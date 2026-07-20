import { test, expect, type Route } from "@playwright/test";

const API = "https://api-dandi.emberarchive.org/api";

function mp4Buffer(): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(32, 0);
  buf.write("ftyp", 4, "ascii");
  return buf;
}

test("full upload pipeline against a mocked DANDI API", async ({ page }) => {
  const createdAssets: unknown[] = [];

  await page.route(`${API}/users/me/`, (route: Route) => route.fulfill({ json: { username: "test-user" } }));
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
      return route.fulfill({ json: { asset_id: "asset-1", path: "clip.mp4" } });
    }
    return route.continue();
  });

  await page.goto("/");
  await page.fill("#api-key", "test-key");
  await page.fill("#dandiset-id", "000123");
  await page.locator("#dandiset-id").blur();
  await expect(page.locator("#connect-status-dot")).toHaveClass(/\bok\b/);
  await expect(page.locator("#connect-status-text")).toContainText("Connected");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: mp4Buffer() });

  const row = page.locator("#file-list .file-item").first();

  // The buffer isn't a real playable video, so the browser can't decode it —
  // exercise the "upload anyway" branch of the integrity check.
  await expect(row.getByRole("button", { name: "Upload anyway" })).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Upload anyway" }).click();

  await row.getByRole("button", { name: "Start upload" }).click();

  await expect(row.locator('[data-role="badge"]')).toHaveText("Done", { timeout: 15000 });
  await expect(row.locator('[data-role="status"]')).toContainText("Uploaded successfully as clip.mp4");
  expect(createdAssets).toEqual([{ blob_id: "blob-1", metadata: { path: "clip.mp4", encodingFormat: "video/mp4" } }]);
});
