# AttestLock Agent — delivery plan and status

**Hackathon:** BUIDL CTC 2026 Fall · primary track DeFi
**Extended deadline:** September 13, 2026 at 23:59 ET / September 14 at 10:59 Asia/Bangkok
**Internal target:** submit one day early

## Product bet

Lock `100 mUSDC` on Sepolia, prove the exact successful escrow transaction with Attestcoin, open a 50% seven-day Creditcoin line, and let only the borrower draw it. A junk transaction must visibly fail closed.

## Scope

Shipped in code:

- six-decimal one-time-faucet `MockUSDC` and expiring `LockVault`;
- official-ABI `AttestLockASC`, replay protection, exact receipt/event policy;
- ASC-only `CreditPool`, six-decimal `MockUSD`, borrower-only borrow, open repayment;
- reusable Creditcoin borrower profile updated only by proof-opened lines, draws, and repayments;
- tx-bound EIP-712 worker API, case-insensitive transaction uniqueness, transactional quotas, PostgreSQL migrations, scale-safe claims, bounded-range restart reconciliation, deterministic refusals, retries, preflight, and SSE;
- responsive wallet UI for source flow, transaction-journal refresh recovery, proof evidence, refusal, borrow, repay, profiles, and aggregate activity;
- ChainInfo/prover/relayer readiness, production smoke, browser E2E, CI, deployment-manifest generation, clean-clone verification, and judge documentation.

Explicitly excluded: native ETH, multiple assets, price oracles, interest, liquidation, batch proofs, source-chain writability, mainnet, automatic borrowing, and LLM financial decisions.

## Evidence gates

- [x] Contracts compile and automated proof/pool tests pass.
- [x] Worker and UI type-check, test, and production-build locally.
- [x] PostgreSQL integration tests, browser E2E, accessibility scan, and Foundry coverage run locally.
- [x] ChainInfo chain registration, active/advancing attestation, ProofBuilder, bytecode, and relayer funding are required by readiness.
- [x] Aggregate-only public statistics and reusable borrower profile are implemented.
- [x] Live deployment scripts and sanitized manifests exist.
- [x] Public GitHub repository and green baseline CI; the completion branch must pass its own PR run before merge.
- [ ] Sepolia and Creditcoin testnet deployments.
- [ ] One live proof-to-line-to-borrow transcript.
- [ ] Junk, tampered-proof, and replay live evidence.
- [x] Railway project, Singapore web preview, worker skeleton, and private PostgreSQL. Worker activation awaits live addresses and relayer credentials.
- [x] Visually verified six-slide PPTX/PDF with target user, distribution, ecosystem value, credibility, and roadmap.
- [ ] Recorded 90-second live demo.
- [ ] DoraHacks submission.

No unchecked evidence gate may be described as complete. See `docs/EVIDENCE.md` for the exact live-chain acceptance criteria.

## Schedule

| Date     | Exit criterion                                    |
| -------- | ------------------------------------------------- |
| Sep 3–4  | Public baseline, contracts, security tests        |
| Sep 5    | Worker, persistence, proof adapter                |
| Sep 5    | First real Sepolia → Creditcoin proof/line        |
| Sep 7–8  | Borrow/repay UI and Railway judge path            |
| Sep 9–10 | Negative paths, restart, clean-room test          |
| Sep 11   | Documentation and deck                            |
| Sep 12   | Post-maturity repayment, videos, submission draft |
| Sep 13   | Freeze, smoke test, submit                        |
