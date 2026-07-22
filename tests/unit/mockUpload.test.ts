import { describe, expect, it } from "vitest";
import { generateMockDroppedFiles, MOCK_FILE_MAX_SIZE, MOCK_FILE_MIN_SIZE } from "../../src/lib/mockUpload";

describe("generateMockDroppedFiles", () => {
  it("returns exactly `count` entries", () => {
    const entries = generateMockDroppedFiles(25);
    expect(entries).toHaveLength(25);
  });

  it("returns nothing for a zero count", () => {
    const entries = generateMockDroppedFiles(0);
    expect(entries).toHaveLength(0);
  });

  it("keeps every fake file's reported size within [MOCK_FILE_MIN_SIZE, MOCK_FILE_MAX_SIZE]", () => {
    const entries = generateMockDroppedFiles(200);
    for (const entry of entries) {
      expect(entry.file.size).toBeGreaterThanOrEqual(MOCK_FILE_MIN_SIZE);
      expect(entry.file.size).toBeLessThanOrEqual(MOCK_FILE_MAX_SIZE);
    }
  });

  it("spreads sizes across the range rather than clustering near one end", () => {
    const entries = generateMockDroppedFiles(200);
    const midpoint = (MOCK_FILE_MIN_SIZE + MOCK_FILE_MAX_SIZE) / 2;
    const aboveMidpoint = entries.filter((e) => e.file.size > midpoint).length;
    // A uniform draw over 200 samples should land roughly half above the midpoint; a generous
    // band (20-80%) keeps this from being a flaky test while still catching a badly skewed draw.
    expect(aboveMidpoint).toBeGreaterThan(40);
    expect(aboveMidpoint).toBeLessThan(160);
  });

  it("gives every file a non-empty name with an extension", () => {
    const entries = generateMockDroppedFiles(50);
    for (const entry of entries) {
      expect(entry.file.name).toMatch(/^[\w-]+\.\w+$/);
    }
  });

  it("nests at least some files under a folder path", () => {
    const entries = generateMockDroppedFiles(50);
    expect(entries.some((e) => e.relativePath !== "")).toBe(true);
  });
});
