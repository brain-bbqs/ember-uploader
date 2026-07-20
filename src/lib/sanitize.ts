export function sanitizeSegment(segment: string, fallback: string): string {
  let s = segment.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
  s = s.replace(/_{2,}/g, "_").replace(/^[._\s-]+|[._\s-]+$/g, "");
  return s || fallback;
}

export function sanitizeFilename(originalName: string): string {
  const base = originalName.replace(/\.[^.]*$/, "");
  return `${sanitizeSegment(base, "video")}.mp4`;
}

export function sanitizePath(prefix: string, filename: string): string {
  const segments = prefix
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => sanitizeSegment(s, "_"));
  return [...segments, filename].join("/");
}
