import type { UploaderElements } from "./elements";
import type { UploaderConfig } from "../lib/types";
import { apiFetch } from "../lib/api";
import { initialsFrom } from "../lib/format";

/**
 * Renders the header's "who's signed in" avatar/username as soon as there's an access token,
 * independent of whether a dandiset has been selected yet.
 */
export async function renderIdentity(els: UploaderElements, cfg: UploaderConfig): Promise<void> {
  if (!cfg.accessToken) return;
  try {
    const me = await apiFetch<{ username?: string; name?: string }>(cfg, "/users/me/");
    if (me?.username) {
      els.oauthUsername.textContent = me.username;
      els.oauthAvatar.textContent = initialsFrom(me.name ?? "");
    }
  } catch {
    /* leave the header as-is; the next connection check retries */
  }
}
