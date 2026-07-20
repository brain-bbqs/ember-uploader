import { describe, expect, it } from "vitest";
import { configProblems, resolveConfig } from "../../src/lib/settings";

describe("resolveConfig", () => {
  it("resolves a known instance's API/web URLs", () => {
    const cfg = resolveConfig({
      instance: "dandi-sandbox",
      customApi: "",
      apiKey: " key123 ",
      dandisetId: "DANDI:000123",
      pathPrefix: " videos/ ",
    });
    expect(cfg.api).toBe("https://api.sandbox.dandiarchive.org/api");
    expect(cfg.web).toBe("https://sandbox.dandiarchive.org");
    expect(cfg.apiKey).toBe("key123");
    expect(cfg.dandisetId).toBe("000123");
    expect(cfg.pathPrefix).toBe("videos/");
  });

  it("uses the custom API URL and strips trailing slashes for custom instances", () => {
    const cfg = resolveConfig({
      instance: "custom",
      customApi: "https://example.org/api///",
      apiKey: "k",
      dandisetId: "1",
      pathPrefix: "",
    });
    expect(cfg.api).toBe("https://example.org/api");
    expect(cfg.web).toBeNull();
  });

  it("extracts a numeric dandiset id from surrounding text", () => {
    const cfg = resolveConfig({
      instance: "dandi",
      customApi: "",
      apiKey: "k",
      dandisetId: "not-a-real-id",
      pathPrefix: "",
    });
    expect(cfg.dandisetId).toBe("");
  });
});

describe("configProblems", () => {
  it("flags a missing API URL, API key, and dandiset id", () => {
    const problems = configProblems({ api: "", web: null, apiKey: "", dandisetId: "", pathPrefix: "" });
    expect(problems).toHaveLength(3);
  });

  it("passes for a fully valid config", () => {
    const problems = configProblems({
      api: "https://api.dandiarchive.org/api",
      web: "https://dandiarchive.org",
      apiKey: "abc",
      dandisetId: "000123",
      pathPrefix: "",
    });
    expect(problems).toHaveLength(0);
  });
});
