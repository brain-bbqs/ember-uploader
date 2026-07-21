export function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Two-letter avatar initials from a display name, matching the main archive's own convention
 * (first char of the first word + first char of the last word, e.g. "Cody Baker" -> "CB").
 * Falls back to "??" for an empty or single-word name, same as the archive.
 */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "??";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Formats seconds as tqdm-style `mm:ss` (or `h:mm:ss` past an hour). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
