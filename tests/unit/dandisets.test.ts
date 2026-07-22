import { describe, expect, it, vi } from "vitest";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import type { UploaderConfig } from "../../src/lib/types";

const cfg: UploaderConfig = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  accessToken: "token-1",
  dandisetId: "",
};

describe("listIncomingDandisets", () => {
  it("requests the caller's owned dandisets and keeps only 'Incoming: ' titled ones, sorted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { identifier: "000200", draft_version: { name: "Incoming: Zeta Lab" } },
          { identifier: "000100", most_recent_published_version: { name: "Incoming: Alpha Lab" } },
          { identifier: "000300", draft_version: { name: "Not an incoming dataset" } },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listIncomingDandisets(cfg);

    expect(result).toEqual([
      { identifier: "000100", title: "Incoming: Alpha Lab" },
      { identifier: "000200", title: "Incoming: Zeta Lab" },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/api/dandisets/?user=me&embargoed=true&page_size=1000");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    vi.unstubAllGlobals();
  });

  it("prefers the published version's title over the draft's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              identifier: "000100",
              draft_version: { name: "Incoming: Draft Title" },
              most_recent_published_version: { name: "Incoming: Published Title" },
            },
          ],
        }),
      }),
    );

    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([{ identifier: "000100", title: "Incoming: Published Title" }]);
    vi.unstubAllGlobals();
  });

  it("returns an empty list when the response has no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });
});
