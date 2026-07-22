import { test, expect, type Route } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";

const API = "https://api-dandi.emberarchive.org/api";

test("unchecking auto-checksum defers hashing until Upload is clicked", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  await page.route(`${API}/users/me/`, (route: Route) =>
    route.fulfill({ json: { username: "test-user", name: "Test User" } }),
  );
  await page.route(`${API}/dandisets/000123/`, (route: Route) =>
    route.fulfill({ json: { draft_version: { name: "Test dandiset" } } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({ json: { results: [], next: null } }),
  );
  await page.route(`${API}/uploads/initialize/`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 500, body: "stalled for test" });
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await page.locator("#auto-hash-toggle").uncheck();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    { name: "a.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
  ]);

  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 1 file");
  // No hashing has kicked off yet: no "Scanning" badge, and no hash worker spun up.
  await page.waitForTimeout(300);
  await expect(page.locator("[data-role='badge']")).toBeHidden();
  expect(workerUrls.length).toBe(0);

  await page.locator("#upload-all-btn").click();

  // Clicking "Upload" is what starts the checksum now.
  await expect(page.locator("[data-role='badge']").first()).toBeVisible({ timeout: 5000 });
  await expect.poll(() => workerUrls.length, { timeout: 5000 }).toBeGreaterThan(0);
});
