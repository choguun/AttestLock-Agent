# Live evidence gate

A build, mock proof, faucet transfer, or polished preview is not deployed AttestLock integration.

## Audit-driven local verification — September 5, 2026

Branch `codex/audit-driven-completion`, based on clean main `002546f3bce6412fc4a53db72e611b4064f9e8ef`. These measurements describe the implementation in this change; its exact release SHA and GitHub CI must be recorded after commit.

- `pnpm verify`: **100 tests passed, zero skips** with PostgreSQL enabled: 1 shared, 55 worker (including 8 PostgreSQL cases), 13 web, 31 Foundry.
- `pnpm test:e2e`: **7 Chromium paths passed**, including refresh during approval, lock, borrow, repayment approval, repayment, and proof processing. Wallet/API state is mocked; the separate API suite exercises real HTTP SSE transport.
- `pnpm contracts:coverage`: **99.33% lines, 99.46% statements, 87.50% branches, 100% functions** over production contracts. Test harnesses/dependencies are excluded from the denominator, not from execution. Enforced floors remain 95/93/85/90.
- Coverage retains viaIR/source-mapping warnings and a coverage-only memory-safe annotation of the upstream decoder in an isolated temporary copy. It is not production compiler provenance or a security audit. CI pins Foundry v1.7.1.
- Official differential fuzzing invokes imported `ASCBase` and compares query IDs and actual native-verifier calldata. Stateful multi-line invariants exercise 256 runs at depth 128 with no handler reverts.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities; registry failures are not ignored. The CI audit is its own independent job.
- `forge lint --root contracts`: only documented block-timestamp warnings for maturity/expiry policy and the invariant time gate.
- Production configuration tests fail closed on missing/zero live variables. Preview disables writes even with addresses present.
- Full-history secret and Markdown-link checks are configured in CI; local binaries are unavailable. Do not infer they passed from other tests.
- The existing PPTX/PDF are **drafts with stale counts, coverage, and preview screenshot text**. They are not final judge evidence.

## Hosted observation — September 5, 2026

Railway CLI inspection still reports:

- Web preview: deployment `4695be59-8170-4620-9773-dcc039b38ba4`, Singapore, active.
- Private PostgreSQL: running with persistent volume.
- Worker: no deployment, no repository source, reserved public domain only.
- Live smoke: latest scheduled run [33950241169](https://github.com/choguun/AttestLock-Agent/actions/runs/33950241169) skipped because live configuration is not enabled.

This is a point-in-time observation, not a future uptime guarantee. Railway proxy CIDRs/header trust semantics are not yet verified for this deployment; arbitrary forwarding headers remain untrusted.

## Gate 1 — deployment provenance

- [ ] Deploy MockUSDC and LockVault on Sepolia `11155111`.
- [ ] Deploy MockUSD, CreditPool and AttestLockASC on Creditcoin `102031`.
- [ ] Verify all five contracts publicly and confirm runtime code hashes, constructor arguments, source bindings, verifier `0x0FD2`, one-time ASC configuration, and pool liquidity.
- [ ] Generate manifests using pre-broadcast CI/artifact provenance and actual receipts. Never take the current checkout SHA as retrospective deployment provenance.

## Gate 2 — positive native path

- [ ] Faucet 1,000 mUSDC; approve and lock 100 mUSDC for 15 days.
- [ ] Attest the exact source block; generate and sanitize the real ProofBuilder tuple.
- [ ] Native `0x0FD2` execution opens exactly one 50 mUSD, seven-day line with the exact borrower/lock/query.
- [ ] The borrower, not the relayer, signs the 50 mUSD draw.
- [ ] After actual on-chain maturity, repay and confirm borrower accounting `borrowed - repaid == outstandingDebt`.

## Gate 3 — negative evidence

- [ ] Real junk API job, matching source hash and deterministic refusal; no funded submission.
- [ ] Broadcast tampered proof **while its query is unused**, verify exact verifier-failure selector and unchanged state.
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

| Artifact                                             | Reference / disposition                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Public repository                                    | [choguun/AttestLock-Agent](https://github.com/choguun/AttestLock-Agent)             |
| Audited main                                         | `002546f3bce6412fc4a53db72e611b4064f9e8ef`                                          |
| Audited main CI                                      | [33900862465](https://github.com/choguun/AttestLock-Agent/actions/runs/33900862465) |
| Current completion PR / release CI                   | Pending delivery of this branch                                                     |
| Source/destination manifests                         | Pending actual deployment; `.example.json` files are templates                      |
| Real proof fixture and proof/draw/repayment receipts | Pending                                                                             |
| Hosted preview                                       | [Railway preview](https://attestlock-web-production.up.railway.app)                 |
| Worker                                               | Reserved domain; no active deployment                                               |
| Judge PDF/PPTX                                       | Existing draft, superseded for submission evidence until refreshed                  |
| Public videos                                        | Pending                                                                             |

## Sanitization and publication

Only proof input bytes and public-chain facts belong in Git. Keep RPC tokens, database URLs, private keys, signed queue authorizations, raw signed outbox rows, Keychain passwords and Railway sealed-variable output out. Publish the successful strict checker JSON as `apps/web/public/evidence/verified.json` for the wallet-free judge view; it currently has no verified fixture.

All unchecked live gates remain unearned regardless of local test counts or internal rubric targets.
