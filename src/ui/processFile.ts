import type { FilePart, UploaderConfig } from "../lib/types";
import { createFileRow, type FileRow } from "./fileRow";
import { configProblems } from "../lib/settings";
import { sanitizeFilename, sanitizePath } from "../lib/sanitize";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../lib/upload-pipeline";
import { diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";

export type UploadOutcome = "blocked" | "cancelled" | "error" | "replaced" | "done";

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

    // --- 2. Existing-asset lookup -----------------------------------------
    // A path match alone says nothing about content, so it never skips the upload;
    // it only tells asset registration to replace (PUT) instead of create (POST).
    // Content dedup stays server-side: uploadBlob's digest check reuses the
    // existing blob without re-transferring bytes when the content is already known.
    row.setBadge("Uploading", "busy");
    const existing = await findExistingAsset(cfg, path);

    // --- 3. Blob upload --------------------------------------------------
    const { blobId, reused } = await uploadBlob(
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
    await createOrReplaceAsset(cfg, path, blobId, existing?.asset_id ?? null, file.type || undefined);

    if (existing) {
      row.setBadge("Replaced", "ok");
      row.setStatus(reused ? "matched existing content" : "content updated", "ok");
    } else {
      row.setBadge("Done", "ok");
      row.setStatus("", "ok");
    }
    row.setProgress(1, true);
    onUploadProgress?.(file.size);
    return existing ? "replaced" : "done";
  } catch (e) {
    onUploadProgress?.(file.size);
    // The AbortError check catches a hash cancelled via "Cancel all" before this upload's own
    // controller existed (hashJob.promise rejects with it when awaited above).
    if (abort.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
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
