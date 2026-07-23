import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { dropFile } from "./helpers/drop";
import { seedSignedIn } from "./helpers/auth";

const DB_NAME = "bbqs-uploader.checksum-cache";
const STORE = "files";

/** Runs in the page: how many parts the cache record for the single stored file marks present. */
function storedPresentParts([dbName, store]: [string, string]): Promise<number> {
  return new Promise((resolve) => {
    const openRequest = indexedDB.open(dbName);
    openRequest.onerror = () => resolve(-1);
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const getAll = db.transaction(store).objectStore(store).getAll();
      getAll.onerror = () => resolve(-1);
      getAll.onsuccess = () => {
        db.close();
        const records = getAll.result as { present: Uint8Array; partCount: number }[];
        if (records.length !== 1) {
          resolve(-1);
          return;
        }
        let count = 0;
        for (let i = 0; i < records[0].partCount; i++) {
          if (records[0].present[i >> 3] & (1 << (i & 7))) count++;
        }
        resolve(count);
      };
    };
  });
}

test("re-dropping an unchanged file after a reload hashes only one verification part", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  // 64MB + 10 bytes plans exactly two parts. Written to disk (Playwright rejects in-memory
  // setFiles buffers this large), and re-dropped from the same path so name/size/mtime — the
  // cache's file identity — are identical across the two drops.
  const bigPath = join(mkdtempSync(join(tmpdir(), "bbqs-cache-")), "big.bin");
  const bytes = Buffer.alloc(64 * 1024 * 1024 + 10);
  bytes.fill(7);
  writeFileSync(bigPath, bytes);

  await seedSignedIn(page);
  await page.goto("/");
  await dropFile(page, bigPath);

  // First drop: a full scan, fanning the two parts out across two pool workers.
  await expect(page.locator("#progress-hash-files")).toHaveText("1 of 1", { timeout: 60_000 });
  await expect.poll(() => workerUrls.length).toBe(2);

  // Both part digests must be persisted (write-through settles just after the scan finishes)
  // before the reload wipes the page.
  await expect
    .poll(() => page.evaluate(storedPresentParts, [DB_NAME, STORE] as [string, string]), { timeout: 10_000 })
    .toBe(2);

  await page.reload();
  workerUrls.length = 0;
  await dropFile(page, bigPath);

  // Second drop: every part comes from the cache, so the pool only re-hashes the single
  // verification part — observable as exactly one worker (of a pool that fans a full scan of
  // this file out to two) ever spawning in the fresh page.
  await expect(page.locator("#progress-hash-files")).toHaveText("1 of 1", { timeout: 60_000 });
  await expect.poll(() => workerUrls.length).toBe(1);
});
