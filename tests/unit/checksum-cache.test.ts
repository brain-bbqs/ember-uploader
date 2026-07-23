import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checksumCacheKey, openChecksumCache, type ChecksumCacheOptions } from "../../src/lib/checksum-cache";
import { planParts } from "../../src/lib/etag";
import type { FilePart } from "../../src/lib/types";

const MB = 2 ** 20;

function digest(seed: number): Uint8Array {
  return new Uint8Array(16).map((_, i) => (seed * 31 + i) % 256);
}

function open(options: ChecksumCacheOptions = {}) {
  return openChecksumCache({ dbName: "test-cache", ...options });
}

/** Reads the record keys straight out of IndexedDB, bypassing the cache (and its lastUsed touch). */
function listStoredKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open("test-cache", 1);
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const keysRequest = db.transaction("files").objectStore("files").getAllKeys();
      keysRequest.onerror = () => reject(keysRequest.error);
      keysRequest.onsuccess = () => {
        db.close();
        resolve(keysRequest.result as string[]);
      };
    };
  });
}

beforeEach(() => {
  // A fresh IDBFactory per test isolates each test's database contents.
  globalThis.indexedDB = new IDBFactory();
});

describe("checksumCacheKey", () => {
  it("includes path, name, size, and mtime so any difference misses", () => {
    const base = { relativePath: "sub/dir", name: "a.bin", size: 10, lastModified: 1000 };
    const key = checksumCacheKey(base);
    expect(key).toBe("sub/dir/a.bin|10|1000");
    expect(checksumCacheKey({ ...base, relativePath: "" })).not.toBe(key);
    expect(checksumCacheKey({ ...base, name: "b.bin" })).not.toBe(key);
    expect(checksumCacheKey({ ...base, size: 11 })).not.toBe(key);
    expect(checksumCacheKey({ ...base, lastModified: 1001 })).not.toBe(key);
  });
});

describe("openChecksumCache", () => {
  it("round-trips part digests through flush", async () => {
    const parts = planParts(64 * MB + 10);
    expect(parts).toHaveLength(2);
    const cache = open();
    cache.putPart("k", parts, 1, digest(1));
    cache.putPart("k", parts, 2, digest(2));
    await cache.flush("k");

    const hit = await cache.get("k", parts);
    expect(hit).not.toBeNull();
    expect(hit!.present).toEqual([true, true]);
    expect(hit!.digests.subarray(0, 16)).toEqual(digest(1));
    expect(hit!.digests.subarray(16, 32)).toEqual(digest(2));
  });

  it("persists across cache instances (simulating a page reload)", async () => {
    const parts = planParts(64 * MB + 10);
    const first = open();
    first.putPart("k", parts, 2, digest(2));
    await first.flush("k");
    first.close();

    const second = open();
    const hit = await second.get("k", parts);
    expect(hit).not.toBeNull();
    expect(hit!.present).toEqual([false, true]);
    expect(hit!.digests.subarray(16, 32)).toEqual(digest(2));
  });

  it("keeps a partial record partial: unwritten parts stay absent", async () => {
    const parts = planParts(200 * MB);
    const cache = open();
    cache.putPart("k", parts, 3, digest(3));
    await cache.flush("k");
    const hit = await cache.get("k", parts);
    expect(hit!.present.filter(Boolean)).toHaveLength(1);
    expect(hit!.present[2]).toBe(true);
  });

  it("merges later parts into an existing record instead of replacing it", async () => {
    const parts = planParts(200 * MB);
    const cache = open();
    cache.putPart("k", parts, 1, digest(1));
    await cache.flush("k");
    cache.putPart("k", parts, 2, digest(2));
    await cache.flush("k");
    const hit = await cache.get("k", parts);
    expect(hit!.present[0]).toBe(true);
    expect(hit!.present[1]).toBe(true);
    expect(hit!.digests.subarray(0, 16)).toEqual(digest(1));
    expect(hit!.digests.subarray(16, 32)).toEqual(digest(2));
  });

  it("misses on an unknown key", async () => {
    const cache = open();
    expect(await cache.get("nope", planParts(MB))).toBeNull();
  });

  it("does not surface buffered parts before any flush", async () => {
    const parts = planParts(64 * MB + 10);
    const cache = open();
    cache.putPart("k", parts, 1, digest(1));
    const other = open();
    expect(await other.get("k", parts)).toBeNull();
  });

  it("drops a record whose stored part layout no longer matches", async () => {
    const partsNow = planParts(64 * MB + 10);
    // Same key, different plan: as if a future version changed part sizing.
    const partsStored: FilePart[] = [{ number: 1, offset: 0, size: 64 * MB + 10 }];
    const cache = open();
    cache.putPart("k", partsStored, 1, digest(1));
    await cache.flush("k");

    expect(await cache.get("k", partsNow)).toBeNull();
    // The mismatching record was discarded outright, not just hidden.
    expect(await cache.get("k", partsStored)).toBeNull();
  });

  it("discard removes the stored record and buffered parts", async () => {
    const parts = planParts(64 * MB + 10);
    const cache = open();
    cache.putPart("k", parts, 1, digest(1));
    await cache.flush("k");
    cache.putPart("k", parts, 2, digest(2));
    await cache.discard("k");
    await cache.flush("k");
    expect(await cache.get("k", parts)).toBeNull();
  });

  it("clear removes every stored record and buffered parts", async () => {
    const parts = planParts(64 * MB + 10);
    const cache = open();
    cache.putPart("a", parts, 1, digest(1));
    await cache.flush("a");
    cache.putPart("b", parts, 1, digest(2));
    await cache.clear();
    await cache.flush("b");

    expect(await cache.get("a", parts)).toBeNull();
    expect(await cache.get("b", parts)).toBeNull();
    expect(await listStoredKeys()).toEqual([]);
  });

  it("clear degrades to a no-op when IndexedDB is unavailable", async () => {
    // @ts-expect-error simulating an environment without IndexedDB
    delete globalThis.indexedDB;
    const cache = open();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it("auto-flushes after enough buffered parts without an explicit flush", async () => {
    const parts = planParts(5 * 2 ** 30); // 5GB: 80 parts, past the 64-part flush threshold
    expect(parts.length).toBeGreaterThan(64);
    const cache = open();
    for (const part of parts) cache.putPart("k", parts, part.number, digest(part.number));

    const other = open();
    await vi.waitFor(async () => {
      const hit = await other.get("k", parts);
      expect(hit).not.toBeNull();
      expect(hit!.present.filter(Boolean).length).toBeGreaterThanOrEqual(64);
    });
  });

  it("evicts least-recently-used records once over the byte budget, sparing touched ones", async () => {
    const parts = planParts(64 * MB + 10);
    let clock = 1000;
    // Each of these records is ~99 accounted bytes; a 250-byte budget fits two of them.
    const cache = open({ maxBytes: 250, now: () => clock++ });

    cache.putPart("a", parts, 1, digest(1));
    await cache.flush("a");
    cache.putPart("b", parts, 1, digest(2));
    await cache.flush("b");
    expect(await cache.get("a", parts)).not.toBeNull(); // touch "a" so "b" is now the LRU
    cache.putPart("c", parts, 1, digest(3));
    await cache.flush("c");

    // Observe eviction through a raw connection: polling via cache.get would itself touch
    // lastUsed and could reshuffle the LRU order mid-eviction.
    await vi.waitFor(async () => {
      expect((await listStoredKeys()).sort()).toEqual(["a", "c"]);
    });
    expect(await cache.get("a", parts)).not.toBeNull();
    expect(await cache.get("c", parts)).not.toBeNull();
  });

  it("degrades to misses and dropped writes when IndexedDB is unavailable", async () => {
    // @ts-expect-error simulating an environment without IndexedDB
    delete globalThis.indexedDB;
    const cache = open();
    const parts = planParts(MB);
    cache.putPart("k", parts, 1, digest(1));
    await expect(cache.flush("k")).resolves.toBeUndefined();
    await expect(cache.get("k", parts)).resolves.toBeNull();
    await expect(cache.discard("k")).resolves.toBeUndefined();
  });
});
