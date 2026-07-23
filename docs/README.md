# Live Testing

## Live test injections

`npm test` runs unit tests, `npm run test:integration` runs Playwright. Paste one of these into the address bar:

| URL                    | What it should look like                                                | Try it                                                                  |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `?test&num_datasets=0` | No-datasets-found message                                               | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&num_datasets=0) |
| `?test&num_datasets=1` | Single dataset, shown as plain text with an archive link                | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&num_datasets=1) |
| `?test&num_datasets=2` | Dropdown with 2 fake datasets                                           | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&num_datasets=2) |
| `?test&mock_upload=25` | A nested batch of 25 fake files, scanning then uploading                | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&mock_upload=25) |
| `?test&signed_out`     | The page as a signed-out visitor sees it, regardless of your real state | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&signed_out)     |
| `?test&freeze_scan`    | Every dropped file hangs mid-scan (badge, Cancel button, 0% figures)    | [Open](https://brain-bbqs.github.io/bbqs-uploader/?test&freeze_scan)    |

`?test` alone (without one of the above) is a no-op that never changes anything by itself.

Fake datasets use negative identifiers (e.g. `-000001`) so they're never mistaken for real ones.
Sign-in state is untouched and nothing is written to `localStorage`, so all of the above are safe to try at any time, whether or not you're actually signed in.

`mock_upload=N` queues `N` fake files (10 MB-100 GB each) nested randomly across folders and animates the Scanning bar immediately, then the Uploading bar once you click "Upload".
No bytes are read, hashed, or sent anywhere.
While it's active, every file (including a genuinely dropped one) runs through the same simulated timers, so don't combine this with a real upload.

`signed_out` forces every auth-dependent render (the header's sign-in control, the Dataset card, upload blocking) to behave as if signed out, without ever touching `oauthTokens` or `localStorage`, so it also works while genuinely signed in.

`freeze_scan` gives every dropped file a scan that never finishes: the "Scanning" badge, Cancel button, and 0% summary figures hold still indefinitely (a real scan of a small file finishes in milliseconds, too fast to look at or screenshot). "Cancel all" still cancels the frozen scans. The Chromatic file-queued snapshot uses this to capture the mid-scan state deterministically.
