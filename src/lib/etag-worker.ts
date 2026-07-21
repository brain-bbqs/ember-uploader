import type { FilePart } from "./types";

type WorkerResponse =
  | { type: "progress"; fraction: number }
  | { type: "done"; etag: string }
  | { type: "error"; message: string };

export interface EtagWorkerHandle {
  hash(file: File, parts: FilePart[], onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string>;
  terminate(): void;
}

function spawn(): Worker {
  return new Worker(new URL("../workers/etag.worker.ts", import.meta.url), { type: "module" });
}

/** Wraps a single dedicated worker that hashes one file at a time (callers pool these per CPU core). */
export function createEtagWorker(): EtagWorkerHandle {
  let worker = spawn();

  return {
    hash(file, parts, onProgress, signal) {
      return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Upload cancelled.", "AbortError"));
          return;
        }

        const onMessage = (e: MessageEvent<WorkerResponse>) => {
          const msg = e.data;
          if (msg.type === "progress") {
            onProgress(msg.fraction);
          } else if (msg.type === "done") {
            cleanup();
            resolve(msg.etag);
          } else {
            cleanup();
            reject(new Error(msg.message));
          }
        };
        const onAbort = () => {
          cleanup();
          // The worker can't be interrupted mid-hash, so replace it outright.
          worker.terminate();
          worker = spawn();
          reject(new DOMException("Upload cancelled.", "AbortError"));
        };
        function cleanup() {
          worker.removeEventListener("message", onMessage);
          signal?.removeEventListener("abort", onAbort);
        }

        worker.addEventListener("message", onMessage);
        signal?.addEventListener("abort", onAbort, { once: true });
        worker.postMessage({ file, parts });
      });
    },
    terminate() {
      worker.terminate();
    },
  };
}
