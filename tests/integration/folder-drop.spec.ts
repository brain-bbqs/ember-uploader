import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("recursive folder selection derives sourcedata/raw paths and skips .git", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-upload-"));
  const dirName = path.basename(dir);
  fs.mkdirSync(path.join(dir, "session1"));
  fs.writeFileSync(path.join(dir, "session1", "a.txt"), "a");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "config"), "ignored");

  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Only a.txt should surface — the .git/config file must be filtered out.
  const row = page.locator("#file-list .file-item").first();
  await expect(page.locator("#file-list .file-item")).toHaveCount(1);
  await expect(row).toHaveAttribute("title", `sourcedata/raw/${dirName}/session1/a.txt`);

  // The slider now ranges over the total number of dropped files (1 here), and defaults to
  // revealing everything since 1 is within the default reveal count (30). The ruler's quarter
  // labels dedupe down to just "0" and "1" for a single-file drop.
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "1");
  expect(await page.locator("#expand-depth").inputValue()).toBe("1");
  await expect(page.locator("#expand-depth-ticks .tick-label")).toHaveCount(2);
});

test("a folder with more than 30 files reveals the first 30 and truncates the rest with a placeholder", async ({
  page,
}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-upload-big-"));
  const bigDir = path.join(dir, "bigfolder");
  fs.mkdirSync(bigDir);
  for (let i = 0; i < 35; i++) {
    fs.writeFileSync(path.join(bigDir, `file-${i}.txt`), String(i));
  }

  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Folder rows are always visible and expanded; the slider only governs file rows.
  const toggle = page.locator(".dir-toggle", { hasText: "bigfolder/" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // All 35 file rows are queued in the DOM, but only the default reveal count (30) is visible;
  // the truncation is signposted by a free "… N more files" placeholder row.
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "35");
  expect(await page.locator("#expand-depth").inputValue()).toBe("30");
  await expect(page.locator("#expand-depth-bubble")).toHaveText("30 files");
  await expect(page.locator("#file-list .file-item")).toHaveCount(35);
  await expect(page.locator("#file-list .file-item:visible")).toHaveCount(30);
  await expect(page.locator("#file-list .more-files")).toHaveText("… 5 more files");

  // Dragging the slider to the max reveals every row, drops the placeholder, and the value
  // bubble riding the thumb tracks the new count.
  await page.locator("#expand-depth").fill("35");
  await expect(page.locator("#expand-depth-bubble")).toHaveText("35 files");
  await expect(page.locator("#file-list .file-item:visible")).toHaveCount(35);
  await expect(page.locator("#file-list .more-files")).toHaveCount(0);
});
