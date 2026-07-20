import type { UploaderConfig } from "../lib/types";
import type { UploaderElements } from "./elements";
import { createFileRow, askUser } from "./fileRow";
import { configProblems } from "../lib/settings";
import { sanitizeFilename, sanitizePath } from "../lib/sanitize";
import { checkMp4Structure, probeVideoDecodable } from "../lib/mp4";
import { planParts, computeDandiEtag } from "../lib/etag";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../lib/upload-pipeline";
import { diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";

let fileCounter = 0;

export async function processFile(
  els: UploaderElements,
  file: File,
  getConfig: () => UploaderConfig,
  activeUploads: Set<AbortController>
): Promise<void> {
  const id = `file-${fileCounter++}`;
  const row = createFileRow(els.fileList, file, id);

  if (!/\.mp4$/i.test(file.name) && file.type !== "video/mp4") {
    row.setBadge("Rejected", "err");
    row.setStatus("Only .mp4 files are accepted by this tool.", "err");
    row.pathInput.disabled = true;
    return;
  }

  const cfg = getConfig();
  const problems = configProblems(cfg);
  if (problems.length) {
    row.setBadge("Blocked", "err");
    row.setStatus(
      `Fix the connection settings first, then re-add this file:\n${problems.join("\n")}`,
      "err"
    );
    row.pathInput.disabled = true;
    return;
  }

  row.pathInput.value = sanitizePath(cfg.pathPrefix, sanitizeFilename(file.name));

  // --- 1. Integrity checks -------------------------------------------------
  try {
    row.setBadge("Checking", "busy");
    row.setStatus("Verifying MP4 structure…");
    await checkMp4Structure(file);
    row.setStatus("Verifying the file can be opened…");
    const probe = await probeVideoDecodable(els.probeVideo, file);
    if (probe.ok) {
      const secs = Number.isFinite(probe.duration) ? `${Math.round(probe.duration!)} s` : "unknown length";
      row.setStatus(`MP4 verified (${probe.width}×${probe.height}, ${secs}).`, "ok");
    } else {
      const answer = await askUser(
        row,
        `MP4 structure looks fine, but this browser could not decode it (${probe.reason}). ` +
          "This can happen with codecs the browser lacks. Upload anyway?",
        [
          { label: "Upload anyway", value: "upload", primary: true },
          { label: "Skip file", value: "skip" },
        ]
      );
      if (answer === "skip") {
        row.setBadge("Skipped", "warn");
        row.setStatus("Skipped by user.", "warn");
        return;
      }
    }
  } catch (e) {
    row.setBadge("Invalid", "err");
    row.setStatus(e instanceof Error ? e.message : String(e), "err");
    return;
  }

  // --- 2. Wait for the user to confirm the destination path ---------------
  const proceed = await askUser(row, "Ready — adjust the archive path above if needed, then start.", [
    { label: "Start upload", value: "go", primary: true },
    { label: "Remove", value: "remove" },
  ]);
  if (proceed === "remove") {
    row.el.remove();
    return;
  }

  const path = sanitizePath("", row.pathInput.value.trim().replace(/^\/+|\/+$/g, ""));
  if (!/\.mp4$/i.test(path)) {
    row.setBadge("Error", "err");
    row.setStatus("Destination path must end in .mp4", "err");
    return;
  }
  row.pathInput.value = path;
  row.pathInput.disabled = true;

  const abort = new AbortController();
  activeUploads.add(abort);
  let cancelBtn = row.addAction("Cancel", () => abort.abort());

  try {
    // --- 3. Checksum -------------------------------------------------------
    row.setBadge("Hashing", "busy");
    row.setStatus("Computing dandi-etag checksum…");
    const parts = planParts(file.size);
    const etag = await computeDandiEtag(file, parts, (f) => {
      if (abort.signal.aborted) throw new Error("Upload cancelled.");
      row.setProgress(f * 0.999);
    });
    row.setProgress(0);

    // --- 4. Conflict check ---------------------------------------------
    row.setBadge("Uploading", "busy");
    row.setStatus("Checking for an existing file at this path…");
    const existing = await findExistingAsset(cfg, path);
    let existingAssetId: string | null = null;
    if (existing) {
      cancelBtn.remove();
      const answer = await askUser(
        row,
        `“${path}” already exists in dandiset ${cfg.dandisetId} — replace it?`,
        [
          { label: "Replace", value: "replace", primary: true },
          { label: "Skip file", value: "skip" },
        ]
      );
      cancelBtn = row.addAction("Cancel", () => abort.abort());
      if (answer === "skip") {
        row.setBadge("Skipped", "warn");
        row.setStatus("Skipped — an asset already exists at this path.", "warn");
        activeUploads.delete(abort);
        return;
      }
      existingAssetId = existing.asset_id;
    }

    // --- 5. Blob upload ------------------------------------------------
    row.setStatus("Uploading to the archive…");
    const { blobId, reused } = await uploadBlob(
      cfg, file, etag, parts,
      (f) => {
        row.setProgress(f);
        row.setStatus(`Uploading to the archive… ${(f * 100).toFixed(1)}%`);
      },
      abort.signal
    );

    // --- 6. Asset registration -------------------------------------------
    row.setStatus(reused ? "Identical file already stored — registering asset…" : "Registering asset…");
    const asset = await createOrReplaceAsset(cfg, path, blobId, existingAssetId);

    row.setBadge("Done", "ok");
    row.setProgress(1, true);
    row.clearActions();
    const verb = existingAssetId ? "Replaced" : "Uploaded";
    row.setStatus(`${verb} successfully as ${path}`, "ok");
    if (cfg.web) {
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const viewUrl =
        `${cfg.web}/dandiset/${cfg.dandisetId}/draft/files` +
        `?location=${encodeURIComponent(folder)}`;
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
    row.clearActions();
  } finally {
    activeUploads.delete(abort);
  }
}
