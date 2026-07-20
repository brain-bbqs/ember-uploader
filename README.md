# EMBER Uploader

A **fully static, backend-free** web app for uploading files to an
existing dandiset on the [EMBER Archive](https://emberarchive.org) with a
simple drag-and-drop interface.

Built with [Vite](https://vitejs.dev) + TypeScript. There is no server —
everything (MP4 integrity checks, checksumming, and the multipart upload to
the DANDI API / S3) runs in the browser.

## Development

```sh
npm install
npm run dev          # start the dev server
npm run typecheck    # type-check the whole project
npm test             # run unit tests (vitest)
npm run test:watch   # unit tests in watch mode
npm run test:coverage
npm run test:integration  # end-to-end tests against a built preview (playwright)
npm run build         # type-check + production build to dist/
npm run preview       # preview the production build locally
```

## Project layout

```
index.html            Vite entry point
src/
  main.ts             App bootstrap / event wiring
  style.css           Styles
  assets/             Logos and other static assets bundled by Vite
  lib/                 Framework-free, unit-tested logic
    api.ts             DANDI API client + CORS diagnostics
    etag.ts             dandi-etag checksum (S3-multipart digest-of-digests)
    instances.ts        Known DANDI/EMBER-DANDI instance presets
    mp4.ts               MP4 structure / decodability checks
    s3-upload.ts         S3 multipart part upload (XHR)
    sanitize.ts          Filename/path sanitization
    settings.ts          Config resolution + localStorage persistence
    upload-pipeline.ts    Blob upload + asset registration against the DANDI API
  ui/                  DOM wiring for the above
public/
  favicon.ico
tests/
  unit/                vitest specs for src/lib
  integration/         playwright specs driving the built app in a browser
```

## How uploads work

Mirrors the API flow of `dandi upload --validation skip`:

1. Compute the dandi-etag (S3-multipart-style MD5 digest-of-digests).
2. `POST /uploads/initialize/` → `upload_id` + presigned part URLs
   (HTTP 409 means an identical blob already exists; reuse it).
3. `PUT` each part to S3, collecting the `ETag` response headers.
4. `POST /uploads/{id}/complete/` → S3 `CompleteMultipartUpload` URL + body.
5. `POST` the body to that S3 URL.
6. `POST /uploads/{id}/validate/` → `blob_id` (server re-checks the etag).
7. `POST` (or `PUT`, when replacing) the asset onto the dandiset's draft version.

NWB validation is not performed; the app only verifies that the file is a
readable MP4. The dandiset must already exist and your account must have
permission to edit it.

## Deployment

`.github/workflows/test.yml` type-checks and runs the unit + integration
test suites on every pull request. `.github/workflows/deploy.yml` builds and
publishes `dist/` to GitHub Pages on pushes to `main`; `preview.yml` does the
same for pull request previews.

---

Built &amp; maintained by the [Center for Open Neuroscience](https://centerforopenneuroscience.org).
