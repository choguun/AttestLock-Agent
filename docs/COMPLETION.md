# Audit-driven completion status

Audit branch merged through [PR #4](https://github.com/choguun/AttestLock-Agent/pull/4); Solidity deployment commit `6aec094ed321675199eaa2ff818e4a719c67a37b` has green CI. PRs #5 and [#6](https://github.com/choguun/AttestLock-Agent/pull/6) delivered native proof evidence and healthy hosted release `b7e71f2`. Current follow-up: `codex/borrow-evidence-release`. See [EVIDENCE.md](EVIDENCE.md), [LIVE_TESTNET.md](LIVE_TESTNET.md), and [CLAIMS.md](CLAIMS.md).

## Local implementation

- [x] Wallet/transaction uniqueness, migration serialization and collision reports.
- [x] Guard before async claim, renewable leases and fencing.
- [x] Receipt-first recovery, per-relayer serialization, signed outbox before broadcast.
- [x] Short persisted attestation polling and source/proof binding.
- [x] Imported official ASCBase differential harness and stateful multi-line accounting invariant.
- [x] Deterministic public errors, stale/null aggregate metrics, bounded background readiness.
- [x] REST/SSE reconciliation, session guards, pending-transaction gates, explicit authorization/repayment resume.
- [x] Selectable line history, preview write guard, replacement/cancellation reconciliation.
- [x] Wallet-free evidence view that shows unavailable rather than fabricating a proof.
- [x] Pre-deployment compiler/CI provenance and stricter calldata/revert/state evidence checker.
- [x] Fresh-clone audit release verification (100 tests, zero skips, seven browser paths), PR CI, and merge.
- [x] Infrastructure/proof-input PR #5 CI and merge; 107 tests plus seven browser paths.
- [x] Native receipt, continuity-linkage, wallet-free partial snapshot and deck follow-up CI/merge (PR #6; 111 tests, zero skips, seven browser paths).
- [x] Borrow-evidence follow-up local checks: 137 tests, zero skips, eight browser paths; exact draw checker, 22 rejection mutations, SSE slot release and proxy-boundary regressions.
- [ ] Borrow-evidence follow-up CI, fresh public clone and deployed evidence snapshot.
- [x] Real hosted borrower draw; exact historical calldata/event/token/profile checker and sanitized fixture.
- [ ] Production browser crash/replacement drill and Railway proxy-boundary confirmation.

## Fresh accounts and faucet funding

Three dedicated testnet keys were generated locally on September 5, 2026. Keystores are encrypted under the local Foundry directory; passwords are stored in macOS Keychain. Only public addresses are listed:

| Role          | Address                                      |
| ------------- | -------------------------------------------- |
| Deployer      | `0x013575D43f206930ea0b1741D45a6993dF1E2209` |
| Relayer       | `0xeD699A3FDe6C3552f312fAD2b38208b22186ef01` |
| Demo borrower | `0xdc56fd8775Fe11B8E881A300aA878EAc7Bb1637A` |

RPC checks on September 5 confirmed 0.05 Sepolia ETH and 10,000 testnet CTC at the deployer. These are free test tokens, not mainnet funds. [Sepolia faucet transaction](https://eth-sepolia.blockscout.com/tx/0x1a361933c4e42c8942c81ae0acb5c20e48c15349570e7e9df525be91da5bf582). The Creditcoin faucet bot reported success in its official Discord channel. Relayer/borrower funding, broadcasts and manifests must be recorded separately. The alternate Sepolia explorer is used because Etherscan blocks the CI link checker with HTTP 403.

`node scripts/testnet-accounts.mjs` is idempotent on these encrypted keystores. Never print the output of a Keychain password retrieval, pass a secret on a command line, commit a raw wallet, or place a key in `VITE_*`. The helper's captured pipe is for local signing only. The production relayer must be transferred directly into sealed Railway storage and kept capped.

## Live sequence (retain completed deployment steps for reproducibility)

1. Completed: green merged SHA and pre-broadcast artifact provenance.
2. Completed: all five deployed/verified, bindings/code checked, pool funded with 1,000,000 mUSD.
3. Completed: borrower funded with 0.01 Sepolia ETH and 5 CTC; relayer funded with 5 CTC and sealed in Railway. [Public records](../evidence/testnet-origination-inputs-2026-09-05.json) contain no signing material.
4. Completed: Singapore worker/PG, readiness-v2 advancement and current aggregate stats. Proxy boundary verification remains pending; arbitrary forwarded headers stay untrusted.
5. Completed: web rebuilt with preview disabled, exact live API/addresses and known non-vault refusal hash; production smoke passes.
6. Completed: unused-query tamper, valid native proof, identical-calldata query replay and unfunded junk refusal, with actual receipt/state evidence.
7. Completed: hosted borrower-signed 50 mUSD draw and sanitized draw fixture. Still run the whole browser onboarding: the first source faucet/approval/lock used the encrypted local signer.
8. Actual maturity: **September 12, 2026, 18:21:15 Bangkok**. Post-maturity evidence cannot be manufactured by changing a local clock.
9. Run the strict evidence command with every required ID/receipt; publish its output as `apps/web/public/evidence/verified.json`.
10. Refresh the six-slide deck only with verified evidence; record both public videos, disclose time cuts, and test all links logged out.
11. Six-hour smoke is enabled; [scheduled run 33966292097](https://github.com/choguun/AttestLock-Agent/actions/runs/33966292097) passed on `b7e71f2`. Require another successful scheduled run on the eventual submission SHA.
12. User privately completes eligibility/personal fields in DoraHacks before the deadline.

The observed deployment/native line are complete; score 93 and eligibility PASS are not. The first line did open on September 5; retain its real seven-day timestamp, never backdate repayment.
