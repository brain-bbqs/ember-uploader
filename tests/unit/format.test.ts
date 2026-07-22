import { describe, expect, it } from "vitest";
import { friendlyEta, humanSize, initialsFrom } from "../../src/lib/format";

describe("humanSize", () => {
  it("formats bytes with the right unit", () => {
    expect(humanSize(500)).toBe("500 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("friendlyEta", () => {
  it("keeps very short estimates vague", () => {
    expect(friendlyEta(0)).toBe("a few sec");
    expect(friendlyEta(9)).toBe("a few sec");
  });

  it("rounds sub-minute estimates to 5 seconds", () => {
    expect(friendlyEta(12)).toBe("~10 sec");
    expect(friendlyEta(42)).toBe("~40 sec");
  });

  it("promotes near-minute and sub-hour estimates to minutes", () => {
    expect(friendlyEta(58)).toBe("~1 min");
    expect(friendlyEta(170)).toBe("~3 min");
    expect(friendlyEta(59.4 * 60)).toBe("~59 min");
  });

  it("formats hour-scale estimates as hours and minutes", () => {
    expect(friendlyEta(59.5 * 60)).toBe("~1 hr");
    expect(friendlyEta(3650)).toBe("~1 hr 1 min");
    expect(friendlyEta(2 * 3600)).toBe("~2 hr");
  });

  it("falls back to a placeholder for non-finite or negative input", () => {
    expect(friendlyEta(NaN)).toBe("—");
    expect(friendlyEta(Infinity)).toBe("—");
    expect(friendlyEta(-5)).toBe("—");
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
