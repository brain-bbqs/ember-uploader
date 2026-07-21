# Changelog

## 0.0.12

#### 🚀 Enhancement

- Simplified the "Dataset" and file-drop cards: dropped the numbered "1 ·"/"2 ·" section titles and the "Files" heading, since the cards are self-explanatory ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- When the signed-in user has only one incoming dataset, it's now shown as "Uploading directly to EMBER Dandiset `000xyz`, "Incoming: ..."" (the identifier in a code style) with a link out to its archive view, instead of a disabled single-option dropdown ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Removed the connection status dot and its hover text next to the dataset picker, since the picker's own states already communicate sign-in and loading status ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))

## 0.0.11

#### 🚀 Enhancement

- Replaced pasting a DANDI API key with a "Sign in with EMBER" button, top-right in the header (mirroring the main archive's layout), that authenticates via the archive's OAuth2 (Authorization Code + PKCE) flow ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- Replaced the free-text Dandiset ID field with a dropdown that auto-populates with the signed-in user's own dandisets titled "Incoming: ..." (the BBQS convention for a lab's staging dataset), so there's nothing to type or look up ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- Colored the "Sign in with EMBER" button in the archive's flame red (matched from the logo mark) instead of the app's generic accent color ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- Added a colored initials avatar (e.g. "CB") next to the username once signed in, matching the main archive's own convention, so there's a clearer signal of being signed in than just the button disappearing ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- The signed-in header now shows just the avatar; the username and "Sign out" only appear in a hover popover beneath it, matching the main archive's own avatar-menu behavior ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- Reworded the avatar popover to match the main archive's own wording ("You are logged in as **{username}**.") and outlined the avatar in flame red instead of filling it, and added a logout icon next to "Sign out" ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- Shortened the "Incoming dataset" label to just "Dataset", and the dropdown now greys out (disabled) when there's only one dataset to pick, since there's nothing to choose between ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))

#### 🐛 Bug Fix

- The signed-in username/avatar in the header now appears as soon as sign-in succeeds, instead of being gated behind having an "Incoming: " dataset available to select ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))
- The OAuth redirect URI is now computed from wherever the page is actually being served (production root, a PR preview, local dev) instead of a hardcoded production URL, so sign-in can work from any of those locations once registered on the archive side ([#19](https://github.com/brain-bbqs/ember-uploader/pull/19))

## 0.0.10

#### 🚀 Enhancement

- Added a "What's New" link next to the version tag that opens a modal showing the rendered CHANGELOG.md content for the latest 3 versions ([#18](https://github.com/brain-bbqs/ember-uploader/pull/18))

## 0.0.9

#### 🚀 Enhancement

- Added recursive folder drag-and-drop (and a "select a folder" click-to-browse alternative), walking the full directory tree and uploading every file, not just `.mp4`s, under `sourcedata/raw/<same relative path>` in the dandiset ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- `.git`, `.datalad`, and `.git-annex` folders (and any files inside them) are automatically skipped when uploading a dropped or selected folder ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- The file list now groups dropped files by folder, collapsing any folder with more than 30 files/subfolders into a single expandable row instead of listing every entry ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Reworded the dropzone copy to "Drop your research contents here" instead of "files or folders" ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Replaced the per-file "Start upload"/"Remove" confirmation and "Replace/Skip" existing-asset prompt with a single "Upload N files" button above the file list; files with a path collision are now skipped automatically instead of prompting ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Simplified each file row to a single compact line (badge, name, size, and a right-aligned progress bar/status) and added a static `sourcedata/raw` heading above the tree, removing the per-file editable archive-path box and idle "Ready to upload." text — the full destination path is still available as a hover tooltip on each row ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Dropped the "Queued" badge (a file being in the list already implies it's queued) and shrank the file tree's rows, borders, spacing, and badges considerably so a handful of folders no longer fills the whole page ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Added a rotating chevron to each folder row so expanded/collapsed state is visible at a glance, and replaced the folder emoji with a trailing `/` on folder names for a more compact look ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Folder rows now show the total size of their contents (e.g. "9 items · 47 MB"), summed recursively across all nested files, styled a bit lighter than the item count for clarity ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Moved the dandi-etag checksum computation into a pool of Web Workers (one per available CPU core, up to 8), so hashing multiple concurrently-uploading files actually uses multiple CPU cores instead of interleaving on the single JS main thread; workers are spawned lazily on first upload, not at page load ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Added an "Expand depth" slider next to the `sourcedata/raw/` heading; only the first two levels of nesting expand by default (folders with more than 30 entries still start collapsed regardless), and dragging the slider re-expands/collapses the whole tree to any depth on the fly. The slider's range is capped to the actual depth of the dropped tree (no further than the deepest folder) and snaps to tick marks, one per level ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Added a cumulative progress tracker above the file list, visible as soon as files are added: separate "Scanning" and "Uploading" progress bars (tqdm-style, each showing bytes done/total, elapsed<ETA, and throughput, e.g. `62% (620 MB / 1.0 GB) [00:12<00:07, 51.7 MB/s]`, styled in a monospace font with the percentage in accent color) plus a three-column footer (done/error/cancelled counts on the left, skipped in the middle, an `N/M files` counter on the right). It covers everything added this session across multiple "Upload" rounds, not just the most recent batch. Each bar's elapsed/rate timer starts independently — scanning from the first file dropped, uploading only once the first byte actually starts transferring — so early rates aren't skewed by idle time ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Scanning (checksumming) now starts the moment a file is dropped or selected, instead of waiting for the "Upload" click — by the time you hit Upload, most files' checksums are already computed ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Replaced the per-file "view in archive"/"download" links on completion with a single "View dataset ↗" link (next to the Upload button) pointing at the dandiset itself; the per-file download link was removed entirely since a direct asset download link isn't meaningful here ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))
- Moved each file row's status badge to sit next to its progress bar (was on the far left, is now on the right, closer to the path/status text it reflects) ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))

#### 🐛 Bug Fix

- Removed the MP4 structure/decodability check, which ran a probe against a single shared hidden `<video>` element and could get many concurrently-dropped files stuck on "Checking" ([#17](https://github.com/brain-bbqs/ember-uploader/pull/17))

## 0.0.8

#### 🐛 Bug Fix

- Tightened the bottom-left version link flush to the page corner and restyled the Center for Open Neuroscience logo as a large, faint watermark in the bottom-right corner, matching the footer treatment on the stamped-checklist site ([#10](https://github.com/brain-bbqs/ember-uploader/pull/10))

## 0.0.7

#### 🚀 Enhancement

- Added a short message next to the status dot explaining the problem when the connection check fails, matching what was previously only in the hover tooltip ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))
- Dropped the leftover ".mp4 files" mention from the successful connection message, since the dropzone copy no longer mentions a specific file type ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))

## 0.0.6

#### 🚀 Enhancement

- Replaced the connection status bar with a small status dot next to the Dandiset ID field ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))
- Removed the "Destination folder" connection setting and the DANDI instance selector; the uploader now always connects to the EMBER-DANDI archive ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))

## 0.0.5

#### 🚀 Enhancement

- Updated the drag-and-drop dropzone copy to reference "research files" instead of `.mp4` files, and made the sentence's styling consistent (no partial bolding) ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))
- Removed the "Remember settings in this browser" checkbox; connection settings (including the API key) are now always persisted to `localStorage` ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))
- Replaced the "Save & test connection" button with an automatic connection check that runs whenever a connection field changes, shown via a colored status bar instead of a button/status paragraph ([#13](https://github.com/brain-bbqs/ember-uploader/pull/13))

## 0.0.4

#### 🏠 Internal

- Bumped `vitest` from `2.1.9` to `4.1.10` and resolved merge conflicts against `main` ([#11](https://github.com/brain-bbqs/ember-uploader/pull/11))
- Pinned the footer version indicator to a static placeholder (via a new `CHROMATIC_STATIC_VERSION` env var) when building Storybook and the Chromatic Playwright snapshots, so routine `package.json` version bumps no longer retrigger unrelated Chromatic diffs ([#11](https://github.com/brain-bbqs/ember-uploader/pull/11))
- Set up Codecov: unit tests now run with coverage in CI and upload results via `codecov/codecov-action`, added an `lcov` reporter to the Vitest coverage config, and ignored the local `coverage/` output directory ([#12](https://github.com/brain-bbqs/ember-uploader/pull/12))

## 0.0.2

#### 🏠 Internal

- Added `pre-commit` with `prettier`, `codespell`, and REUSE license-compliance hooks; added `configs/prettier.config.cjs`, `format`/`format:check` npm scripts, `LICENSES/MIT.txt`, a root `LICENSE` file, and `REUSE.toml` to bring the repository into REUSE compliance; reformatted the codebase with Prettier ([#4](https://github.com/brain-bbqs/ember-uploader/pull/4))
- Moved `.codespellrc` into `configs/` alongside the other tool configs ([#4](https://github.com/brain-bbqs/ember-uploader/pull/4))

## 0.0.1

#### 🚀 Enhancement

- Added a fully static, backend-free web app for uploading `.mp4` files to an existing dandiset on the DANDI Archive: drag-and-drop UI, a faithful JS port of the DANDI ETag checksum algorithm, resumable multipart S3 uploads with retry handling, MP4 structure/decodability validation, and GitHub Pages deployment ([#1](https://github.com/brain-bbqs/ember-uploader/pull/1))

#### 🏠 Internal

- Added Storybook component documentation and Chromatic visual regression testing, plus corresponding GitHub Actions workflows ([#3](https://github.com/brain-bbqs/ember-uploader/pull/3))
- Refactored from a single vanilla-JS `app.js` into a TypeScript + Vite project with a modular `src/lib`/`src/ui` architecture, added Vitest unit tests and Playwright integration tests, and introduced CI workflows for testing and deployment ([#2](https://github.com/brain-bbqs/ember-uploader/pull/2))
