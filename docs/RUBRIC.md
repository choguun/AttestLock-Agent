# Rubric and eligibility ledger

The organizer publishes requirements but no numeric weights. This repository therefore uses an internal equal-weight, five-pillar model for prioritization; it is not an official score.

## Hard eligibility

| Requirement                  | Evidence                                                         | Status                           |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Original hackathon work      | Public incremental Git history                                   | Pass                             |
| Attestcoin is a core feature | `AttestLockASC` cannot open a line without `0x0FD2` verification | Pass in code; live proof pending |
| Technical documentation      | README, architecture, integration, and threat model              | Pass                             |
| Testnet deployment           | Sepolia and Creditcoin explorer links                            | Pending funded deployment        |
| Deck or whitepaper           | Six-slide PPTX and PDF                                           | Pass                             |
| Prototype video              | Public 90-second live demo URL                                   | Pending live evidence            |

Eligibility remains **blocked** until both testnet deployment and the live proof-to-credit transaction are independently verifiable.

## Internal scoring model

| Pillar                       |   Baseline | Current verified |     Target | Remaining evidence gap                                   |
| ---------------------------- | ---------: | ---------------: | ---------: | -------------------------------------------------------- |
| Userbase Expansion           |       7/20 |            13/20 |      16/20 | Three builder interviews or pilot commitments            |
| Technical Alignment          |      14/20 |            17/20 |      19/20 | Live ProofBuilder payload and BlockProver transaction    |
| Product Vision & Innovation  |      15/20 |            18/20 |      18/20 | Target met in product, differentiation, and roadmap docs |
| Execution Capability         |      10/20 |            15/20 |      19/20 | Deployed worker, complete hosted flow, and public video  |
| Market & Technical Relevance |       7/20 |            14/20 |      16/20 | External validation of the proposed adoption wedge       |
| **Total**                    | **53/100** |       **77/100** | **88/100** |                                                          |

The current score credits only repository artifacts, passing CI, and the healthy fail-closed hosted preview. It does not award points for planned deployments, mock-only proof evidence, or an unrecorded video.

## Judge evidence map

- **One-sentence product:** Collateral stays on Ethereum; Creditcoin acts only on a proof.
- **Load-bearing integration:** a line cannot exist unless the native verifier accepts the proof and the ASC validates receipt success, exact emitter/event/token, amount, term, and replay keys.
- **Execution proof:** CI, hosted web, worker readiness, deployment manifests, explorer transactions, and a reproducible evidence transcript.
- **Visible safety:** the same interface accepts a junk transaction and deterministically refuses it without opening credit.
- **Honest boundary:** V1 cannot trustlessly liquidate or release source collateral; Attestcoin writability is roadmap work.

Official source: [BUIDL CTC 2026 Fall rules](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail).
