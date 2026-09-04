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

## Creditcoin-native value

Creditcoin's [Credal case study](https://creditcoin.org/Credal) presents authenticated loan transactions and accumulated on-chain credit history as infrastructure for future financial access. AttestLock contributes a deliberately smaller primitive: a profile of proof-opened lines, real draws, repayments, and outstanding debt on Creditcoin. It is evidence for later risk modules, not a score or a promise of repayment.

The protocol fit is direct rather than inferred from a generic interoperability narrative. Creditcoin's [official architecture overview](https://docs.creditcoin.org/usc/overview/usc-architecture-overview) describes native `0x0FD2` verification of external transactions followed by application-specific Creditcoin logic, and uses cross-chain lending as its example. Its [builder infrastructure guide](https://docs.creditcoin.org/usc/dapp-builder-infrastructure/infrastructure-overview) separates the source contract, off-chain worker, universal smart contract, and destination business logic—the same trust-boundary split used here.

## Adoption loop

1. Use the [five-minute onboarding path](ONBOARDING.md) and reusable collateral-event schema.
2. Measure the aggregate public funnel: authorized wallet → proof job → execution/refusal. Do not publish wallet lists.
3. Measure wallet connection and borrower-draw conversion only after privacy-safe product analytics exist.
4. Add collateral adapters only after one live end-to-end policy is reliable and observable.
5. Feed proof-backed draw and repayment history into Creditcoin-native risk modules.

The ecosystem loop is direct: collateral activity from external chains creates verifiable Creditcoin credit lines, transactions, borrowers, and repayment history without requiring the asset itself to migrate.

See [competitive positioning](COMPETITIVE.md) for a dated, primary-source comparison with current BUIDL CTC projects. External interviews and outreach are outside this submission; the lack of customer validation remains explicit.
