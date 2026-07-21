import { describe, expect, it } from "vitest";
import { sanitizeFilename, sanitizePath, sanitizeSegment } from "../../src/lib/sanitize";

describe("sanitizeSegment", () => {
  it("strips accents and replaces unsafe characters", () => {
    expect(sanitizeSegment("café résumé!", "fallback")).toBe("cafe_resume");
  });

  it("collapses repeated underscores and trims edges", () => {
    expect(sanitizeSegment("  __weird--name__  ", "fallback")).toBe("weird--name");
  });

  it("falls back when nothing survives sanitization", () => {
    expect(sanitizeSegment("!!!", "fallback")).toBe("fallback");
  });
});

describe("sanitizeFilename", () => {
  it("sanitizes the base name and preserves the original extension", () => {
    expect(sanitizeFilename("My Video.mov")).toBe("My_Video.mov");
  });

  it("lowercases the extension", () => {
    expect(sanitizeFilename("Clip.MP4")).toBe("Clip.mp4");
  });

  it("handles filenames with no extension", () => {
    expect(sanitizeFilename("README")).toBe("README");
  });

  it("falls back when nothing survives sanitization", () => {
    expect(sanitizeFilename("!!!.mov")).toBe("file.mov");
  });

  it("treats a leading dot as a dotfile, not an extension", () => {
    expect(sanitizeFilename(".gitignore")).toBe("gitignore");
  });
});

describe("sanitizePath", () => {
  it("joins sanitized prefix segments with the filename", () => {
    expect(sanitizePath("session 1/../sub01", "clip.mp4")).toBe("session_1/sub01/clip.mp4");
  });

  it("drops empty, '.' and '..' segments", () => {
    expect(sanitizePath("//./..//videos//", "clip.mp4")).toBe("videos/clip.mp4");
  });

  it("returns just the filename for an empty prefix", () => {
    expect(sanitizePath("", "clip.mp4")).toBe("clip.mp4");
  });
});
