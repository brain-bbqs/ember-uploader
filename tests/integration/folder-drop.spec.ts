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

  // Both dirName/ and session1/ directly hold only 1 entry each (a subfolder, then a.txt) — the
  // slider's range should match that exactly, and default to showing both expanded since 1 is
  // within the default (30).
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "1");
  expect(await page.locator("#expand-depth").inputValue()).toBe("1");
  await expect(page.locator("#expand-depth-ticks option")).toHaveCount(2);
});

test("a folder with more than 30 entries renders collapsed by default", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-upload-big-"));
  const bigDir = path.join(dir, "bigfolder");
  fs.mkdirSync(bigDir);
  for (let i = 0; i < 35; i++) {
    fs.writeFileSync(path.join(bigDir, `file-${i}.txt`), String(i));
  }

  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // "bigfolder" itself holds the 35 files directly, so it's the one that starts collapsed — its
  // wrapping parent folder (the selected directory) has no files of its own and stays expanded.
  const toggle = page.locator(".dir-toggle", { hasText: "bigfolder/" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const nestedChildren = toggle.locator("+ .dir-children");
  await expect(nestedChildren).toBeHidden();
  // The 35 file rows exist in the DOM (queued) but are hidden behind the collapsed folder.
  await expect(page.locator("#file-list .file-item")).toHaveCount(35);
  await expect(page.locator("#file-list .file-item").first()).toBeHidden();
  // Click-to-expand itself is covered by the jsdom unit test in tests/unit/fileTree.dom.test.ts.
});
