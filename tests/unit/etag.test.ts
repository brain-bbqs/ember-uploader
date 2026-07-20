import { describe, expect, it } from "vitest";
import { planParts, computeDandiEtag } from "../../src/lib/etag";

const MB = 2 ** 20;

describe("planParts", () => {
  it("rejects empty files", () => {
    expect(() => planParts(0)).toThrow(/empty files/i);
  });

  it("rejects files larger than 5 TB", () => {
    expect(() => planParts(5 * 2 ** 40 + 1)).toThrow(/larger than the S3 maximum/i);
  });

  it("uses a single part sized to the whole file when it fits in one default part", () => {
    const parts = planParts(10 * MB);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ number: 1, offset: 0, size: 10 * MB });
  });

  it("splits a file spanning multiple default-sized parts", () => {
    const size = 64 * MB + 10;
    const parts = planParts(size);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ number: 1, offset: 0, size: 64 * MB });
    expect(parts[1]).toEqual({ number: 2, offset: 64 * MB, size: 10 });
    expect(parts[0].size + parts[1].size).toBe(size);
  });

  it("produces contiguous, non-overlapping offsets", () => {
    const parts = planParts(200 * MB + 1234);
    let expectedOffset = 0;
    for (const part of parts) {
      expect(part.offset).toBe(expectedOffset);
      expectedOffset += part.size;
    }
    expect(expectedOffset).toBe(200 * MB + 1234);
  });
});

describe("computeDandiEtag", () => {
  it("produces a hash-count suffix matching the number of parts", async () => {
    const size = 10 * MB;
    const file = new Blob([new Uint8Array(size)]);
    const parts = planParts(size);
    const progress: number[] = [];
    const etag = await computeDandiEtag(file, parts, (f) => progress.push(f));
    expect(etag).toMatch(/^[0-9a-f]{32}-1$/);
    expect(progress[progress.length - 1]).toBeCloseTo(1, 5);
  });

  it("is deterministic for identical content", async () => {
    const bytes = new Uint8Array(2 * MB).map((_, i) => i % 256);
    const fileA = new Blob([bytes]);
    const fileB = new Blob([bytes]);
    const partsA = planParts(fileA.size);
    const partsB = planParts(fileB.size);
    const etagA = await computeDandiEtag(fileA, partsA, () => {});
    const etagB = await computeDandiEtag(fileB, partsB, () => {});
    expect(etagA).toBe(etagB);
  });
});
