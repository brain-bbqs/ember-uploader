import { test, expect } from "@playwright/test";
import { STORAGE_KEY } from "../../../src/lib/settings";
import { EMBER_INSTANCE } from "../../../src/lib/instances";
import { seedTheme } from "../helpers/theme";

const API = EMBER_INSTANCE.api;

// With more than one incoming dataset the picker is a dropdown, and its options should always be
// ranked by descending integer dandiset id -- regardless of the order the archive's API returns
// them in (which is sorted by title).
test.describe("dataset dropdown ordering", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "light");
    await page.addInitScript(
      ({ key, expiresAt }) => {
        localStorage.setItem(key, JSON.stringify({ oauth: { accessToken: "test-token", expiresAt } }));
      },
      { key: STORAGE_KEY, expiresAt: Date.now() + 3600_000 },
    );
    await page.route(`${API}/dandisets/?user=me&embargoed=true&page_size=1000`, (route) =>
      route.fulfill({
        json: {
          count: 3,
          next: null,
          previous: null,
          results: [
            { identifier: "000100", draft_version: { name: "Incoming: Alpha Lab" } },
            { identifier: "000300", draft_version: { name: "Incoming: Gamma Lab" } },
            { identifier: "000200", draft_version: { name: "Incoming: Beta Lab" } },
          ],
        },
      }),
    );
  });

  test("ranks dropdown options by descending integer id", async ({ page }) => {
    await page.goto("/");

    const options = page.locator("#dandiset-id option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("Incoming: Gamma Lab (000300)");
    await expect(options.nth(1)).toHaveText("Incoming: Beta Lab (000200)");
    await expect(options.nth(2)).toHaveText("Incoming: Alpha Lab (000100)");
  });
});
