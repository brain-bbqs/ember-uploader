import { describe, expect, it } from "vitest";
import { checkMp4Structure } from "../../src/lib/mp4";

function box(type: string, boxSizeField = 32, blobSize = 32): Blob {
  const buf = new ArrayBuffer(blobSize);
  const view = new DataView(buf);
  view.setUint32(0, boxSizeField);
  for (let i = 0; i < 4; i++) view.setUint8(4 + i, type.charCodeAt(i));
  return new Blob([buf]);
}

describe("checkMp4Structure", () => {
  it("rejects files smaller than 16 bytes", async () => {
    await expect(checkMp4Structure(new Blob([new Uint8Array(8)]))).rejects.toThrow(/too small/i);
  });

  it("accepts a well-formed ftyp box", async () => {
    await expect(checkMp4Structure(box("ftyp"))).resolves.toBe("ftyp");
  });

  it("rejects an implausible ftyp box size", async () => {
    await expect(checkMp4Structure(box("ftyp", 4, 32))).rejects.toThrow(/malformed MP4 header/i);
  });

  it("rejects unknown top-level box types", async () => {
    await expect(checkMp4Structure(box("xxxx"))).rejects.toThrow(/does not look like an MP4/i);
  });

  it("accepts other known top-level boxes like moov", async () => {
    await expect(checkMp4Structure(box("moov"))).resolves.toBe("moov");
  });
});
