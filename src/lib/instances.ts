import type { DandiInstance } from "./types";

export const EMBER_INSTANCE: DandiInstance = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  oauth: "https://api-dandi.emberarchive.org/oauth",
};

// Registered as a public (PKCE, no client secret) OAuth2 application on the EMBER archive,
// with this exact redirect URI (GitHub Pages does not allow per-deploy redirect URIs, so the
// app's root is what's registered).
export const OAUTH_CLIENT_ID = "KoQNdyPaJULkfRJXa9YSm6PTC29TLzEz8yZH3vNv";
export const OAUTH_REDIRECT_URI = "https://brain-bbqs.github.io/ember-uploader";
