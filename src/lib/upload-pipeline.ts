import type { Asset, CompletedPart, FilePart, UploadInitResponse, UploaderConfig } from "./types";
import { apiFetch } from "./api";
import { ApiError } from "./errors";
import { runQueue } from "./queue";
import { uploadPartWithRetry } from "./s3-upload";

const PARALLEL_PARTS = 3;

export interface UploadBlobResult {
  blobId: string;
  reused: boolean;
}

/** Looks up an already-uploaded blob by content digest, or null if none exists yet. */
async function findBlobByDigest(cfg: UploaderConfig, etag: string): Promise<string | null> {
  try {
    const blob = (await apiFetch<{ blob_id: string }>(cfg, "/blobs/digest/", {
      method: "POST",
      json: { algorithm: "dandi:dandi-etag", value: etag },
    }))!;
    return blob.blob_id;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function uploadBlob(
  cfg: UploaderConfig,
  file: File,
  etag: string,
  parts: FilePart[],
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadBlobResult> {
  // Check for an already-uploaded blob with this exact digest before ever attempting to
  // initialize a new upload. This is the common case for re-uploading unchanged content
  // (checksum-cache hits, re-dropped folders): without this check, /uploads/initialize/ would
  // reject it with a 409 to signal the same thing, which the browser logs to the console as a
  // failed request regardless of the app catching and handling it.
  const existingBlob = await findBlobByDigest(cfg, etag);
  if (existingBlob) {
    onProgress(1);
    return { blobId: existingBlob, reused: true };
  }

  // Initialize; a 409 here means a blob with this digest appeared between the check above and
  // this call (e.g. a concurrent uploader), rather than the common case the check above avoids.
  let init: UploadInitResponse;
  try {
    init = (await apiFetch<UploadInitResponse>(cfg, "/uploads/initialize/", {
      method: "POST",
      json: {
        contentSize: file.size,
        digest: { algorithm: "dandi:dandi-etag", value: etag },
        dandiset: cfg.dandisetId,
      },
    }))!;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const blob = (await apiFetch<{ blob_id: string }>(cfg, "/blobs/digest/", {
        method: "POST",
        json: { algorithm: "dandi:dandi-etag", value: etag },
      }))!;
      onProgress(1);
      return { blobId: blob.blob_id, reused: true };
    }
    throw e;
  }

  const uploadId = init.upload_id;
  const serverParts = init.parts;
  if (serverParts.length !== parts.length) {
    throw new Error(`Server planned ${serverParts.length} parts but this client computed ${parts.length} — aborting.`);
  }

  // Upload parts with a small worker pool.
  const partBytes = new Array<number>(serverParts.length).fill(0);
  const results = new Array<CompletedPart>(serverParts.length);
  const reportProgress = () => {
    const sent = partBytes.reduce((a, b) => a + b, 0);
    onProgress(Math.min(sent / file.size, 0.999));
  };
  await runQueue(serverParts, PARALLEL_PARTS, async (sp, i) => {
    const local = parts[sp.part_number - 1];
    if (!local || local.size !== sp.size) {
      throw new Error(`Part ${sp.part_number} size mismatch between client and server.`);
    }
    const blobSlice = file.slice(local.offset, local.offset + local.size);
    const serverEtag = await uploadPartWithRetry(
      sp.upload_url,
      blobSlice,
      (loaded) => {
        partBytes[i] = loaded;
        reportProgress();
      },
      signal,
    );
    partBytes[i] = local.size;
    reportProgress();
    results[i] = { part_number: sp.part_number, size: sp.size, etag: serverEtag };
  });

  // Finish the multipart upload on S3, then let the API validate the etag.
  const completion = (await apiFetch<{ complete_url: string; body: string }>(cfg, `/uploads/${uploadId}/complete/`, {
    method: "POST",
    json: { parts: results },
  }))!;
  const s3Resp = await fetch(completion.complete_url, {
    method: "POST",
    body: completion.body,
  });
  const s3Text = await s3Resp.text();
  if (!s3Resp.ok || /<Error>/.test(s3Text)) {
    throw new Error(`S3 rejected the CompleteMultipartUpload request: ${s3Text.slice(0, 300)}`);
  }

  const blob = (await apiFetch<{ blob_id: string }>(cfg, `/uploads/${uploadId}/validate/`, {
    method: "POST",
  }))!;
  onProgress(1);
  return { blobId: blob.blob_id, reused: false };
}

export async function findExistingAsset(cfg: UploaderConfig, path: string): Promise<Asset | null> {
  let url: string | null =
    `/dandisets/${cfg.dandisetId}/versions/draft/assets/` +
    `?path=${encodeURIComponent(path)}&metadata=false&page_size=100`;
  for (let pages = 0; url && pages < 20; pages++) {
    const page: { results?: Asset[]; next?: string | null } = (await apiFetch<{
      results?: Asset[];
      next?: string | null;
    }>(cfg, url))!;
    const hit = (page.results || []).find((a: Asset) => a.path === path);
    if (hit) return hit;
    // Follow server pagination in case the path filter matches many assets.
    url = page.next ? page.next.replace(cfg.api, "") : null;
    if (url && /^https?:\/\//.test(url)) return null; // next page on foreign host — stop
  }
  return null;
}

export async function createOrReplaceAsset(
  cfg: UploaderConfig,
  path: string,
  blobId: string,
  existingAssetId: string | null,
  encodingFormat?: string,
): Promise<Asset> {
  const metadata: { path: string; encodingFormat?: string } = { path };
  if (encodingFormat) metadata.encodingFormat = encodingFormat;
  const payload = { blob_id: blobId, metadata };
  if (existingAssetId) {
    return (await apiFetch<Asset>(cfg, `/dandisets/${cfg.dandisetId}/versions/draft/assets/${existingAssetId}/`, {
      method: "PUT",
      json: payload,
    }))!;
  }
  return (await apiFetch<Asset>(cfg, `/dandisets/${cfg.dandisetId}/versions/draft/assets/`, {
    method: "POST",
    json: payload,
  }))!;
}
