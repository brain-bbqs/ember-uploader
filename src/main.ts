import "./style.css";
import { getElements } from "./ui/elements";
import { initDropzone } from "./ui/dropzone";
import { queueFileRow, uploadFile, type UploadOutcome, type HashJob } from "./ui/processFile";
import { humanSize, formatDuration } from "./lib/format";
import { testConnection } from "./ui/connection";
import { renderFileTree, setExpandDepth, DEFAULT_EXPAND_DEPTH } from "./ui/fileTree";
import { createEtagWorker } from "./lib/etag-worker";
import { planParts } from "./lib/etag";
import { loadStoredSettings, saveStoredSettings, resolveConfig } from "./lib/settings";
import { maxDepth, buildTree } from "./lib/fileTree";
import type { UploaderConfig } from "./lib/types";
import type { DroppedFile } from "./lib/fileTree";
import type { FileRow } from "./ui/fileRow";
import { renderChangelogHtml } from "./lib/changelog";
import changelog from "../CHANGELOG.md?raw";

declare const __APP_VERSION__: string;

// One hashing worker (a real OS thread) per CPU-core "lane", so hashing N files at once actually
// uses N cores instead of interleaving on the single JS main thread. Workers are spawned lazily
// per lane on first use, not eagerly at page load.
const FILE_CONCURRENCY = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8));
const hashWorkers: ReturnType<typeof createEtagWorker>[] = [];
function getHashWorker(lane: number): ReturnType<typeof createEtagWorker> {
  return (hashWorkers[lane] ??= createEtagWorker());
}

const els = getElements();
const activeUploads = new Set<AbortController>();
const pending: { file: File; row: FileRow; path: string }[] = [];

// Hashing starts the moment a file is dropped, not when "Upload" is clicked. Each lane's worker
// processes one file at a time, so hash requests for the same lane are chained sequentially;
// different lanes still run fully in parallel.
const hashJobs = new Map<File, HashJob>();
const laneQueues: Promise<unknown>[] = [];
let nextHashLane = 0;

function runOnLane(lane: number, task: () => Promise<string>): Promise<string> {
  const prev = laneQueues[lane] ?? Promise.resolve();
  const next = prev.then(task, task);
  laneQueues[lane] = next.catch(() => {});
  return next;
}

function startHashing(file: File, row: FileRow): HashJob {
  ensureScanTimerStarted();
  const parts = planParts(file.size);
  const lane = nextHashLane++ % FILE_CONCURRENCY;
  row.setBadge("Scanning", "busy");
  const promise = runOnLane(lane, () =>
    getHashWorker(lane).hash(file, parts, (f) => {
      row.setProgress(f * 0.999);
      reportHashBytes(file, f * file.size);
    }),
  );
  promise
    .then(() => reportHashBytes(file, file.size))
    .catch(() => {
      /* surfaced again (and handled) once uploadFile awaits this same promise */
    })
    .finally(() => {
      row.setProgress(0);
      row.hideBadge();
    });
  const job: HashJob = { parts, promise };
  hashJobs.set(file, job);
  return job;
}

// Cumulative progress tracker covering every file added this session (across all "Upload"
// clicks), so the summary stays meaningful even after multiple rounds of dropping + uploading.
let totalBytes = 0;
let hashDoneBytes = 0;
let uploadDoneBytes = 0;
let totalFiles = 0;
const counts: Record<UploadOutcome, number> = { done: 0, skipped: 0, error: 0, cancelled: 0, blocked: 0 };
const lastHashBytes = new Map<File, number>();
const lastUploadBytes = new Map<File, number>();
let treeMaxDepth = 0;
let scanStart: number | null = null;
let uploadStart: number | null = null;
let tickerRunning = false;

function ensureTicker(): void {
  if (tickerRunning) return;
  tickerRunning = true;
  window.setInterval(updateProgressSummary, 500);
}

function ensureScanTimerStarted(): void {
  ensureTicker();
  scanStart ??= performance.now();
}

function ensureUploadTimerStarted(): void {
  ensureTicker();
  uploadStart ??= performance.now();
}

function elapsedMsSince(start: number | null): number {
  return start !== null ? performance.now() - start : 0;
}

function reportHashBytes(file: File, bytesDone: number): void {
  const prev = lastHashBytes.get(file) ?? 0;
  hashDoneBytes += bytesDone - prev;
  lastHashBytes.set(file, bytesDone);
  updateProgressSummary();
}

function reportUploadBytes(file: File, bytesDone: number): void {
  const prev = lastUploadBytes.get(file) ?? 0;
  uploadDoneBytes += bytesDone - prev;
  lastUploadBytes.set(file, bytesDone);
  updateProgressSummary();
}

function renderPhaseBar(
  fillEl: HTMLDivElement,
  textEl: HTMLSpanElement,
  phaseDoneBytes: number,
  elapsedSec: number,
): void {
  const pct = totalBytes > 0 ? Math.min(100, Math.round((phaseDoneBytes / totalBytes) * 100)) : 0;
  fillEl.style.width = `${pct}%`;
  const rate = elapsedSec > 0 ? phaseDoneBytes / elapsedSec : 0;
  const remaining = Math.max(0, totalBytes - phaseDoneBytes);
  const etaSec = rate > 0 ? remaining / rate : NaN;

  const pctSpan = document.createElement("span");
  pctSpan.className = "stat-pct";
  pctSpan.textContent = `${pct}%`;

  const bytesSpan = document.createElement("span");
  bytesSpan.className = "stat-bytes";
  bytesSpan.textContent = `(${humanSize(phaseDoneBytes)} / ${humanSize(totalBytes)})`;

  const nodes: Node[] = [pctSpan, bytesSpan];
  if (elapsedSec > 0) {
    const timingSpan = document.createElement("span");
    timingSpan.className = "stat-timing";
    timingSpan.textContent =
      rate > 0
        ? `[${formatDuration(elapsedSec)}<${formatDuration(etaSec)}, ${humanSize(rate)}/s]`
        : `[${formatDuration(elapsedSec)}]`;
    nodes.push(timingSpan);
  }
  textEl.replaceChildren(...nodes);
}

function updateProgressSummary(): void {
  renderPhaseBar(els.progressHashFill, els.progressHashText, hashDoneBytes, elapsedMsSince(scanStart) / 1000);
  renderPhaseBar(els.progressUploadFill, els.progressUploadText, uploadDoneBytes, elapsedMsSince(uploadStart) / 1000);

  const finished = counts.done + counts.skipped + counts.error + counts.cancelled + counts.blocked;
  const leftParts: string[] = [];
  if (counts.done) leftParts.push(`${counts.done} done`);
  if (counts.error) leftParts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.cancelled) leftParts.push(`${counts.cancelled} cancelled`);
  if (counts.blocked) leftParts.push(`${counts.blocked} blocked`);
  els.progressFooterLeft.textContent = leftParts.join(", ");
  els.progressFooterMid.textContent = counts.skipped ? `${counts.skipped} skipped` : "";
  els.progressFooterRight.textContent = `${finished}/${totalFiles} files`;
}

function updateExpandDepthRange(): void {
  els.expandDepthInput.max = String(treeMaxDepth);
  els.expandDepthTicks.replaceChildren(
    ...Array.from({ length: treeMaxDepth + 1 }, (_, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      return opt;
    }),
  );
  els.expandDepthValue.textContent = els.expandDepthInput.value;
}

if (els.versionIndicator) {
  els.versionIndicator.textContent = `v${__APP_VERSION__}`;
}

els.whatsNewContent.innerHTML = renderChangelogHtml(changelog, 3);
els.whatsNewButton.addEventListener("click", () => els.whatsNewModal.showModal());
els.whatsNewClose.addEventListener("click", () => els.whatsNewModal.close());
els.whatsNewModal.addEventListener("click", (e) => {
  if (e.target === els.whatsNewModal) els.whatsNewModal.close();
});

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

function updateViewDatasetLink(): void {
  const cfg = currentConfig();
  if (cfg.web && cfg.dandisetId) {
    els.viewDatasetLink.href = `${cfg.web}/dandiset/${cfg.dandisetId}/draft/files`;
    els.viewDatasetLink.hidden = false;
  } else {
    els.viewDatasetLink.hidden = true;
  }
}

function updateUploadBar(): void {
  els.uploadBar.hidden = els.fileList.children.length === 0;
  els.uploadAllBtn.hidden = pending.length === 0;
  els.uploadAllBtn.textContent = `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`;
}

function addFiles(entries: DroppedFile[]): void {
  const isFirstBatch = totalFiles === 0;
  treeMaxDepth = Math.max(treeMaxDepth, maxDepth(buildTree(entries)));
  updateExpandDepthRange();
  if (isFirstBatch) {
    els.expandDepthInput.value = String(Math.min(DEFAULT_EXPAND_DEPTH, treeMaxDepth));
    els.expandDepthValue.textContent = els.expandDepthInput.value;
  }

  const targets = renderFileTree(els.fileList, entries, Number(els.expandDepthInput.value));
  for (const entry of entries) {
    const container = targets.get(entry.file) ?? els.fileList;
    const { row, path } = queueFileRow(container, entry.file, entry.relativePath);
    pending.push({ file: entry.file, row, path });
    totalBytes += entry.file.size;
    startHashing(entry.file, row);
  }
  totalFiles += entries.length;

  const hasFiles = els.fileList.children.length > 0;
  els.destRoot.hidden = !hasFiles;
  els.progressSummary.hidden = !hasFiles;
  updateProgressSummary();
  updateUploadBar();
  updateViewDatasetLink();
}

async function runQueue<T>(items: T[], worker: (item: T, lane: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function run(lane: number): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], lane);
    }
  }
  await Promise.all(Array.from({ length: Math.min(FILE_CONCURRENCY, items.length) }, (_, lane) => run(lane)));
}

async function startUpload(): Promise<void> {
  const batch = pending.splice(0, pending.length);
  updateUploadBar();
  els.cancelAllBtn.hidden = false;
  const cfg = currentConfig();

  await runQueue(batch, async ({ file, row, path }) => {
    const job = hashJobs.get(file)!;
    const outcome = await uploadFile(
      row,
      file,
      path,
      cfg,
      activeUploads,
      job,
      (bytesDone) => reportUploadBytes(file, bytesDone),
      ensureUploadTimerStarted,
    );
    counts[outcome]++;
    updateProgressSummary();
  });

  els.cancelAllBtn.hidden = true;
  updateUploadBar();
}

function runConnectionCheck(): void {
  void testConnection(els, currentConfig, saveSettings);
  updateViewDatasetLink();
}

const hadStoredSettings = loadSettings();
initDropzone(els, addFiles);
[els.apiKey, els.dandisetId].forEach((el) => el.addEventListener("change", runConnectionCheck));
document.getElementById("config-form")!.addEventListener("submit", (e) => e.preventDefault());
if (hadStoredSettings) runConnectionCheck();
els.apiKeyHelp.addEventListener("click", () => {
  els.apiKeyHelpText.hidden = !els.apiKeyHelpText.hidden;
});
els.expandDepthInput.addEventListener("input", () => {
  const depth = Number(els.expandDepthInput.value);
  els.expandDepthValue.textContent = String(depth);
  setExpandDepth(els.fileList, depth);
});
els.uploadAllBtn.addEventListener("click", () => void startUpload());
els.cancelAllBtn.addEventListener("click", () => {
  for (const controller of activeUploads) controller.abort();
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
