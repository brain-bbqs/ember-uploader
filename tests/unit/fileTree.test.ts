import { describe, expect, it } from "vitest";
import {
  buildTree,
  countDescendants,
  directEntryCount,
  maxDirectEntries,
  sumSize,
  type DroppedFile,
} from "../../src/lib/fileTree";

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

describe("directEntryCount", () => {
  it("counts only immediate files and subfolders, not anything nested deeper", () => {
    const entries: DroppedFile[] = [
      { file: fakeFile("a.txt"), relativePath: "top" },
      { file: fakeFile("b.txt"), relativePath: "top" },
      { file: fakeFile("c.txt"), relativePath: "top/sub" },
      { file: fakeFile("d.txt"), relativePath: "top/sub" },
    ];
    const tree = buildTree(entries);
    const top = tree.dirs.get("top")!;
    // top directly holds: a.txt, b.txt, and the "sub" folder itself = 3, regardless of what's inside "sub".
    expect(directEntryCount(top)).toBe(3);
  });

  it("is zero for an empty node", () => {
    const tree = buildTree([]);
    expect(directEntryCount(tree)).toBe(0);
  });
});

describe("maxDirectEntries", () => {
  it("is the root's own direct entry count when there are no subfolders", () => {
    const tree = buildTree([
      { file: fakeFile("a.txt"), relativePath: "" },
      { file: fakeFile("b.txt"), relativePath: "" },
    ]);
    expect(maxDirectEntries(tree)).toBe(2);
  });

  it("takes the folder with the most direct entries anywhere, not the one with the most nested descendants", () => {
    const tree = buildTree([
      // "wide" holds 5 files directly.
      ...Array.from({ length: 5 }, (_, i) => ({ file: fakeFile(`w${i}.txt`), relativePath: "wide" })),
      // "deep" spreads its files across two nesting levels, so no single node along that chain
      // holds more than 4 direct entries — even though the full subtree (deep/nested1/nested2/*)
      // ends up with more total descendants than "wide" has.
      { file: fakeFile("n1.txt"), relativePath: "deep/nested1" },
      ...Array.from({ length: 4 }, (_, i) => ({ file: fakeFile(`n2-${i}.txt`), relativePath: "deep/nested1/nested2" })),
    ]);
    expect(countDescendants(tree.dirs.get("deep")!)).toBeGreaterThan(countDescendants(tree.dirs.get("wide")!));
    expect(maxDirectEntries(tree)).toBe(5);
  });
});
