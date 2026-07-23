import { test, expect } from "@chromatic-com/playwright";

test("Main page - default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#dropzone")).toBeVisible();
});

test("Main page - file queued", async ({ page }) => {
  // A real scan of this 32-byte file finishes in milliseconds, racing the end-of-test snapshot
  // between the mid-scan and scan-finished states; the freeze_scan injection pins the row
  // mid-scan so the capture always shows the "Scanning" badge and Cancel button.
  await page.goto("/?test&freeze_scan");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(32),
  });
  const row = page.locator("#file-list .file-item");
  await expect(row).toBeVisible();
  await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
  await expect(page.locator("#cancel-all-btn")).toBeVisible();
});
