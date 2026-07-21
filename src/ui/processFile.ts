import type { UploaderConfig } from "../lib/types";
import { createFileRow, type FileRow } from "./fileRow";
import { configProblems } from "../lib/settings";
import { sanitizeFilename, sanitizePath } from "../lib/sanitize";
import { planParts, computeDandiEtag } from "../lib/etag";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../lib/upload-pipeline";
import { diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";

let fileCounter = 0;

/** Adds a row to the file list with its suggested archive path, ready for a later batch upload. */
export function queueFileRow(container: HTMLUListElement, file: File, relativePath: string): FileRow {
  const id = `file-${fileCounter++}`;
  const row = createFileRow(container, file, id);
  const prefix = ["sourcedata", "raw", ...relativePath.split("/").filter(Boolean)].join("/");
  row.pathInput.value = sanitizePath(prefix, sanitizeFilename(file.name));
  row.setBadge("Queued", "busy");
  row.setStatus("Ready to upload.");
  return row;
}

export async function uploadFile(
  row: FileRow,
  file: File,
  cfg: UploaderConfig,
  activeUploads: Set<AbortController>,
): Promise<void> {
  const problems = configProblems(cfg);
  if (problems.length) {
    row.setBadge("Blocked", "err");
    row.setStatus(`Fix the connection settings first:\n${problems.join("\n")}`, "err");
    return;
  }

  const path = sanitizePath("", row.pathInput.value.trim().replace(/^\/+|\/+$/g, ""));
  if (!path || path.endsWith("/")) {
    row.setBadge("Error", "err");
    row.setStatus("Destination path is invalid.", "err");
    return;
  }
  row.pathInput.value = path;

  const abort = new AbortController();
  activeUploads.add(abort);

  try {
    // --- 1. Checksum ---------------------------------------------------
    row.setBadge("Hashing", "busy");
    row.setStatus("Computing dandi-etag checksum…");
    const parts = planParts(file.size);
    const etag = await computeDandiEtag(file, parts, (f) => {
      if (abort.signal.aborted) throw new Error("Upload cancelled.");
      row.setProgress(f * 0.999);
    });
    row.setProgress(0);

    // --- 2. Conflict check (skip automatically; never overwrites) ------
    row.setBadge("Uploading", "busy");
    row.setStatus("Checking for an existing file at this path…");
    const existing = await findExistingAsset(cfg, path);
    if (existing) {
      row.setBadge("Skipped", "warn");
      row.setStatus("Skipped — an asset already exists at this path.", "warn");
      return;
    }

    // --- 3. Blob upload --------------------------------------------------
    row.setStatus("Uploading to the archive…");
    const { blobId, reused } = await uploadBlob(
      cfg,
      file,
      etag,
      parts,
      (f) => {
        row.setProgress(f);
        row.setStatus(`Uploading to the archive… ${(f * 100).toFixed(1)}%`);
      },
      abort.signal,
    );

    // --- 4. Asset registration -------------------------------------------
    row.setStatus(reused ? "Identical file already stored — registering asset…" : "Registering asset…");
    const asset = await createOrReplaceAsset(cfg, path, blobId, null, file.type || undefined);

    row.setBadge("Done", "ok");
    row.setProgress(1, true);
    row.setStatus(`Uploaded successfully as ${path}`, "ok");
    if (cfg.web) {
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const viewUrl = `${cfg.web}/dandiset/${cfg.dandisetId}/draft/files` + `?location=${encodeURIComponent(folder)}`;
      const link = document.createElement("a");
      link.href = viewUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "View in archive ↗";
      row.status.append(" — ", link);
    }
    const dl = document.createElement("a");
    dl.href = `${cfg.api}/assets/${asset.asset_id}/download/`;
    dl.target = "_blank";
    dl.rel = "noopener";
    dl.textContent = "Direct download ↗";
    row.status.append(" · ", dl);
  } catch (e) {
    if (abort.signal.aborted) {
      row.setBadge("Cancelled", "warn");
      row.setStatus("Upload cancelled.", "warn");
    } else {
      row.setBadge("Error", "err");
      let msg = friendlyError(e);
      if (e instanceof ApiError && e.status === 0) {
        try {
          msg += `\n\n${await diagnoseCors(cfg)}`;
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
