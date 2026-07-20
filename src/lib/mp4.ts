import type { VideoProbeResult } from "./types";

const KNOWN_TOP_BOXES = new Set([
  "ftyp",
  "styp",
  "moov",
  "mdat",
  "free",
  "skip",
  "wide",
  "pdin",
  "prfl",
  "moof",
  "mfra",
  "meta",
  "sidx",
  "ssix",
  "uuid",
]);

export async function checkMp4Structure(file: Blob): Promise<string> {
  if (file.size < 16) throw new Error("File is too small to be a valid MP4.");
  const head = new DataView(await file.slice(0, 16).arrayBuffer());
  const boxSize = head.getUint32(0);
  const boxType = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
  if (!KNOWN_TOP_BOXES.has(boxType)) {
    throw new Error(
      `File does not look like an MP4 (first box type is "${boxType.replace(
        /[^\x20-\x7e]/g,
        "?",
      )}", expected "ftyp" or similar).`,
    );
  }
  if (boxType === "ftyp" && (boxSize < 16 || boxSize > 1024)) {
    throw new Error("File has a malformed MP4 header (implausible ftyp box size).");
  }
  return boxType;
}

export function probeVideoDecodable(
  videoEl: HTMLVideoElement,
  file: Blob,
  timeoutMs = 15000,
): Promise<VideoProbeResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: VideoProbeResult) => {
      if (settled) return;
      settled = true;
      videoEl.removeAttribute("src");
      videoEl.load();
      URL.revokeObjectURL(url);
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timed out while reading video metadata" }), timeoutMs);
    videoEl.onloadedmetadata = () =>
      finish({
        ok: true,
        duration: videoEl.duration,
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
      });
    videoEl.onerror = () =>
      finish({
        ok: false,
        reason: videoEl.error?.message || "browser could not decode the file",
      });
    videoEl.src = url;
  });
}
