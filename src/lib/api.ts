import type { UploaderConfig } from "./types";
import { ApiError } from "./errors";

export interface ApiFetchOptions {
  method?: string;
  json?: unknown;
  expectJson?: boolean;
}

export async function apiFetch<T = unknown>(
  cfg: UploaderConfig,
  path: string,
  { method = "GET", json, expectJson = true }: ApiFetchOptions = {},
): Promise<T | null> {
  const headers: Record<string, string> = { Authorization: `token ${cfg.apiKey}` };
  let body: string | undefined;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  let resp: Response;
  try {
    resp = await fetch(`${cfg.api}${path}`, { method, headers, body });
  } catch (e) {
    throw new ApiError(
      `Network error calling ${path}. Check your connection (or the server's CORS policy): ${
        e instanceof Error ? e.message : String(e)
      }`,
      0,
    );
  }
  if (!resp.ok) {
    let detail = "";
    try {
      detail = await resp.text();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      `${method} ${path} failed with HTTP ${resp.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`,
      resp.status,
      detail,
    );
  }
  if (!expectJson || resp.status === 204) return null;
  return (await resp.json()) as T;
}

// When a request dies with a network/CORS error, probe the API two ways to
// pinpoint which layer of the server's CORS setup is broken. (Browsers don't
// let a page inspect another origin's CORS headers directly, so this
// differential probe is the best client-side diagnosis available.)
export async function diagnoseCors(cfg: UploaderConfig): Promise<string> {
  const probe = async (headers: Record<string, string>) => {
    try {
      const r = await fetch(`${cfg.api}/info/`, { headers });
      return r.status > 0; // readable response of any status = CORS passed
    } catch {
      return false;
    }
  };
  const simple = await probe({}); // no preflight needed
  const preflighted = await probe({ Authorization: `token ${cfg.apiKey}` });
  const origin = window.location.origin;
  if (!simple && !preflighted) {
    return (
      `CORS diagnosis: the API refuses ALL cross-origin requests from ${origin}. ` +
      "The instance operators must add this origin to the server's CORS allowlist " +
      "(DJANGO_CORS_ALLOWED_ORIGINS / DJANGO_CORS_ALLOWED_ORIGIN_REGEXES)."
    );
  }
  if (!preflighted) {
    return (
      `CORS diagnosis: simple requests from ${origin} pass, but preflighted (OPTIONS) ` +
      "requests are rejected. The API's CORS layer is not answering preflights for this origin."
    );
  }
  // GETs pass — check whether POSTs fail across the board or only the upload
  // endpoint, using a harmless read-only POST (/blobs/digest/ lookup).
  let postPasses = false;
  try {
    const r = await fetch(`${cfg.api}/blobs/digest/`, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        algorithm: "dandi:dandi-etag",
        value: `${"0".repeat(32)}-1`,
      }),
    });
    postPasses = r.status > 0;
  } catch {
    postPasses = false;
  }
  if (postPasses) {
    return (
      `CORS diagnosis: GET requests AND other POST requests from ${origin} pass CORS, ` +
      "but the upload-initialize response came back without an Access-Control-Allow-Origin " +
      "header. A proxy/WAF rule specific to the /uploads/ path on the API server is the " +
      "likely culprit. This can only be fixed by the instance operators."
    );
  }
  return (
    `CORS diagnosis: reads work but writes are blocked. dandi-archive servers allow ` +
    "GET/HEAD/OPTIONS from ANY origin (the cors_allow_anyone_read_only hook) but only " +
    `add CORS headers to write responses for allowlisted origins, and ${origin} is not ` +
    "in this server's DJANGO_CORS_ALLOWED_ORIGINS. Ask the instance operators to add " +
    "this origin to that allowlist (for DANDI itself: the allowed_external_services " +
    "list in dandi-infrastructure's terraform/main.tf)."
  );
}
