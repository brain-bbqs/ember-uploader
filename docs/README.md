# Docs

## How to test

`npm test` runs unit tests, `npm run test:integration` runs Playwright. For the dataset picker's
various states, paste one of these into the address bar:

| URL                    | What it should look like                                 |
| ---------------------- | -------------------------------------------------------- |
| `?test`                | Single dataset, shown as plain text with an archive link |
| `?test&num_datasets=0` | No-datasets-found message                                |
| `?test&num_datasets=1` | Same as `?test` — single dataset, plain text             |
| `?test&num_datasets=2` | Dropdown with 2 fake datasets                            |
| `?test&num_datasets=5` | Dropdown with 5 fake datasets                            |

Fake datasets use negative identifiers (e.g. `-000001`) so they're never mistaken for real ones.
Sign-in state is untouched and nothing is written to `localStorage`, so this is safe to try at any
time.
