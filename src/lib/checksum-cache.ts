import type { FilePart } from "./types";

// Persistent per-part checksum cache backed by IndexedDB (localStorage is far too small for
// digest arrays and is synchronous). One record per file keyed by relativePath + name + size +
// lastModified — browsers expose no absolute path or creation time, so this heuristic identity
// is the best available; see the verification step in etag-worker.ts for how a stale hit on a
// changed-but-same-size file is caught before its cached etag is trusted.
//
// Stores only file names/relative paths and MD5 part digests — no credentials or tokens — so the
// SECURITY.md checklist's credential-storage concerns don't apply; kept as a hand-rolled wrapper
// so no runtime dependency is added.

const DB_NAME = "bbqs-uploader.checksum-cache";
const DB_VERSION = 1;
const STORE = "files";
const LAST_USED_INDEX = "lastUsed";
const DIGEST_BYTES = 16;
/** Digest records evicted least-recently-used past this total; hygiene, not a hard requirement
 * (10MB holds records for tens of thousands of files). */
const DEFAULT_MAX_BYTES = 10 * 2 ** 20;
/** Completed parts are buffered and written through every this-many parts (and on flush), so a
 * 10,000-part file doesn't issue 10,000 IndexedDB writes. */
const FLUSH_EVERY_PARTS = 64;

export interface FileIdentity {
  /** Folder path from the drop entry, empty for a loose file (see DroppedFile.relativePath). */
  relativePath: string;
  name: string;
  size: number;
  lastModified: number;
}

/** Cache key for a file. No absolute path or inode identity exists in the browser, so this is a
 * heuristic: two different files can collide if they share path-in-drop, name, size, and mtime. */
export function checksumCacheKey(id: FileIdentity): string {
  return `${id.relativePath}/${id.name}|${id.size}|${id.lastModified}`;
}

export interface CachedDigests {
  /** parts.length * 16 bytes in part order; only stretches with present[i] true are valid. */
  digests: Uint8Array;
  present: boolean[];
}

export interface ChecksumCache {
  /** Cached part digests for a file, or null on miss. A record whose stored part layout no
   * longer matches `parts` is discarded and reported as a miss. Touches lastUsed on hit. */
  get(key: string, parts: FilePart[]): Promise<CachedDigests | null>;
  /** Buffers a completed part's digest for write-through; auto-flushes every FLUSH_EVERY_PARTS
   * buffered parts. Copies the digest, so callers may reuse the array. */
  putPart(key: string, parts: FilePart[], partNumber: number, digest: Uint8Array): void;
  /** Writes any buffered parts for this file now (call when a hash settles, including on
   * cancel/error, so an interrupted hash resumes from its finished parts next time). */
  flush(key: string): Promise<void>;
  /** Drops the stored record and any buffered parts for this file (verification mismatch). */
  discard(key: string): Promise<void>;
  /** Drops every stored record and any buffered parts (user-triggered "clear scan cache"). */
  clear(): Promise<void>;
  close(): void;
}

interface CacheRecord {
  key: string;
  partCount: number;
  /** Size of part 1; together with partCount and the file size baked into the key this pins the
   * whole part layout, guarding against a future change to planParts. */
  firstPartSize: number;
  digests: ArrayBuffer;
  /** Presence bitmap, one bit per part (LSB-first within each byte). */
  present: Uint8Array;
  lastUsed: number;
  /** Approximate stored size, summed against the eviction budget. */
  bytes: number;
}

interface PendingParts {
  parts: FilePart[];
  digests: Map<number, Uint8Array>;
  sinceFlush: number;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function bitmapGet(bitmap: Uint8Array, i: number): boolean {
  return (bitmap[i >> 3] & (1 << (i & 7))) !== 0;
}

function bitmapSet(bitmap: Uint8Array, i: number): void {
  bitmap[i >> 3] |= 1 << (i & 7);
}

function recordBytes(record: CacheRecord): number {
  // Rough per-record footprint: payloads plus key text and fixed overhead.
  return record.digests.byteLength + record.present.byteLength + record.key.length * 2 + 64;
}

function layoutMatches(record: CacheRecord, parts: FilePart[]): boolean {
  return record.partCount === parts.length && record.firstPartSize === parts[0].size;
}

export interface ChecksumCacheOptions {
  dbName?: string;
  maxBytes?: number;
  /** Clock override for tests. */
  now?: () => number;
}

/** Opens the cache. Never throws: environments without a working IndexedDB (or any storage
 * error later on) degrade to cache misses and dropped writes — hashing itself is unaffected. */
export function openChecksumCache(options: ChecksumCacheOptions = {}): ChecksumCache {
  const dbName = options.dbName ?? DB_NAME;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = options.now ?? Date.now;

  let dbPromise: Promise<IDBDatabase> | null = null;
  let closed = false;
  // Total stored bytes, seeded by one scan on open and maintained incrementally after, so
  // eviction never needs to re-scan the store per write.
  let totalBytes = 0;
  const pending = new Map<string, PendingParts>();
  // All storage operations for one key are chained so read-modify-write flushes, discards, and
  // lastUsed touches can never interleave and lose an update.
  const keyChains = new Map<string, Promise<void>>();
  let evicting = false;

  function openDb(): Promise<IDBDatabase> {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      const request = indexedDB.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex(LAST_USED_INDEX, "lastUsed");
      };
      request.onsuccess = () => {
        const db = request.result;
        void seedTotalBytes(db);
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function seedTotalBytes(db: IDBDatabase): Promise<void> {
    try {
      const records = await requestToPromise(
        db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<CacheRecord[]>,
      );
      totalBytes += records.reduce((sum, r) => sum + r.bytes, 0);
      maybeEvict();
    } catch {
      /* budget seeding is best-effort */
    }
  }

  /** Chains fn behind every earlier operation on the same key; storage errors become no-ops. */
  function enqueue(key: string, fn: (db: IDBDatabase) => Promise<void>): Promise<void> {
    const chained = (keyChains.get(key) ?? Promise.resolve()).then(async () => {
      if (closed) return;
      try {
        await fn(await openDb());
      } catch {
        /* degrade to a cache miss / dropped write */
      }
    });
    keyChains.set(key, chained);
    return chained;
  }

  function maybeEvict(): void {
    if (evicting || totalBytes <= maxBytes) return;
    evicting = true;
    void (async () => {
      try {
        const db = await openDb();
        const tx = db.transaction(STORE, "readwrite");
        const byLastUsed = tx.objectStore(STORE).index(LAST_USED_INDEX);
        await new Promise<void>((resolve, reject) => {
          const cursorRequest = byLastUsed.openCursor();
          cursorRequest.onerror = () => reject(cursorRequest.error);
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor || totalBytes <= maxBytes) {
              resolve();
              return;
            }
            totalBytes -= (cursor.value as CacheRecord).bytes;
            cursor.delete();
            cursor.continue();
          };
        });
      } catch {
        /* eviction is best-effort */
      } finally {
        evicting = false;
      }
    })();
  }

  async function readRecord(db: IDBDatabase, key: string): Promise<CacheRecord | undefined> {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    return requestToPromise(store.get(key) as IDBRequest<CacheRecord | undefined>);
  }

  async function writeRecord(db: IDBDatabase, record: CacheRecord, previousBytes: number): Promise<void> {
    record.bytes = recordBytes(record);
    await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
    totalBytes += record.bytes - previousBytes;
    maybeEvict();
  }

  async function deleteRecord(db: IDBDatabase, key: string): Promise<void> {
    const existing = await readRecord(db, key);
    if (!existing) return;
    await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(key));
    totalBytes -= existing.bytes;
  }

  function flushKey(key: string): Promise<void> {
    return enqueue(key, async (db) => {
      const buffered = pending.get(key);
      if (!buffered || buffered.digests.size === 0) return;
      pending.delete(key);
      const { parts, digests } = buffered;
      let record = await readRecord(db, key);
      // The put below replaces whatever sat at this key, so its bytes leave the budget either way.
      const previousBytes = record?.bytes ?? 0;
      if (!record || !layoutMatches(record, parts)) {
        record = {
          key,
          partCount: parts.length,
          firstPartSize: parts[0].size,
          digests: new ArrayBuffer(parts.length * DIGEST_BYTES),
          present: new Uint8Array(Math.ceil(parts.length / 8)),
          lastUsed: 0,
          bytes: 0,
        };
      }
      const digestView = new Uint8Array(record.digests);
      for (const [partNumber, digest] of digests) {
        digestView.set(digest, (partNumber - 1) * DIGEST_BYTES);
        bitmapSet(record.present, partNumber - 1);
      }
      record.lastUsed = now();
      await writeRecord(db, record, previousBytes);
    });
  }

  return {
    async get(key, parts) {
      let result: CachedDigests | null = null;
      await enqueue(key, async (db) => {
        const record = await readRecord(db, key);
        if (!record) return;
        if (!layoutMatches(record, parts)) {
          await deleteRecord(db, key);
          return;
        }
        record.lastUsed = now();
        await writeRecord(db, record, record.bytes);
        const present: boolean[] = [];
        for (let i = 0; i < parts.length; i++) present.push(bitmapGet(record.present, i));
        result = { digests: new Uint8Array(record.digests.slice(0)), present };
      });
      return result;
    },

    putPart(key, parts, partNumber, digest) {
      let buffered = pending.get(key);
      if (!buffered || buffered.parts.length !== parts.length) {
        buffered = { parts, digests: new Map(), sinceFlush: 0 };
        pending.set(key, buffered);
      }
      buffered.digests.set(partNumber, digest.slice());
      if (++buffered.sinceFlush >= FLUSH_EVERY_PARTS) {
        buffered.sinceFlush = 0;
        void flushKey(key);
      }
    },

    flush(key) {
      return flushKey(key);
    },

    discard(key) {
      pending.delete(key);
      return enqueue(key, (db) => deleteRecord(db, key));
    },

    async clear() {
      pending.clear();
      try {
        const db = await openDb();
        await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
        totalBytes = 0;
      } catch {
        /* best-effort, same as the rest of this file's storage operations */
      }
    },

    close() {
      closed = true;
      pending.clear();
      void dbPromise?.then((db) => db.close()).catch(() => {});
    },
  };
}
