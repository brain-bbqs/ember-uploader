import type { UploaderElements } from "./elements";
import type { UploaderConfig } from "../lib/types";
import { apiFetch, diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";
import { configProblems } from "../lib/settings";

export async function testConnection(
  els: UploaderElements,
  getConfig: () => UploaderConfig,
  saveSettings: () => void,
): Promise<void> {
  saveSettings();
  const cfg = getConfig();
  const problems = configProblems(cfg);
  const barEl = els.connectStatusBar;
  const textEl = els.connectStatusText;
  barEl.hidden = false;
  if (problems.length) {
    textEl.textContent = problems.join(" ");
    barEl.title = problems.join(" ");
    barEl.className = "status-bar err";
    return;
  }
  textEl.textContent = "Testing connection…";
  barEl.title = "Testing connection…";
  barEl.className = "status-bar busy";
  try {
    let who = "";
    try {
      const me = await apiFetch<{ username?: string }>(cfg, "/users/me/");
      who = me?.username ? ` Signed in as ${me.username}.` : "";
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        throw new ApiError("API key was rejected (HTTP 401) — check that it is correct.", 401);
      }
      // Any other failure here is non-fatal; the dandiset check below still runs.
    }
    const ds = await apiFetch<{
      draft_version?: { name?: string };
      most_recent_published_version?: { name?: string };
    }>(cfg, `/dandisets/${cfg.dandisetId}/`);
    const name = ds?.draft_version?.name || ds?.most_recent_published_version?.name || "";
    const msg =
      `✓ Connected. Dandiset ${cfg.dandisetId}${name ? ` (“${name}”)` : ""} found.${who}` +
      " You can now drop .mp4 files below.";
    textEl.textContent = msg;
    barEl.title = msg;
    barEl.className = "status-bar ok";
  } catch (e) {
    let msg = friendlyError(e);
    if (e instanceof ApiError && e.status === 0) {
      try {
        msg += ` ${await diagnoseCors(cfg)}`;
      } catch {
        /* diagnosis is best-effort */
      }
    }
    textEl.textContent = `✗ ${msg}`;
    barEl.title = msg;
    barEl.className = "status-bar err";
  }
}
