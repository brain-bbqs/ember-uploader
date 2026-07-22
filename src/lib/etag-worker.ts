import { combineDigests } from "./etag";
import type { ChecksumCache } from "./checksum-cache";
import type { FilePart } from "./types";

export type HashWorkerRequest =
  { type: "hash-part"; requestId: number; file: File; part: FilePart } | { type: "cancel"; requestId: number };

export type HashWorkerResponse =
  | { type: "progress"; requestId: number; bytesDone: number }
  | { type: "done"; requestId: number; digest: Uint8Array }
  | { type: "error"; requestId: number; message: string }
  | { type: "cancelled"; requestId: number };

export interface HashPool {
  hash(
    file: File,
    parts: FilePart[],
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
    cacheKey?: string,
  ): Promise<string>;
}

/** A file being hashed: its claimed/finished part bookkeeping plus the promise's settle hooks. */
interface HashJobState {
  file: File;
  parts: FilePart[];
  /** Parts still needing a worker — all of `parts` on a cache miss, only the misses on a partial
   * hit, or the single verification part on a full hit. */
  queue: FilePart[];
  nextQueued: number;
  partDigests: Uint8Array;
  partsDone: number;
  bytesDone: number;
  cacheKey?: string;
  /** Set when every part came from the cache: the one part being re-hashed to confirm the record
   * still matches the file's content, and the cached digest it must reproduce. */
  verify?: { part: FilePart; expected: Uint8Array };
  onProgress: (fraction: number) => void;
  settled: boolean;
  resolve: (etag: string) => void;
  reject: (err: unknown) => void;
  removeAbortListener: () => void;
}

interface InFlightPart {
  job: HashJobState;
  part: FilePart;
  worker: Worker;
  /** Bytes already credited to the job from this part's progress messages. */
  lastBytes: number;
}

function spawn(onResponse: (worker: Worker, msg: HashWorkerResponse) => void): Worker {
  const worker = new Worker(new URL("../workers/etag.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e: MessageEvent<HashWorkerResponse>) => onResponse(worker, e.data));
  return worker;
}

function digestsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A fixed-size pool of stateless part-hashing workers shared by every file being hashed. Parts
 * are independent (the etag is md5-of-part-md5s), so a single large file's parts fan out across
 * the whole pool instead of serializing on one worker. The queue is drained round-robin across
 * active files, so a newly added file gets its first part serviced as soon as any worker frees
 * up rather than waiting behind another file's remaining parts. Worker count is bounded by the
 * pool size in all cases; workers are spawned lazily and reused indefinitely.
 *
 * With a cache, each job first loads any part digests persisted for the same
 * path+name+size+mtime and only queues the misses, and completed digests are written back
 * through so an interrupted hash resumes where it left off. That identity is a heuristic (the
 * browser exposes nothing stronger), and a wrong cached etag would not always fail loudly —
 * uploadBlob's 409 dedup path silently attaches the existing blob when the etag is already known
 * server-side — so a fully cached file is never trusted blindly: one part is re-hashed and
 * compared first, and on mismatch the record is discarded and the whole file hashed normally.
 */
export function createHashPool(size: number, cache?: ChecksumCache): HashPool {
  const workers: Worker[] = [];
  const idle: Worker[] = [];
  const inFlight = new Map<number, InFlightPart>();
  // Unsettled jobs, in insertion order; claimNext cycles over this list starting at rrIndex.
  const jobs: HashJobState[] = [];
  let rrIndex = 0;
  let nextRequestId = 0;

  function claimNext(): { job: HashJobState; part: FilePart } | null {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[(rrIndex + i) % jobs.length];
      if (job.nextQueued < job.queue.length) {
        rrIndex = ((rrIndex + i) % jobs.length) + 1;
        return { job, part: job.queue[job.nextQueued++] };
      }
    }
    return null;
  }

  function takeWorker(): Worker | null {
    const existing = idle.pop();
    if (existing) return existing;
    if (workers.length < size) {
      const worker = spawn(onResponse);
      workers.push(worker);
      return worker;
    }
    return null;
  }

  /** Hands queued parts to idle (or newly spawned) workers until one of the two runs out. */
  function pump(): void {
    for (;;) {
      if (!jobs.some((job) => job.nextQueued < job.queue.length)) return;
      const worker = takeWorker();
      if (!worker) return;
      const { job, part } = claimNext()!;
      const requestId = nextRequestId++;
      inFlight.set(requestId, { job, part, worker, lastBytes: 0 });
      worker.postMessage({ type: "hash-part", requestId, file: job.file, part } satisfies HashWorkerRequest);
    }
  }

  function settle(job: HashJobState, error: unknown | null): void {
    job.settled = true;
    // Drop the job's unclaimed parts and its round-robin slot.
    job.nextQueued = job.queue.length;
    const index = jobs.indexOf(job);
    if (index !== -1) jobs.splice(index, 1);
    job.removeAbortListener();
    // Persist finished parts even on cancel/error, so the next attempt resumes from them.
    if (cache && job.cacheKey) void cache.flush(job.cacheKey);
    if (error === null) job.resolve(combineDigests(job.partDigests, job.parts.length));
    else job.reject(error);
    // Interrupt the job's other in-flight parts so their workers free up promptly; each worker
    // acks with "cancelled" (or a harmless late "done") and rejoins the idle set via onResponse.
    for (const [requestId, entry] of inFlight) {
      if (entry.job === job) {
        entry.worker.postMessage({ type: "cancel", requestId } satisfies HashWorkerRequest);
      }
    }
  }

  /** Applies a cached lookup to a just-created job and enqueues it: cached parts count as
   * already done, and a fully cached file queues one verification part instead of zero. */
  function startJob(job: HashJobState, cached: { digests: Uint8Array; present: boolean[] } | null): void {
    if (job.settled) return; // aborted while the cache lookup was in flight
    if (cached) {
      const missing: FilePart[] = [];
      for (let i = 0; i < job.parts.length; i++) {
        if (cached.present[i]) {
          job.partDigests.set(cached.digests.subarray(i * 16, (i + 1) * 16), i * 16);
          job.partsDone++;
          job.bytesDone += job.parts[i].size;
        } else {
          missing.push(job.parts[i]);
        }
      }
      if (missing.length === 0) {
        // Full hit: pull one part back out and re-hash it as the verification probe.
        const v = Math.floor(Math.random() * job.parts.length);
        const part = job.parts[v];
        job.verify = { part, expected: job.partDigests.slice(v * 16, (v + 1) * 16) };
        job.partsDone--;
        job.bytesDone -= part.size;
        job.queue = [part];
      } else {
        job.queue = missing;
      }
      if (job.bytesDone > 0) job.onProgress(job.bytesDone / job.file.size);
    }
    jobs.push(job);
    pump();
  }

  function onResponse(worker: Worker, msg: HashWorkerResponse): void {
    const entry = inFlight.get(msg.requestId);
    if (!entry) return;
    const { job, part } = entry;
    if (msg.type === "progress") {
      if (job.settled) return;
      job.bytesDone += msg.bytesDone - entry.lastBytes;
      entry.lastBytes = msg.bytesDone;
      job.onProgress(job.bytesDone / job.file.size);
      return;
    }
    inFlight.delete(msg.requestId);
    if (!job.settled) {
      if (
        msg.type === "done" &&
        job.verify &&
        part === job.verify.part &&
        !digestsEqual(msg.digest, job.verify.expected)
      ) {
        // Stale cache hit (same path+name+size+mtime, different content). Drop the record and
        // hash the whole file from scratch, keeping the one freshly hashed part.
        job.verify = undefined;
        if (cache && job.cacheKey) {
          void cache.discard(job.cacheKey);
          cache.putPart(job.cacheKey, job.parts, part.number, msg.digest);
        }
        job.partDigests.fill(0);
        job.partDigests.set(msg.digest, (part.number - 1) * 16);
        job.partsDone = 1;
        job.bytesDone = part.size;
        job.queue = job.parts.filter((p) => p !== part);
        job.nextQueued = 0;
        job.onProgress(job.bytesDone / job.file.size);
        if (job.partsDone === job.parts.length) settle(job, null); // single-part file: fresh digest is complete
      } else if (msg.type === "done") {
        job.verify = undefined;
        job.partDigests.set(msg.digest, (part.number - 1) * 16);
        if (cache && job.cacheKey) cache.putPart(job.cacheKey, job.parts, part.number, msg.digest);
        job.bytesDone += part.size - entry.lastBytes;
        job.onProgress(job.bytesDone / job.file.size);
        job.partsDone++;
        if (job.partsDone === job.parts.length) settle(job, null);
      } else if (msg.type === "error") {
        settle(job, new Error(msg.message));
      }
      // "cancelled" for an unsettled job cannot happen (cancels are only sent on settle).
    }
    idle.push(worker);
    pump();
  }

  return {
    hash(file, parts, onProgress, signal, cacheKey) {
      return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Upload cancelled.", "AbortError"));
          return;
        }
        const job: HashJobState = {
          file,
          parts,
          queue: parts,
          nextQueued: 0,
          partDigests: new Uint8Array(parts.length * 16),
          partsDone: 0,
          bytesDone: 0,
          cacheKey: cache ? cacheKey : undefined,
          onProgress,
          settled: false,
          resolve,
          reject,
          removeAbortListener: () => {},
        };
        if (signal) {
          const onAbort = () => settle(job, new DOMException("Upload cancelled.", "AbortError"));
          job.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
          signal.addEventListener("abort", onAbort, { once: true });
        }
        if (cache && cacheKey) {
          cache.get(cacheKey, parts).then(
            (cached) => startJob(job, cached),
            () => startJob(job, null),
          );
        } else {
          startJob(job, null);
        }
      });
    },
  };
}
