import {
  buildTree,
  countDescendants,
  directEntryCount,
  sumSize,
  type DroppedFile,
  type TreeNode,
} from "../lib/fileTree";
import { humanSize } from "../lib/format";

export const DEFAULT_MAX_ENTRIES = 30;

// Building the DOM for a very large dropped folder (thousands of directory nodes) in one
// synchronous pass blocks the main thread long enough that the browser can't paint anything
// (including the tree itself) until it's done. Yielding back to the event loop every
// RENDER_CHUNK_SIZE nodes lets the browser interleave a paint between chunks.
const RENDER_CHUNK_SIZE = 300;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Renders a nested directory tree into `root` and returns, for each dropped file, the
 * `<ul>` it was placed under so callers can append a matching file row there. A folder starts
 * collapsed once it directly holds more than `maxEntries` files and subfolders combined —
 * deliberately its own *direct* entries, not the full recursive size of its subtree, so one
 * dominant folder (holding effectively the whole drop, but only a handful of direct subfolders)
 * doesn't act as an all-or-nothing gate for everything nested inside it. Collapsing still
 * cascades out-to-in, top-to-bottom: a folder inside an already-collapsed folder stays collapsed
 * regardless of its own size.
 */
export async function renderFileTree(
  root: HTMLUListElement,
  entries: DroppedFile[],
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<Map<File, HTMLUListElement>> {
  const targets = new Map<File, HTMLUListElement>();
  let processed = 0;

  async function renderNode(node: TreeNode, container: HTMLUListElement, parentCollapsed: boolean): Promise<void> {
    for (const entry of node.files) targets.set(entry.file, container);
    for (const child of node.dirs.values()) {
      const directEntries = directEntryCount(child);
      const collapsed = parentCollapsed || directEntries > maxEntries;
      const count = countDescendants(child);
      const size = sumSize(child);

      const li = document.createElement("li");
      li.className = "dir-item";
      li.innerHTML = `
        <button type="button" class="dir-toggle" aria-expanded="${!collapsed}" data-entries="${directEntries}">
          <span class="dir-chevron" aria-hidden="true">▸</span>
          <span class="dir-name"></span>
          <span class="dir-count">${count} item${count === 1 ? "" : "s"}</span>
          <span class="dir-size">${humanSize(size)}</span>
        </button>
        <ul class="dir-children"></ul>
      `;
      li.querySelector(".dir-name")!.textContent = `${child.name}/`;
      const childUl = li.querySelector<HTMLUListElement>(".dir-children")!;
      childUl.hidden = collapsed;
      const toggle = li.querySelector<HTMLButtonElement>(".dir-toggle")!;
      toggle.addEventListener("click", () => {
        const nowHidden = !childUl.hidden;
        childUl.hidden = nowHidden;
        toggle.setAttribute("aria-expanded", String(!nowHidden));
      });

      container.appendChild(li);
      if (++processed % RENDER_CHUNK_SIZE === 0) await yieldToMain();

      await renderNode(child, childUl, collapsed);
    }
  }

  await renderNode(buildTree(entries), root, false);
  return targets;
}

/**
 * Re-applies an "auto-expand folders with up to N direct entries" bulk toggle to an already-
 * rendered tree. Walks out-to-in (root to leaves) and top-to-bottom (document order) so a folder
 * past `maxEntries` forces every folder nested inside it to stay collapsed too, regardless of
 * their own size.
 */
export function setExpandCount(root: HTMLUListElement, maxEntries: number): void {
  function walk(container: HTMLUListElement, parentCollapsed: boolean): void {
    for (const li of Array.from(container.children)) {
      if (!(li instanceof HTMLLIElement) || !li.classList.contains("dir-item")) continue;
      const toggle = li.firstElementChild as HTMLButtonElement;
      const childUl = li.lastElementChild as HTMLUListElement;
      const directEntries = Number(toggle.dataset.entries);
      const collapsed = parentCollapsed || directEntries > maxEntries;
      childUl.hidden = collapsed;
      toggle.setAttribute("aria-expanded", String(!collapsed));
      walk(childUl, collapsed);
    }
  }
  walk(root, false);
}
