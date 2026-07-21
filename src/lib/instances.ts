import type { DandiInstance } from "./types";

export const EMBER_INSTANCE: DandiInstance = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  oauth: "https://api-dandi.emberarchive.org/oauth",
};

// Registered as a public (PKCE, no client secret) OAuth2 application on the EMBER archive. The
// redirect URI itself is computed at runtime from wherever the app is actually being served
// (see oauth.ts) rather than hardcoded, since PR previews and local dev live at different paths
// than the production root — each one still has to be added as a valid redirect URI on the
// archive side (or covered by a wildcard) for sign-in to work from that specific location.
export const OAUTH_CLIENT_ID = "KoQNdyPaJULkfRJXa9YSm6PTC29TLzEz8yZH3vNv";
