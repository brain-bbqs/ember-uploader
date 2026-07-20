import { test, expect } from "@playwright/test";

test.describe("EMBER uploader shell", () => {
  test("renders branding, version, and the connection form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EMBER .mp4 Uploader/);
    await expect(page.locator(".brand-logo")).toBeVisible();
    await expect(page.locator("#version-indicator")).toHaveText(/^v\d+\.\d+\.\d+$/);
    await expect(
      page.locator('.footer-credit a[href="https://centerforopenneuroscience.org"]').first()
    ).toBeVisible();
    await expect(page.locator("#dropzone")).toBeVisible();
  });

  test("blocks an uploaded file until the connection is configured", async ({ page }) => {
    await page.goto("/");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.alloc(32),
    });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Blocked");
    await expect(row.locator('[data-role="status"]')).toContainText("API key is missing");
  });

  test("rejects non-mp4 files immediately", async ({ page }) => {
    await page.goto("/");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Rejected");
  });
});
