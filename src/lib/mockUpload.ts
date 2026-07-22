import type { DroppedFile } from "./fileTree";

/** Bounds for the "?test&mock_upload=N" live test injection's fake file sizes (see docs/README.md). */
export const MOCK_FILE_MIN_SIZE = 10 * 1024 * 1024; // 10 MB
export const MOCK_FILE_MAX_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB

const FOLDER_NAMES = [
  "sub-01",
  "sub-02",
  "sub-03",
  "sub-04",
  "ses-1",
  "ses-2",
  "ses-3",
  "raw",
  "processed",
  "calibration",
  "pilot",
  "cohort-a",
  "cohort-b",
];
const FILE_STEMS = ["recording", "clip", "trace", "scan", "sample", "log", "frame", "segment", "session"];
const FILE_EXTENSIONS = ["mp4", "avi", "mov", "csv", "json", "dat", "h5", "png", "wav", "txt"];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomMockSize(): number {
  return Math.round(MOCK_FILE_MIN_SIZE + Math.random() * (MOCK_FILE_MAX_SIZE - MOCK_FILE_MIN_SIZE));
}

// Depth 0-3, picked from a small shared pool so files land inside a handful of reused folders
// (siblings) rather than every file getting a folder all to itself.
function randomRelativePath(): string {
  const depth = Math.floor(Math.random() * 4);
  return Array.from({ length: depth }, () => pick(FOLDER_NAMES)).join("/");
}

function randomFileName(index: number): string {
  return `${pick(FILE_STEMS)}-${String(index).padStart(3, "0")}.${pick(FILE_EXTENSIONS)}`;
}

/**
 * Builds a fake `File` reporting `size` bytes without allocating any real content: `size` is
 * defined as an own property that shadows `Blob.prototype`'s accessor, which every reader here
 * (humanSize, the progress bars, etc.) reaches through ordinary `file.size` access.
 */
function createMockFile(name: string, size: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/**
 * Generates `count` fake dropped files nested randomly across folders, with sizes drawn uniformly
 * from [MOCK_FILE_MIN_SIZE, MOCK_FILE_MAX_SIZE]. Backs the "?test&mock_upload=N" debug injection
 * that previews the scanning/uploading UI without any real files — see docs/README.md.
 */
export function generateMockDroppedFiles(count: number): DroppedFile[] {
  return Array.from({ length: count }, (_, i) => ({
    file: createMockFile(randomFileName(i + 1), randomMockSize()),
    relativePath: randomRelativePath(),
  }));
}

// Bounds for a mock phase's animation length: wide enough that a batch of small and huge fake
// files still looks staggered, short enough that even a 100 GB file "finishes" in a couple of
// seconds -- the upload phase additionally runs through the same concurrency-limited queue a
// real batch would, so a large mock_upload count still finishes in waves rather than all at once.
const MOCK_PHASE_MIN_MS = 600;
const MOCK_PHASE_MAX_MS = 3000;

// Compresses the 10 MB-100 GB mock size range above into a watchable animation: duration grows
// with log2(size) rather than size itself, so scanning/uploading a fake 100 GB file doesn't take
// literal hours.
export function mockPhaseDurationMs(sizeBytes: number): number {
  const mb = sizeBytes / (1024 * 1024);
  const scaled = MOCK_PHASE_MIN_MS + Math.log2(Math.max(1, mb)) * 200;
  return Math.min(MOCK_PHASE_MAX_MS, Math.max(MOCK_PHASE_MIN_MS, scaled));
}

// Ticks `onProgress(bytesDone)` once per animation frame until `totalBytes` worth of (fake)
// progress has been reported, over roughly `durationMs` of real time. Rejects with the same
// AbortError shape a real cancelled fetch/hash would, so callers can share their cancellation
// handling with the real hashing/upload paths.
export function simulateProgress(
  totalBytes: number,
  durationMs: number,
  signal: AbortSignal,
  onProgress: (bytesDone: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const start = performance.now();
    let frame: number;
    const onAbort = () => {
      cancelAnimationFrame(frame);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const tick = () => {
      const fraction = Math.min(1, (performance.now() - start) / durationMs);
      onProgress(totalBytes * fraction);
      if (fraction >= 1) {
        signal.removeEventListener("abort", onAbort);
        resolve();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}
