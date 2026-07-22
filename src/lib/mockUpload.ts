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
