# Market and ecosystem thesis

## Initial user

The first user is a testnet lending or risk team that wants to extend credit against collateral held on another chain without taking bridge custody or trusting one oracle signer. The first integration wedge is intentionally narrow: one escrow contract, one supported asset, and one deterministic policy that can be audited end to end.

## Why it is different

| Alternative                 | What the lender trusts                 | AttestLock distinction                                               |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Asset bridge                | Bridge custody and validator set       | Collateral remains in the source vault                               |
| Centralized oracle/API      | Operator identity and uptime           | Creditcoin verifies proof inclusion and policy on-chain              |
| Reputation-only credit      | Historical behavior as a proxy         | The line is bounded by a newly proven capital lock                   |
| Generic cross-chain message | Message origin plus application policy | Exact successful receipt and lock economics are part of the ASC gate |

AttestLock does not claim that proof alone solves liquidation. The product value today is verifiable origination; authenticated repayment release and default handling require Attestcoin writability or another explicit source-control mechanism.

## Adoption loop

1. Publish a five-minute integration path and a reusable collateral-event schema.
2. Recruit three Creditcoin testnet lending or risk builders for structured feedback.
3. Measure wallet connection, successful lock, proof completion time, line opening, and borrower draw conversion.
4. Add collateral adapters only after one end-to-end policy is reliable and observable.
5. Feed proof-backed repayment history into Creditcoin-native risk modules.

The ecosystem loop is direct: collateral activity from external chains creates verifiable Creditcoin credit lines, transactions, borrowers, and repayment history without requiring the asset itself to migrate.
