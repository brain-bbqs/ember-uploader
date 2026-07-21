import { buildTree, countDescendants, type DroppedFile, type TreeNode } from "../lib/fileTree";

const COLLAPSE_THRESHOLD = 30;

/**
 * Renders a nested directory tree into `root` and returns, for each dropped file, the
 * `<ul>` it was placed under so callers can append a matching file row there.
 */
export function renderFileTree(root: HTMLUListElement, entries: DroppedFile[]): Map<File, HTMLUListElement> {
  const targets = new Map<File, HTMLUListElement>();
  renderNode(buildTree(entries), root, targets);
  return targets;
}

function renderNode(node: TreeNode, container: HTMLUListElement, targets: Map<File, HTMLUListElement>): void {
  for (const entry of node.files) targets.set(entry.file, container);
  for (const child of node.dirs.values()) {
    const count = countDescendants(child);
    const collapsed = count > COLLAPSE_THRESHOLD;

    const li = document.createElement("li");
    li.className = "dir-item";
    li.innerHTML = `
      <button type="button" class="dir-toggle" aria-expanded="${!collapsed}">
        <span class="dir-chevron" aria-hidden="true">▸</span>
        <span class="dir-name"></span>
        <span class="dir-count">${count} item${count === 1 ? "" : "s"}</span>
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
    renderNode(child, childUl, targets);
  }
}
