import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Route } from "@playwright/test";
import { API, seedSignedIn } from "./helpers/auth";
import { mockUploadApi } from "./helpers/api-mock";
import { dropFile } from "./helpers/drop";

test("hashes concurrently-uploading files on separate workers, not the main thread", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  await mockUploadApi(page);
  // Stall briefly before failing, so files stay parked mid-flight long enough to observe worker
  // creation without leaving requests hanging indefinitely (which slows down test teardown).
  await page.route(`${API}/uploads/initialize/`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 500, body: "stalled for test" });
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await dropFile(page, [
    { name: "a.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "b.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "c.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
  ]);

  // Hashing starts the moment files are dropped, before "Upload" is ever clicked.
  await expect(page.locator("[data-role='badge']").first()).toBeVisible({ timeout: 5000 });
  await expect.poll(() => workerUrls.length, { timeout: 5000 }).toBeGreaterThan(1);

  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files");
  await page.locator("#upload-all-btn").click();
});

test("fans a single multi-part file out across workers and cancels hashing via Cancel all", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  await seedSignedIn(page);
  await page.goto("/");

  // Slow the page down so the mid-hash cancel below isn't a race against real-time MD5 speed.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });

  // 64MB + 10 bytes plans exactly two parts, so one file alone exercises multi-worker fan-out.
  // Written to disk because Playwright rejects in-memory setFiles buffers this large.
  const bigPath = join(mkdtempSync(join(tmpdir(), "bbqs-hash-")), "big.bin");
  writeFileSync(bigPath, Buffer.alloc(64 * 1024 * 1024 + 10));

  await dropFile(page, bigPath);

  const badge = page.locator("[data-role='badge']").first();
  await expect(badge).toHaveText("Scanning", { timeout: 10000 });
  // Both of the file's parts should be claimed by separate pool workers.
  await expect.poll(() => workerUrls.length, { timeout: 10000 }).toBeGreaterThan(1);

  // "Cancel all" is offered during the scan phase now, and aborts the in-progress hash mid-part.
  await page.locator("#cancel-all-btn").click();
  await expect(badge).toHaveText("Cancelled", { timeout: 10000 });
  await expect(page.locator("#cancel-all-btn")).toBeHidden();
});
