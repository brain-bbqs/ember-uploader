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

/**
 * MD5 of one part of a file, streamed in 16MB chunks. Parts are independent of each other, so
 * callers may hash any subset of a file's parts concurrently (see createHashPool) and stitch the
 * results together with combineDigests.
 */
export async function hashPart(
  file: Blob,
  part: FilePart,
  onChunk: (bytesDoneInPart: number) => void,
): Promise<Uint8Array> {
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
    onChunk(read);
  }
  // end(true) yields the raw 16-byte digest as a binary string
  const raw = spark.end(true) as unknown as string;
  const digest = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    digest[i] = raw.charCodeAt(i) & 0xff;
  }
  return digest;
}

/** Folds the concatenated per-part digests (16 bytes per part, in part order) into the final etag. */
export function combineDigests(partDigests: Uint8Array, partCount: number): string {
  const finalSpark = new SparkMD5.ArrayBuffer();
  finalSpark.append(partDigests.buffer as ArrayBuffer);
  return `${finalSpark.end()}-${partCount}`;
}
