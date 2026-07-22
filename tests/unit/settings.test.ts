// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { configProblems, resolveConfig, loadStoredTheme, saveStoredTheme, THEME_KEY } from "../../src/lib/settings";

describe("resolveConfig", () => {
  it("resolves the EMBER-DANDI API/web URLs and the dandiset id", () => {
    const cfg = resolveConfig({
      dandisetId: "DANDI:000123",
      oauthAccessToken: "the-access-token",
    });
    expect(cfg.api).toBe("https://api-dandi.emberarchive.org/api");
    expect(cfg.web).toBe("https://dandi.emberarchive.org");
    expect(cfg.accessToken).toBe("the-access-token");
    expect(cfg.dandisetId).toBe("000123");
  });

  it("resolves to an empty id when the input contains no numeric dandiset id", () => {
    const cfg = resolveConfig({ dandisetId: "not-a-real-id" });
    expect(cfg.dandisetId).toBe("");
  });

  it("rejects the negative fake identifiers used by the ?test&num_datasets injection", () => {
    const cfg = resolveConfig({ dandisetId: "-000001" });
    expect(cfg.dandisetId).toBe("");
  });

  it("leaves the access token empty when not signed in", () => {
    const cfg = resolveConfig({ dandisetId: "000123" });
    expect(cfg.accessToken).toBe("");
  });
});

describe("configProblems", () => {
  it("flags a missing API URL and not being signed in (dandiset id is secondary while signed out)", () => {
    const problems = configProblems({ api: "", web: "", accessToken: "", dandisetId: "" });
    expect(problems).toHaveLength(2);
    expect(problems).toContain("Not signed in.");
  });

  it("passes for a fully valid config", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "https://dandi.emberarchive.org",
      accessToken: "abc",
      dandisetId: "000123",
    });
    expect(problems).toHaveLength(0);
  });

  it("reports 'No dataset selected.' when signed in but no dandiset is chosen", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "",
      accessToken: "abc",
      dandisetId: "",
    });
    expect(problems).toEqual(["No dataset selected."]);
  });
});

describe("theme preference storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing has been stored", () => {
    expect(loadStoredTheme()).toBe(null);
  });

  it("round-trips a saved preference", () => {
    saveStoredTheme("dark");
    expect(loadStoredTheme()).toBe("dark");
    saveStoredTheme("light");
    expect(loadStoredTheme()).toBe("light");
  });

  it("ignores a corrupted stored value", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    expect(loadStoredTheme()).toBe(null);
  });
});
