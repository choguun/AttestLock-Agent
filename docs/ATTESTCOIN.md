# Attestcoin integration

This document identifies exactly where Attestcoin is required and how a source-chain fact becomes a Creditcoin credit line.

## Proven fact

The source fact is one successful Sepolia log emitted by the registered `LockVault`:

```solidity
event CollateralLocked(
    bytes32 indexed lockId,
    address indexed borrower,
    address indexed token,
    uint256 amount,
    uint64 unlockAt
);
```

The supported token is the deployed six-decimal `MockUSDC`. The source vault enforces at least `100e6` units and at least 14 days at lock time. The browser uses 15 days so attestation latency does not consume the destination safety margin.

## Worker path

1. Fetch the transaction receipt from Sepolia.
2. Refuse a missing or failed receipt, wrong `to`, wrong emitter, wrong event, wrong borrower, wrong token, small amount, or insufficient remaining term.
3. Call `ProofBuilder.waitUntilHeightAttested(1, blockNumber, 15_000, 1_200_000)`.
4. Call `ProofBuilder.getProof(txHash)` using `@gluwa/usc-sdk@0.18.0`.
5. Convert the official result into the seven arguments expected by `verifyLockAndOpenLine`.
6. Run `eth_call` preflight against the exact relayer call.
7. Broadcast only if simulation succeeds.

Preflight is a cost and operations control, not the trust boundary. The destination contract repeats all material validation.

## On-chain verification

`AttestLockASC.verifyLockAndOpenLine` requires `chainKey == 1`, constructs the official Merkle and continuity structs, and calls the Creditcoin BlockProver precompile through `INativeQueryVerifier` at:

```text
0x0000000000000000000000000000000000000FD2
```

The contract intentionally calls the official verifier ABI directly instead of inheriting generic `ASCBase.execute`. The current base hook receives the action, query ID, and encoded transaction but not `chainKey`; AttestLock must reject every non-Sepolia proof before business logic. Differential tests keep its proof tuple and query-ID packing aligned with the official base implementation.

It then decodes the proof-contained transaction with `EvmV1Decoder` and checks:

- supported Ethereum transaction type;
- receipt status equals `1`;
- exactly one matching event signature;
- exact registered vault emitter;
- exactly four event topics and exactly 64 data bytes;
- exact registered token;
- collateral at least `100 mUSDC`;
- remaining collateral term covers seven-day maturity plus one-day buffer.

Only after all checks pass does the ASC call `CreditPool.openLine` with a `50%` limit.

## Replay protection

Two independent keys are one-time:

- `queryId = keccak256(abi.encodePacked(uint256(chainKey), blockHeight, txIndex))`;
- proof-derived `lockId` from the vault event.

A repeated proof fails before line creation. A different proof that contains an already-used lock also fails. The worker treats a previously emitted success for the same lock as idempotent completion rather than broadcasting again.

## Live evidence

The following must remain blank until verified on live testnets:

| Evidence                        | Value                     |
| ------------------------------- | ------------------------- |
| Sepolia lock transaction        | Pending funded deployment |
| Proof Builder payload fixture   | Pending attestation       |
| Creditcoin proof transaction    | Pending funded deployment |
| Creditcoin borrower transaction | Pending funded deployment |

Use [EVIDENCE.md](EVIDENCE.md) to capture the sanitized fixture, timestamps, addresses, and explorer links.

## Primary references

- [Official Attestcoin protocol examples](https://github.com/gluwa/attestcoin-protocol-examples)
- [Attestcoin documentation](https://docs.attestcoin.org/)
- [Creditcoin testnet Blockscout](https://creditcoin-testnet.blockscout.com/)
