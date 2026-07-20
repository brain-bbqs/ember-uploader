# Changelog

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
