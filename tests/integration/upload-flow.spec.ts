import { test, expect, type Route } from "@playwright/test";
import { API, seedSignedIn } from "./helpers/auth";
import { mockUploadApi, S3 } from "./helpers/api-mock";
import { dropFile } from "./helpers/drop";

test("full upload pipeline against a mocked DANDI API", async ({ page }) => {
  const createdAssets: unknown[] = [];

  await mockUploadApi(page);
  // Override the baseline asset-creation mock to also capture each POSTed payload.
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

  await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

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

test("replaces the existing asset (PUT) when one exists at the path and the content changed", async ({ page }) => {
  let assetCreated = false;
  const replacedAssets: unknown[] = [];

  await mockUploadApi(page);
  // An asset already sits at the path, so registration must go through PUT, not POST.
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({ json: { results: [{ asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" }], next: null } }),
  );
  await page.route(`${API}/uploads/upload-1/validate/`, (route: Route) =>
    route.fulfill({ json: { blob_id: "blob-2" } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      assetCreated = true;
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });
  await page.route(`${API}/dandisets/000123/versions/draft/assets/existing-1/`, (route: Route) => {
    if (route.request().method() === "PUT") {
      replacedAssets.push(route.request().postDataJSON());
      return route.fulfill({ json: { asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

  const row = page.locator("#file-list .file-item").first();
  await page.locator("#upload-all-btn").click();

  await expect(row.locator('[data-role="badge"]')).toHaveText("Replaced", { timeout: 15000 });
  await expect(row.locator('[data-role="status"]')).toContainText("content updated");
  expect(replacedAssets).toEqual([
    { blob_id: "blob-2", metadata: { path: "sourcedata/raw/clip.mp4", encodingFormat: "video/mp4" } },
  ]);
  expect(assetCreated).toBe(false);
});

test("replaces via the server digest fast-path (409) without re-transferring bytes", async ({ page }) => {
  let assetCreated = false;
  let bytesUploaded = false;
  const replacedAssets: unknown[] = [];

  await mockUploadApi(page);
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({ json: { results: [{ asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" }], next: null } }),
  );
  // 409 = the server already holds a blob with this digest; no S3 traffic should follow.
  await page.route(`${API}/uploads/initialize/`, (route: Route) => route.fulfill({ status: 409, body: "blob exists" }));
  await page.route(`${API}/blobs/digest/`, (route: Route) => route.fulfill({ json: { blob_id: "blob-1" } }));
  await page.route(`${S3}/**`, (route: Route) => {
    bytesUploaded = true;
    return route.fulfill({ status: 500, body: "" });
  });
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      assetCreated = true;
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });
  await page.route(`${API}/dandisets/000123/versions/draft/assets/existing-1/`, (route: Route) => {
    if (route.request().method() === "PUT") {
      replacedAssets.push(route.request().postDataJSON());
      return route.fulfill({ json: { asset_id: "existing-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

  const row = page.locator("#file-list .file-item").first();
  await page.locator("#upload-all-btn").click();

  await expect(row.locator('[data-role="badge"]')).toHaveText("Replaced", { timeout: 15000 });
  await expect(row.locator('[data-role="status"]')).toContainText("matched existing content");
  expect(replacedAssets).toEqual([
    { blob_id: "blob-1", metadata: { path: "sourcedata/raw/clip.mp4", encodingFormat: "video/mp4" } },
  ]);
  expect(assetCreated).toBe(false);
  expect(bytesUploaded).toBe(false);
});
