// Isolated stories for the "?test&mock_upload=N" live test injection documented in
// docs/README.md -- a snapshot of the scanning/uploading UI mid-flight against a nested batch of
// fake files, in both color themes. Paste e.g. "?test&mock_upload=25" into the running app's
// address bar to see the real (animated) thing.
import { buildTree, countDescendants, sumSize, type TreeNode } from "../../src/lib/fileTree";
import { generateMockDroppedFiles } from "../../src/lib/mockUpload";
import { createFileRow, type FileRow } from "../../src/ui/fileRow";
import { humanSize } from "../../src/lib/format";
import { withCard, withTheme } from "../utils";

// A trimmed-down, synchronous stand-in for src/ui/fileTree.ts's renderFileTree() -- unneeded here
// since a story only ever renders a handful of rows, not a large chunked-yield batch.
function renderNode(node: TreeNode, container: HTMLUListElement, rows: FileRow[]): void {
  for (const entry of node.files) {
    const path = [entry.relativePath, entry.file.name].filter(Boolean).join("/");
    rows.push(createFileRow(container, entry.file, `mock-file-${rows.length}`, path));
  }
  for (const child of node.dirs.values()) {
    const count = countDescendants(child);
    const size = sumSize(child);
    const li = document.createElement("li");
    li.className = "dir-item";
    li.innerHTML = `
      <button type="button" class="dir-toggle" aria-expanded="true">
        <span class="dir-chevron" aria-hidden="true">▸</span>
        <span class="dir-name">${child.name}/</span>
        <span class="dir-count">${count} item${count === 1 ? "" : "s"}</span>
        <span class="dir-size">${humanSize(size)}</span>
      </button>
      <ul class="dir-children"></ul>
    `;
    container.appendChild(li);
    renderNode(child, li.querySelector<HTMLUListElement>(".dir-children")!, rows);
  }
}

function progressPhaseMarkup(opts: {
  label: string;
  pct: number;
  doneLabel: string;
  done: string;
  total: string;
  rate: string;
  eta: string;
  filesDone: number;
  filesTotal: number;
}): string {
  return `
    <div class="progress-phase">
      <div class="progress-phase-head">
        <span class="progress-phase-label">${opts.label}</span>
        <span class="progress-phase-pct">${opts.pct}%</span>
      </div>
      <div class="progress-summary-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${opts.pct}">
        <div style="width: ${opts.pct}%"></div>
      </div>
      <div class="progress-chips">
        <div class="progress-chip">
          <span class="progress-chip-label">${opts.doneLabel}</span>
          <span class="progress-chip-value">${opts.done}<span class="progress-chip-sub"> of ${opts.total}</span></span>
        </div>
        <div class="progress-chip">
          <span class="progress-chip-label">Speed</span>
          <span class="progress-chip-value">${opts.rate}</span>
        </div>
        <div class="progress-chip">
          <span class="progress-chip-label">Time left</span>
          <span class="progress-chip-value">${opts.eta}</span>
        </div>
        <div class="progress-chip">
          <span class="progress-chip-label">Files</span>
          <span class="progress-chip-value">${opts.filesDone}<span class="progress-chip-sub"> of ${opts.filesTotal}</span></span>
        </div>
      </div>
    </div>
  `;
}

function buildMockUploadPanel(): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "card";

  const entries = generateMockDroppedFiles(6);
  const totalSize = entries.reduce((sum, e) => sum + e.file.size, 0);

  wrap.innerHTML = `
    <div class="progress-summary">
      ${progressPhaseMarkup({
        label: "Scanning",
        pct: 100,
        doneLabel: "Scanned",
        done: humanSize(totalSize),
        total: humanSize(totalSize),
        rate: "—",
        eta: "done",
        filesDone: 6,
        filesTotal: 6,
      })}
      ${progressPhaseMarkup({
        label: "Uploading",
        pct: 42,
        doneLabel: "Uploaded",
        done: humanSize(totalSize * 0.42),
        total: humanSize(totalSize),
        rate: "180 MB/s",
        eta: "~46 seconds",
        filesDone: 2,
        filesTotal: 6,
      })}
      <div class="progress-summary-footer">
        <span>2 done</span>
        <span></span>
        <span></span>
      </div>
    </div>
    <ul id="file-list"></ul>
  `;

  const fileList = wrap.querySelector<HTMLUListElement>("#file-list")!;
  const rows: FileRow[] = [];
  renderNode(buildTree(entries), fileList, rows);

  // A believable spread of per-row states for a batch caught mid-transfer: a couple finished, a
  // couple uploading, one still scanning, one still queued -- left alone in its default state.
  rows[0]?.setBadge("Done", "ok");
  rows[0]?.setProgress(1, true);
  rows[1]?.setBadge("Done", "ok");
  rows[1]?.setProgress(1, true);
  rows[2]?.setBadge("Uploading", "busy");
  rows[2]?.setStatus("64%");
  rows[2]?.setProgress(0.64);
  rows[3]?.setBadge("Uploading", "busy");
  rows[3]?.setStatus("21%");
  rows[3]?.setProgress(0.21);
  rows[4]?.setBadge("Scanning", "busy");
  rows[4]?.setProgress(0.8);

  return withCard(wrap);
}

export default {
  title: "Injections/Mock upload",
};

export const MidTransferLight = {
  name: "Mid-transfer (light)",
  render: () => withTheme("light", buildMockUploadPanel),
};

export const MidTransferDark = {
  name: "Mid-transfer (dark)",
  render: () => withTheme("dark", buildMockUploadPanel),
};
