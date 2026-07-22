import { test, expect } from "@playwright/test";
import { seedSignedIn } from "../helpers/auth";
import { seedTheme } from "../helpers/theme";

// Exercises the "?test&num_datasets=0" live test injection documented in docs/README.md, in both
// color themes -- previews the no-datasets-found state for an otherwise-signed-in user, without
// needing an account that's really been left off every direct-upload dataset.
for (const theme of ["light", "dark"] as const) {
  test.describe(`?test&num_datasets=0 (${theme} mode)`, () => {
    test.beforeEach(async ({ page }) => {
      await seedTheme(page, theme);
      await seedSignedIn(page);
    });

    test("shows the signed-in header alongside the no-datasets-found message", async ({ page }) => {
      await page.goto("/?test&num_datasets=0");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await expect(page.locator("#oauth-signin-btn")).toBeHidden();
      await expect(page.locator("#oauth-signed-in")).toBeVisible();

      await expect(page.locator("#dandiset-message")).toBeVisible();
      await expect(page.locator("#dandiset-message")).toHaveText(
        "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this.",
      );
      await expect(page.locator("#dandiset-single")).toBeHidden();
      await expect(page.locator("#dandiset-id")).toBeHidden();
      await expect(page.locator("#view-dataset-link")).toBeHidden();
    });
  });
}
