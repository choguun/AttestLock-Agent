# Threat model

## Protected outcomes

- No unproven, failed, malformed, stale, unsupported, or replayed source transaction opens credit.
- No relayer or third party borrows from a user's line.
- No job/API failure is displayed as an on-chain success.
- No dedicated testnet private key reaches the repository or browser bundle.

## Controls

| Threat                      | Control                                                                                                 | Residual risk                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fake transaction hash       | Transaction/receipt lookup plus on-chain proof verification                                             | Source RPC can delay classification                                    |
| Failed source call          | Receipt status checked off-chain and on-chain                                                           | None within supported receipt encoding                                 |
| Look-alike event            | Proof-contained sender/destination plus exact signature, emitter, topics, token, and data shape         | Direct EOA lock policy excludes intermediary smart wallets             |
| Tampered proof              | BlockProver precompile verification                                                                     | Attestcoin protocol/testnet assumptions                                |
| Proof replay                | One-time query ID                                                                                       | None after final destination state                                     |
| Same lock in another proof  | One-time proof-derived lock ID                                                                          | None after final destination state                                     |
| Signature reuse or swapping | EIP-712 binds wallet, tx, chain, vault, API, and expiry                                                 | Compromised borrower wallet                                            |
| Relayer abuse               | One-time typed challenge, transactional quota, IP limit                                                 | Distributed abuse across wallets and IPs                               |
| Worker crash                | Persisted signed outbox, relayer serialization, renewable leases, fencing, receipt-first reconciliation | RPC availability can delay recovery                                    |
| Browser refresh             | Pre-confirmation identity journal, receipt/REST/SSE recovery, explicit replacement checks               | Local storage can be cleared; chain and API state remain authoritative |
| Over-borrow                 | Pool checks `debt + amount <= limit`                                                                    | Mock asset has no market value                                         |
| Unauthorized borrowing      | `msg.sender == borrower`                                                                                | Compromised borrower wallet                                            |
| Maturity bypass             | Borrow rejects at or after maturity                                                                     | Debt has no liquidation mechanism                                      |
| Source collateral release   | Time-locked source withdrawal                                                                           | Destination cannot prevent post-expiry withdrawal                      |
| Stalled attestation network | ChainInfo height must exist and advance within a window                                                 | A short stall can delay readiness before it becomes stale              |
| Public metrics leakage      | Aggregate counts only; no wallet lists                                                                  | Individual jobs remain public-chain evidence                           |
| Profile misattribution      | Pool updates the line borrower after successful transfer                                                | Profile is activity accounting, not identity or creditworthiness       |

## Known limitation: no trustless liquidation

Creditcoin cannot seize or extend the Sepolia escrow in V1. The seven-day line plus one-day buffer completes before the 15-day demo lock expires, but repayment is not enforced by the source vault. This is acceptable for a mock-liquidity proof of concept, not production lending.

A production design requires Attestcoin writability or another authenticated source-chain control to release collateral on repayment and route it on default. The submission must describe that as roadmap work.

## Operational residual risks

- Signed outbox transactions are private operational data, never API evidence. A party with database access could broadcast the already-authorized proof, but cannot change its signed calldata.
- Cleared browser storage or an unavailable legacy transaction identity can require manual explorer recovery; unknown pending work is not automatically rebroadcast.
- Railway proxy CIDRs must be verified before enabling forwarded-IP trust. The default does not trust arbitrary headers; it can conservatively share a quota across an ingress proxy.
- Dependency readiness does not prove chain finality, solvency, liquidation, or permanent RPC availability.

## Key handling

- Use separate funded testnet deployer, relayer, and demo-borrower wallets. Local keys are encrypted; passwords are stored in the OS Keychain, not command arguments.
- Seal the relayer key in Railway; never prefix it with `VITE_`.
- Keep deployer keys out of hosted services after deployment.
- Rotate the relayer after the event and cap its native balance.
- Never use production or mainnet credentials.
