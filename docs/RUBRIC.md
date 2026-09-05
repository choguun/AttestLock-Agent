# Rubric and eligibility ledger

This is an internal equal-weight planning model of five AMA pillars, not organizer scoring or a prediction of winning. Audit baseline: clean main `002546f`, September 5, 2026. Local hardening does not automatically earn live-delivery points.

| Pillar                       | Evidence-adjusted baseline |     Target | Evidence needed to earn the target                                                                                |
| ---------------------------- | -------------------------: | ---------: | ----------------------------------------------------------------------------------------------------------------- |
| Userbase Expansion           |                      13/20 |      16/20 | Public functional path, five-minute setup, honestly labelled aggregate activity                                   |
| Technical Alignment          |                      18/20 |      20/20 | Verified contracts, native `0x0FD2` proof, real fixture, immutable bindings                                       |
| Product Vision & Innovation  |                      17/20 |      19/20 | Auditable fixed-term origination, reusable borrower accounting, credible differentiation from Unbridged and Spark |
| Execution Capability         |                      16/20 |      20/20 | Hosted worker and wallet flow, crash/replacement recovery, scheduled smoke and public videos                      |
| Market & Technical Relevance |                      16/20 |      18/20 | Primary-source positioning plus observed protocol usage, without invented validation                              |
| **Total**                    |                 **80/100** | **93/100** | Re-score only from the release's evidence ledger                                                                  |

The previous 87/100 claim is withdrawn: it overcredited recovery, operational reliability, and differentiation. The audit-driven branch repairs those gaps, but its code, CI, hosted deployment, and live-chain outcomes remain distinct evidence layers.

## Hard eligibility

| Requirement                                       | Artifact                                                                 | Current disposition                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Original hackathon work and redistribution rights | Incremental history, MIT original code, attributed dependencies/research | Original code present; historical copied research rights review still pending |
| Meaningful Attestcoin integration                 | ASC proof gate, official differential harness                            | Code/tests present; native execution pending                                  |
| Creditcoin testnet deployment                     | Actual manifests and explorer bytecode verification                      | Pending                                                                       |
| Technical documentation                           | README, architecture, integration, threat model, claim ledger            | Present; active claims reconciled with explicit limits                        |
| PDF deck or whitepaper                            | Six-slide draft PDF/PPTX                                                 | Draft has stale counts/screenshot; final refresh pending                      |
| Prototype video                                   | Public 90-second demonstration                                           | Pending                                                                       |

**Submission readiness: FAIL.** Documentation and a polished preview do not substitute for working deployed integration. All mandatory fields and public links must be checked in a clean browser before submission.

## Exact evidence map

- Contract policy: [AttestLockASC.sol](../contracts/src/creditcoin/AttestLockASC.sol), [policy tests](../contracts/test/AttestLockASC.t.sol).
- Actual official-base comparison: [OfficialDifferential.t.sol](../contracts/test/OfficialDifferential.t.sol).
- Stateful credit accounting: [ProfileInvariant.t.sol](../contracts/test/ProfileInvariant.t.sol).
- Recovery/security: [worker regressions](../apps/worker/src/recovery.test.ts), [submission recovery](../apps/worker/src/submission-recovery.test.ts), [PostgreSQL integration](../apps/worker/src/store.pg.test.ts).
- User flow: [browser tests](../e2e/attestlock.spec.ts), [journal tests](../apps/web/src/transaction-journal.test.ts).
- Claim scope and live gates: [CLAIMS.md](CLAIMS.md), [EVIDENCE.md](EVIDENCE.md), [COMPLETION.md](COMPLETION.md).
- Research-only market rationale: [MARKET.md](MARKET.md), [COMPETITIVE.md](COMPETITIVE.md).

## Scoring guardrails

On-chain wallet counts are not independent people, interviews, pilots, or market validation. A borrower profile is accounting, not an identity or solvency score. The source vault cannot enforce destination default; no interest, liquidation, or authenticated release ships in V1. The six-hour smoke workflow earns operational evidence only when enabled and successfully run against the release SHA.

Official authority: [DoraHacks rules](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail). Deadline: September 13, 2026, 23:59 ET (September 14, 10:59 Bangkok); winner announcement: September 20.
