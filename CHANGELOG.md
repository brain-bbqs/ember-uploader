# Changelog

## 0.0.20

#### 🚀 Enhancement

- Redesigned the summary progress readout from tqdm-style text (`42% (1.4 GB / 3.4 GB) [01:23<02:45, 15 MB/s]`) into labeled stat chips: each phase now shows a headline percentage above a full-width bar, with captioned Scanned/Uploaded, Speed, Time left, and Files figures beneath it, set in the app font (with tabular numerals) instead of monospace ([#30](https://github.com/brain-bbqs/ember-uploader/pull/30))
- Time-left estimates now read in plain words ("~3 minutes", "a few seconds") and round more coarsely as they grow, and the Speed figure is smoothed with a ~3s exponential moving average instead of the lifetime average, so both track current throughput without flickering; the Time left chip additionally shows "estimating…" during a phase's first 30 seconds of activity (counted from that phase's own first byte of progress), since instant checksum-cache hits at the start of a scan otherwise skew the early estimate far too low ([#30](https://github.com/brain-bbqs/ember-uploader/pull/30))
- The summary bars now carry `role="progressbar"` with live `aria-valuenow`, so overall progress is announced to screen readers ([#30](https://github.com/brain-bbqs/ember-uploader/pull/30))

#### 🐛 Bug Fix

- The fixed footer bar at the bottom of the viewport no longer swallows clicks aimed at page content behind its empty middle stretch (such as the upload bar's Upload/Cancel buttons once the file card grows tall enough to reach it); pointer events now pass through everywhere except over the bar's actual links and logo ([#30](https://github.com/brain-bbqs/ember-uploader/pull/30))

## 0.0.19

#### 🚀 Enhancement

- Centered the "BBQS Uploader" title in the header, flanked symmetrically by the BBQS logo and the sign-in controls ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Matched the signed-in avatar circle's size to the circular BBQS header logo (both 3rem) ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Restyled the "Scanning"/"Uploading" progress bar titles to match the file-name text at the left of the per-file progress rows (normal case, regular text color) instead of uppercase muted labels ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Moved each phase's "done/total files" count out of the byte-level stats line beside its bar; both the Scanning and Uploading bars now have their own simple bold file counter below and to the right of the bar, in the style of the footer's original count (which the Uploading counter replaces) ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Added a "Show more" button at the bottom of the What's New modal that renders the entire rest of the changelog ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Moved the "View dataset ↗" link from the file-drop card's upload bar into the Dataset card's heading, and dropped the single-dataset view's redundant "View in archive ↗" link pointing at the same page ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))
- Added a light/dark mode toggle next to the sign-in button that overrides the OS preference and persists across visits ([#28](https://github.com/brain-bbqs/ember-uploader/pull/28))

## 0.0.18

#### 🐛 Bug Fix

- Files whose destination path already holds an asset are no longer silently skipped on a pure path match (which ignored content, so a changed local file never updated its stale asset); they now upload normally and replace the existing asset, with content dedup left to the server's blob digest check so unchanged bytes are still never re-transferred. Rows finish as "Replaced" (with "content updated" or "matched existing content") instead of "Skipped", and the progress footer counts replaced files ([#27](https://github.com/brain-bbqs/ember-uploader/pull/27))

## 0.0.17

#### 🚀 Enhancement

- Added a persistent per-part checksum cache (IndexedDB): part digests are written through as hashing completes, so re-dropping an unchanged file — across page reloads or after a cancelled/interrupted scan — resumes from its already-hashed parts instead of re-hashing from scratch. Files are keyed by relative path + name + size + mtime (the strongest identity a browser exposes); since that is a heuristic, a fully cached file re-hashes one randomly chosen part and compares it against the cached digest before its etag is trusted, discarding the record and re-hashing everything on mismatch. Records are evicted least-recently-used past a ~10MB budget ([#26](https://github.com/brain-bbqs/ember-uploader/pull/26))

## 0.0.16

#### 🚀 Enhancement

- Parallelized checksum hashing across the parts of a single large file: the per-file "one worker hashes all of a file's parts sequentially" lanes were replaced by a shared pool of part-hashing workers (one per CPU core, up to 8) fed by a queue of individual parts drained round-robin across all files being hashed, so a lone multi-part file now uses every core instead of one, and a newly dropped file gets serviced as soon as any worker frees up instead of waiting behind another file's remaining parts ([#25](https://github.com/brain-bbqs/ember-uploader/pull/25))
- Made checksum hashing cancellable: "Cancel all" now also aborts in-progress and queued hashing (mid-part, at 16MB chunk granularity) and is offered while files are still scanning, with cancelled rows marked "Cancelled" ([#25](https://github.com/brain-bbqs/ember-uploader/pull/25))

## 0.0.15

#### 🚀 Enhancement

- Reworked the file tree's slider from a per-folder "auto-expand folders up to N entries" threshold into a continuous "show N files" reveal: at position N exactly N file rows are visible in total across the whole tree, handed out one at a time round-robin across directories in breadth-first order so no single large folder can hog the slots; folder rows are always shown, and every folder still holding hidden files gets a "… N more files" placeholder row instead of being cut off silently ([#24](https://github.com/brain-bbqs/ember-uploader/pull/24))
- Restyled the reveal slider as a ruler: minor tick marks every 5% of the track with labeled major ticks at each quarter of the file count (replacing the browser-dependent `<datalist>` dots), and an "N files" value bubble that rides along with the slider thumb instead of a static readout beside it; the track is also wider now (220px, up from 90px) ([#24](https://github.com/brain-bbqs/ember-uploader/pull/24))

## 0.0.14

#### 🚀 Enhancement

- Made the signed-in avatar icon about a third larger ([#23](https://github.com/brain-bbqs/ember-uploader/pull/23))
- Reworded the upload progress footer count from "X/Y files" to "X/Y files done", and added a separate "done/total files" counter to each of the Scanning and Uploading progress bars individually ([#23](https://github.com/brain-bbqs/ember-uploader/pull/23))

#### 🐛 Bug Fix

- Fixed the file tree failing to render and the expand-depth slider becoming unresponsive when dropping a large folder, by yielding to the browser periodically while building the tree/queueing files, coalescing hash-progress UI updates to once per animation frame, and debouncing the slider's full-tree traversal ([#23](https://github.com/brain-bbqs/ember-uploader/pull/23))
- Changed the tree's expand slider to judge each folder by its own direct entry count (files and subfolders held directly inside it) rather than its full recursive subtree size; a single dominant aggregator folder no longer acts as an all-or-nothing gate where nothing below it shows until the slider clears it and then everything does at once, since dominant folders typically hold only a handful of direct subfolders even when their full subtree is huge ([#23](https://github.com/brain-bbqs/ember-uploader/pull/23))

## 0.0.13

#### 🚀 Enhancement

- Replaced the dropzone's single page icon with three icons (video camera, microscope, paper) to better represent the range of research contents that can be uploaded ([#22](https://github.com/brain-bbqs/ember-uploader/pull/22))

## 0.0.12

#### 🚀 Enhancement

- Simplified the "Dataset" and file-drop cards: dropped the numbered "1 ·"/"2 ·" section titles and the "Files" heading, since the cards are self-explanatory ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- When the signed-in user has only one incoming dataset, it's now shown as "Uploading directly to EMBER Dandiset `000xyz`, "Incoming: ..."" (the identifier in a code style) with a link out to its archive view, instead of a disabled single-option dropdown ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Removed the connection status dot and its hover text next to the dataset picker, since the picker's own states already communicate sign-in and loading status ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Renamed the app to "BBQS Uploader" with the BBQS logo in the header, and added a subtitle ("Your direct upload link to the EMBER-DANDI Archive") flanked by a doubled-size EMBER logo on both sides ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Reworded the no-datasets-found message to "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this." ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Replaced the dropzone's arrow icon with a page icon, and removed the "or select a folder" link underneath it; folders can still be uploaded by dragging them onto the box ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- The dataset picker's status messages (signed out, loading, no datasets, error) are now shown as plain text instead of a disabled dropdown option ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Cropped the BBQS header logo to a circle and made it 25% larger ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Tightened up copy: added periods to the dropzone prompt and the sign-in message ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))

#### 🏠 Internal

- Added a `?test&num_datasets=N` URL override that fills the dataset picker with fake "Incoming: Test dataset" entries under negative identifiers (e.g. `-000001`, so they're never mistaken for real dandisets), including `N=0` for the no-datasets-found state, so any dataset-picker state can be previewed without a real account; `?test` alone (without `num_datasets`) is a no-op ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))
- Fixed the `?test` override clearing the header avatar/username for an already signed-in user, since it now leaves real sign-in state untouched and only fakes the dataset list ([#20](https://github.com/brain-bbqs/ember-uploader/pull/20))

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
