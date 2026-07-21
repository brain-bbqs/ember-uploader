import { computeDandiEtag } from "../lib/etag";
import type { FilePart } from "../lib/types";

interface HashRequest {
  file: File;
  parts: FilePart[];
}

type WorkerResponse =
  | { type: "progress"; fraction: number }
  | { type: "done"; etag: string }
  | { type: "error"; message: string };

// Cast rather than reference the "webworker" lib, which conflicts with the app's "DOM" lib
// in a single tsconfig (both declare an incompatible global `self`).
const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((e: MessageEvent<HashRequest>) => void) | null;
};

ctx.onmessage = async (e) => {
  const { file, parts } = e.data;
  try {
    const etag = await computeDandiEtag(file, parts, (fraction) => {
      ctx.postMessage({ type: "progress", fraction });
    });
    ctx.postMessage({ type: "done", etag });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
