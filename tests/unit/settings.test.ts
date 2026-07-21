import { describe, expect, it } from "vitest";
import { configProblems, resolveConfig } from "../../src/lib/settings";

describe("resolveConfig", () => {
  it("resolves the EMBER-DANDI API/web URLs and trims the API key", () => {
    const cfg = resolveConfig({
      apiKey: " key123 ",
      dandisetId: "DANDI:000123",
    });
    expect(cfg.api).toBe("https://api-dandi.emberarchive.org/api");
    expect(cfg.web).toBe("https://dandi.emberarchive.org");
    expect(cfg.apiKey).toBe("key123");
    expect(cfg.authScheme).toBe("token");
    expect(cfg.dandisetId).toBe("000123");
  });

  it("extracts a numeric dandiset id from surrounding text", () => {
    const cfg = resolveConfig({
      apiKey: "k",
      dandisetId: "not-a-real-id",
    });
    expect(cfg.dandisetId).toBe("");
  });

  it("prefers an OAuth access token over a pasted API key, using the Bearer scheme", () => {
    const cfg = resolveConfig({
      apiKey: "pasted-key",
      dandisetId: "000123",
      oauthAccessToken: "the-access-token",
    });
    expect(cfg.apiKey).toBe("the-access-token");
    expect(cfg.authScheme).toBe("Bearer");
  });
});

describe("configProblems", () => {
  it("flags a missing API URL, API key, and dandiset id", () => {
    const problems = configProblems({ api: "", web: null, apiKey: "", authScheme: "token", dandisetId: "" });
    expect(problems).toHaveLength(3);
  });

  it("passes for a fully valid config", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "https://dandi.emberarchive.org",
      apiKey: "abc",
      authScheme: "token",
      dandisetId: "000123",
    });
    expect(problems).toHaveLength(0);
  });

  it("reports 'Not signed in.' rather than an API-key message when the auth scheme is Bearer", () => {
    const problems = configProblems({ api: "https://x", web: null, apiKey: "", authScheme: "Bearer", dandisetId: "1" });
    expect(problems).toContain("Not signed in.");
  });
});
