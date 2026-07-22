// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFileTree, setRevealCount } from "../../src/ui/fileTree";
import type { DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string): File {
  return new File(["x"], name);
}

function toggleByName(root: HTMLUListElement, name: string): HTMLButtonElement {
  const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
  return toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
}

// Mirrors what main.ts does after renderFileTree: append one (initially hidden) file row per
// entry into the <ul> the tree render assigned it.
async function renderWithRows(root: HTMLUListElement, entries: DroppedFile[]): Promise<void> {
  const targets = await renderFileTree(root, entries);
  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "file-item";
    li.textContent = entry.file.name;
    li.hidden = true;
    (targets.get(entry.file) ?? root).appendChild(li);
  }
}

function visibleFileNames(root: HTMLUListElement): string[] {
  return Array.from(root.querySelectorAll<HTMLLIElement>(".file-item"))
    .filter((li) => !li.hidden)
    .map((li) => li.textContent!)
    .sort();
}

function placeholderTexts(root: HTMLUListElement): string[] {
  return Array.from(root.querySelectorAll<HTMLLIElement>(".more-files"), (li) => li.textContent!);
}

function files(folder: string, count: number): DroppedFile[] {
  return Array.from({ length: count }, (_, i) => ({
    file: fakeFile(`${folder}-${i}.txt`),
    relativePath: folder,
  }));
}

describe("renderFileTree", () => {
  it("places top-level (non-nested) files directly in the root list, no dir wrapper", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const targets = await renderFileTree(root, entries);
    expect(targets.get(entries[0].file)).toBe(root);
    expect(root.querySelectorAll(".dir-item")).toHaveLength(0);
  });

  it("always renders folder rows expanded, no matter how many files they hold", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, files("bigfolder", 500));

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("lets a folder be collapsed and re-expanded by clicking its toggle", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, files("folder", 2));

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(childUl.hidden).toBe(true);

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });
});

describe("setRevealCount", () => {
  it("reveals exactly N file rows in total, one more per tick", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("a", 3), ...files("b", 3)]);

    for (let n = 0; n <= 6; n++) {
      setRevealCount(root, n);
      expect(visibleFileNames(root)).toHaveLength(n);
    }
  });

  it("hands out slots round-robin so a large folder can't hog them from its siblings", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("big", 100), ...files("small", 2)]);

    setRevealCount(root, 4);
    // Round 1: big-0, small-0; round 2: big-1, small-1 — not the first four of "big".
    expect(visibleFileNames(root)).toEqual(["big-0.txt", "small-0.txt", "big-1.txt", "small-1.txt"].sort());
  });

  it("cycles back to earlier folders once later ones run out of files", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("a", 3), ...files("b", 1)]);

    setRevealCount(root, 4);
    expect(visibleFileNames(root)).toEqual(["a-0.txt", "a-1.txt", "a-2.txt", "b-0.txt"].sort());
  });

  it("treats the root list's own top-level files as the first directory in the cycle", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [{ file: fakeFile("top.txt"), relativePath: "" }, ...files("folder", 5)]);

    setRevealCount(root, 1);
    expect(visibleFileNames(root)).toEqual(["top.txt"]);
  });

  it("orders the cycle breadth-first, so a nested folder joins right after its parent's level", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [
      ...files("outer", 2),
      { file: fakeFile("inner-0.txt"), relativePath: "outer/inner" },
      { file: fakeFile("inner-1.txt"), relativePath: "outer/inner" },
    ]);

    setRevealCount(root, 2);
    expect(visibleFileNames(root)).toEqual(["outer-0.txt", "inner-0.txt"].sort());
  });

  it("marks every folder still holding hidden files with a free '… N more files' placeholder", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("a", 3), ...files("b", 1)]);

    setRevealCount(root, 2);
    // "a" shows 1 of 3, "b" shows its only file — so only "a" gets a placeholder, and the
    // placeholder doesn't consume a slot (exactly 2 real rows stay visible).
    expect(visibleFileNames(root)).toHaveLength(2);
    expect(placeholderTexts(root)).toEqual(["… 2 more files"]);

    setRevealCount(root, 3);
    expect(placeholderTexts(root)).toEqual(["… 1 more file"]);
  });

  it("removes placeholders once a reveal count covers every file", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, files("a", 3));

    setRevealCount(root, 0);
    expect(placeholderTexts(root)).toEqual(["… 3 more files"]);

    setRevealCount(root, 3);
    expect(placeholderTexts(root)).toEqual([]);
    expect(visibleFileNames(root)).toHaveLength(3);
  });

  it("re-applies cleanly when the reveal count is lowered again", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("a", 2), ...files("b", 2)]);

    setRevealCount(root, 4);
    expect(visibleFileNames(root)).toHaveLength(4);

    setRevealCount(root, 1);
    expect(visibleFileNames(root)).toEqual(["a-0.txt"]);
    expect(placeholderTexts(root)).toEqual(["… 1 more file", "… 2 more files"]);
  });

  it("does not touch folder collapse state, which stays a purely manual toggle", async () => {
    const root = document.createElement("ul");
    await renderWithRows(root, [...files("a", 2), ...files("b", 2)]);

    toggleByName(root, "a").click();
    setRevealCount(root, 4);
    expect(toggleByName(root, "a").getAttribute("aria-expanded")).toBe("false");
    expect(toggleByName(root, "b").getAttribute("aria-expanded")).toBe("true");
  });
});
