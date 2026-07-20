import "./style.css";
import { getElements } from "./ui/elements";
import { initDropzone } from "./ui/dropzone";
import { processFile } from "./ui/processFile";
import { testConnection } from "./ui/connection";
import { loadStoredSettings, saveStoredSettings, resolveConfig } from "./lib/settings";
import type { UploaderConfig } from "./lib/types";

declare const __APP_VERSION__: string;

const els = getElements();
const activeUploads = new Set<AbortController>();

if (els.versionIndicator) {
  els.versionIndicator.textContent = `v${__APP_VERSION__}`;
}

function loadSettings(): boolean {
  const s = loadStoredSettings();
  if (s) {
    if (s.apiKey) els.apiKey.value = s.apiKey;
    if (s.dandisetId) els.dandisetId.value = s.dandisetId;
  }
  return s !== null;
}

function saveSettings(): void {
  saveStoredSettings({
    apiKey: els.apiKey.value.trim(),
    dandisetId: els.dandisetId.value.trim(),
  });
}

function currentConfig(): UploaderConfig {
  return resolveConfig({
    apiKey: els.apiKey.value,
    dandisetId: els.dandisetId.value,
  });
}

function addFiles(fileList: FileList): void {
  for (const file of Array.from(fileList)) {
    void processFile(els, file, currentConfig, activeUploads);
  }
}

function runConnectionCheck(): void {
  void testConnection(els, currentConfig, saveSettings);
}

const hadStoredSettings = loadSettings();
initDropzone(els, addFiles);
[els.apiKey, els.dandisetId].forEach((el) => el.addEventListener("change", runConnectionCheck));
document.getElementById("config-form")!.addEventListener("submit", (e) => e.preventDefault());
if (hadStoredSettings) runConnectionCheck();
els.apiKeyHelp.addEventListener("click", () => {
  els.apiKeyHelpText.hidden = !els.apiKeyHelpText.hidden;
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
