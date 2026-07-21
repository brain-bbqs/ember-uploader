// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { startLogin, handleRedirectCallback, ensureFreshToken, revokeToken } from "../../src/lib/oauth";
import { OAUTH_CLIENT_ID } from "../../src/lib/instances";

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("startLogin", () => {
  it("redirects to the archive's authorize endpoint with PKCE params and stashes the verifier", async () => {
    const navigate = vi.fn();

    await startLogin(navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api-dandi.emberarchive.org/oauth/authorize/");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(OAUTH_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${window.location.origin}${window.location.pathname}`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});

describe("startLogin redirect_uri", () => {
  it("uses the page's own current path, not a hardcoded one, so it works from any deploy location", async () => {
    window.history.replaceState({}, "", `${window.location.origin}/pr-preview/pr-19/`);
    const navigate = vi.fn();
    await startLogin(navigate);
    const url = new URL(navigate.mock.calls[0][0] as string);
    expect(url.searchParams.get("redirect_uri")).toBe(`${window.location.origin}/pr-preview/pr-19/`);
  });
});

describe("handleRedirectCallback", () => {
  it("returns null and leaves the URL untouched when there's no code/state in it", async () => {
    window.history.replaceState({}, "", `${window.location.origin}/`);
    const result = await handleRedirectCallback();
    expect(result).toBeNull();
  });

  it("returns null and strips OAuth params when state doesn't match a pending login", async () => {
    window.history.replaceState({}, "", `${window.location.origin}/?code=abc&state=unknown-state`);
    const result = await handleRedirectCallback();
    expect(result).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("exchanges the code for tokens via PKCE when state matches, then cleans the URL", async () => {
    const navigate = vi.fn();
    await startLogin(navigate);
    const authorizeUrl = new URL(navigate.mock.calls[0][0] as string);
    const state = authorizeUrl.searchParams.get("state")!;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-1", refresh_token: "rt-1", expires_in: 36000 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    window.history.replaceState({}, "", `${window.location.origin}/?code=the-code&state=${state}`);
    const before = Date.now();
    const tokens = await handleRedirectCallback();

    expect(window.location.search).toBe("");
    expect(tokens).not.toBeNull();
    expect(tokens!.accessToken).toBe("at-1");
    expect(tokens!.refreshToken).toBe("rt-1");
    expect(tokens!.expiresAt).toBeGreaterThanOrEqual(before + 36000 * 1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/oauth/token/");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe(OAUTH_CLIENT_ID);
    expect(body.get("client_secret")).toBeNull();
    expect(body.get("code_verifier")).toBeTruthy();
  });
});

describe("ensureFreshToken", () => {
  it("returns the same token set unchanged when it isn't near expiry", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tokens = { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 3600_000 };
    const result = await ensureFreshToken(tokens);
    expect(result).toBe(tokens);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes via refresh_token grant (no client_secret) when near/past expiry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-2", refresh_token: "rt-2", expires_in: 100 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const tokens = { accessToken: "at-old", refreshToken: "rt-old", expiresAt: Date.now() - 1 };
    const result = await ensureFreshToken(tokens);
    expect(result.accessToken).toBe("at-2");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/oauth/token/");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-old");
    expect(body.get("client_secret")).toBeNull();
  });

  it("gives up and returns the stale token as-is if there's no refresh token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tokens = { accessToken: "at-old", expiresAt: Date.now() - 1 };
    const result = await ensureFreshToken(tokens);
    expect(result).toBe(tokens);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("revokeToken", () => {
  it("posts to the revoke endpoint and never throws, even on failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeToken({ accessToken: "at", expiresAt: 0 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-dandi.emberarchive.org/oauth/revoke_token/",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
