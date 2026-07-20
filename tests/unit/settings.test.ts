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
    expect(cfg.dandisetId).toBe("000123");
  });

  it("extracts a numeric dandiset id from surrounding text", () => {
    const cfg = resolveConfig({
      apiKey: "k",
      dandisetId: "not-a-real-id",
    });
    expect(cfg.dandisetId).toBe("");
  });
});

describe("configProblems", () => {
  it("flags a missing API URL, API key, and dandiset id", () => {
    const problems = configProblems({ api: "", web: null, apiKey: "", dandisetId: "" });
    expect(problems).toHaveLength(3);
  });

  it("passes for a fully valid config", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "https://dandi.emberarchive.org",
      apiKey: "abc",
      dandisetId: "000123",
    });
    expect(problems).toHaveLength(0);
  });
});
