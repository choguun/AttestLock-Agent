# Rubric and eligibility ledger

This is an internal equal-weight planning model of five AMA pillars, not organizer scoring or a prediction of winning. Audit baseline: clean main `002546f`, September 5, 2026. Updated observation: native origination, borrower-signed draw and successful scheduled smoke on Railway release `b7e71f2`; local hardening does not automatically earn live-delivery points.

| Pillar                       |   Baseline | Evidence-adjusted now |     Target | Basis and remaining gap                                                                                                                               |
| ---------------------------- | ---------: | --------------------: | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Userbase Expansion           |         13 |                    14 |         16 | Live app/aggregate endpoint and onboarding; no independent users or completed browser onboarding evidence yet                                         |
| Technical Alignment          |         18 |                    20 |         20 | Five verified contracts, successful native `0x0FD2`, real executed tuple, bindings, fail-closed native rejection                                      |
| Product Vision & Innovation  |         17 |                    19 |         19 | Real bounded line, borrower-controlled draw, token movement and reusable profile accounting; post-maturity repayment still pending                    |
| Execution Capability         |         16 |                    18 |         20 | Green CI, live worker/web, native proof, browser draw, negative receipts and scheduled smoke; full browser onboarding, maturity and media still gated |
| Market & Technical Relevance |         16 |                    17 |         18 | Attributed primary-source competitor/strategy research and observable operator activity; no interviews, pilots or validated adoption                  |
| **Total**                    | **80/100** |            **88/100** | **93/100** | Actual draw earns one product point; future gates do not                                                                                              |

The earlier preview-only 87/100 claim was withdrawn. Native origination and healthy hosting subsequently supported a distinct 87/100 estimate; the verified borrower draw moves that internal estimate to 88/100. It is still below the target, and no score guarantees placement. See [the dated live ledger](LIVE_TESTNET.md). Test-count increases alone do not earn points, and one operator wallet is not adoption validation.

## Hard eligibility

| Requirement                                       | Artifact                                                                 | Current disposition                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Original hackathon work and redistribution rights | Incremental history, MIT original code, attributed dependencies/research | Original code present; historical copied research rights review still pending |
| Meaningful Attestcoin integration                 | ASC proof gate, official differential harness, actual native receipt     | Verified live proof opened exactly one 50% line                               |
| Creditcoin testnet deployment                     | Actual manifests and explorer bytecode verification                      | All five deployed/verified from green main; see LIVE_TESTNET.md               |
| Technical documentation                           | README, architecture, integration, threat model, claim ledger            | Present; active claims reconciled with explicit limits                        |
| PDF deck or whitepaper                            | Six-slide live-origination PDF/PPTX                                      | Refreshed and visually checked; unfinished gates explicit                     |
| Prototype video                                   | Public 90-second demonstration                                           | Pending                                                                       |

**Submission readiness: FAIL.** Native integration and deployment are now observed, but the prototype video, final browser/media acceptance and private eligibility fields remain incomplete. All mandatory fields and public links must be checked in a clean browser before submission.

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
