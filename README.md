# dandi-uploader

A **fully static, backend-free** web page for uploading `.mp4` files to an
existing dandiset on the [DANDI Archive](https://dandiarchive.org) with a
simple drag-and-drop interface — no Python, no `dandi` CLI, nothing to
install. Everything (checksumming, S3 multipart upload, asset registration)
runs in the browser and talks directly to the DANDI REST API.

It is the browser equivalent of:

```bash
DANDI_DEVEL=1 dandi upload --validation skip --allow-any-path
```

i.e. **no NWB/BIDS validation is performed**. The app instead ensures the file
is a *readable MP4* (container signature check + a browser decode probe) and
sanitizes the destination filename/path before uploading.

## Usage

1. Serve the files statically (any static host works — GitHub Pages, or
   locally):

   ```bash
   python3 -m http.server 8080
   # then open http://localhost:8080
   ```

2. Pick your DANDI instance (production, sandbox, or a custom API URL).
3. Paste your **API key** (top-right user menu → "API key" on the archive
   website). The key is kept **client-side only** — it lives in your browser's
   `localStorage` (optional, on by default) and is only ever sent as the
   `Authorization` header to the API server you selected.
4. Enter the **dandiset ID** (e.g. `000123`) — the dandiset must already exist
   and your account must have edit permission on it.
5. Optionally set a destination folder (e.g. `videos/session1`).
6. Click **Save & test connection**, then drag `.mp4` files onto the drop
   zone.

For each file the app will:

1. **Verify** it is an MP4 (checks the leading ISO-BMFF box, e.g. `ftyp`) and
   that the browser can open it (metadata decode probe — if your browser lacks
   the codec you can still choose "Upload anyway").
2. **Sanitize** the filename (ASCII letters/digits/`._-`, folders allowed via
   the prefix) and let you edit the final archive path before starting.
3. **Checksum** it with the DANDI ETag algorithm (a faithful JS port of
   `dandischema.digests.dandietag`, verified byte-for-byte against the Python
   implementation).
4. **Upload** it as a multipart S3 upload via presigned URLs from
   `POST /uploads/initialize/` (3 parts in parallel, per-part retry with
   backoff, live progress, cancellable). If an identical blob already exists
   on the archive (HTTP 409), the upload is skipped entirely and the existing
   blob is reused.
5. **Finalize** via `/uploads/{id}/complete/` + the S3
   `CompleteMultipartUpload` call, then `/uploads/{id}/validate/` (the server
   re-verifies the checksum).
6. **Register the asset** on the dandiset's draft version with minimal
   metadata (`path`, `encodingFormat: video/mp4`). If an asset already exists
   at that path you are asked whether to replace it or skip.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | UI |
| `app.js` | All logic: etag, MP4 checks, sanitization, upload pipeline |
| `styles.css` | Styling (light/dark aware) |
| `vendor/spark-md5.min.js` | [SparkMD5](https://github.com/satazor/js-spark-md5) (WTFPL/MIT), vendored — MD5 is not available via WebCrypto |

No build step, no dependencies, no analytics, no third-party requests other
than the DANDI API and its S3 storage bucket.

## Notes & limitations

- **CORS**: the page relies on the DANDI API and its S3 bucket allowing
  cross-origin requests. The part-upload step additionally requires the bucket
  CORS config to *expose the `ETag` response header*; if it doesn't, the app
  stops with an explicit error message saying so.
- **Draft only**: assets are added to the dandiset's `draft` version (same as
  the CLI). Publish from the archive web UI as usual.
- **Asset metadata is minimal** — the asset will show up as invalid in
  dandiset validation (exactly like `--validation skip` uploads) until/unless
  richer metadata is added.
- Files up to the S3 object limit (5 TB) are supported in principle; parts
  are sized per the DANDI part-size algorithm (64 MiB default, ≤ 10,000
  parts). Very large files are limited mainly by your patience and connection.
- Keep the tab open while uploading; the app warns before you close it
  mid-upload.

## Security

Your API key is stored (optionally) in `localStorage` of your browser for this
page's origin only, and transmitted exclusively to the API base URL you
selected. Untick "Remember settings" to keep it out of storage entirely. Don't
use this app on a shared/untrusted machine, and treat the key like a password
— it grants full access to your DANDI account.
