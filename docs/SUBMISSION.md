# DoraHacks submission draft

## Project

**Name:** AttestLock Agent
**Primary track:** DeFi
**Tagline:** Collateral stays on Ethereum; Creditcoin acts only on a proof.

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

| Field             | URL                             |
| ----------------- | ------------------------------- |
| Public repository | Pending repository creation     |
| Hosted demo       | Pending Railway deployment      |
| Demo video        | Pending live evidence recording |
| Slide deck PDF    | Pending final export            |
| Sepolia lock      | Pending funded deployment       |
| Creditcoin proof  | Pending funded deployment       |
| Creditcoin borrow | Pending funded deployment       |

Do not submit until every pending field required by the [official hackathon page](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) is populated and independently opened in a clean browser session.
