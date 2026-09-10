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

- Fresh-wallet browser faucet footage remains absent. Browser approval, lock, queue authorization, attestation, native proof and line creation completed in the September 9 run below using previously claimed tokens. The existing hosted borrower draw is genuine; no additional draw was requested.
- Production browser crash/replacement drill and Railway proxy-boundary confirmation.
- Repayment after the actual on-chain maturity: **September 12, 2026, 11:21:15 UTC / 18:21:15 Bangkok**.
- Public 90-second video, uncut technical appendix, and private DoraHacks eligibility/personal fields.
- Final clean-room/public-link checks and a successful scheduled smoke against the submission release.
- Historical research redistribution-rights review; no invented permission or new reuse of copied material.

The internal 88/100 estimate is unchanged by these repairs. Neither 93/100 nor eligibility PASS is claimed; test counts are not market validation and no score guarantees placement.

## September 9 browser onboarding completed

After the read-only refresh above, the user explicitly authorized one 100 mUSDC approval, a 15-day lock and its queue authorization, and handled Rabby signing in Chrome. The earlier no-new-transactions boundary was lifted only for those actions. The deployed release remained `0e68b36`; the recovery patch in PR #10 was not used or deployed for this run.

- [Approval](https://eth-sepolia.blockscout.com/tx/0xd5710c7ec00f59ee64a90d01378e1fd426ec8029d7f185615c9ed38e44dcd40f): successful block 11668917, exactly 100 mUSDC allowance to the configured vault.
- [Source lock](https://eth-sepolia.blockscout.com/tx/0xc0cd26a96028edf201fa312aabf7cb2999b40d503e30447d65b1cdf3e100fa15): successful block 11668922, exact borrower/token/event and 100 mUSDC; collateral unlocks September 24 at 15:49:09 UTC / 22:49:09 Bangkok.
- Job `218b4375-b6aa-42f6-a452-febb5a35daf7` was accepted by the signed queue API. A real page reload during attestation waiting restored the same borrower, source hash and job without another signature or duplicate lock.
- [Native proof](https://creditcoin-testnet.blockscout.com/tx/0xb1c329b7aa85925c145cbcf0ba0eca0064098e7aaca47586495979d038c92924): successful block 5458589, 289980 gas, attested height 11668930, recorded queue-to-execution duration 548527 ms. On-chain calldata decodes to the seven-argument entrypoint with chain key 1; the verifier getter is `0x0FD2`.
- New lock `0xa014b60206eb1928021bb6749a54a5d4e3ada531331d5356994d2a891705b045` has an exact 50 mUSD limit and zero debt. Its seven-day line matures September 16 at 15:58:30 UTC, **not** September 12. Both replay flags and the expected ASC event were verified.
- The original line was compared immediately before/after this proof and remained unchanged. Aggregate borrower credit increased by 50 mUSD; borrowed/repaid/outstanding totals did not change. The original September 12 maturity repayment remains pending.

[Sanitized browser-onboarding evidence](../evidence/browser-onboarding-2026-09-09.json) includes successful receipts, calldata/proof tuple, timestamps, event-derived lock fact, job evidence, line and borrower-profile snapshots. No new faucet claim, new draw, repayment, video recording or full submission certification is implied.

## September 10 release and remaining-gate work

- PR #10 passed all checks, including the narrow historical secret-scan exception for the public ERC20 address. It merged as `44b989fbea0a96f9ceca240b70c32eba8da7bfd0`; [main CI 34472071485](https://github.com/choguun/AttestLock-Agent/actions/runs/34472071485) passed.
- Railway worker deployment `da87c2b9-02ee-41e9-bc3f-fa86749eb101` and web deployment `c3639035-5f07-4e71-a773-f1dd6b26bf60` reached SUCCESS on that SHA. Initial source-pin requests failed before a build existed; explicit source redeploys succeeded. Database configuration and sealed secrets were unchanged.
- At `2026-09-10T11:47:34Z`, health/readiness returned 200, readiness reported that SHA and all checks true, and native/ProofBuilder height was 11674700. Three jobs survived the worker replacement: two executed, one refused, zero failed. Current chain metrics at block 5463337 reported two lines, one drawer, 100 mUSD opened, 50 borrowed, zero repaid and 50 debt. This is an idle-worker replacement observation, not an active-broadcast crash drill.
- The live proxy check sent four read-only statistics requests with alternating documentation-only forwarding addresses. Every response incorrectly restarted at 299 remaining. Curated runtime-log inspection found 11 distinct socket peers among 42 stats requests; no raw client or infrastructure IPs were published. `TRUSTED_PROXY_CIDRS` was empty. This does not establish header spoofing, but it demonstrates ineffective per-socket accounting behind rotating ingress.
- The remediation uses one shared public-request bucket whenever no trusted CIDR boundary is configured. A new regression rotates peers and forwarding headers and requires 200, 200, 429; health/readiness remain excluded. Shared quota exhaustion affects all clients, so it is a conservative safety fallback, not per-client isolation. [Railway documents X-Real-IP](https://docs.railway.com/networking/public-networking/specs-and-limits); no stable trusted-peer/overwrite guarantee has been assumed.
- Local checks after the quota fix: 146 tests passed with PostgreSQL and no skips; all 15 existing browser tests passed. Follow-up media-player checks and the follow-up release require their own results.
- The six-slide September 10 PDF/PPTX was rendered and visually checked. Its evidence distinguishes the September 9 origination from the September 5 draw. The 90-second edited overview uses local synthetic narration, captions and a transcript. It is not an uncut browser signing video; final demo and appendix acceptance remain pending.
- Manual smoke [34473311403](https://github.com/choguun/AttestLock-Agent/actions/runs/34473311403) failed on stale/unavailable protocol statistics. A focused live event query took 11,149 ms, exceeding the existing 10-second HTTP dependency deadline. The follow-up adds canonical-block checkpointed incremental event reads, a reorg rebuild, and single-flight scanning; stale/error behavior and the strict smoke assertion are retained. The first cold scan can still temporarily be unavailable, and no uptime guarantee is claimed.

Still time/user dependent: the original-line repayment after September 12 18:21:15 Bangkok, wallet signatures for any new replacement/cancellation drill, final live-demo and uncut appendix recordings, private DoraHacks fields/eligibility, and the final submission-release clean-room/scheduled-smoke checks. Historical research remains excluded from active submission artifacts; no permission to redistribute old copied Git-history content is inferred.
