export interface DroppedFile {
  file: File;
  /** Forward-slash-joined folder path containing the file, no filename. Empty for a top-level file. */
  relativePath: string;
}

export interface TreeNode {
  name: string;
  path: string;
  dirs: Map<string, TreeNode>;
  files: DroppedFile[];
}

export function buildTree(entries: DroppedFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", dirs: new Map(), files: [] };
  for (const entry of entries) {
    if (!entry.relativePath) {
      root.files.push(entry);
      continue;
    }
    const segments = entry.relativePath.split("/").filter(Boolean);
    let node = root;
    let path = "";
    for (const seg of segments) {
      path = path ? `${path}/${seg}` : seg;
      let child = node.dirs.get(seg);
      if (!child) {
        child = { name: seg, path, dirs: new Map(), files: [] };
        node.dirs.set(seg, child);
      }
      node = child;
    }
    node.files.push(entry);
  }
  return root;
}

/** Number of files and subfolders anywhere in this node's subtree (not counting the node itself). */
export function countDescendants(node: TreeNode): number {
  let count = node.files.length;
  for (const child of node.dirs.values()) {
    count += 1 + countDescendants(child);
  }
  return count;
}

/** Total byte size of every file anywhere in this node's subtree. */
export function sumSize(node: TreeNode): number {
  let total = node.files.reduce((sum, entry) => sum + entry.file.size, 0);
  for (const child of node.dirs.values()) {
    total += sumSize(child);
  }
  return total;
}

/** Number of files and subfolders directly inside this node (not counting anything nested deeper). */
export function directEntryCount(node: TreeNode): number {
  return node.files.length + node.dirs.size;
}

/** Largest `directEntryCount` found on any single directory node in this subtree (including the node itself). */
export function maxDirectEntries(node: TreeNode): number {
  let max = directEntryCount(node);
  for (const child of node.dirs.values()) {
    max = Math.max(max, maxDirectEntries(child));
  }
  return max;
}
