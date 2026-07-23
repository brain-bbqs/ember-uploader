import { test, expect } from "@playwright/test";
import { dropFile } from "../helpers/drop";
import { seedSignedIn } from "../helpers/auth";

// Exercises the "?test&freeze_scan" live test injection documented in docs/README.md: a dropped
// file's scan must hang at its just-started state (a real scan of a tiny file finishes in
// milliseconds), while "Cancel all" still settles the frozen job as cancelled.
test.describe("?test&freeze_scan", () => {
  test("pins a dropped file mid-scan indefinitely", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/?test&freeze_scan");
    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
    await expect(page.locator("#cancel-all-btn")).toBeVisible();

    // Long past a real 32-byte scan, the frozen one must still be going nowhere.
    await page.waitForTimeout(1000);
    await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
    await expect(page.locator("#cancel-all-btn")).toBeVisible();
    await expect(page.locator("#progress-hash-pct")).toHaveText("0%");
    await expect(page.locator("#progress-hash-files")).toContainText("0");
  });

  test("cancelling a frozen scan still works", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/?test&freeze_scan");
    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
    await page.locator("#cancel-all-btn").click();

    await expect(row.locator('[data-role="badge"]')).toHaveText("Cancelled");
    await expect(page.locator("#cancel-all-btn")).toBeHidden();
  });

  // Regression test: a cancelled scan used to have its full file size credited toward the hash
  // phase's total regardless of how much (if any) had actually been hashed, jumping the summary
  // bar straight to 100%/"done" the instant "Cancel all" was clicked. freeze_scan guarantees zero
  // real progress ever happens, so any movement away from 0%/"—" here can only come from that bug.
  test("cancelling a frozen scan freezes the summary bar instead of jumping to 100%/done", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/?test&freeze_scan");
    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
    await expect(page.locator("#progress-hash-pct")).toHaveText("0%");
    await expect(page.locator("#progress-hash-eta")).toHaveText("—");

    await page.locator("#cancel-all-btn").click();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Cancelled");

    await expect(page.locator("#progress-hash-pct")).toHaveText("0%");
    await expect(page.locator("#progress-hash-eta")).toHaveText("—");

    // ...and it should hold there rather than start climbing again a tick later.
    await page.waitForTimeout(1200);
    await expect(page.locator("#progress-hash-pct")).toHaveText("0%");
    await expect(page.locator("#progress-hash-eta")).toHaveText("—");
  });
});
