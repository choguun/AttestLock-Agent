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

### September 9 acceptance refresh

Remote main and the running worker still identify `0e68b361350ecd114e60c62a73d9ab75a7ccda9f`. Worker deployment `5acb8ea8-9625-4ee0-98ea-7efcfcf1b122` reports SUCCESS. At 15:36 UTC, web and health returned 200; readiness schema 2 reported every component healthy, with Sepolia attested height 11668820. These are observations, not uninterrupted-uptime claims.

- [Scheduled smoke 34352086842](https://github.com/choguun/AttestLock-Agent/actions/runs/34352086842) actually executed `pnpm smoke:production` successfully on that release at 12:37 UTC. This closes the scheduled-smoke gate for **that SHA only**; a later submission release needs its own passing scheduled run.
- [September 8 failure 34263559653](https://github.com/choguun/AttestLock-Agent/actions/runs/34263559653) failed because protocol statistics were stale or unavailable. Subsequent scheduled runs recovered. The logs do not establish the underlying RPC cause; do not erase this failure or weaken the freshness check.
- Two live SSE connections returned 200 and `text/event-stream`; each was closed and followed by REST recovery of the same executed/refused jobs. This verifies transport/retrieval, not an in-flight proof or browser crash.
- Hosted-origin preflight returned 204 and the exact allowed origin. A request with an untrusted origin received no allow-origin header. This verifies CORS, **not** Railway forwarded-header identity semantics.
- Chrome/Rabby account switching selected the dedicated borrower; Sepolia displayed 900 mUSDC, faucet already claimed and approval required. Creditcoin displayed the existing 50 mUSD line, 50 mUSD debt and 50 mUSD balance. No wallet transaction or new proof job was sent.
- Read-only Creditcoin preflight at block **5458505**, `2026-09-09T15:37:39.398Z`: debt/balance each `50000000`, allowance `0`, borrower native balance `4999915139600000000` wei. Profile accounting holds; maturity remains `2026-09-12T11:21:15.000Z` and had **not** passed.
- Fresh `pnpm verify` passed with PostgreSQL. The initial browser run passed 14/15 and reproduced a repayment-approval recovery failure; a serial repeat also failed once. A subsequent run exposed the same pending-state problem during borrow. Local remediation publishes confirmed journal state before optional profile/balance reads and always releases session-owned recovery guards, including stale-session early returns. Regression scenarios stall reads and replace the wallet session during recovery. All five refresh scenarios passed three repetitions after the guard fix. This change is not yet deployed; see the delivery result for final test/CI status.

### Signing and media handoff

Final local checks for this patch: `pnpm verify` passed with PostgreSQL enabled (145 tests, zero skips); all 15 Chromium browser cases passed, including the new stalled-read and in-flight session-replacement assertions. The unchanged deployed application was also reloaded in Chrome: Rabby restored the dedicated borrower on Creditcoin, the existing 50 mUSD debt/balance reappeared, and another draw was disabled. No pending transaction was created for that production reload check.

The no-new-wallet-transactions boundary remains in effect. Completing a new browser source lock needs explicit authorization for a 100 mUSDC approval/15-day lock and the transaction-bound queue signature. The existing borrower already claimed its one-time faucet; do not claim a second faucet success or mislabel the original local-signer transaction as browser footage.

For maturity evidence, wait until **chain block time** is at least September 12 11:21:15 UTC, select the existing lock `0xaab90d516e9c2f35987d428c3466d6c7ea7785004b2adf682a04a98c39d0ec3e`, and re-read debt, balance and allowance. With explicit signing authorization, approve only the required debt and repay on Creditcoin. Save the actual receipt hash; run the strict evidence command with `REPAY_TX_HASH` and the actual `REPAY_PAYER`, then verify zero debt and matching borrower-profile/token deltas. A reminder, simulation or early repayment cannot satisfy this gate.

The appendix described in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md) requires the future repayment receipt, so it cannot yet be recorded as evidence-complete. Public media URLs and DoraHacks personal/eligibility fields remain unset; no uploads or submission were performed during this refresh.

### Remaining gates

- Full real hosted-browser faucet/approve/lock/proof flow; the original source lock used the local encrypted signer. The existing hosted borrower draw is genuine.
- Production browser crash/replacement drill and Railway proxy-boundary confirmation.
- Repayment after the actual on-chain maturity: **September 12, 2026, 11:21:15 UTC / 18:21:15 Bangkok**.
- Public 90-second video, uncut technical appendix, and private DoraHacks eligibility/personal fields.
- Final clean-room/public-link checks and a successful scheduled smoke against the submission release.
- Historical research redistribution-rights review; no invented permission or new reuse of copied material.

The internal 88/100 estimate is unchanged by these repairs. Neither 93/100 nor eligibility PASS is claimed; test counts are not market validation and no score guarantees placement.
