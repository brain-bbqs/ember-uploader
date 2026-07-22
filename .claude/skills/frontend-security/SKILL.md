---
name: frontend-security
description: Threat-model checklist for this repo's client-side security (XSS surface, credential/token storage, CodeQL "clear text storage" alerts). Use whenever adding/reading a scanner alert about storing a token/credential/secret, whenever adding or reviewing any `innerHTML`/`outerHTML`/`insertAdjacentHTML` usage, before adding a new runtime dependency or third-party script, or when deciding how long an auth token should persist client-side.
---

# Frontend security checklist

Full writeup and rationale: [`SECURITY.md`](../../../SECURITY.md) at the repo
root — read it before acting, this file is just the triggerable summary.

bbqs-uploader is a fully static, backend-free page. There is no server to
hold a session, so any API credential (OAuth tokens, previously a pasted API
key) necessarily lives somewhere client-side JS can read it. That's a fixed
constraint, not a bug to route around — the job is managing it deliberately.

## If a scanner (CodeQL or otherwise) flags clear-text credential storage

Don't default to dismissing it, and don't try to "encrypt" the value
client-side (a decryption key reachable by this app's own JS is reachable by
injected attacker JS too — that's a false sense of security, not a real one).
Instead:

1. Check the actual XSS surface first:
   ```
   grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML" src/
   ```
   For every hit, confirm dynamic/untrusted strings (file names, API
   responses, usernames, dandiset titles) are assigned via `.textContent`,
   not concatenated into the HTML. A hardcoded static template via
   `innerHTML` is fine. If this turns up a real injection point, fix that —
   it's the actual vulnerability, not the storage choice.
2. If no XSS surface exists, pick a persistence level deliberately:
   `localStorage` (survives restarts, lowest friction) → `sessionStorage`
   (clears on tab close, still usually flagged the same way) → in-memory only
   (cleared on any reload, no flagged sink at all, but re-auth every load).
3. Dismiss the alert citing this file/SECURITY.md if you land on
   `localStorage`/`sessionStorage`, rather than leaving it open unexplained.

## Other things to keep true

- No third-party `<script>` tags or CDN includes in `index.html` — only this
  app's own bundled module loads at runtime.
- Keep runtime dependencies minimal (currently just `spark-md5`) — a
  compromised dependency is the other realistic path to a token leaking even
  without a bug in this app's own code.

See `SECURITY.md` for the full reasoning, the OAuth token lifecycle
(refresh behavior, ~10h access token default), and prior precedent
(PR #16, PR #19).
