# Live evidence gate

A build, mock proof, faucet transfer, or polished preview is not deployed AttestLock integration.

## Audit-driven local verification — September 5, 2026

Audit hardening merged through [PR #4](https://github.com/choguun/AttestLock-Agent/pull/4), main `6aec094ed321675199eaa2ff818e4a719c67a37b`; [merged-main CI 33959893700](https://github.com/choguun/AttestLock-Agent/actions/runs/33959893700) passed. The following 100-test measurements describe that certified Solidity deployment commit. [PR #5](https://github.com/choguun/AttestLock-Agent/pull/5) subsequently passed **107 tests, zero skips, seven browser paths**, merged as `8d2c2bf`, and passed [main CI 33961818287](https://github.com/choguun/AttestLock-Agent/actions/runs/33961818287). Native-receipt follow-up: `codex/live-proof-evidence`.

The native-receipt follow-up merged as **`b7e71f2` through PR #6** and passed [main CI 33964655735](https://github.com/choguun/AttestLock-Agent/actions/runs/33964655735): **111 tests, zero skips** (8 script, 1 shared, 56 worker including all 8 PostgreSQL cases, 14 web, 32 Foundry) and **seven browser tests**. Its fresh public clone passed the same tests. New tests bind both real proof fixtures, reject altered query/continuity linkage, and prevent partial judge evidence being labelled complete. The borrower-evidence follow-up must obtain its own CI before release.

**Borrower-evidence local verification:** `pnpm verify` passed **137 tests, zero skips** (31 script, 1 shared, 58 worker including all 8 PostgreSQL cases, 15 web, 32 Foundry). All **eight Chromium tests** passed, including wallet-free rendering/accessibility of the real draw fixture. The new pure checker passes the actual draw and rejects 22 mutated alternatives. API tests exercise actual SSE connection exhaustion/disconnection recovery and explicitly pinned proxy trust without accepting forged headers from an untrusted peer. Local PostgreSQL is 14.17; CI independently uses PostgreSQL 17. Coverage remains 99.33/99.46/87.50/100, above the existing floors. Production dependency audit reports no known vulnerabilities. These local results are not a production crash drill or a confirmed Railway proxy boundary.

- `pnpm verify`: **100 tests passed, zero skips** with PostgreSQL enabled: 1 shared, 55 worker (including 8 PostgreSQL cases), 13 web, 31 Foundry.
- `pnpm test:e2e`: **7 Chromium paths passed**, including refresh during approval, lock, borrow, repayment approval, repayment, and proof processing. Wallet/API state is mocked; the separate API suite exercises real HTTP SSE transport.
- `pnpm contracts:coverage`: **99.33% lines, 99.46% statements, 87.50% branches, 100% functions** over production contracts. Test harnesses/dependencies are excluded from the denominator, not from execution. Enforced floors remain 95/93/85/90.
- Coverage retains viaIR/source-mapping warnings and a coverage-only memory-safe annotation of the upstream decoder in an isolated temporary copy. It is not production compiler provenance or a security audit. CI pins Foundry v1.7.1.
- Official differential fuzzing invokes imported `ASCBase` and compares query IDs and actual native-verifier calldata. Stateful multi-line invariants exercise 256 runs at depth 128 with no handler reverts.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities; registry failures are not ignored. The CI audit is its own independent job.
- `forge lint --root contracts`: only documented block-timestamp warnings for maturity/expiry policy and the invariant time gate.
- Production configuration tests fail closed on missing/zero live variables. Preview disables writes even with addresses present.
- Full-history secret and Markdown-link checks passed in merged-main CI. A fresh public clone passed all 100 tests with PostgreSQL (zero skips) and all seven browser paths.
- Original and `-live` deck files are historical drafts. The new `-borrow` PPTX/PDF preserve the six-slide design and native table, add the real draw gas/block/profile accounting, and cite the passed scheduled smoke. Package/layout/import checks pass; all six PDF slides were rendered and visually inspected. Full browser onboarding, maturity repayment and videos remain explicitly pending.

## Hosted observation — September 5, 2026

Historical morning inspection reported (superseded by the later update below):

- Web preview: deployment `4695be59-8170-4620-9773-dcc039b38ba4`, Singapore, active.
- Private PostgreSQL: running with persistent volume.
- Worker: no deployment, no repository source, reserved public domain only.
- Live smoke: latest scheduled run [33950241169](https://github.com/choguun/AttestLock-Agent/actions/runs/33950241169) skipped because live configuration is not enabled.

This is a point-in-time observation, not a future uptime guarantee. Railway proxy CIDRs/header trust semantics are not yet verified for this deployment; arbitrary forwarding headers remain untrusted.

**Later September 5 update:** all contracts are deployed/verified, the real source lock and proof fixture exist, and a tampered payload reverted with unchanged state. The capped relayer is sealed in Railway. The worker now has repository source, but its first build selected the legacy root web build and failed startup. This follow-up replaces the three TOML files with an imported, no-op-verified `.railway/railway.ts`. See [LIVE_TESTNET.md](LIVE_TESTNET.md) for exact provenance, transactions and pending acceptance. Failed deployment is not liveness.

**11:26 UTC recovery update (supersedes the hosting failures above):** worker `b63fc834-34b7-4003-a756-dd882f048d77` and live web `95ef618d-c767-44ac-b5a0-5139c5e4203f` run green release `8d2c2bf`. Native origination, junk refusal, tamper and replay are verified. Health/readiness/stats/CORS and exact live bundle configuration passed [manual smoke 33963339337](https://github.com/choguun/AttestLock-Agent/actions/runs/33963339337). Six-hour scheduled smoke is enabled, not yet claimed as successfully scheduled on the final submission release.

**12:53 UTC borrower update:** the exact borrower drew **50 mUSD** through the hosted app/Rabby on release `b7e71f2`. [Draw receipt](https://creditcoin-testnet.blockscout.com/tx/0xb631739d1a05410e3ca6a26b88de068ea514cec1d18b758d8aebde49e684dba4), block **5434865**, status **1**, gas **141,434**. [Sanitized draw evidence](../evidence/borrow-2026-09-05.json) binds calldata, block hashes, all three events and historical line/profile/token deltas. Borrowed 50 − repaid 0 = outstanding 50 mUSD. This does not retroactively make the locally signed source lock a browser action.

**Scheduled monitoring update:** [schedule-triggered run 33966292097](https://github.com/choguun/AttestLock-Agent/actions/runs/33966292097) passed the actual production smoke step at 12:31 UTC on `b7e71f2`. Worker `8cf69ba0-3c19-4dd6-9078-cac29df92924` and web `d07c07ef-2237-46d1-a7a5-aff42eb41332` served that commit. This supersedes earlier current-release schedule-pending notes; a future submission SHA still needs its own successful scheduled run.

## Gate 1 — deployment provenance

- [x] Deploy MockUSDC and LockVault on Sepolia `11155111`.
- [x] Deploy MockUSD, CreditPool and AttestLockASC on Creditcoin `102031`.
- [x] Verify all five contracts publicly and confirm runtime code hashes, constructor arguments, source bindings, verifier `0x0FD2`, one-time ASC configuration, and pool liquidity.
- [x] Generate manifests using pre-broadcast CI/artifact provenance and actual receipts. Never take the current checkout SHA as retrospective deployment provenance.

## Gate 2 — positive native path

- [x] Faucet 1,000 mUSDC; approve and lock 100 mUSDC (actual term: 14 days plus approximately one hour).
- [x] Attest the exact source block; generate and sanitize the real ProofBuilder tuple.
- [x] Native `0x0FD2` execution opens exactly one 50 mUSD, seven-day line with the exact borrower/lock/query.
- [x] The borrower, not the relayer, signs the 50 mUSD draw.
- [ ] Complete faucet/approval/lock/queue/proof/draw through the hosted browser; only the first draw, not the original source actions, has browser evidence.
- [ ] After actual on-chain maturity, repay and confirm borrower accounting `borrowed - repaid == outstandingDebt`.

## Gate 3 — negative evidence

- [x] Real junk API job, matching source hash and deterministic refusal; no funded submission.
- [x] Broadcast tampered proof **while its query is unused**, verify exact native `Error("Merkle proof validation failed")` and unchanged state. The precompile reverts rather than returning false; the checker recognizes only this exact native error or the ASC false-return error.
- [x] Submit the valid proof, then broadcast its identical calldata and verify exact query-replay rejection.
- [x] Duplicate-lock protection is tested by the deterministic Foundry harness. Do not fabricate a second distinct live proof for the immutable vault's same lock.

The live checker rejects arbitrary reverted transactions: it checks calldata mutation, timing/order, receipt/event linkage, signer identity, amounts, exact maturity, replay state, token balances and profile/line invariance. It requires all transaction IDs, the real fixture and the actual junk refusal job.

## Gate 4 — public release

- [x] Hosted live web, worker liveness/readiness/current stats, CORS and exact bundle addresses.
- [ ] One successful six-hour scheduled smoke against the submission SHA.
- [ ] Public 90-second video and uncut technical appendix, with explicit time-cut/previous-example disclosures.
- [x] Refreshed and visually verified six-slide PDF/PPTX with real evidence and QR links; refresh pending fields again after their evidence exists.
- [ ] All repository, explorer, app, worker, deck and video links open logged out.
- [ ] User privately completes eligibility and personal DoraHacks fields.

## Artifact table

| Artifact                                             | Reference / disposition                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository                                    | [choguun/AttestLock-Agent](https://github.com/choguun/AttestLock-Agent)                                                                                                                                                            |
| Audited main                                         | `002546f3bce6412fc4a53db72e611b4064f9e8ef`                                                                                                                                                                                         |
| Audited main CI                                      | [33900862465](https://github.com/choguun/AttestLock-Agent/actions/runs/33900862465)                                                                                                                                                |
| Current completion PR / release CI                   | [PR #6](https://github.com/choguun/AttestLock-Agent/pull/6), [main CI 33964655735](https://github.com/choguun/AttestLock-Agent/actions/runs/33964655735), release `b7e71f2`; borrower-evidence follow-up CI pending                |
| Source/destination manifests                         | [Sepolia](../deployments/sepolia.json), [Creditcoin](../deployments/creditcoin-testnet.json); `.example.json` remains templates                                                                                                    |
| Real proof fixture and proof/draw/repayment receipts | [Executed tuple](../fixtures/proofs/creditcoin-executed-2026-09-05.json), [native transcript](../evidence/native-origination-2026-09-05.json), [draw fixture](../evidence/borrow-2026-09-05.json); post-maturity repayment pending |
| Hosted live app                                      | [Railway app](https://attestlock-web-production.up.railway.app)                                                                                                                                                                    |
| Worker                                               | [Liveness](https://attestlock-worker-production.up.railway.app/health), [readiness](https://attestlock-worker-production.up.railway.app/ready), [aggregate stats](https://attestlock-worker-production.up.railway.app/api/stats)   |
| Judge PDF/PPTX                                       | [Proof-and-draw PDF](deck/AttestLock-Hackathon-Deck-borrow.pdf), [editable PPTX](deck/AttestLock-Hackathon-Deck-borrow.pptx); six-slide package/layout/import checks passed and every PDF page visually inspected                  |
| Public videos                                        | Pending                                                                                                                                                                                                                            |

## Sanitization and publication

Only proof input bytes and public-chain facts belong in Git. Keep RPC tokens, database URLs, private keys, signed queue authorizations, raw signed outbox rows, Keychain passwords and Railway sealed-variable output out. The wallet-free `apps/web/public/evidence/verified.json` is explicitly marked `borrow-demonstrated`: its generator verifies the historical native counterpart, exact line/event, both negative reasons, unchanged invalid-path state and actual borrower draw accounting. It does not claim post-maturity repayment, complete browser onboarding, videos or submission eligibility. Replace it with explicitly `complete` full strict checker output only after the chain gates pass; missing/unknown stages are refused by the UI parser.

All unchecked live gates remain unearned regardless of local test counts or internal rubric targets.
