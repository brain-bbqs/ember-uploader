import type { FileChooser, Page } from "@playwright/test";

/** Drops file(s) through the dropzone's file chooser; accepts anything setFiles does
 * (a path on disk, an in-memory payload, or an array of either). */
export async function dropFile(page: Page, files: Parameters<FileChooser["setFiles"]>[0]): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(files);
}
