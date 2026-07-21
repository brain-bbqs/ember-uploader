import { describe, expect, it } from "vitest";
import { buildTree, countDescendants, maxDepth, sumSize, type DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string, size = 1): File {
  return new File([new Uint8Array(size)], name);
}

describe("buildTree", () => {
  it("puts top-level files (empty relativePath) directly on the root", () => {
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const tree = buildTree(entries);
    expect(tree.files).toHaveLength(1);
    expect(tree.dirs.size).toBe(0);
  });

  it("nests files under their folder path", () => {
    const entries: DroppedFile[] = [
      { file: fakeFile("clip.mp4"), relativePath: "session1/videos" },
      { file: fakeFile("notes.txt"), relativePath: "session1" },
    ];
    const tree = buildTree(entries);
    expect(tree.files).toHaveLength(0);
    const session1 = tree.dirs.get("session1")!;
    expect(session1.path).toBe("session1");
    expect(session1.files).toHaveLength(1);
    const videos = session1.dirs.get("videos")!;
    expect(videos.path).toBe("session1/videos");
    expect(videos.files).toHaveLength(1);
  });
});

describe("countDescendants", () => {
  it("counts files and subfolders recursively", () => {
    const entries: DroppedFile[] = [
      { file: fakeFile("a.txt"), relativePath: "top" },
      { file: fakeFile("b.txt"), relativePath: "top/sub" },
      { file: fakeFile("c.txt"), relativePath: "top/sub" },
    ];
    const tree = buildTree(entries);
    const top = tree.dirs.get("top")!;
    // top has: a.txt, "sub" folder itself, b.txt, c.txt = 4 descendants.
    expect(countDescendants(top)).toBe(4);
  });

  it("is zero for an empty node", () => {
    const tree = buildTree([]);
    expect(countDescendants(tree)).toBe(0);
  });
});

describe("sumSize", () => {
  it("sums file sizes recursively across subfolders", () => {
    const entries: DroppedFile[] = [
      { file: fakeFile("a.txt", 10), relativePath: "top" },
      { file: fakeFile("b.txt", 20), relativePath: "top/sub" },
      { file: fakeFile("c.txt", 30), relativePath: "top/sub" },
    ];
    const tree = buildTree(entries);
    const top = tree.dirs.get("top")!;
    expect(sumSize(top)).toBe(60);
  });

  it("is zero for an empty node", () => {
    const tree = buildTree([]);
    expect(sumSize(tree)).toBe(0);
  });
});

describe("maxDepth", () => {
  it("is zero for a node with only top-level files, no subfolders", () => {
    const tree = buildTree([{ file: fakeFile("a.txt"), relativePath: "" }]);
    expect(maxDepth(tree)).toBe(0);
  });

  it("counts the deepest nested chain of folders", () => {
    const tree = buildTree([{ file: fakeFile("a.txt"), relativePath: "l1/l2/l3" }]);
    expect(maxDepth(tree)).toBe(3);
  });

  it("takes the deepest of multiple branches", () => {
    const tree = buildTree([
      { file: fakeFile("a.txt"), relativePath: "shallow" },
      { file: fakeFile("b.txt"), relativePath: "deep/deeper/deepest" },
    ]);
    expect(maxDepth(tree)).toBe(3);
  });
});
