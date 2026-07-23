import { test, expect } from "@playwright/test";
import { seedSignedIn } from "../helpers/auth";
import { seedTheme } from "../helpers/theme";

// Exercises the "?test&signed_out" live test injection documented in docs/README.md, in both
// color themes -- it should force the signed-out UI even over a real (mocked) session, proving
// the override actually overrides rather than just matching the already-signed-out default.
for (const theme of ["light", "dark"] as const) {
  test.describe(`?test&signed_out (${theme} mode)`, () => {
    test.beforeEach(async ({ page }) => {
      await seedTheme(page, theme);
      await seedSignedIn(page);
    });

    test("shows the signed-out header and dataset card despite a real session", async ({ page }) => {
      await page.goto("/?test&signed_out");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await expect(page.locator("#oauth-signin-btn")).toBeVisible();
      await expect(page.locator("#oauth-signed-in")).toBeHidden();
      await expect(page.locator("#dandiset-message")).toHaveText("Please sign in to see your incoming datasets.");
    });

    // The "blocked as not signed in" upload outcome itself is covered in smoke.spec.ts via a real
    // mid-session sign-out: "?test&signed_out" hides the dropzone along with the rest of the
    // signed-out UI (see main.ts's isSignedIn()), so there's no way to queue a file through it in
    // the first place while the override is active.
    test("hides the dropzone along with the rest of the signed-out UI", async ({ page }) => {
      await page.goto("/?test&signed_out");
      await expect(page.locator("#dropzone")).toBeHidden();
    });
  });
}
