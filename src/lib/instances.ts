import type { DandiInstance } from "./types";

export const INSTANCES: Record<string, DandiInstance> = {
  dandi: {
    api: "https://api.dandiarchive.org/api",
    web: "https://dandiarchive.org",
  },
  "dandi-sandbox": {
    api: "https://api.sandbox.dandiarchive.org/api",
    web: "https://sandbox.dandiarchive.org",
  },
  "ember-dandi": {
    api: "https://api-dandi.emberarchive.org/api",
    web: "https://dandi.emberarchive.org",
  },
  "ember-dandi-sandbox": {
    api: "https://api-dandi.sandbox.emberarchive.org/api",
    web: "https://dandi.sandbox.emberarchive.org",
  },
};
