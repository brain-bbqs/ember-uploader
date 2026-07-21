// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFileTree, setExpandDepth } from "../../src/ui/fileTree";
import type { DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string): File {
  return new File(["x"], name);
}

describe("renderFileTree", () => {
  it("places top-level (non-nested) files directly in the root list, no dir wrapper", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const targets = renderFileTree(root, entries);
    expect(targets.get(entries[0].file)).toBe(root);
    expect(root.querySelectorAll(".dir-item")).toHaveLength(0);
  });

  it("collapses a subtree with more than 30 descendant entries by default, and expands on click", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    renderFileTree(root, entries);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(childUl.hidden).toBe(true);

    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("does not collapse a subtree with 30 or fewer descendant entries", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 30 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "smallfolder",
    }));
    renderFileTree(root, entries);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("expands the first two levels by default and collapses anything deeper", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "l1/l2/l3" }];
    renderFileTree(root, entries);

    const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
    const byName = (name: string) => toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
    // l1 (depth 1) and l2 (depth 2) are within the default expand depth; l3 (depth 3) is not.
    expect(byName("l1").getAttribute("aria-expanded")).toBe("true");
    expect(byName("l2").getAttribute("aria-expanded")).toBe("true");
    expect(byName("l3").getAttribute("aria-expanded")).toBe("false");
  });

  it("honors a custom expandDepth passed to renderFileTree", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "l1/l2/l3" }];
    renderFileTree(root, entries, 1);

    const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
    const byName = (name: string) => toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
    expect(byName("l1").getAttribute("aria-expanded")).toBe("true");
    expect(byName("l2").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("setExpandDepth", () => {
  it("re-applies a new expand depth to an already-rendered tree", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "l1/l2/l3" }];
    renderFileTree(root, entries, 1);

    const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
    const byName = (name: string) => toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
    expect(byName("l3").getAttribute("aria-expanded")).toBe("false");

    setExpandDepth(root, 3);
    expect(byName("l1").getAttribute("aria-expanded")).toBe("true");
    expect(byName("l2").getAttribute("aria-expanded")).toBe("true");
    expect(byName("l3").getAttribute("aria-expanded")).toBe("true");

    setExpandDepth(root, 0);
    expect(byName("l1").getAttribute("aria-expanded")).toBe("false");
  });

  it("still respects the item-count threshold regardless of expand depth", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    renderFileTree(root, entries, 1);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    setExpandDepth(root, 5);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
