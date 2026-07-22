import "./style.css";
import { getElements } from "./ui/elements";
import { initDropzone } from "./ui/dropzone";
import { queueFileRow, uploadFile, type UploadOutcome, type HashJob } from "./ui/processFile";
import { humanSize, friendlyEta } from "./lib/format";
import { renderIdentity } from "./ui/connection";
import { renderFileTree, setRevealCount, DEFAULT_REVEAL_COUNT } from "./ui/fileTree";
import { createHashPool } from "./lib/etag-worker";
import { openChecksumCache, checksumCacheKey } from "./lib/checksum-cache";
import { planParts } from "./lib/etag";
import { loadStoredSettings, saveStoredSettings, resolveConfig, saveStoredTheme } from "./lib/settings";
import { startLogin, handleRedirectCallback, ensureFreshToken, revokeToken } from "./lib/oauth";
import { listIncomingDandisets, type IncomingDandiset } from "./lib/dandisets";
import type { UploaderConfig, OAuthTokenSet } from "./lib/types";
import type { DroppedFile } from "./lib/fileTree";
import type { FileRow } from "./ui/fileRow";
import { renderChangelogHtml, countChangelogVersions } from "./lib/changelog";
import changelog from "../CHANGELOG.md?raw";

declare const __APP_VERSION__: string;

// Hashing runs on a pool of FILE_CONCURRENCY generic part-hashing workers (real OS threads), one
// per CPU-core "lane". Every file's parts feed the same pool, so a lone large file fans out
// across all cores instead of serializing on one worker, while the worker count stays bounded no
// matter how many files are in flight. Workers are spawned lazily, not eagerly at page load.
const FILE_CONCURRENCY = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8));
// Part digests persist in IndexedDB across reloads and re-drops, so re-adding an unchanged file
// skips re-hashing it (stores only file names/paths and MD5 digests — see SECURITY.md).
const checksumCache = openChecksumCache();
const hashPool = createHashPool(FILE_CONCURRENCY, checksumCache);

const els = getElements();
const activeUploads = new Set<AbortController>();
const activeHashes = new Set<AbortController>();
const pending: { file: File; row: FileRow; path: string }[] = [];
let uploadBatchActive = false;

// "Cancel all" is offered whenever there's background work to stop: an upload batch in progress,
// or files still hashing (which starts on drop, before "Upload" is ever clicked).
function updateCancelAllVisibility(): void {
  els.cancelAllBtn.hidden = !uploadBatchActive && activeHashes.size === 0;
}

// Hashing starts the moment a file is dropped, not when "Upload" is clicked.
const hashJobs = new Map<File, HashJob>();

function startHashing(file: File, row: FileRow, relativePath: string): HashJob {
  ensureTicker();
  const parts = planParts(file.size);
  row.setBadge("Scanning", "busy");
  const abort = new AbortController();
  activeHashes.add(abort);
  updateCancelAllVisibility();
  const promise = hashPool.hash(
    file,
    parts,
    (f) => {
      row.setProgress(f * 0.999);
      reportHashBytes(file, f * file.size);
    },
    abort.signal,
    checksumCacheKey({ relativePath, name: file.name, size: file.size, lastModified: file.lastModified }),
  );
  promise
    .then(() => {
      hashedFiles++;
      reportHashBytes(file, file.size);
      row.hideBadge();
    })
    .catch((e: unknown) => {
      // Surfaced again (and handled) once uploadFile awaits this same promise; a cancelled scan
      // keeps its badge so the row doesn't silently look untouched.
      if (e instanceof DOMException && e.name === "AbortError") {
        row.setBadge("Cancelled", "warn");
      } else {
        row.hideBadge();
      }
    })
    .finally(() => {
      row.setProgress(0);
      activeHashes.delete(abort);
      updateCancelAllVisibility();
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
let hashedFiles = 0;
let totalFiles = 0;
const counts: Record<UploadOutcome, number> = { done: 0, replaced: 0, error: 0, cancelled: 0, blocked: 0 };
const lastHashBytes = new Map<File, number>();
const lastUploadBytes = new Map<File, number>();
let tickerRunning = false;

function ensureTicker(): void {
  if (tickerRunning) return;
  tickerRunning = true;
  window.setInterval(updateProgressSummary, 500);
}

// The "Speed" chips show an exponential moving average over roughly the last RATE_WINDOW_SEC of
// samples rather than the lifetime average: the lifetime figure keeps misreporting for minutes
// after a stall or a burst, while raw per-update deltas flicker. Samples closer together than
// RATE_SAMPLE_MIN_SEC are folded into the next one, so the rAF-coalesced bursts of worker
// messages don't feed near-zero dt into the average.
const RATE_WINDOW_SEC = 3;
const RATE_SAMPLE_MIN_SEC = 0.25;

// A phase's first ETA_WARMUP_SEC of activity shows "estimating…" instead of a time-left figure:
// checksum-cache hits complete whole files instantly at the start of a scan, and those bursts
// make the early estimate wildly optimistic (seconds shown for work that takes minutes). The
// clock starts at the phase's own first byte of progress, not when the summary appears, so the
// upload phase idling before "Upload" is clicked doesn't burn its warm-up on inactivity.
const ETA_WARMUP_SEC = 30;

interface RateTracker {
  lastSampleTime: number | null;
  lastSampleBytes: number;
  bytesPerSec: number;
  firstProgressTime: number | null;
}

const hashRate: RateTracker = { lastSampleTime: null, lastSampleBytes: 0, bytesPerSec: 0, firstProgressTime: null };
const uploadRate: RateTracker = { lastSampleTime: null, lastSampleBytes: 0, bytesPerSec: 0, firstProgressTime: null };

function sampleRate(tracker: RateTracker, doneBytes: number): number {
  const now = performance.now();
  if (tracker.lastSampleTime === null) {
    tracker.lastSampleTime = now;
    tracker.lastSampleBytes = doneBytes;
    return tracker.bytesPerSec;
  }
  const dt = (now - tracker.lastSampleTime) / 1000;
  if (dt < RATE_SAMPLE_MIN_SEC) return tracker.bytesPerSec;
  const instantaneous = (doneBytes - tracker.lastSampleBytes) / dt;
  const alpha = 1 - Math.exp(-dt / RATE_WINDOW_SEC);
  tracker.bytesPerSec += alpha * (instantaneous - tracker.bytesPerSec);
  tracker.lastSampleTime = now;
  tracker.lastSampleBytes = doneBytes;
  return tracker.bytesPerSec;
}

// Hash/upload progress arrives in a flood of worker messages (one per 16MB chunk, across up to
// 8 pool workers). Coalescing them into at most one DOM update per animation frame keeps the
// main thread from being swamped by redundant layout-invalidating writes.
let progressUpdateScheduled = false;
function scheduleProgressUpdate(): void {
  if (progressUpdateScheduled) return;
  progressUpdateScheduled = true;
  requestAnimationFrame(() => {
    progressUpdateScheduled = false;
    updateProgressSummary();
  });
}

function reportHashBytes(file: File, bytesDone: number): void {
  const prev = lastHashBytes.get(file) ?? 0;
  hashDoneBytes += bytesDone - prev;
  lastHashBytes.set(file, bytesDone);
  scheduleProgressUpdate();
}

function reportUploadBytes(file: File, bytesDone: number): void {
  const prev = lastUploadBytes.get(file) ?? 0;
  uploadDoneBytes += bytesDone - prev;
  lastUploadBytes.set(file, bytesDone);
  scheduleProgressUpdate();
}

interface PhaseChipEls {
  fill: HTMLDivElement;
  pct: HTMLSpanElement;
  done: HTMLSpanElement;
  rate: HTMLSpanElement;
  eta: HTMLSpanElement;
  files: HTMLSpanElement;
}

// Chip values pair a primary figure with a quieter suffix ("1.4 GB" + "of 3.4 GB"), composed
// from text nodes rather than markup strings.
function setChipValue(el: HTMLSpanElement, main: string, sub: string): void {
  const subSpan = document.createElement("span");
  subSpan.className = "progress-chip-sub";
  subSpan.textContent = ` ${sub}`;
  el.replaceChildren(document.createTextNode(main), subSpan);
}

function renderPhaseBar(
  chipEls: PhaseChipEls,
  tracker: RateTracker,
  phaseDoneBytes: number,
  phaseDoneFiles: number,
): void {
  const pct = totalBytes > 0 ? Math.min(100, Math.round((phaseDoneBytes / totalBytes) * 100)) : 0;
  chipEls.fill.style.width = `${pct}%`;
  chipEls.fill.parentElement?.setAttribute("aria-valuenow", String(pct));

  const finished = totalBytes > 0 && phaseDoneBytes >= totalBytes;
  // Freeze the smoothed rate once the phase completes (re-baselining for any later batch),
  // instead of letting further zero-delta samples decay the final figure toward 0 on screen.
  let rate: number;
  if (finished) {
    rate = tracker.bytesPerSec;
    tracker.lastSampleTime = null;
  } else {
    rate = sampleRate(tracker, phaseDoneBytes);
  }
  const remaining = Math.max(0, totalBytes - phaseDoneBytes);

  if (phaseDoneBytes > 0 && tracker.firstProgressTime === null) {
    tracker.firstProgressTime = performance.now();
  }
  const warmingUp =
    tracker.firstProgressTime === null || (performance.now() - tracker.firstProgressTime) / 1000 < ETA_WARMUP_SEC;

  chipEls.pct.textContent = `${pct}%`;
  setChipValue(chipEls.done, humanSize(phaseDoneBytes), `of ${humanSize(totalBytes)}`);
  chipEls.rate.textContent = rate > 0 ? `${humanSize(rate)}/s` : "—";
  chipEls.eta.textContent = finished
    ? "done"
    : rate <= 0
      ? "—"
      : warmingUp
        ? "estimating…"
        : friendlyEta(remaining / rate);
  setChipValue(chipEls.files, String(phaseDoneFiles), `of ${totalFiles}`);
}

function updateProgressSummary(): void {
  const finished = counts.done + counts.replaced + counts.error + counts.cancelled + counts.blocked;
  renderPhaseBar(
    {
      fill: els.progressHashFill,
      pct: els.progressHashPct,
      done: els.progressHashDone,
      rate: els.progressHashRate,
      eta: els.progressHashEta,
      files: els.progressHashFiles,
    },
    hashRate,
    hashDoneBytes,
    hashedFiles,
  );
  renderPhaseBar(
    {
      fill: els.progressUploadFill,
      pct: els.progressUploadPct,
      done: els.progressUploadDone,
      rate: els.progressUploadRate,
      eta: els.progressUploadEta,
      files: els.progressUploadFiles,
    },
    uploadRate,
    uploadDoneBytes,
    finished,
  );

  const leftParts: string[] = [];
  if (counts.done) leftParts.push(`${counts.done} done`);
  if (counts.error) leftParts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.cancelled) leftParts.push(`${counts.cancelled} cancelled`);
  if (counts.blocked) leftParts.push(`${counts.blocked} blocked`);
  els.progressFooterLeft.textContent = leftParts.join(", ");
  els.progressFooterMid.textContent = counts.replaced ? `${counts.replaced} replaced` : "";
}

// The slider's ruler is drawn at fixed percentages of the track — a tick per possible value
// would mean one element per dropped file, the same kind of unbounded DOM growth this file's
// other perf fixes avoid. Minor ticks land every 5%, with a labeled major tick per quarter.
const EXPAND_MINOR_TICKS = 20;
const EXPAND_LABEL_STOPS = 4;

function updateExpandDepthRange(): void {
  els.expandDepthInput.max = String(totalFiles);
  const ruler: HTMLSpanElement[] = [];
  for (let i = 0; i <= EXPAND_MINOR_TICKS; i++) {
    const tick = document.createElement("span");
    tick.className = i % (EXPAND_MINOR_TICKS / EXPAND_LABEL_STOPS) === 0 ? "tick major" : "tick";
    tick.style.left = `${(i / EXPAND_MINOR_TICKS) * 100}%`;
    ruler.push(tick);
  }
  // Deduped so a small drop doesn't repeat the same rounded number; each label sits at the track
  // position its value actually maps to.
  const values = new Set(
    Array.from({ length: EXPAND_LABEL_STOPS + 1 }, (_, i) => Math.round((i * totalFiles) / EXPAND_LABEL_STOPS)),
  );
  for (const v of values) {
    const label = document.createElement("span");
    label.className = "tick-label";
    label.style.left = totalFiles > 0 ? `${(v / totalFiles) * 100}%` : "0%";
    label.textContent = String(v);
    ruler.push(label);
  }
  els.expandDepthTicks.replaceChildren(...ruler);
  updateExpandBubble();
}

// Keeps the "N files" bubble riding centered over the slider thumb (the 8px inset is half the
// native thumb's width) and its number in sync with the input's value.
function updateExpandBubble(): void {
  const value = Number(els.expandDepthInput.value);
  const max = Number(els.expandDepthInput.max);
  els.expandDepthValue.textContent = String(value);
  const fraction = max > 0 ? value / max : 0;
  els.expandDepthBubble.style.left = `calc(8px + (100% - 16px) * ${fraction})`;
}

if (els.versionIndicator) {
  els.versionIndicator.textContent = `v${__APP_VERSION__}`;
}

// The modal opens on the latest few versions; "Show more" swaps in the entire changelog for
// anyone curious enough to keep reading.
const WHATS_NEW_RECENT_VERSIONS = 3;
els.whatsNewContent.innerHTML = renderChangelogHtml(changelog, WHATS_NEW_RECENT_VERSIONS);
els.whatsNewShowMore.hidden = countChangelogVersions(changelog) <= WHATS_NEW_RECENT_VERSIONS;
els.whatsNewShowMore.addEventListener("click", () => {
  els.whatsNewContent.innerHTML = renderChangelogHtml(changelog, Infinity);
  els.whatsNewShowMore.hidden = true;
});
els.whatsNewButton.addEventListener("click", () => els.whatsNewModal.showModal());
els.whatsNewClose.addEventListener("click", () => els.whatsNewModal.close());
els.whatsNewModal.addEventListener("click", (e) => {
  if (e.target === els.whatsNewModal) els.whatsNewModal.close();
});

// The inline script in index.html already applied any stored theme override before first paint,
// so the toggle only has to flip and persist it. With nothing stored, data-theme is unset and the
// OS preference is in effect, so the first click flips away from whatever is currently showing.
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
els.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme ?? (prefersDark.matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  saveStoredTheme(next);
});

let oauthTokens: OAuthTokenSet | null = null;
// The dandiset id restored from a previous session, applied once the dropdown is populated with
// the signed-in user's incoming datasets (a <select> can't hold a value before its options exist).
let storedDandisetId = "";

function loadSettings(): boolean {
  const s = loadStoredSettings();
  if (s) {
    if (s.dandisetId) storedDandisetId = s.dandisetId;
    if (s.oauth) oauthTokens = s.oauth;
  }
  return s !== null;
}

function saveSettings(): void {
  saveStoredSettings({
    dandisetId: els.dandisetId.value.trim(),
    oauth: oauthTokens ?? undefined,
  });
}

function currentConfig(): UploaderConfig {
  return resolveConfig({
    dandisetId: els.dandisetId.value,
    oauthAccessToken: oauthTokens?.accessToken,
  });
}

function renderAuthUI(): void {
  const signedIn = !!oauthTokens;
  els.oauthSigninBtn.hidden = signedIn;
  els.oauthSignedIn.hidden = !signedIn;
}

// Refreshes the OAuth access token first if it's near expiry, so the config used for the request
// that follows always carries a live token instead of one that's about to be rejected.
async function ensureFreshOAuth(): Promise<void> {
  if (!oauthTokens) return;
  const fresh = await ensureFreshToken(oauthTokens).catch(() => oauthTokens!);
  if (fresh !== oauthTokens) {
    oauthTokens = fresh;
    saveSettings();
  }
}

// The dataset picker has three mutually exclusive views: a plain-text status message (signed
// out, loading, no datasets, error), plain text naming the one dataset there's nothing to choose
// between, or a dropdown when there's an actual choice to make.
function showDandisetView(view: "message" | "single" | "dropdown"): void {
  els.dandisetMessage.hidden = view !== "message";
  els.dandisetSingle.hidden = view !== "single";
  els.dandisetId.hidden = view !== "dropdown";
}

function setDandisetPlaceholder(text: string): void {
  els.dandisetMessage.textContent = text;
  showDandisetView("message");
}

// With only one incoming dataset there's nothing to choose between, so show its name as plain
// text instead of a single-option dropdown (the card heading's "View dataset" link covers the
// way out to the archive).
function showDandisetSingle(dataset: IncomingDandiset): void {
  showDandisetView("single");
  const idCode = document.createElement("code");
  idCode.textContent = dataset.identifier;
  els.dandisetSingleText.replaceChildren("Uploading directly to EMBER Dandiset ", idCode, `, "${dataset.title}"`);
}

// Populates the dandiset picker (dropdown or single-dataset text) from a resolved list of
// datasets, shared by the real signed-in fetch and the "?test&num_datasets=N" debug override.
function applyDatasetList(datasets: IncomingDandiset[]): void {
  if (!datasets.length) {
    setDandisetPlaceholder(
      "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this.",
    );
    return;
  }
  els.dandisetId.replaceChildren(
    ...datasets.map((d) => {
      const opt = document.createElement("option");
      opt.value = d.identifier;
      opt.textContent = `${d.title} (${d.identifier})`;
      return opt;
    }),
  );
  const match = datasets.find((d) => d.identifier === storedDandisetId);
  const selected = match ?? datasets[0];
  // The select stays populated even when hidden (single-dataset view) so currentConfig() keeps
  // reading a real dandiset id from it.
  els.dandisetId.value = selected.identifier;
  if (datasets.length === 1) {
    showDandisetSingle(selected);
  } else {
    showDandisetView("dropdown");
  }
}

// Debug-only escape hatch for previewing the dataset picker's various states without a real
// account: e.g. "?test&num_datasets=2" fills in that many fake datasets, and "?test&num_datasets=0"
// previews the no-datasets-found state. Bypasses sign-in entirely, so it also works for a
// signed-out visitor. "?test" alone (no num_datasets) is a no-op, so the override only ever
// kicks in when explicitly parameterized.
function readTestDatasetOverride(): IncomingDandiset[] | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("num_datasets");
  if (!params.has("test") || raw === null) return null;
  const count = Math.max(0, Number(raw) || 0);
  // Negative identifiers (e.g. "-000001") so a fake dataset is never mistaken for a real one.
  return Array.from({ length: count }, (_, i) => ({
    identifier: `-${String(i + 1).padStart(6, "0")}`,
    title: `Incoming: Test dataset ${i + 1}`,
  }));
}

// Populates the "Incoming dataset" dropdown from the signed-in user's owned dandisets, since
// there's no longer a free-text Dandiset ID field to type into.
async function refreshDandisetOptions(): Promise<void> {
  const testDatasets = readTestDatasetOverride();
  if (testDatasets) {
    // Only the dataset list is faked; sign-in state (and thus the header avatar) still reflects
    // whatever the browser is really signed in as, if anything.
    if (oauthTokens) {
      await ensureFreshOAuth();
      void renderIdentity(els, currentConfig());
    }
    applyDatasetList(testDatasets);
    updateViewDatasetLink();
    return;
  }
  if (!oauthTokens) {
    setDandisetPlaceholder("Please sign in to see your incoming datasets.");
    updateViewDatasetLink();
    return;
  }
  await ensureFreshOAuth();
  void renderIdentity(els, currentConfig());
  setDandisetPlaceholder("Loading your incoming datasets…");
  try {
    const datasets = await listIncomingDandisets(currentConfig());
    applyDatasetList(datasets);
  } catch {
    setDandisetPlaceholder("Could not load your datasets");
  }
  saveSettings();
  runConnectionCheck();
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

// How many files to queue (create a row + start hashing) per animation frame. Doing this for an
// entire large folder in one synchronous loop would block the browser from painting until it's
// done, on top of the tree render itself.
const ADD_FILES_CHUNK_SIZE = 200;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function addFiles(entries: DroppedFile[]): Promise<void> {
  const isFirstBatch = totalFiles === 0;
  totalFiles += entries.length;
  updateExpandDepthRange();
  if (isFirstBatch) {
    els.expandDepthInput.value = String(Math.min(DEFAULT_REVEAL_COUNT, totalFiles));
    updateExpandBubble();
  }

  const targets = await renderFileTree(els.fileList, entries);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const container = targets.get(entry.file) ?? els.fileList;
    const { row, path } = queueFileRow(container, entry.file, entry.relativePath);
    // Rows start hidden; the reveal pass below decides which ones the slider's budget covers.
    row.el.hidden = true;
    pending.push({ file: entry.file, row, path });
    totalBytes += entry.file.size;
    startHashing(entry.file, row, entry.relativePath);
    if ((i + 1) % ADD_FILES_CHUNK_SIZE === 0) await yieldToMain();
  }
  setRevealCount(els.fileList, Number(els.expandDepthInput.value));

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
  await ensureFreshOAuth();
  const batch = pending.splice(0, pending.length);
  updateUploadBar();
  uploadBatchActive = true;
  updateCancelAllVisibility();
  const cfg = currentConfig();

  await runQueue(batch, async ({ file, row, path }) => {
    const job = hashJobs.get(file)!;
    const outcome = await uploadFile(row, file, path, cfg, activeUploads, job, (bytesDone) =>
      reportUploadBytes(file, bytesDone),
    );
    counts[outcome]++;
    updateProgressSummary();
  });

  uploadBatchActive = false;
  updateCancelAllVisibility();
  updateUploadBar();
}

function runConnectionCheck(): void {
  void (async () => {
    await ensureFreshOAuth();
    updateViewDatasetLink();
  })();
}

const callbackTokens = await handleRedirectCallback().catch((e) => {
  console.warn("OAuth sign-in callback failed:", e);
  return null;
});
loadSettings();
if (callbackTokens) {
  oauthTokens = callbackTokens;
  saveSettings();
}
renderAuthUI();
initDropzone(els, addFiles);
els.dandisetId.addEventListener("change", runConnectionCheck);
document.getElementById("config-form")!.addEventListener("submit", (e) => e.preventDefault());
els.oauthSigninBtn.addEventListener("click", () => void startLogin());
els.oauthSignoutBtn.addEventListener("click", () => {
  const tokens = oauthTokens;
  oauthTokens = null;
  saveSettings();
  renderAuthUI();
  if (tokens) void revokeToken(tokens);
  void refreshDandisetOptions();
});
void refreshDandisetOptions();
// A range input fires "input" continuously while dragging (many events per second).
// setRevealCount() walks every file row in the tree, so coalescing to at most once per
// animation frame keeps a drag from becoming an unresponsive flood of full-tree traversals.
let expandDepthUpdateScheduled = false;
els.expandDepthInput.addEventListener("input", () => {
  updateExpandBubble();
  if (expandDepthUpdateScheduled) return;
  expandDepthUpdateScheduled = true;
  requestAnimationFrame(() => {
    expandDepthUpdateScheduled = false;
    setRevealCount(els.fileList, Number(els.expandDepthInput.value));
  });
});
els.uploadAllBtn.addEventListener("click", () => void startUpload());
els.cancelAllBtn.addEventListener("click", () => {
  for (const controller of activeHashes) controller.abort();
  for (const controller of activeUploads) controller.abort();
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
