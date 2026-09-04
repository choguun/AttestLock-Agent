# Architecture

## Components and trust boundaries

```text
Borrower wallet
  │ faucet / approve / lock                    │ borrow / repay
  ▼                                             ▼
Sepolia                                    Creditcoin testnet
MockUSDC → LockVault                       AttestLockASC → CreditPool → MockUSD
             │ event                             ▲              ▲
             ▼                                   │ proof        │ onlyASC
        Worker + API ── Proof Builder ───────────┘              │
             │                                                   │
          PostgreSQL                                    borrower signature
```

The wallet is the only component authorized to lock, withdraw, borrow, or approve repayment. Queue authorization uses EIP-712 data bound to the wallet, exact transaction hash, Sepolia chain, source vault, API origin, nonce, and expiry. The worker holds a dedicated testnet relayer key whose only intended action is proof submission. The proof verifier—not the worker database or UI—is authoritative for opening credit.

## State machines

### Source lock

`uncreated → active → withdrawn_after_expiry`

### Proof job

`queued → waiting_attestation → proving → preflight → submitting → executed`

Policy failures terminate in `refused`. Exhausted infrastructure retries terminate in `failed`. On process restart, in-flight states return to `queued`; on-chain replay checks make resubmission safe.

### Credit line

`unopened → open → matured`, with repayment available while open or matured. V1 has no interest or liquidation.

## Invariants

1. A line cannot exist without a successful BlockProver call and exact event validation.
2. One proof query and one lock can open at most one line.
3. `debt <= limit` at all times.
4. Only the recorded borrower can increase debt.
5. Maturity stops new borrowing but never blocks repayment.
6. The worker cannot move borrower funds.

## Operational design

- Versioned PostgreSQL migrations persist challenges, jobs, attempts, evidence, and retry schedule.
- The target deployment is one Railway worker replica in Singapore. Atomic row claiming remains safe if a second replica is introduced.
- Transient failures retry after 5, 30, and 120 seconds, then fail closed.
- Typed challenges expire after a short window, authorize one transaction, and are consumed once.
- Transactional per-wallet quotas and IP rate limits bound relayer spend.
- A submitted Creditcoin transaction hash is persisted before confirmation and reconciled on restart.
- SSE gives the browser immediate updates; REST remains the recovery path.

## Intentionally excluded from V1

Native ETH, multiple collateral assets, price oracles, interest, liquidation, batch proofs, Attestcoin writability, mainnet, automatic borrowing, and LLM-driven financial decisions are outside the shipped boundary.
