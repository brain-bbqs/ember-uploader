import { test, expect, type Route } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";

const API = "https://api-dandi.emberarchive.org/api";

test("hashes concurrently-uploading files on separate workers, not the main thread", async ({ page }) => {
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
  // Stall briefly before failing, so files stay parked mid-flight long enough to observe worker
  // creation without leaving requests hanging indefinitely (which slows down test teardown).
  await page.route(`${API}/uploads/initialize/`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 500, body: "stalled for test" });
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#connect-status-dot")).toHaveClass(/\bok\b/);

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    { name: "a.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "b.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "c.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
  ]);

  // Hashing starts the moment files are dropped, before "Upload" is ever clicked.
  await expect(page.locator("[data-role='badge']").first()).toBeVisible({ timeout: 5000 });
  await expect.poll(() => workerUrls.length, { timeout: 5000 }).toBeGreaterThan(1);

  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files");
  await page.locator("#upload-all-btn").click();
});
