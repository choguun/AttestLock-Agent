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

1. Reconcile any persisted destination submission first, even if the source RPC is unavailable or the lock has since expired. Otherwise fetch the source transaction and receipt.
2. Refuse a missing or failed receipt, wrong `to`, wrong emitter, wrong event, wrong borrower, wrong token, small amount, or insufficient remaining term.
3. Confirm ChainInfo binds chain key `1` to Sepolia `11155111`, exposes an attestation, and keeps advancing within the configured freshness window.
4. Sample native ChainInfo in short steps. If the source height is not attested, persist a delayed queue state and release the worker lease. Repeat without exhausting proof-generation retries.
5. Call `ProofBuilder.getProof(txHash)` using `@gluwa/usc-sdk@0.18.0`, then reject a response for another chain key, block, or transaction hash. Canonical proof-contained common fields and receipt bytes must match the requested source lock.
6. Convert the official result into the seven arguments expected by `verifyLockAndOpenLine`.
7. Run `eth_call` preflight against the exact relayer call.
8. Require fresh readiness, then serialize the relayer, sign, and atomically persist signed bytes plus their hash before broadcast. Receipt uncertainty only reconciles that exact signed transaction.

Preflight is a cost and operations control, not the trust boundary. The destination contract repeats all material validation.

## On-chain verification

`AttestLockASC.verifyLockAndOpenLine` requires `chainKey == 1`, constructs the official Merkle and continuity structs, and calls the Creditcoin BlockProver precompile through `INativeQueryVerifier` at:

```text
0x0000000000000000000000000000000000000FD2
```

The contract intentionally calls the official verifier ABI directly instead of inheriting generic `ASCBase.execute`. The current base hook receives the action, query ID, and encoded transaction but not `chainKey`; AttestLock must reject every non-Sepolia proof before business logic. `contracts/test/OfficialDifferential.t.sol` imports the actual official base and compares both its query ID and recorded verifier calldata with AttestLock over fuzzed heights, indexes, and proof paths.

It then decodes the proof-contained transaction with `EvmV1Decoder` and checks:

- supported Ethereum transaction type;
- non-null destination equal to the immutable source vault;
- transaction sender equal to the event borrower;
- receipt status equals `1`;
- exactly one matching event signature;
- exact registered vault emitter;
- exactly four event topics and exactly 64 data bytes;
- exact registered token;
- collateral at least `100 mUSDC`;
- remaining collateral term covers seven-day maturity plus one-day buffer.

Only after all checks pass does the ASC call `CreditPool.openLine` with a `50%` limit.

The worker records attested height/time, proof-generation time, destination block, gas used, and total processing duration. A successful receipt is not called `executed` unless it contains exactly one matching ASC event and the pool line plus both replay flags agree. Those fields are operational evidence; the proof and destination state remain authoritative.

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
