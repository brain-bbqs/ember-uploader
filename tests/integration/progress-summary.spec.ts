import { test, expect, type Route } from "@playwright/test";
import { API, seedSignedIn } from "./helpers/auth";
import { mockUploadApi } from "./helpers/api-mock";
import { dropFile } from "./helpers/drop";

test("tracks overall progress and per-outcome counts across a mixed batch", async ({ page }) => {
  await mockUploadApi(page, { partSize: 16 });
  // clip.mp4 already exists (replaced via PUT); other.bin does not (created via POST).
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get("path");
    if (path === "sourcedata/raw/clip.mp4") {
      return route.fulfill({ json: { results: [{ asset_id: "existing-1", path }], next: null } });
    }
    return route.fulfill({ json: { results: [], next: null } });
  });
  await page.route(`${API}/dandisets/000123/versions/draft/assets/existing-1/`, (route: Route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ json: { asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await expect(page.locator("#progress-summary")).toBeHidden();

  await dropFile(page, [
    { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(16) },
    { name: "other.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(16) },
  ]);

  // The summary is present as soon as files are queued, showing the total size up front, and no
  // files have finished (hashing happens in the background, but that isn't a "finished" outcome).
  await expect(page.locator("#progress-summary")).toBeVisible();
  await expect(page.locator("#progress-upload-files")).toHaveText("0 of 2");
  await expect(page.locator("#progress-hash-done")).toContainText("32 B");
  await expect(page.locator("#progress-upload-done")).toContainText("32 B");
  // Scanning finishes (in the background) well before Upload is even clicked, so its own file
  // counter should reach 2 of 2 independently of the upload counter, which is still at 0 of 2.
  await expect(page.locator("#progress-hash-files")).toHaveText("2 of 2");
  await expect(page.locator("#progress-upload-files")).toHaveText("0 of 2");

  await page.locator("#upload-all-btn").click();

  await expect(page.locator("#progress-upload-files")).toHaveText("2 of 2", { timeout: 15000 });
  await expect(page.locator("#progress-hash-files")).toHaveText("2 of 2");
  await expect(page.locator("#progress-hash-pct")).toHaveText("100%");
  await expect(page.locator("#progress-upload-pct")).toHaveText("100%");
  await expect(page.locator("#progress-hash-eta")).toHaveText("done");
  await expect(page.locator("#progress-upload-eta")).toHaveText("done");
  await expect(page.locator("#progress-footer-left")).toContainText("1 done");
  await expect(page.locator("#progress-footer-mid")).toContainText("1 replaced");
  const hashWidth = await page.locator("#progress-hash-fill").evaluate((el) => el.style.width);
  const uploadWidth = await page.locator("#progress-upload-fill").evaluate((el) => el.style.width);
  expect(hashWidth).toBe("100%");
  expect(uploadWidth).toBe("100%");
});
