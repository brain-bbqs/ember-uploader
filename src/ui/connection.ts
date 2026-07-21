import type { UploaderElements } from "./elements";
import type { UploaderConfig } from "../lib/types";
import { apiFetch, diagnoseCors } from "../lib/api";
import { ApiError, friendlyError } from "../lib/errors";
import { configProblems } from "../lib/settings";
import { initialsFrom } from "../lib/format";

/**
 * Renders the header's "who's signed in" avatar/username as soon as there's an access token,
 * independent of whether a dandiset has been selected yet — that gate is for the dandiset check
 * below, not for showing that sign-in itself succeeded.
 */
export async function renderIdentity(
  els: UploaderElements,
  cfg: UploaderConfig,
): Promise<{ username?: string; name?: string } | null> {
  if (!cfg.accessToken) return null;
  try {
    const me = await apiFetch<{ username?: string; name?: string }>(cfg, "/users/me/");
    if (me?.username) {
      els.oauthUsername.textContent = me.username;
      els.oauthAvatar.textContent = initialsFrom(me.name ?? "");
    }
    return me;
  } catch {
    return null; // surfaced again (and handled) by testConnection's own /users/me/ call
  }
}

export async function testConnection(
  els: UploaderElements,
  getConfig: () => UploaderConfig,
  saveSettings: () => void,
): Promise<void> {
  saveSettings();
  const cfg = getConfig();
  void renderIdentity(els, cfg);
  const problems = configProblems(cfg);
  const dotEl = els.connectStatusDot;
  const textEl = els.connectStatusText;
  dotEl.hidden = false;
  const setMessage = (text: string, visible: boolean) => {
    textEl.textContent = text;
    dotEl.title = text;
    textEl.classList.toggle("sr-only", !visible);
  };
  if (problems.length) {
    setMessage(problems.join(" "), true);
    dotEl.className = "status-dot err";
    return;
  }
  setMessage("Testing connection…", false);
  dotEl.className = "status-dot busy";
  try {
    let who = "";
    try {
      const me = await apiFetch<{ username?: string; name?: string }>(cfg, "/users/me/");
      if (me?.username) who = ` Signed in as ${me.username}.`;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        throw new ApiError("Sign-in was rejected (HTTP 401): please sign in again.", 401);
      }
      // Any other failure here is non-fatal; the dandiset check below still runs.
    }
    const ds = await apiFetch<{
      draft_version?: { name?: string };
      most_recent_published_version?: { name?: string };
    }>(cfg, `/dandisets/${cfg.dandisetId}/`);
    const name = ds?.draft_version?.name || ds?.most_recent_published_version?.name || "";
    const msg = `Connected. Dandiset ${cfg.dandisetId}${name ? ` (“${name}”)` : ""} found.${who}`;
    setMessage(msg, false);
    dotEl.className = "status-dot ok";
  } catch (e) {
    let msg = friendlyError(e);
    if (e instanceof ApiError && e.status === 0) {
      try {
        msg += ` ${await diagnoseCors(cfg)}`;
      } catch {
        /* diagnosis is best-effort */
      }
    }
    setMessage(msg, true);
    dotEl.className = "status-dot err";
  }
}
