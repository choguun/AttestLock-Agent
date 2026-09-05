# DoraHacks submission draft

## Project

**Name:** AttestLock Agent
**Primary track:** DeFi
**Tagline:** Collateral stays on Ethereum; Creditcoin acts only on a proof.
**Logo:** https://attestlock-web-production.up.railway.app/attestlock-logo.svg

## Short description

AttestLock turns a Sepolia escrow transaction into a bounded Creditcoin credit line without moving the collateral. A worker obtains an Attestcoin proof, but the destination contract independently verifies the successful receipt, exact vault event, supported token, amount, term, and replay keys before opening 50% credit. The relayer cannot borrow; the user explicitly signs the draw.

## Problem

Bridge-based collateral movement and operator-reported collateral introduce custody or reporting assumptions. Proof-gated peers already exist; see the attributed competitor comparison. AttestLock is an auditable fixed-term credit-origination reference for lending and risk teams. That makes the reporting layer part of the solvency boundary. AttestLock replaces that assertion with an Attestcoin transaction proof verified inside Creditcoin.

## Product contribution (not a claim of unique invention)

- Attestcoin is a hard credit gate rather than a decorative data widget.
- The planned live happy/refusal paths are not submission evidence until deployed and recorded.
- The autonomous worker is operational infrastructure, not a discretionary lender.
- Credit lines are useful only after proof, while borrowing remains user-controlled.
- Each proof-opened line and real draw or repayment updates a compact, reusable Creditcoin borrower profile without issuing a transferable credential.

## Attestcoin integration

The worker waits for Sepolia block attestation and requests the official Merkle and continuity proof with `@gluwa/usc-sdk`. `AttestLockASC` sends it to BlockProver `0x0FD2`, decodes the proof-contained receipt, and validates the exact `CollateralLocked` event. Query and lock replays revert. Only the ASC can call the pool's `openLine`.

## Creditcoin ecosystem value

AttestLock demonstrates Creditcoin as a credit coordination layer for collateral already held on another chain. Its borrower profile accumulates proof-opened credit, real borrowing, repayment, and outstanding debt on Creditcoin. The production roadmap is multi-asset risk modules and Attestcoin writability for source release/default handling—not a new asset bridge.

## Safety and limitations

Testnet only. Mock assets have no value. V1 has no interest, liquidation, or trustless source-chain default handling. These omissions are explicit in the interface and threat model.

## Required links

| Field                    | URL                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository        | https://github.com/choguun/AttestLock-Agent                                                                                                                                                   |
| Hosted demo              | https://attestlock-web-production.up.railway.app                                                                                                                                              |
| Five-minute setup        | [ONBOARDING.md](ONBOARDING.md)                                                                                                                                                                |
| Competitor matrix        | [COMPETITIVE.md](COMPETITIVE.md)                                                                                                                                                              |
| Demo video               | Pending live evidence recording                                                                                                                                                               |
| Technical appendix video | Pending uncut live evidence recording                                                                                                                                                         |
| Slide deck PDF           | [Verified six-slide PDF at immutable artifact commit](https://github.com/choguun/AttestLock-Agent/blob/621744bbf3d9a6e3de9df2ce52d25320a81804d5/docs/deck/AttestLock-Hackathon-Deck-live.pdf) |
| Sepolia lock             | [100 mUSDC source lock](https://eth-sepolia.blockscout.com/tx/0xf93882f35ac789132fbe46205d699fbbb01b254862b0624e3ea20f4d11491b8f)                                                             |
| Creditcoin proof         | [Native proof opens 50 mUSD](https://creditcoin-testnet.blockscout.com/tx/0xa064d130e0aaaa4e6068e0cb2bb3f50d46bc531a004273d8dc28827ff91a05d9)                                                 |
| Creditcoin borrow        | Pending borrower-signed draw                                                                                                                                                                  |

## Team information

This is a solo `choguun` submission. The required legal name, email, short bio, role, country of residence, and country of citizenship must be entered privately in DoraHacks before submission. Optional Telegram, X, LinkedIn, and resume links may be added by the user. Do not infer or commit personal identity fields.

Do not submit until every pending field required by the [official hackathon page](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) is populated and independently opened in a clean browser session.
