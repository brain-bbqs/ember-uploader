import SparkMD5 from "spark-md5";
import type { FilePart } from "./types";

const MB = 2 ** 20;
const GB = 2 ** 30;
const TB = 2 ** 40;
const MAX_PARTS = 10_000;
const MIN_PART_SIZE = 5 * MB;
const MAX_PART_SIZE = 5 * GB;
const DEFAULT_PART_SIZE = 64 * MB;
const HASH_CHUNK = 16 * MB;

/** Faithful port of dandischema.digests.dandietag.PartGenerator. */
export function planParts(fileSize: number): FilePart[] {
  if (fileSize <= 0) throw new Error("Empty files cannot be uploaded to DANDI.");
  if (fileSize > 5 * TB) throw new Error("File is larger than the S3 maximum object size (5 TB).");

  let partSize = DEFAULT_PART_SIZE;
  if (Math.ceil(fileSize / partSize) >= MAX_PARTS) {
    partSize = Math.ceil(fileSize / MAX_PARTS);
  }
  if (partSize < MIN_PART_SIZE || partSize > MAX_PART_SIZE) {
    throw new Error("Internal error: computed part size is outside S3 limits.");
  }

  let partQty = Math.floor(fileSize / partSize);
  let finalPartSize = fileSize - partQty * partSize;
  if (finalPartSize === 0) {
    finalPartSize = partSize;
  } else {
    partQty += 1;
  }
  if (partQty === 1) partSize = finalPartSize;

  const parts: FilePart[] = [];
  let offset = 0;
  for (let number = 1; number <= partQty; number++) {
    const size = number === partQty ? finalPartSize : partSize;
    parts.push({ number, offset, size });
    offset += size;
  }
  return parts;
}

export async function computeDandiEtag(
  file: Blob,
  parts: FilePart[],
  onProgress: (fraction: number) => void,
): Promise<string> {
  const partDigests = new Uint8Array(parts.length * 16);
  let bytesDone = 0;
  for (const part of parts) {
    const spark = new SparkMD5.ArrayBuffer();
    let read = 0;
    while (read < part.size) {
      const n = Math.min(HASH_CHUNK, part.size - read);
      const start = part.offset + read;
      const buf = await file.slice(start, start + n).arrayBuffer();
      if (buf.byteLength !== n) {
        throw new Error("File changed on disk while hashing — please re-add it.");
      }
      spark.append(buf);
      read += n;
      bytesDone += n;
      onProgress(bytesDone / file.size);
    }
    // end(true) yields the raw 16-byte digest as a binary string
    const raw = spark.end(true) as unknown as string;
    for (let i = 0; i < 16; i++) {
      partDigests[(part.number - 1) * 16 + i] = raw.charCodeAt(i) & 0xff;
    }
  }
  const finalSpark = new SparkMD5.ArrayBuffer();
  finalSpark.append(partDigests.buffer);
  return `${finalSpark.end()}-${parts.length}`;
}
