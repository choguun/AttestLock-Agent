# Rubric and eligibility ledger

The organizer publishes requirements but no numeric weights. This repository therefore uses an internal equal-weight, five-pillar model for prioritization; it is not an official score.

## Hard eligibility

| Requirement                  | Evidence                                                         | Status                           |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Original hackathon work      | Public incremental Git history                                   | Pass                             |
| Attestcoin is a core feature | `AttestLockASC` cannot open a line without `0x0FD2` verification | Pass in code; live proof pending |
| Technical documentation      | README, architecture, integration, and threat model              | Pass                             |
| Testnet deployment           | Sepolia and Creditcoin explorer links                            | Pending live deployment          |
| Deck or whitepaper           | Six-slide PPTX and PDF                                           | Pass                             |
| Prototype video              | Public 90-second live demo URL                                   | Pending live evidence            |

Eligibility remains **blocked** until both testnet deployment and the live proof-to-credit transaction are independently verifiable.

## Internal scoring model

| Pillar                       |   Baseline | Current verified |     Target | Remaining evidence gap                                                 |
| ---------------------------- | ---------: | ---------------: | ---------: | ---------------------------------------------------------------------- |
| Userbase Expansion           |       7/20 |            14/20 |      16/20 | Public live onboarding and nonzero aggregate usage                     |
| Technical Alignment          |      14/20 |            19/20 |      20/20 | Native `0x0FD2` transaction, verified bytecode, and real proof fixture |
| Product Vision & Innovation  |      15/20 |            19/20 |      19/20 | Target met by bounded line plus reusable on-chain borrower profile     |
| Execution Capability         |      10/20 |            18/20 |      20/20 | Live worker/hosted flow, scheduled smoke result, and two public videos |
| Market & Technical Relevance |       7/20 |            17/20 |      18/20 | Replace research-only assumptions with observed live funnel evidence   |
| **Total**                    | **53/100** |       **87/100** | **93/100** | Six points remain behind live, independently verifiable acceptance     |

The current score credits proof-contained transaction hardening, borrower profiles, first-observation-fails-closed ChainInfo readiness, binding checks, aggregate on-chain stats, measured coverage floors, real SSE API tests, transaction-journal refresh recovery, and primary-source competitor research. It does not award points for planned deployments, mock-only proof evidence, an inactive scheduled smoke, or unrecorded videos.

## Judge evidence map

- **One-sentence product:** Collateral stays on Ethereum; Creditcoin acts only on a proof.
- **Load-bearing integration:** a line cannot exist unless the native verifier accepts the proof and the ASC validates receipt success, exact emitter/event/token, amount, term, and replay keys.
- **Execution proof:** CI, hosted web, worker readiness, deployment manifests, explorer transactions, and a reproducible evidence transcript.
- **Visible safety:** the same interface accepts a junk transaction and deterministically refuses it without opening credit.
- **Honest boundary:** V1 cannot trustlessly liquidate or release source collateral; Attestcoin writability is roadmap work.

## Artifact map for the 93 target

| Evidence                                                                                     | Repository artifact                                             | Live status                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Borrower profile accounting and invariants                                                   | `CreditPool.sol`, Foundry tests, public ABI, wallet UI          | Verified locally                                                  |
| ChainInfo registration, advancing height, ProofBuilder, RPC, bytecode, and relayer readiness | worker `/ready` and adapter tests                               | Verified locally; production pending                              |
| Aggregate adoption evidence without wallet-list leakage                                      | worker `/api/stats` and API tests                               | Verified locally; live counts pending                             |
| Full wallet and refusal journey                                                              | Playwright E2E with injected EIP-1193 provider and mocked API   | Verified SSE progression and mid-proof reload; live chain pending |
| Production monitor                                                                           | scheduled/manual `live-smoke.yml` plus immutable binding checks | Implemented; deliberately inactive until live variables exist     |
| Native proof, draw, rejection, and replay                                                    | sanitized manifest, fixture, transcript, explorer URLs          | Pending                                                           |
| Submission and technical appendix videos                                                     | public unauthenticated URLs                                     | Pending                                                           |

Official source: [BUIDL CTC 2026 Fall rules](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail).
