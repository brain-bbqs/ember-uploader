import { test, expect } from "@playwright/test";

test.describe("EMBER uploader shell", () => {
  test("renders branding, version, and the connection form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/BBQS Uploader/);
    await expect(page.locator(".brand-logo")).toBeVisible();
    const versionLink = page.locator("#version-indicator");
    await expect(versionLink).toHaveText(/^v\d+\.\d+\.\d+$/);
    await expect(versionLink).toHaveAttribute("href", "https://github.com/brain-bbqs/ember-uploader");
    const conLink = page.locator('a.con-brand-link[href="https://centerforopenneuroscience.org"]');
    await expect(conLink).toBeVisible();
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
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
    await page.locator("#upload-all-btn").click();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Blocked");
    await expect(row.locator('[data-role="status"]')).toContainText("Not signed in");
  });

  test("accepts non-mp4 files (queued, not rejected, once configured)", async ({ page }) => {
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
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
    await page.locator("#upload-all-btn").click();
    // Not rejected for its file type; it's only "Blocked" because the connection isn't configured.
    await expect(row.locator('[data-role="badge"]')).toHaveText("Blocked");
    await expect(row.locator('[data-role="status"]')).toContainText("Not signed in");
  });
});
