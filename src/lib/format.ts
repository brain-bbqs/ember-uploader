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

/**
 * Compact plain-words "time left" estimate for the progress chips: "a few sec", "~40 sec",
 * "~3 min", "~1 hr 5 min". Rounds more coarsely as the estimate grows, so the readout stays
 * calm instead of twitching on every tick. Returns "—" when no estimate is possible.
 */
export function friendlyEta(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  if (totalSeconds < 10) return "a few sec";
  const roundedSec = Math.round(totalSeconds / 5) * 5;
  if (roundedSec < 60) return `~${roundedSec} sec`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `~${hours} hr ${remMinutes} min` : `~${hours} hr`;
}
