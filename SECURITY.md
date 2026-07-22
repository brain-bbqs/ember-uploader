# Security notes

bbqs-uploader is a fully static, backend-free page (see `package.json`'s
description) — there is no server to hold a session, set an `httpOnly`
cookie, or otherwise keep a credential out of client-side JavaScript. Any
credential used to call the DANDI API (the pasted API key before this PR, the
OAuth access/refresh tokens since) has to live somewhere the browser's JS can
read it back out. That constraint doesn't go away; the sections below are
about managing it deliberately instead of by accident.

## The actual risk is XSS, not "clear text storage" by itself

A token sitting in `localStorage`/`sessionStorage` is only exploitable
remotely if an attacker can first get JavaScript to execute on this origin
(XSS) — at which point they could just make authenticated requests directly,
credential theft is a bonus, not the primary damage. So before treating a
"clear text storage of sensitive information" scanner alert as something to
dismiss or work around, actually check whether that precondition holds:

```
grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML" src/
```

For every hit, confirm any _dynamic_ (user-supplied, API-returned, or
otherwise non-literal) string is assigned via `.textContent` (or an
`element.value` type property) rather than concatenated into the HTML string
itself. A fixed, hardcoded template assigned via `innerHTML` is fine — the
risk is interpolating untrusted data into HTML source, not the property name.
As of this writing, all three `innerHTML` uses in `src/` (`fileRow.ts`,
`fileTree.ts`, the "What's New" modal) follow this pattern: static skeleton
via `innerHTML`, then `.textContent` for anything dynamic (file names,
dandiset titles, usernames). Keep it that way — this is the property that
makes accepting client-side token storage a reasonable call for this app.

Also keep an eye on:

- **No third-party runtime scripts.** `index.html` loads only this app's own
  bundled module — no CDN `<script>` tags, no analytics. A compromised
  third-party script is the other realistic way a token in storage gets
  exfiltrated even without a bug in this app's own code.
- **Minimal runtime dependencies.** Currently just `spark-md5`. Every added
  runtime dependency is something that could be compromised upstream and ship
  code that reads `localStorage`; don't add one without a reason.

## Handling a "clear text storage" alert on a new credential

1. Run the `innerHTML`/XSS check above. If it turns up a real
   injection point, fix _that_ — it's a bigger problem than where the token
   sits, and no storage choice below fixes it.
2. If it doesn't, decide how much persistence the credential actually needs,
   in order of decreasing exposure:
   - `localStorage` — survives browser restarts. Lowest friction, largest
     exposure window (persists until explicitly cleared or signed out).
   - `sessionStorage` — survives reloads, clears on tab close. Meaningfully
     smaller window than `localStorage`, but scanners (CodeQL included)
     generally flag this the same way — expect to still need step 3.
   - In-memory only (a plain module variable, no Storage API) — cleared on
     any reload/navigation, not just tab close. Removes the flagged sink
     entirely, at the cost of re-authenticating on every page load.
3. If you land on `localStorage` or `sessionStorage`, dismiss the resulting
   alert as an accepted, documented trade-off (link this file) rather than
   trying to "encrypt" the value client-side first — any decryption key
   reachable by this app's own JS is reachable by an attacker's injected JS
   too, so client-side encryption of a client-held secret is not a real
   mitigation, just a false sense of one.

**Precedent:** [PR #16](https://github.com/brain-bbqs/bbqs-uploader/pull/16)
proposed dropping persistence entirely for the pasted API key (in-memory /
re-enter-each-session, option 2's strictest form above) rather than dismissing
its alert. [PR #19](https://github.com/brain-bbqs/bbqs-uploader/pull/19)
replaced that key with OAuth tokens persisted in `localStorage` — decide the
same question for those tokens using the checklist above rather than assuming
the OAuth migration made #16's alert moot; it's the same sink, just renamed.

## OAuth token lifecycle (as of the PR #19 EMBER sign-in flow)

- Access tokens use `django-oauth-toolkit`'s unconfigured default lifetime
  (~10 hours on the EMBER archive, per its settings). `ensureFreshOAuth()` in
  `src/main.ts` refreshes the access token automatically (60s before expiry)
  on every connection check and upload, using the `refresh_token` — so in
  practice a signed-in user isn't prompted to re-authenticate every 10 hours,
  only when the refresh token itself is invalidated, the user explicitly
  signs out (which revokes it via `/oauth/revoke_token/`), or stored settings
  are cleared.
