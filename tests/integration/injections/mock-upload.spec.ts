import { test, expect } from "@playwright/test";

// Exercises the "?test&mock_upload=N" live test injection documented in docs/README.md, in both
// color themes, since it drives the same scanning/uploading UI a real batch would.
for (const theme of ["light", "dark"] as const) {
  test.describe(`?test&mock_upload (${theme} mode)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("dandi-mp4-uploader.theme", t), theme);
    });

    test("queues a nested batch of fake files and animates scanning then uploading", async ({ page }) => {
      // Uploading runs through the same concurrency-limited queue a real batch would, so on a
      // low-core machine a larger count finishes in more waves; keep this small and the test
      // timeout generous rather than racing the animation.
      test.setTimeout(60000);
      await page.goto("/?test&mock_upload=6");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await expect(page.locator("#progress-summary")).toBeVisible();
      await expect(page.locator("#file-list .file-item")).toHaveCount(6);
      await expect(page.locator("#upload-all-btn")).toHaveText("Upload 6 files");

      // Scanning starts on its own, before "Upload" is ever clicked.
      await expect(page.locator("#progress-hash-files")).toHaveText("6 of 6", { timeout: 15000 });
      await expect(page.locator("#progress-hash-pct")).toHaveText("100%");
      await expect(page.locator("#progress-upload-files")).toHaveText("0 of 6");

      await page.locator("#upload-all-btn").click();

      await expect(page.locator("#progress-upload-files")).toHaveText("6 of 6", { timeout: 45000 });
      await expect(page.locator("#progress-upload-pct")).toHaveText("100%");
      await expect(page.locator("#progress-footer-left")).toContainText("6 done");
      await expect(page.locator("#file-list .badge").first()).toHaveText("Done");
    });
  });
}
