import { test, expect } from "@playwright/test";
import { seedSignedIn } from "../helpers/auth";

// Exercises the "?test&signed_out" live test injection documented in docs/README.md, in both
// color themes -- it should force the signed-out UI even over a real (mocked) session, proving
// the override actually overrides rather than just matching the already-signed-out default.
for (const theme of ["light", "dark"] as const) {
  test.describe(`?test&signed_out (${theme} mode)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("dandi-mp4-uploader.theme", t), theme);
      await seedSignedIn(page);
    });

    test("shows the signed-out header and dataset card despite a real session", async ({ page }) => {
      await page.goto("/?test&signed_out");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await expect(page.locator("#oauth-signin-btn")).toBeVisible();
      await expect(page.locator("#oauth-signed-in")).toBeHidden();
      await expect(page.locator("#dandiset-message")).toHaveText("Please sign in to see your incoming datasets.");
    });

    test("blocks an uploaded file as not signed in", async ({ page }) => {
      await page.goto("/?test&signed_out");
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("#dropzone").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

      await page.locator("#upload-all-btn").click();
      const row = page.locator("#file-list .file-item").first();
      await expect(row.locator('[data-role="badge"]')).toHaveText("Blocked");
      await expect(row.locator('[data-role="status"]')).toContainText("Not signed in");
    });
  });
}
