import type { Page } from "@playwright/test";
import { THEME_KEY } from "../../../src/lib/settings";

/** Seeds the stored light/dark override before the page's inline pre-paint script reads it. */
export async function seedTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme] as const);
}
