import { describe, expect, it } from "vitest";
import { formatDuration, humanSize, initialsFrom } from "../../src/lib/format";

describe("humanSize", () => {
  it("formats bytes with the right unit", () => {
    expect(humanSize(500)).toBe("500 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDuration", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("formats past an hour as h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("falls back to a placeholder for non-finite or negative input", () => {
    expect(formatDuration(NaN)).toBe("--:--");
    expect(formatDuration(Infinity)).toBe("--:--");
    expect(formatDuration(-5)).toBe("--:--");
  });
});

describe("initialsFrom", () => {
  it("takes the first letter of the first and last word, matching the main archive's convention", () => {
    expect(initialsFrom("Cody Baker")).toBe("CB");
    expect(initialsFrom("Cody C Baker")).toBe("CB");
    expect(initialsFrom("  cody   baker  ")).toBe("CB");
  });

  it("falls back to '??' for an empty or single-word name", () => {
    expect(initialsFrom("")).toBe("??");
    expect(initialsFrom("cbaker")).toBe("??");
  });
});
