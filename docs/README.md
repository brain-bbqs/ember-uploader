# Live Testing

## Live test injections

`npm test` runs unit tests, `npm run test:integration` runs Playwright. Paste one of these into the address bar:

| URL                    | What it should look like                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| `?test&num_datasets=0` | No-datasets-found message                                               |
| `?test&num_datasets=1` | Single dataset, shown as plain text with an archive link                |
| `?test&num_datasets=2` | Dropdown with 2 fake datasets                                           |
| `?test&mock_upload=25` | A nested batch of 25 fake files, scanning then uploading                |
| `?test&signed_out`     | The page as a signed-out visitor sees it, regardless of your real state |

`?test` alone (without one of the above) is a no-op — it never changes anything by itself.

Fake datasets use negative identifiers (e.g. `-000001`) so they're never mistaken for real ones.
Sign-in state is untouched and nothing is written to `localStorage`, so all of the above are safe to try at any time, whether or not you're actually signed in.

`mock_upload=N` queues `N` fake files (10 MB-100 GB each) nested randomly across folders and animates the Scanning bar immediately, then the Uploading bar once you click "Upload" — no bytes are read, hashed, or sent anywhere. While it's active, every file (including a genuinely dropped one) runs through the same simulated timers, so don't combine this with a real upload.

`signed_out` forces every auth-dependent render (the header's sign-in control, the Dataset card, upload blocking) to behave as if signed out, without ever touching `oauthTokens` or `localStorage` — so it also works while genuinely signed in.

See also:

- `stories/injections/` — isolated Storybook stories for the components each injection affects, in light and dark mode (`npm run storybook`)
- `tests/integration/injections/` — Playwright coverage of both injections, in light and dark mode
