/*
 * DANDI .mp4 Uploader — a fully client-side uploader for the DANDI Archive.
 *
 * Mirrors the API flow of `dandi upload --validation skip`:
 *   1. compute the dandi-etag (S3-multipart-style MD5 digest-of-digests)
 *   2. POST /uploads/initialize/            -> upload_id + presigned part URLs
 *      (HTTP 409 means an identical blob already exists; reuse it)
 *   3. PUT each part to S3, collecting the ETag response headers
 *   4. POST /uploads/{id}/complete/         -> S3 CompleteMultipartUpload URL + body
 *   5. POST the body to that S3 URL
 *   6. POST /uploads/{id}/validate/         -> blob_id (server re-checks the etag)
 *   7. POST (or PUT, when replacing) the asset onto the dandiset's draft version
 */
"use strict";

// ---------------------------------------------------------------------------
// Instances & persisted settings
// ---------------------------------------------------------------------------

const INSTANCES = {
  dandi: {
    api: "https://api.dandiarchive.org/api",
    web: "https://dandiarchive.org",
  },
  "dandi-sandbox": {
    api: "https://api.sandbox.dandiarchive.org/api",
    web: "https://sandbox.dandiarchive.org",
  },
  "ember-dandi": {
    api: "https://api-dandi.emberarchive.org/api",
    web: "https://dandi.emberarchive.org",
  },
  "ember-dandi-sandbox": {
    api: "https://api-dandi.sandbox.emberarchive.org/api",
    web: "https://dandi.sandbox.emberarchive.org",
  },
};

const STORAGE_KEY = "dandi-mp4-uploader.settings.v1";

const els = {
  instance: document.getElementById("instance"),
  customApiLabel: document.getElementById("custom-api-label"),
  customApi: document.getElementById("custom-api"),
  apiKey: document.getElementById("api-key"),
  dandisetId: document.getElementById("dandiset-id"),
  pathPrefix: document.getElementById("path-prefix"),
  remember: document.getElementById("remember"),
  connectBtn: document.getElementById("connect-btn"),
  connectStatus: document.getElementById("connect-status"),
  apiKeyHelp: document.getElementById("api-key-help"),
  apiKeyHelpText: document.getElementById("api-key-help-text"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileList: document.getElementById("file-list"),
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.instance) els.instance.value = s.instance;
    if (s.customApi) els.customApi.value = s.customApi;
    if (s.apiKey) els.apiKey.value = s.apiKey;
    if (s.dandisetId) els.dandisetId.value = s.dandisetId;
    if (s.pathPrefix) els.pathPrefix.value = s.pathPrefix;
  } catch (e) {
    console.warn("Could not restore settings:", e);
  }
  toggleCustomApi();
}

function saveSettings() {
  if (!els.remember.checked) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      instance: els.instance.value,
      customApi: els.customApi.value.trim(),
      apiKey: els.apiKey.value.trim(),
      dandisetId: els.dandisetId.value.trim(),
      pathPrefix: els.pathPrefix.value.trim(),
    })
  );
}

function toggleCustomApi() {
  els.customApiLabel.hidden = els.instance.value !== "custom";
}

function currentConfig() {
  const instance = els.instance.value;
  let api, web;
  if (instance === "custom") {
    api = els.customApi.value.trim().replace(/\/+$/, "");
    web = null;
  } else {
    ({ api, web } = INSTANCES[instance]);
  }
  const rawId = els.dandisetId.value.trim();
  const idMatch = rawId.match(/(\d{6,})/);
  return {
    api,
    web,
    apiKey: els.apiKey.value.trim(),
    dandisetId: idMatch ? idMatch[1] : "",
    pathPrefix: els.pathPrefix.value.trim(),
  };
}

function configProblems(cfg) {
  const problems = [];
  if (!cfg.api || !/^https?:\/\//.test(cfg.api)) problems.push("API base URL is missing or invalid.");
  if (!cfg.apiKey) problems.push("API key is missing.");
  if (!cfg.dandisetId) problems.push("Dandiset ID is missing (expected something like 000123).");
  return problems;
}

// ---------------------------------------------------------------------------
// DANDI API helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch(cfg, path, { method = "GET", json, expectJson = true } = {}) {
  const headers = { Authorization: `token ${cfg.apiKey}` };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  let resp;
  try {
    resp = await fetch(`${cfg.api}${path}`, { method, headers, body });
  } catch (e) {
    throw new ApiError(
      `Network error calling ${path} — check your connection (or the server's CORS policy): ${e.message}`,
      0
    );
  }
  if (!resp.ok) {
    let detail = "";
    try {
      detail = await resp.text();
    } catch (e) {
      /* ignore */
    }
    throw new ApiError(
      `${method} ${path} failed with HTTP ${resp.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`,
      resp.status,
      detail
    );
  }
  if (!expectJson || resp.status === 204) return null;
  return resp.json();
}

// ---------------------------------------------------------------------------
// dandi-etag (faithful port of dandischema.digests.dandietag.PartGenerator)
// ---------------------------------------------------------------------------

const MB = 2 ** 20;
const GB = 2 ** 30;
const TB = 2 ** 40;
const MAX_PARTS = 10_000;
const MIN_PART_SIZE = 5 * MB;
const MAX_PART_SIZE = 5 * GB;
const DEFAULT_PART_SIZE = 64 * MB;

function planParts(fileSize) {
  if (fileSize <= 0) throw new Error("Empty files cannot be uploaded to DANDI.");
  if (fileSize > 5 * TB) throw new Error("File is larger than the S3 maximum object size (5 TB).");

  let partSize = DEFAULT_PART_SIZE;
  if (Math.ceil(fileSize / partSize) >= MAX_PARTS) {
    partSize = Math.ceil(fileSize / MAX_PARTS);
  }
  if (partSize < MIN_PART_SIZE || partSize > MAX_PART_SIZE) {
    throw new Error("Internal error: computed part size is outside S3 limits.");
  }

  let partQty = Math.floor(fileSize / partSize);
  let finalPartSize = fileSize - partQty * partSize;
  if (finalPartSize === 0) {
    finalPartSize = partSize;
  } else {
    partQty += 1;
  }
  if (partQty === 1) partSize = finalPartSize;

  const parts = [];
  let offset = 0;
  for (let number = 1; number <= partQty; number++) {
    const size = number === partQty ? finalPartSize : partSize;
    parts.push({ number, offset, size });
    offset += size;
  }
  return parts;
}

const HASH_CHUNK = 16 * MB;

async function computeDandiEtag(file, parts, onProgress) {
  const partDigests = new Uint8Array(parts.length * 16);
  let bytesDone = 0;
  for (const part of parts) {
    const spark = new SparkMD5.ArrayBuffer();
    let read = 0;
    while (read < part.size) {
      const n = Math.min(HASH_CHUNK, part.size - read);
      const start = part.offset + read;
      const buf = await file.slice(start, start + n).arrayBuffer();
      if (buf.byteLength !== n) {
        throw new Error("File changed on disk while hashing — please re-add it.");
      }
      spark.append(buf);
      read += n;
      bytesDone += n;
      onProgress(bytesDone / file.size);
    }
    // end(true) yields the raw 16-byte digest as a binary string
    const raw = spark.end(true);
    for (let i = 0; i < 16; i++) {
      partDigests[(part.number - 1) * 16 + i] = raw.charCodeAt(i) & 0xff;
    }
  }
  const finalSpark = new SparkMD5.ArrayBuffer();
  finalSpark.append(partDigests.buffer);
  return `${finalSpark.end()}-${parts.length}`;
}

// ---------------------------------------------------------------------------
// Filename / path sanitization
// ---------------------------------------------------------------------------

function sanitizeSegment(segment, fallback) {
  let s = segment.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
  s = s.replace(/_{2,}/g, "_").replace(/^[._\s-]+|[._\s-]+$/g, "");
  return s || fallback;
}

function sanitizeFilename(originalName) {
  const base = originalName.replace(/\.[^.]*$/, "");
  return `${sanitizeSegment(base, "video")}.mp4`;
}

function sanitizePath(prefix, filename) {
  const segments = prefix
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => sanitizeSegment(s, "_"));
  return [...segments, filename].join("/");
}

// ---------------------------------------------------------------------------
// MP4 integrity checks ("can it be opened?")
// ---------------------------------------------------------------------------

const KNOWN_TOP_BOXES = new Set([
  "ftyp", "styp", "moov", "mdat", "free", "skip", "wide", "pdin", "prfl",
  "moof", "mfra", "meta", "sidx", "ssix", "uuid",
]);

async function checkMp4Structure(file) {
  if (file.size < 16) throw new Error("File is too small to be a valid MP4.");
  const head = new DataView(await file.slice(0, 16).arrayBuffer());
  const boxSize = head.getUint32(0);
  const boxType = String.fromCharCode(
    head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7)
  );
  if (!KNOWN_TOP_BOXES.has(boxType)) {
    throw new Error(
      `File does not look like an MP4 (first box type is "${boxType.replace(/[^\x20-\x7e]/g, "?")}", expected "ftyp" or similar).`
    );
  }
  if (boxType === "ftyp" && (boxSize < 16 || boxSize > 1024)) {
    throw new Error("File has a malformed MP4 header (implausible ftyp box size).");
  }
  return boxType;
}

function probeVideoDecodable(file, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const video = document.getElementById("probe-video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "timed out while reading video metadata" }),
      timeoutMs
    );
    video.onloadedmetadata = () =>
      finish({
        ok: true,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    video.onerror = () =>
      finish({
        ok: false,
        reason: video.error?.message || "browser could not decode the file",
      });
    video.src = url;
  });
}

// ---------------------------------------------------------------------------
// S3 part upload (XHR for upload-progress events + ETag response header)
// ---------------------------------------------------------------------------

function uploadPartToS3(url, blob, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader("ETag") || "").replace(/"/g, "");
        if (!etag) {
          reject(
            new Error(
              "S3 accepted the part but the ETag response header is not readable. " +
                "The storage bucket's CORS configuration must expose the ETag header " +
                "for browser-based uploads to work."
            )
          );
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`S3 part upload failed with HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during S3 part upload (possibly a CORS rejection)."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

async function uploadPartWithRetry(url, blob, onProgress, signal, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new Error("Upload cancelled.");
    try {
      return await uploadPartToS3(url, blob, onProgress, signal);
    } catch (e) {
      lastErr = e;
      if (/cancelled/i.test(e.message) || /ETag response header/.test(e.message)) throw e;
      onProgress(0);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Per-file upload pipeline
// ---------------------------------------------------------------------------

const PARALLEL_PARTS = 3;

async function uploadBlob(cfg, file, etag, parts, onProgress, signal) {
  // Initialize; a 409 means an identical blob already exists server-side.
  let init;
  try {
    init = await apiFetch(cfg, "/uploads/initialize/", {
      method: "POST",
      json: {
        contentSize: file.size,
        digest: { algorithm: "dandi:dandi-etag", value: etag },
        dandiset: cfg.dandisetId,
      },
    });
  } catch (e) {
    if (e.status === 409) {
      const blob = await apiFetch(cfg, "/blobs/digest/", {
        method: "POST",
        json: { algorithm: "dandi:dandi-etag", value: etag },
      });
      onProgress(1);
      return { blobId: blob.blob_id, reused: true };
    }
    throw e;
  }

  const uploadId = init.upload_id;
  const serverParts = init.parts;
  if (serverParts.length !== parts.length) {
    throw new Error(
      `Server planned ${serverParts.length} parts but this client computed ${parts.length} — aborting.`
    );
  }

  // Upload parts with a small worker pool.
  const partBytes = new Array(serverParts.length).fill(0);
  const results = new Array(serverParts.length);
  const reportProgress = () => {
    const sent = partBytes.reduce((a, b) => a + b, 0);
    onProgress(Math.min(sent / file.size, 0.999));
  };
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= serverParts.length) return;
      const sp = serverParts[i];
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
        signal
      );
      partBytes[i] = local.size;
      reportProgress();
      results[i] = { part_number: sp.part_number, size: sp.size, etag: serverEtag };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_PARTS, serverParts.length) }, worker)
  );

  // Finish the multipart upload on S3, then let the API validate the etag.
  const completion = await apiFetch(cfg, `/uploads/${uploadId}/complete/`, {
    method: "POST",
    json: { parts: results },
  });
  const s3Resp = await fetch(completion.complete_url, {
    method: "POST",
    body: completion.body,
  });
  const s3Text = await s3Resp.text();
  if (!s3Resp.ok || /<Error>/.test(s3Text)) {
    throw new Error(`S3 rejected the CompleteMultipartUpload request: ${s3Text.slice(0, 300)}`);
  }

  const blob = await apiFetch(cfg, `/uploads/${uploadId}/validate/`, { method: "POST" });
  onProgress(1);
  return { blobId: blob.blob_id, reused: false };
}

async function findExistingAsset(cfg, path) {
  let url =
    `/dandisets/${cfg.dandisetId}/versions/draft/assets/` +
    `?path=${encodeURIComponent(path)}&metadata=false&page_size=100`;
  for (let pages = 0; url && pages < 20; pages++) {
    const page = await apiFetch(cfg, url);
    const hit = (page.results || []).find((a) => a.path === path);
    if (hit) return hit;
    // Follow server pagination in case the path filter matches many assets.
    url = page.next ? page.next.replace(cfg.api, "") : null;
    if (url && /^https?:\/\//.test(url)) return null; // next page on foreign host — stop
  }
  return null;
}

async function createOrReplaceAsset(cfg, path, blobId, existingAssetId) {
  const payload = {
    blob_id: blobId,
    metadata: { path, encodingFormat: "video/mp4" },
  };
  if (existingAssetId) {
    return apiFetch(
      cfg,
      `/dandisets/${cfg.dandisetId}/versions/draft/assets/${existingAssetId}/`,
      { method: "PUT", json: payload }
    );
  }
  return apiFetch(cfg, `/dandisets/${cfg.dandisetId}/versions/draft/assets/`, {
    method: "POST",
    json: payload,
  });
}

// ---------------------------------------------------------------------------
// UI: file rows
// ---------------------------------------------------------------------------

let fileCounter = 0;
const activeUploads = new Set();

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function createFileRow(file) {
  const id = `file-${fileCounter++}`;
  const li = document.createElement("li");
  li.className = "file-item";
  li.id = id;
  li.innerHTML = `
    <div class="file-head">
      <span class="badge busy" data-role="badge">Queued</span>
      <span class="file-name"></span>
      <span class="file-size">${humanSize(file.size)}</span>
    </div>
    <div class="file-path">
      <span class="prefix-label">Archive path:</span>
      <input type="text" data-role="path" spellcheck="false" />
    </div>
    <div class="progress" data-role="progress-wrap" hidden><div data-role="progress"></div></div>
    <div class="file-status" data-role="status"></div>
    <div class="file-actions" data-role="actions"></div>
  `;
  li.querySelector(".file-name").textContent = file.name;
  els.fileList.appendChild(li);

  const row = {
    el: li,
    badge: li.querySelector('[data-role="badge"]'),
    pathInput: li.querySelector('[data-role="path"]'),
    progressWrap: li.querySelector('[data-role="progress-wrap"]'),
    progressBar: li.querySelector('[data-role="progress"]'),
    status: li.querySelector('[data-role="status"]'),
    actions: li.querySelector('[data-role="actions"]'),
    setBadge(text, kind) {
      this.badge.textContent = text;
      this.badge.className = `badge ${kind}`;
    },
    setStatus(text, kind = "") {
      this.status.textContent = text;
      this.status.className = `file-status ${kind}`;
    },
    setProgress(fraction, done = false) {
      this.progressWrap.hidden = false;
      this.progressWrap.classList.toggle("done", done);
      this.progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
    },
    clearActions() {
      this.actions.replaceChildren();
    },
    addAction(label, handler, primary = false) {
      const btn = document.createElement("button");
      btn.textContent = label;
      if (primary) btn.classList.add("primary");
      btn.addEventListener("click", handler);
      this.actions.appendChild(btn);
      return btn;
    },
  };
  return row;
}

function askUser(row, message, choices) {
  // Renders buttons on the row and resolves with the label of the clicked one.
  return new Promise((resolve) => {
    row.setStatus(message, "warn");
    row.clearActions();
    for (const choice of choices) {
      row.addAction(
        choice.label,
        () => {
          row.clearActions();
          resolve(choice.value);
        },
        Boolean(choice.primary)
      );
    }
  });
}

async function processFile(file) {
  const row = createFileRow(file);

  if (!/\.mp4$/i.test(file.name) && file.type !== "video/mp4") {
    row.setBadge("Rejected", "err");
    row.setStatus("Only .mp4 files are accepted by this tool.", "err");
    row.pathInput.disabled = true;
    return;
  }

  const cfg = currentConfig();
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
    const probe = await probeVideoDecodable(file);
    if (probe.ok) {
      const secs = Number.isFinite(probe.duration) ? `${Math.round(probe.duration)} s` : "unknown length";
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
    row.setStatus(e.message, "err");
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
  const cancelBtn = row.addAction("Cancel", () => abort.abort());

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
    let existingAssetId = null;
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
      row.addAction("Cancel", () => abort.abort());
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
        } catch (probeErr) {
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

// When a request dies with a network/CORS error, probe the API two ways to
// pinpoint which layer of the server's CORS setup is broken. (Browsers don't
// let a page inspect another origin's CORS headers directly, so this
// differential probe is the best client-side diagnosis available.)
async function diagnoseCors(cfg) {
  const probe = async (headers) => {
    try {
      const r = await fetch(`${cfg.api}/info/`, { headers });
      return r.status > 0; // readable response of any status = CORS passed
    } catch {
      return false;
    }
  };
  const simple = await probe({}); // no preflight needed
  const preflighted = await probe({ Authorization: `token ${cfg.apiKey}` });
  const origin = window.location.origin;
  if (!simple && !preflighted) {
    return (
      `CORS diagnosis: the API refuses ALL cross-origin requests from ${origin}. ` +
      "The instance operators must add this origin to the server's CORS allowlist " +
      "(DJANGO_CORS_ALLOWED_ORIGINS / DJANGO_CORS_ALLOWED_ORIGIN_REGEXES)."
    );
  }
  if (!preflighted) {
    return (
      `CORS diagnosis: simple requests from ${origin} pass, but preflighted (OPTIONS) ` +
      "requests are rejected — the API's CORS layer is not answering preflights for this origin."
    );
  }
  // GETs pass — check whether POSTs fail across the board or only the upload
  // endpoint, using a harmless read-only POST (/blobs/digest/ lookup).
  let postPasses = false;
  try {
    const r = await fetch(`${cfg.api}/blobs/digest/`, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        algorithm: "dandi:dandi-etag",
        value: `${"0".repeat(32)}-1`,
      }),
    });
    postPasses = r.status > 0;
  } catch {
    postPasses = false;
  }
  if (postPasses) {
    return (
      `CORS diagnosis: GET requests AND other POST requests from ${origin} pass CORS, ` +
      "but the upload-initialize response came back without an Access-Control-Allow-Origin " +
      "header. A proxy/WAF rule specific to the /uploads/ path on the API server is the " +
      "likely culprit. This can only be fixed by the instance operators."
    );
  }
  return (
    `CORS diagnosis: reads work but writes are blocked. dandi-archive servers allow ` +
    "GET/HEAD/OPTIONS from ANY origin (the cors_allow_anyone_read_only hook) but only " +
    `add CORS headers to write responses for allowlisted origins — and ${origin} is not ` +
    "in this server's DJANGO_CORS_ALLOWED_ORIGINS. Ask the instance operators to add " +
    "this origin to that allowlist (for DANDI itself: the allowed_external_services " +
    "list in dandi-infrastructure's terraform/main.tf)."
  );
}

function friendlyError(e) {
  let msg = e.message || String(e);
  if (e instanceof ApiError) {
    if (e.status === 401) msg = "Authentication failed — check your API key.";
    else if (e.status === 403) msg = "Permission denied — your account cannot edit this dandiset.";
    else if (e.status === 404) msg = "Not found — check the dandiset ID (and that a draft version exists).";
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

async function testConnection() {
  saveSettings();
  const cfg = currentConfig();
  const problems = configProblems(cfg);
  const statusEl = els.connectStatus;
  statusEl.hidden = false;
  if (problems.length) {
    statusEl.textContent = problems.join(" ");
    statusEl.className = "status err";
    return;
  }
  statusEl.textContent = "Testing connection…";
  statusEl.className = "status busy";
  els.connectBtn.disabled = true;
  try {
    let who = "";
    try {
      const me = await apiFetch(cfg, "/users/me/");
      who = me?.username ? ` Signed in as ${me.username}.` : "";
    } catch (e) {
      if (e.status === 401) throw new ApiError("API key was rejected (HTTP 401) — check that it is correct.", 401);
      // Any other failure here is non-fatal; the dandiset check below still runs.
    }
    const ds = await apiFetch(cfg, `/dandisets/${cfg.dandisetId}/`);
    const name = ds?.draft_version?.name || ds?.most_recent_published_version?.name || "";
    statusEl.textContent =
      `✓ Connected. Dandiset ${cfg.dandisetId}${name ? ` (“${name}”)` : ""} found.${who}` +
      " You can now drop .mp4 files below.";
    statusEl.className = "status ok";
  } catch (e) {
    let msg = friendlyError(e);
    if (e instanceof ApiError && e.status === 0) {
      try {
        msg += ` ${await diagnoseCors(cfg)}`;
      } catch (probeErr) {
        /* diagnosis is best-effort */
      }
    }
    statusEl.textContent = `✗ ${msg}`;
    statusEl.className = "status err";
  } finally {
    els.connectBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Drag & drop wiring
// ---------------------------------------------------------------------------

function addFiles(fileList) {
  for (const file of fileList) {
    processFile(file);
  }
}

function initDropzone() {
  const dz = els.dropzone;
  dz.addEventListener("click", () => els.fileInput.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener("change", () => {
    addFiles(els.fileInput.files);
    els.fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
  // Prevent the browser from navigating away when a file misses the dropzone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadSettings();
initDropzone();
els.instance.addEventListener("change", () => {
  toggleCustomApi();
  saveSettings();
});
[els.customApi, els.apiKey, els.dandisetId, els.pathPrefix].forEach((el) =>
  el.addEventListener("change", saveSettings)
);
els.remember.addEventListener("change", saveSettings);
document.getElementById("config-form").addEventListener("submit", (e) => {
  e.preventDefault();
  testConnection();
});
els.apiKeyHelp.addEventListener("click", () => {
  els.apiKeyHelpText.hidden = !els.apiKeyHelpText.hidden;
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
