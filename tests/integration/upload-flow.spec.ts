import { test, expect, type Route } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";

const API = "https://api-dandi.emberarchive.org/api";

test("full upload pipeline against a mocked DANDI API", async ({ page }) => {
  const createdAssets: unknown[] = [];

  await page.route(`${API}/users/me/`, (route: Route) =>
    route.fulfill({ json: { username: "test-user", name: "Test User" } }),
  );
  await page.route(`${API}/dandisets/000123/`, (route: Route) =>
    route.fulfill({ json: { draft_version: { name: "Test dandiset" } } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({ json: { results: [], next: null } }),
  );
  await page.route(`${API}/uploads/initialize/`, (route: Route) =>
    route.fulfill({
      json: {
        upload_id: "upload-1",
        parts: [
          {
            part_number: 1,
            size: 32,
            upload_url: "https://mock-s3.test/part-1",
          },
        ],
      },
    }),
  );
  await page.route("https://mock-s3.test/part-1", (route: Route) =>
    route.fulfill({
      status: 200,
      headers: {
        ETag: '"abc123"',
        "Access-Control-Expose-Headers": "ETag",
        "Access-Control-Allow-Origin": "*",
      },
      body: "",
    }),
  );
  await page.route(`${API}/uploads/upload-1/complete/`, (route: Route) =>
    route.fulfill({
      json: { complete_url: "https://mock-s3.test/complete", body: "<complete/>" },
    }),
  );
  await page.route("https://mock-s3.test/complete", (route: Route) => route.fulfill({ status: 200, body: "<ok/>" }));
  await page.route(`${API}/uploads/upload-1/validate/`, (route: Route) =>
    route.fulfill({ json: { blob_id: "blob-1" } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      createdAssets.push(route.request().postDataJSON());
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();
  await expect(page.locator("#oauth-signed-in")).toBeVisible();
  // Only one "Incoming: " dataset was seeded, so it's shown as plain text, not a dropdown.
  await expect(page.locator("#dandiset-id")).toBeHidden();
  await expect(page.locator("#oauth-avatar")).toHaveText("TU");
  await expect(page.locator("#oauth-username")).toHaveText("test-user");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

  const row = page.locator("#file-list .file-item").first();
  await expect(row.locator('[data-role="badge"]')).toBeHidden();
  await expect(row).toHaveAttribute("title", "sourcedata/raw/clip.mp4");
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 1 file");
  await page.locator("#upload-all-btn").click();

  await expect(row.locator('[data-role="badge"]')).toHaveText("Done", { timeout: 15000 });
  // No per-file view/download links — just one dataset-level link, shown once configured.
  await expect(row.locator('[data-role="status"]')).toHaveText("");
  await expect(page.locator("#view-dataset-link")).toBeVisible();
  await expect(page.locator("#view-dataset-link")).toHaveAttribute(
    "href",
    "https://dandi.emberarchive.org/dandiset/000123/draft/files",
  );
  expect(createdAssets).toEqual([
    { blob_id: "blob-1", metadata: { path: "sourcedata/raw/clip.mp4", encodingFormat: "video/mp4" } },
  ]);
});

test("skips a file automatically when an asset already exists at its path, no prompt", async ({ page }) => {
  let assetCreated = false;

  await page.route(`${API}/users/me/`, (route: Route) =>
    route.fulfill({ json: { username: "test-user", name: "Test User" } }),
  );
  await page.route(`${API}/dandisets/000123/`, (route: Route) =>
    route.fulfill({ json: { draft_version: { name: "Test dandiset" } } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({ json: { results: [{ asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" }], next: null } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      assetCreated = true;
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

  const row = page.locator("#file-list .file-item").first();
  await page.locator("#upload-all-btn").click();

  await expect(row.locator('[data-role="badge"]')).toHaveText("Skipped", { timeout: 15000 });
  await expect(row.locator('[data-role="status"]')).toContainText("already exists");
  expect(assetCreated).toBe(false);
});
