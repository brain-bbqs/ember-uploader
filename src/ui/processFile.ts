import type { FilePart, UploaderConfig } from "../lib/types";
import { createFileRow, type FileRow } from "./fileRow";
import { configProblems } from "../lib/settings";
import { sanitizeFilename, sanitizePath } from "../lib/sanitize";
import { planParts } from "../lib/etag";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../lib/upload-pipeline";
import { diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";

export type HashFn = (
  file: File,
  parts: FilePart[],
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) => Promise<string>;

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
  hash: HashFn,
): Promise<void> {
  const problems = configProblems(cfg);
  if (problems.length) {
    row.setBadge("Blocked", "err");
    row.setStatus(problems.join(" "), "err");
    return;
  }

  const abort = new AbortController();
  activeUploads.add(abort);

  try {
    // --- 1. Checksum (off the main thread, via a per-lane worker) ------
    row.setBadge("Hashing", "busy");
    const parts = planParts(file.size);
    const etag = await hash(file, parts, (f) => row.setProgress(f * 0.999), abort.signal);
    row.setProgress(0);

    // --- 2. Conflict check (skip automatically; never overwrites) ------
    row.setBadge("Uploading", "busy");
    const existing = await findExistingAsset(cfg, path);
    if (existing) {
      row.setBadge("Skipped", "warn");
      row.setStatus("already exists", "warn");
      return;
    }

    // --- 3. Blob upload --------------------------------------------------
    const { blobId } = await uploadBlob(
      cfg,
      file,
      etag,
      parts,
      (f) => {
        row.setProgress(f);
        row.setStatus(`${(f * 100).toFixed(0)}%`);
      },
      abort.signal,
    );

    // --- 4. Asset registration -------------------------------------------
    const asset = await createOrReplaceAsset(cfg, path, blobId, null, file.type || undefined);

    row.setBadge("Done", "ok");
    row.setProgress(1, true);
    row.setStatus("", "ok");
    if (cfg.web) {
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const viewUrl = `${cfg.web}/dandiset/${cfg.dandisetId}/draft/files` + `?location=${encodeURIComponent(folder)}`;
      const link = document.createElement("a");
      link.href = viewUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "view ↗";
      row.status.append(link, " ");
    }
    const dl = document.createElement("a");
    dl.href = `${cfg.api}/assets/${asset.asset_id}/download/`;
    dl.target = "_blank";
    dl.rel = "noopener";
    dl.textContent = "download ↗";
    row.status.append(dl);
  } catch (e) {
    if (abort.signal.aborted) {
      row.setBadge("Cancelled", "warn");
    } else {
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
    }
  } finally {
    activeUploads.delete(abort);
  }
}
