# Live evidence gate

A build, mock proof, faucet transfer, or polished preview is not deployed AttestLock integration.

## Audit-driven local verification — September 5, 2026

Audit hardening merged through [PR #4](https://github.com/choguun/AttestLock-Agent/pull/4), main `6aec094ed321675199eaa2ff818e4a719c67a37b`; [merged-main CI 33959893700](https://github.com/choguun/AttestLock-Agent/actions/runs/33959893700) passed. The following 100-test measurements describe that certified deployment commit. Current follow-up branch: `codex/live-testnet-evidence`.

- `pnpm verify`: **100 tests passed, zero skips** with PostgreSQL enabled: 1 shared, 55 worker (including 8 PostgreSQL cases), 13 web, 31 Foundry.
- `pnpm test:e2e`: **7 Chromium paths passed**, including refresh during approval, lock, borrow, repayment approval, repayment, and proof processing. Wallet/API state is mocked; the separate API suite exercises real HTTP SSE transport.
- `pnpm contracts:coverage`: **99.33% lines, 99.46% statements, 87.50% branches, 100% functions** over production contracts. Test harnesses/dependencies are excluded from the denominator, not from execution. Enforced floors remain 95/93/85/90.
- Coverage retains viaIR/source-mapping warnings and a coverage-only memory-safe annotation of the upstream decoder in an isolated temporary copy. It is not production compiler provenance or a security audit. CI pins Foundry v1.7.1.
- Official differential fuzzing invokes imported `ASCBase` and compares query IDs and actual native-verifier calldata. Stateful multi-line invariants exercise 256 runs at depth 128 with no handler reverts.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities; registry failures are not ignored. The CI audit is its own independent job.
- `forge lint --root contracts`: only documented block-timestamp warnings for maturity/expiry policy and the invariant time gate.
- Production configuration tests fail closed on missing/zero live variables. Preview disables writes even with addresses present.
- Full-history secret and Markdown-link checks passed in merged-main CI. A fresh public clone passed all 100 tests with PostgreSQL (zero skips) and all seven browser paths.
- The existing PPTX/PDF are **drafts with stale counts, coverage, and preview screenshot text**. They are not final judge evidence.

## Hosted observation — September 5, 2026

Historical morning inspection reported (superseded by the later update below):

- Web preview: deployment `4695be59-8170-4620-9773-dcc039b38ba4`, Singapore, active.
- Private PostgreSQL: running with persistent volume.
- Worker: no deployment, no repository source, reserved public domain only.
- Live smoke: latest scheduled run [33950241169](https://github.com/choguun/AttestLock-Agent/actions/runs/33950241169) skipped because live configuration is not enabled.

This is a point-in-time observation, not a future uptime guarantee. Railway proxy CIDRs/header trust semantics are not yet verified for this deployment; arbitrary forwarding headers remain untrusted.

**Later September 5 update:** all contracts are deployed/verified, the real source lock and proof fixture exist, and a tampered payload reverted with unchanged state. The capped relayer is sealed in Railway. The worker now has repository source, but its first build selected the legacy root web build and failed startup. This follow-up replaces the three TOML files with an imported, no-op-verified `.railway/railway.ts`. See [LIVE_TESTNET.md](LIVE_TESTNET.md) for exact provenance, transactions and pending acceptance. Failed deployment is not liveness.

## Gate 1 — deployment provenance

- [x] Deploy MockUSDC and LockVault on Sepolia `11155111`.
- [x] Deploy MockUSD, CreditPool and AttestLockASC on Creditcoin `102031`.
- [x] Verify all five contracts publicly and confirm runtime code hashes, constructor arguments, source bindings, verifier `0x0FD2`, one-time ASC configuration, and pool liquidity.
- [x] Generate manifests using pre-broadcast CI/artifact provenance and actual receipts. Never take the current checkout SHA as retrospective deployment provenance.

## Gate 2 — positive native path

- [x] Faucet 1,000 mUSDC; approve and lock 100 mUSDC (actual term: 14 days plus approximately one hour).
- [x] Attest the exact source block; generate and sanitize the real ProofBuilder tuple.
- [ ] Native `0x0FD2` execution opens exactly one 50 mUSD, seven-day line with the exact borrower/lock/query.
- [ ] The borrower, not the relayer, signs the 50 mUSD draw.
- [ ] After actual on-chain maturity, repay and confirm borrower accounting `borrowed - repaid == outstandingDebt`.

## Gate 3 — negative evidence

- [ ] Real junk API job, matching source hash and deterministic refusal; no funded submission.
- [x] Broadcast tampered proof **while its query is unused**, verify exact native `Error("Merkle proof validation failed")` and unchanged state. The precompile reverts rather than returning false; the checker recognizes only this exact native error or the ASC false-return error.
- [ ] Submit the valid proof, then broadcast its identical calldata and verify exact query-replay rejection.
- [x] Duplicate-lock protection is tested by the deterministic Foundry harness. Do not fabricate a second distinct live proof for the immutable vault's same lock.

The live checker rejects arbitrary reverted transactions: it checks calldata mutation, timing/order, receipt/event linkage, signer identity, amounts, exact maturity, replay state, token balances and profile/line invariance. It requires all transaction IDs, the real fixture and the actual junk refusal job.

## Gate 4 — public release

- [ ] Hosted live web, worker liveness/readiness/current stats, CORS and exact bundle addresses.
- [ ] One successful six-hour scheduled smoke against the submission SHA.
- [ ] Public 90-second video and uncut technical appendix, with explicit time-cut/previous-example disclosures.
- [ ] Refreshed and visually verified six-slide PDF/PPTX with real evidence and QR links.
- [ ] All repository, explorer, app, worker, deck and video links open logged out.
- [ ] User privately completes eligibility and personal DoraHacks fields.

## Artifact table

| Artifact                                             | Reference / disposition                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository                                    | [choguun/AttestLock-Agent](https://github.com/choguun/AttestLock-Agent)                                                                                                   |
| Audited main                                         | `002546f3bce6412fc4a53db72e611b4064f9e8ef`                                                                                                                                |
| Audited main CI                                      | [33900862465](https://github.com/choguun/AttestLock-Agent/actions/runs/33900862465)                                                                                       |
| Current completion PR / release CI                   | [PR #4](https://github.com/choguun/AttestLock-Agent/pull/4), [CI 33959893700](https://github.com/choguun/AttestLock-Agent/actions/runs/33959893700); follow-up CI pending |
| Source/destination manifests                         | [Sepolia](../deployments/sepolia.json), [Creditcoin](../deployments/creditcoin-testnet.json); `.example.json` remains templates                                           |
| Real proof fixture and proof/draw/repayment receipts | [Real proof input](../fixtures/proofs/sepolia-lock-2026-09-05.json); successful proof/draw/repayment pending                                                              |
| Hosted preview                                       | [Railway preview](https://attestlock-web-production.up.railway.app)                                                                                                       |
| Worker                                               | Repository connected; first build failed, corrected configuration awaiting deploy                                                                                         |
| Judge PDF/PPTX                                       | Existing draft, superseded for submission evidence until refreshed                                                                                                        |
| Public videos                                        | Pending                                                                                                                                                                   |

## Sanitization and publication

Only proof input bytes and public-chain facts belong in Git. Keep RPC tokens, database URLs, private keys, signed queue authorizations, raw signed outbox rows, Keychain passwords and Railway sealed-variable output out. Publish the successful strict checker JSON as `apps/web/public/evidence/verified.json` for the wallet-free judge view; it currently has no verified fixture.

All unchecked live gates remain unearned regardless of local test counts or internal rubric targets.
