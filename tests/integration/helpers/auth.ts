import type { Page, Route } from "@playwright/test";
import { STORAGE_KEY } from "../../../src/lib/settings";
import { EMBER_INSTANCE } from "../../../src/lib/instances";

export const API = EMBER_INSTANCE.api;

/**
 * Seeds an already-signed-in OAuth session (localStorage) before the page's own script runs, and
 * mocks the "my incoming datasets" dropdown endpoint so tests can pick straight up at "Connected"
 * instead of driving the real PKCE redirect flow.
 */
export async function seedSignedIn(
  page: Page,
  { identifier = "000123", title = "Incoming: Test Lab" }: { identifier?: string; title?: string } = {},
): Promise<void> {
  await page.addInitScript(
    ({ key, expiresAt }) => {
      localStorage.setItem(key, JSON.stringify({ oauth: { accessToken: "test-token", expiresAt } }));
    },
    { key: STORAGE_KEY, expiresAt: Date.now() + 3600_000 },
  );
  await page.route(`${API}/dandisets/?user=me&embargoed=true&page_size=1000`, (route: Route) =>
    route.fulfill({
      json: { count: 1, next: null, previous: null, results: [{ identifier, draft_version: { name: title } }] },
    }),
  );
}
