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
  await expect(page.locator("#file-list .file-item")).toHaveCount(1);
  const pathInput = page.locator("#file-list .file-item").first().locator('[data-role="path"]');
  await expect(pathInput).toHaveValue(`sourcedata/raw/${dirName}/session1/a.txt`);
});

test("a subtree with more than 30 entries renders collapsed by default", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-upload-big-"));
  const bigDir = path.join(dir, "bigfolder");
  fs.mkdirSync(bigDir);
  for (let i = 0; i < 35; i++) {
    fs.writeFileSync(path.join(bigDir, `file-${i}.txt`), String(i));
  }

  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  const toggle = page.locator(".dir-toggle").first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const nestedChildren = page.locator(".dir-children");
  await expect(nestedChildren.first()).toBeHidden();
  // The 35 file rows exist in the DOM (queued) but are hidden behind the collapsed folder.
  await expect(page.locator("#file-list .file-item")).toHaveCount(35);
  await expect(page.locator("#file-list .file-item").first()).toBeHidden();
  // Click-to-expand itself is covered by the jsdom unit test in tests/unit/fileTree.dom.test.ts.
});
