import type { Page, Route } from "@playwright/test";
import { API } from "./auth";

export const S3 = "https://mock-s3.test";

export interface MockUploadApiOptions {
  /** Size the mocked /uploads/initialize/ response reports for its single part. Must match the
   * size of the file the test drops — the client aborts on a client/server part-size mismatch. */
  partSize?: number;
}

/**
 * Registers the baseline happy-path mocks for the full upload pipeline: identity, dataset
 * metadata, no existing asset at any path, a single-part upload to mock S3, validation to
 * "blob-1", and asset creation. Tests override individual steps by registering a route for the
 * same URL AFTER calling this — Playwright hands each request to the most recently registered
 * matching handler.
 */
export async function mockUploadApi(page: Page, { partSize = 32 }: MockUploadApiOptions = {}): Promise<void> {
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
        parts: [{ part_number: 1, size: partSize, upload_url: `${S3}/part-1` }],
      },
    }),
  );
  await page.route(`${S3}/part-1`, (route: Route) =>
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
    route.fulfill({ json: { complete_url: `${S3}/complete`, body: "<complete/>" } }),
  );
  await page.route(`${S3}/complete`, (route: Route) => route.fulfill({ status: 200, body: "<ok/>" }));
  await page.route(`${API}/uploads/upload-1/validate/`, (route: Route) =>
    route.fulfill({ json: { blob_id: "blob-1" } }),
  );
  await page.route(`${API}/dandisets/000123/versions/draft/assets/`, (route: Route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: { asset_id: "asset-1", path: "sourcedata/raw/clip.mp4" } });
    }
    return route.continue();
  });
}
