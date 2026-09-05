# Live UI audit remediation — September 5, 2026

The audit checked production `c763e7f` on desktop and a 390px phone viewport, public API responses, and read-only source getters. It did not submit wallet transactions. Existing native proof and borrower-draw evidence remain unchanged.

| Finding                                                            | Remediation                                                                                                                                         | Regression evidence                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Refused job marked every stage reached, including executed         | Terminal failures receive the current-step label; intermediate completion is not inferred from a terminal status                                    | Refused/failed timeline tests; full browser junk path                                                                             |
| 390px viewport expanded to 555px, then 32,152px on proof expansion | Single-column evidence grid, wrapping identifiers, bounded keyboard-scrollable proof                                                                | Real fixture tested collapsed/expanded at 360/390/768/1440px with accessibility checks                                            |
| Claimed faucet and unapproved lock enabled                         | Read claim, balance, allowance, native gas; disable unavailable actions; bounded reads                                                              | Source-readiness tests and claimed/approval reload browser test                                                                   |
| Competing injected wallet providers                                | EIP-6963 selection; preserve provider for reads/listeners/network changes/signing; restore without prompts                                          | Mock Rabby plus competing provider; missing selection, duplicate announcements, chain addition and provider-switch state clearing |
| Judge navigation missing                                           | Prominent verified-example/setup links; repo, onboarding/API, partial deck, gas faucets, readiness; readable amounts and negative-path explanations | Published-fixture rendering, browser navigation and accessibility                                                                 |
| Failed metric refresh retained “current”                           | Single-flight bounded polling; preserve values with stale label; two-minute observation/local age checks                                            | Unit outage/recovery/slow-request tests and browser API-outage test                                                               |

Wallet names are self-reported, not authentication. A positive gas balance is not a fee sufficiency guarantee; the wallet still estimates gas. Terminal history is intentionally conservative because the public job schema does not expose an authoritative stage history. Connected balances and the selected line/profile also refresh periodically; stale account/selection responses are discarded.

## Verification

- `pnpm verify`: **145 tests, zero skips** with local PostgreSQL enabled: 31 script, 1 shared, 58 worker (all 8 PostgreSQL cases), 23 web, 32 Foundry.
- `pnpm test:e2e`: **15 Chromium tests passed**, including all existing approval/lock/borrow/repayment refresh cases, mobile expanded proof, multi-provider restoration, and stale metrics.
- CI, merged SHA, hosted release, and live browser confirmation must be linked in the PR delivery receipt after they actually pass. Local tests alone do not certify production.

## Still pending — not fixed by presentation changes

- Full real hosted-browser faucet/approve/lock/proof flow; the original source lock used the local encrypted signer. The existing hosted borrower draw is genuine.
- Production browser crash/replacement drill and Railway proxy-boundary confirmation.
- Repayment after the actual on-chain maturity: **September 12, 2026, 11:21:15 UTC / 18:21:15 Bangkok**.
- Public 90-second video, uncut technical appendix, and private DoraHacks eligibility/personal fields.
- Final clean-room/public-link checks and a successful scheduled smoke against the submission release.
- Historical research redistribution-rights review; no invented permission or new reuse of copied material.

The internal 88/100 estimate is unchanged by these repairs. Neither 93/100 nor eligibility PASS is claimed; test counts are not market validation and no score guarantees placement.
