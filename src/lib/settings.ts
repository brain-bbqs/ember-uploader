import type { StoredSettings, UploaderConfig } from "./types";
import { EMBER_INSTANCE } from "./instances";

export const STORAGE_KEY = "dandi-mp4-uploader.settings.v1";

export function loadStoredSettings(): StoredSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSettings;
    return {
      ...parsed,
      // Never restore sensitive credentials from persistent browser storage.
      apiKey: "",
    };
  } catch (e) {
    console.warn("Could not restore settings:", e);
    return null;
  }
}

export function saveStoredSettings(settings: StoredSettings | null): void {
  if (!settings) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const persisted: StoredSettings = {
    apiKey: "",
    dandisetId: settings.dandisetId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function resolveConfig(input: { apiKey: string; dandisetId: string }): UploaderConfig {
  const rawId = input.dandisetId.trim();
  const idMatch = rawId.match(/(\d{6,})/);
  return {
    api: EMBER_INSTANCE.api,
    web: EMBER_INSTANCE.web,
    apiKey: input.apiKey.trim(),
    dandisetId: idMatch ? idMatch[1] : "",
  };
}

export function configProblems(cfg: UploaderConfig): string[] {
  const problems: string[] = [];
  if (!cfg.api || !/^https?:\/\//.test(cfg.api)) problems.push("API base URL is missing or invalid.");
  if (!cfg.apiKey) problems.push("API key is missing.");
  if (!cfg.dandisetId) problems.push("Dandiset ID is missing (expected something like 000123).");
  return problems;
}
