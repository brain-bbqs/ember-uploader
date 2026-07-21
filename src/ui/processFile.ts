import type { FilePart, UploaderConfig } from "../lib/types";
import { createFileRow, type FileRow } from "./fileRow";
import { configProblems } from "../lib/settings";
import { sanitizeFilename, sanitizePath } from "../lib/sanitize";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../lib/upload-pipeline";
import { diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";

export type UploadOutcome = "blocked" | "cancelled" | "error" | "skipped" | "done";

/** A background hash already started (or completed) for a file — see `startHashing` in main.ts. */
export interface HashJob {
  parts: FilePart[];
  promise: Promise<string>;
}

let fileCounter = 0;

/** Adds a row to the file list with its computed archive path, ready for a later batch upload. */
export function queueFileRow(
  container: HTMLUListElement,
  file: File,
  relativePath: string,
): { row: FileRow; path: string } {
  const id = `file-${fileCounter++}`;
  const prefix = ["sourcedata", "raw", ...relativePath.split("/").filter(Boolean)].join("/");
  const path = sanitizePath(prefix, sanitizeFilename(file.name));
  const row = createFileRow(container, file, id, path);
  return { row, path };
}

export async function uploadFile(
  row: FileRow,
  file: File,
  path: string,
  cfg: UploaderConfig,
  activeUploads: Set<AbortController>,
  hashJob: HashJob,
  // Reports bytes uploaded so far for this file (0..file.size), for an aggregate progress bar.
  onUploadProgress?: (bytesDone: number) => void,
  // Fires once, right before the first real byte leaves for S3 (not on skip/blocked/error).
  onUploadStart?: () => void,
): Promise<UploadOutcome> {
  const problems = configProblems(cfg);
  if (problems.length) {
    row.setBadge("Blocked", "err");
    row.setStatus(problems.join(" "), "err");
    onUploadProgress?.(file.size);
    return "blocked";
  }

  const abort = new AbortController();
  activeUploads.add(abort);

  try {
    // --- 1. Checksum — already started (or finished) in the background -----
    const etag = await hashJob.promise;
    row.setProgress(0);

    // --- 2. Conflict check (skip automatically; never overwrites) ------
    row.setBadge("Uploading", "busy");
    const existing = await findExistingAsset(cfg, path);
    if (existing) {
      row.setBadge("Skipped", "warn");
      row.setStatus("already exists", "warn");
      onUploadProgress?.(file.size);
      return "skipped";
    }

    // --- 3. Blob upload --------------------------------------------------
    onUploadStart?.();
    const { blobId } = await uploadBlob(
      cfg,
      file,
      etag,
      hashJob.parts,
      (f) => {
        row.setProgress(f);
        row.setStatus(`${(f * 100).toFixed(0)}%`);
        onUploadProgress?.(f * file.size);
      },
      abort.signal,
    );

    // --- 4. Asset registration -------------------------------------------
    await createOrReplaceAsset(cfg, path, blobId, null, file.type || undefined);

    row.setBadge("Done", "ok");
    row.setProgress(1, true);
    row.setStatus("", "ok");
    onUploadProgress?.(file.size);
    return "done";
  } catch (e) {
    onUploadProgress?.(file.size);
    if (abort.signal.aborted) {
      row.setBadge("Cancelled", "warn");
      return "cancelled";
    }
    row.setBadge("Error", "err");
    let msg = friendlyError(e);
    if (e instanceof ApiError && e.status === 0) {
      try {
        msg += ` ${await diagnoseCors(cfg)}`;
      } catch {
        /* diagnosis is best-effort */
      }
    }
    row.setStatus(msg, "err");
    console.error(e);
    return "error";
  } finally {
    activeUploads.delete(abort);
  }
}
