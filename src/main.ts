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

function toggleCustomApi(): void {
  els.customApiLabel.hidden = els.instance.value !== "custom";
}

function loadSettings(): boolean {
  const s = loadStoredSettings();
  if (s) {
    if (s.instance) els.instance.value = s.instance;
    if (s.customApi) els.customApi.value = s.customApi;
    if (s.apiKey) els.apiKey.value = s.apiKey;
    if (s.dandisetId) els.dandisetId.value = s.dandisetId;
    if (s.pathPrefix) els.pathPrefix.value = s.pathPrefix;
  }
  toggleCustomApi();
  return s !== null;
}

function saveSettings(): void {
  saveStoredSettings({
    instance: els.instance.value,
    customApi: els.customApi.value.trim(),
    apiKey: els.apiKey.value.trim(),
    dandisetId: els.dandisetId.value.trim(),
    pathPrefix: els.pathPrefix.value.trim(),
  });
}

function currentConfig(): UploaderConfig {
  return resolveConfig({
    instance: els.instance.value,
    customApi: els.customApi.value,
    apiKey: els.apiKey.value,
    dandisetId: els.dandisetId.value,
    pathPrefix: els.pathPrefix.value,
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
els.instance.addEventListener("change", () => {
  toggleCustomApi();
  runConnectionCheck();
});
[els.customApi, els.apiKey, els.dandisetId, els.pathPrefix].forEach((el) =>
  el.addEventListener("change", runConnectionCheck),
);
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
