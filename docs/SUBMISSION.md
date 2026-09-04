# DoraHacks submission draft

## Project

**Name:** AttestLock Agent
**Primary track:** DeFi
**Tagline:** Collateral stays on Ethereum; Creditcoin acts only on a proof.
**Logo:** https://attestlock-web-production.up.railway.app/attestlock-logo.svg

## Short description

AttestLock turns a Sepolia escrow transaction into a bounded Creditcoin credit line without moving the collateral. A worker obtains an Attestcoin proof, but the destination contract independently verifies the successful receipt, exact vault event, supported token, amount, term, and replay keys before opening 50% credit. The relayer cannot borrow; the user explicitly signs the draw.

## Problem

Cross-chain lenders usually trust a bridge, oracle signer, or centralized operator to report collateral. That makes the reporting layer part of the solvency boundary. AttestLock replaces that assertion with an Attestcoin transaction proof verified inside Creditcoin.

## What is new

- Attestcoin is a hard credit gate rather than a decorative data widget.
- Both the happy path and a visible refusal path are judge-testable.
- The autonomous worker is operational infrastructure, not a discretionary lender.
- Credit lines are useful only after proof, while borrowing remains user-controlled.

## Attestcoin integration

The worker waits for Sepolia block attestation and requests the official Merkle and continuity proof with `@gluwa/usc-sdk`. `AttestLockASC` sends it to BlockProver `0x0FD2`, decodes the proof-contained receipt, and validates the exact `CollateralLocked` event. Query and lock replays revert. Only the ASC can call the pool's `openLine`.

## Creditcoin ecosystem value

AttestLock demonstrates Creditcoin as a credit coordination layer for collateral already held on another chain. The production roadmap is multi-asset risk modules, credit history, and Attestcoin writability for source release/default handling—not a new asset bridge.

## Safety and limitations

Testnet only. Mock assets have no value. V1 has no interest, liquidation, or trustless source-chain default handling. These omissions are explicit in the interface and threat model.

## Required links

| Field             | URL                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Public repository | https://github.com/choguun/AttestLock-Agent                                                   |
| Hosted demo       | https://attestlock-web-production.up.railway.app                                              |
| Demo video        | Pending live evidence recording                                                               |
| Slide deck PDF    | https://github.com/choguun/AttestLock-Agent/blob/main/docs/deck/AttestLock-Hackathon-Deck.pdf |
| Sepolia lock      | Pending funded deployment                                                                     |
| Creditcoin proof  | Pending funded deployment                                                                     |
| Creditcoin borrow | Pending funded deployment                                                                     |

## Team information

This is a solo `choguun` submission. The required legal name, email, short bio, role, country of residence, and country of citizenship must be entered privately in DoraHacks before submission. Optional Telegram, X, LinkedIn, and resume links may be added by the user. Do not infer or commit personal identity fields.

Do not submit until every pending field required by the [official hackathon page](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) is populated and independently opened in a clean browser session.
