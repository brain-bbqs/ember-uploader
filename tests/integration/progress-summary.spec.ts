import { test, expect, type Route } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";

const API = "https://api-dandi.emberarchive.org/api";

test("tracks overall progress and per-outcome counts across a mixed batch", async ({ page }) => {
  await page.route(`${API}/users/me/`, (route: Route) =>
    route.fulfill({ json: { username: "test-user", name: "Test User" } }),
  );
  await page.route(`${API}/dandisets/000123/`, (route: Route) =>
    route.fulfill({ json: { draft_version: { name: "Test dandiset" } } }),
  );
  // clip.mp4 already exists (skipped); other.bin does not (uploaded).
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path");
    if (path === "sourcedata/raw/clip.mp4") {
      return route.fulfill({ json: { results: [{ asset_id: "existing-1", path }], next: null } });
    }
    return route.fulfill({ json: { results: [], next: null } });
  });
  await page.route(`${API}/uploads/initialize/`, (route: Route) =>
    route.fulfill({
      json: { upload_id: "upload-1", parts: [{ part_number: 1, size: 16, upload_url: "https://mock-s3.test/part-1" }] },
    }),
  );
  await page.route("https://mock-s3.test/part-1", (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { ETag: '"abc123"', "Access-Control-Expose-Headers": "ETag", "Access-Control-Allow-Origin": "*" },
      body: "",
    }),
  );
  await page.route(`${API}/uploads/upload-1/complete/`, (route: Route) =>
    route.fulfill({ json: { complete_url: "https://mock-s3.test/complete", body: "<complete/>" } }),
  );
  await page.route("https://mock-s3.test/complete", (route: Route) => route.fulfill({ status: 200, body: "<ok/>" }));
  await page.route(`${API}/uploads/upload-1/validate/`, (route: Route) =>
    route.fulfill({ json: { blob_id: "blob-1" } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/other.bin" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#connect-status-dot")).toHaveClass(/\bok\b/);

  await expect(page.locator("#progress-summary")).toBeHidden();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(16) },
    { name: "other.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(16) },
  ]);

  // The summary is present as soon as files are queued, showing the total size up front, and no
  // files have finished (hashing happens in the background, but that isn't a "finished" outcome).
  await expect(page.locator("#progress-summary")).toBeVisible();
  await expect(page.locator("#progress-footer-right")).toContainText("0/2 files");
  await expect(page.locator("#progress-hash-text")).toContainText("32 B");
  await expect(page.locator("#progress-upload-text")).toContainText("32 B");

  await page.locator("#upload-all-btn").click();

  await expect(page.locator("#progress-footer-right")).toContainText("2/2 files", { timeout: 15000 });
  await expect(page.locator("#progress-footer-left")).toContainText("1 done");
  await expect(page.locator("#progress-footer-mid")).toContainText("1 skipped");
  const hashWidth = await page.locator("#progress-hash-fill").evaluate((el) => el.style.width);
  const uploadWidth = await page.locator("#progress-upload-fill").evaluate((el) => el.style.width);
  expect(hashWidth).toBe("100%");
  expect(uploadWidth).toBe("100%");
});
