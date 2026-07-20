import type { StoredSettings, UploaderConfig } from "./types";
import { INSTANCES } from "./instances";

export const STORAGE_KEY = "dandi-mp4-uploader.settings.v1";

export function loadStoredSettings(): StoredSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSettings;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveConfig(input: {
  instance: string;
  customApi: string;
  apiKey: string;
  dandisetId: string;
  pathPrefix: string;
}): UploaderConfig {
  let api: string;
  let web: string | null;
  if (input.instance === "custom") {
    api = input.customApi.trim().replace(/\/+$/, "");
    web = null;
  } else {
    ({ api, web } = INSTANCES[input.instance]);
  }
  const rawId = input.dandisetId.trim();
  const idMatch = rawId.match(/(\d{6,})/);
  return {
    api,
    web,
    apiKey: input.apiKey.trim(),
    dandisetId: idMatch ? idMatch[1] : "",
    pathPrefix: input.pathPrefix.trim(),
  };
}

export function configProblems(cfg: UploaderConfig): string[] {
  const problems: string[] = [];
  if (!cfg.api || !/^https?:\/\//.test(cfg.api)) problems.push("API base URL is missing or invalid.");
  if (!cfg.apiKey) problems.push("API key is missing.");
  if (!cfg.dandisetId) problems.push("Dandiset ID is missing (expected something like 000123).");
  return problems;
}
