import { test, expect, type Route } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";
import { mockUploadApi } from "./helpers/api-mock";
import { dropFile } from "./helpers/drop";

// Regression test for a bug reported on this PR: clicking "Reset" while an upload batch was still
// running cleared `hashJobs` out from under runQueue's still-in-flight loop. The next queued file
// then hit `hashJobs.get(file)` returning undefined, and `uploadFile()` read `.promise` off that
// `undefined`, landing in its catch block as a bogus "Cannot read properties of undefined (reading
// 'promise')" error (logged via `console.error`) instead of being cleanly dropped by Reset.
// See main.ts's `if (!job) return;` guard in the runQueue worker.
test("Reset mid-upload does not log an error and leaves the uploader empty", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const pageErrors: Error[] = [];
  page.on("pageerror", (e) => pageErrors.push(e));

  await mockUploadApi(page);
  // Slow down every upload's first network round trip so a batch of several files is still
  // working through its queue (not yet settled) when Reset is clicked below.
  await page.route("**/uploads/initialize/", async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      json: { upload_id: "upload-1", parts: [{ part_number: 1, size: 32, upload_url: "https://mock-s3.test/part-1" }] },
    });
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await dropFile(
    page,
    Array.from({ length: 6 }, (_, i) => ({
      name: `clip-${i}.mp4`,
      mimeType: "video/mp4",
      buffer: Buffer.alloc(32),
    })),
  );

  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 6 files");
  await page.locator("#upload-all-btn").click();
  await expect(page.locator("#cancel-all-btn")).toBeVisible();

  await page.locator("#reset-all-btn").click();

  // Let any straggling aborted/in-flight work (including the slow initialize/ calls above) settle
  // before asserting nothing was logged.
  await page.waitForTimeout(1500);

  expect(consoleErrors.filter((m) => m.includes("Cannot read properties of undefined"))).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page.locator("#file-list")).toBeEmpty();
  await expect(page.locator("#upload-bar")).toBeHidden();
  await expect(page.locator("#progress-summary")).toBeHidden();
  await expect(page.locator("#dest-root")).toBeHidden();

  // The uploader is still usable afterward: a fresh drop queues cleanly.
  await dropFile(page, { name: "after-reset.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 1 file");
});
