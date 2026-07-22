import { describe, expect, it } from "vitest";
import { planParts, hashPart, combineDigests } from "../../src/lib/etag";
import type { FilePart } from "../../src/lib/types";

const MB = 2 ** 20;

/** Sequential reference implementation of the dandi-etag, used as the oracle the production
 * worker-pool path (hashPart per part + combineDigests) is checked against. */
async function computeDandiEtag(
  file: Blob,
  parts: FilePart[],
  onProgress: (fraction: number) => void,
): Promise<string> {
  const partDigests = new Uint8Array(parts.length * 16);
  let bytesBefore = 0;
  for (const part of parts) {
    const digest = await hashPart(file, part, (bytesDoneInPart) => {
      onProgress((bytesBefore + bytesDoneInPart) / file.size);
    });
    partDigests.set(digest, (part.number - 1) * 16);
    bytesBefore += part.size;
  }
  return combineDigests(partDigests, parts.length);
}

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

describe("hashPart / combineDigests", () => {
  it("returns a 16-byte digest and reports cumulative bytes per chunk", async () => {
    const size = 2 * MB;
    const file = new Blob([new Uint8Array(size).map((_, i) => i % 251)]);
    const [part] = planParts(size);
    const chunkBytes: number[] = [];
    const digest = await hashPart(file, part, (b) => chunkBytes.push(b));
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest.length).toBe(16);
    expect(chunkBytes[chunkBytes.length - 1]).toBe(size);
  });

  it("matches computeDandiEtag when parts are hashed independently and out of order", async () => {
    const size = 64 * MB + 3 * MB;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 4096) bytes[i] = (i / 4096) % 256;
    const file = new Blob([bytes]);
    const parts = planParts(size);
    expect(parts.length).toBeGreaterThan(1);

    const partDigests = new Uint8Array(parts.length * 16);
    // Reversed order mimics parts finishing in any order across a worker pool.
    for (const part of [...parts].reverse()) {
      const digest = await hashPart(file, part, () => {});
      partDigests.set(digest, (part.number - 1) * 16);
    }
    const combined = combineDigests(partDigests, parts.length);
    const sequential = await computeDandiEtag(file, parts, () => {});
    expect(combined).toBe(sequential);
    expect(combined).toMatch(new RegExp(`^[0-9a-f]{32}-${parts.length}$`));
  });
});
