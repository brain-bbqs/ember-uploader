import { buildTree, countDescendants, sumSize, type DroppedFile, type TreeNode } from "../lib/fileTree";
import { humanSize } from "../lib/format";

const COLLAPSE_THRESHOLD = 30;
export const DEFAULT_EXPAND_DEPTH = 2;

/**
 * Renders a nested directory tree into `root` and returns, for each dropped file, the
 * `<ul>` it was placed under so callers can append a matching file row there. Folders past
 * `expandDepth` levels of nesting (or with more than 30 entries) start collapsed.
 */
export function renderFileTree(
  root: HTMLUListElement,
  entries: DroppedFile[],
  expandDepth = DEFAULT_EXPAND_DEPTH,
): Map<File, HTMLUListElement> {
  const targets = new Map<File, HTMLUListElement>();
  renderNode(buildTree(entries), root, targets, 1, expandDepth);
  return targets;
}

function renderNode(
  node: TreeNode,
  container: HTMLUListElement,
  targets: Map<File, HTMLUListElement>,
  depth: number,
  expandDepth: number,
): void {
  for (const entry of node.files) targets.set(entry.file, container);
  for (const child of node.dirs.values()) {
    const count = countDescendants(child);
    const collapsed = depth > expandDepth || count > COLLAPSE_THRESHOLD;
    const size = sumSize(child);

    const li = document.createElement("li");
    li.className = "dir-item";
    li.innerHTML = `
      <button type="button" class="dir-toggle" aria-expanded="${!collapsed}" data-depth="${depth}" data-count="${count}">
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
    renderNode(child, childUl, targets, depth + 1, expandDepth);
  }
}

/** Re-applies a "expand down to N levels" bulk toggle to an already-rendered tree. */
export function setExpandDepth(root: HTMLUListElement, expandDepth: number): void {
  root.querySelectorAll<HTMLButtonElement>(".dir-toggle").forEach((toggle) => {
    const depth = Number(toggle.dataset.depth);
    const count = Number(toggle.dataset.count);
    const collapsed = depth > expandDepth || count > COLLAPSE_THRESHOLD;
    const childUl = toggle.nextElementSibling as HTMLUListElement;
    childUl.hidden = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
}
