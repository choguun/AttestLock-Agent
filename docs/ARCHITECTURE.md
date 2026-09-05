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

Each source lock and draw requires its owner's wallet. Anyone may repay using their own approved tokens; repayment credits the borrower profile, not the payer. Queue authorization uses EIP-712 data bound to the wallet, exact transaction hash, Sepolia chain, source vault, API origin, nonce, and expiry. The worker holds a dedicated testnet relayer key whose only intended action is proof submission. The proof verifier—not the worker database or UI—is authoritative for opening credit.

## State machines

### Source lock

`uncreated → active → withdrawn_after_expiry`

### Proof job

`queued → waiting_attestation → proving → preflight → submitting → executed`

Policy failures terminate in `refused`. Exhausted infrastructure retries terminate in `failed`. Only expired 60-second leases are reclaimed. UUID fencing rejects stale owners and leases renew every 20 seconds. Recorded signed submissions reconcile before source lookup or new-loan term checks; an expired source lock cannot erase a successful destination execution.

### Credit line

`unopened → open → matured`, with repayment available while open or matured. V1 has no interest or liquidation.

## Invariants

1. A line cannot exist without a successful BlockProver call and exact event validation.
2. One proof query and one lock can open at most one line.
3. `debt <= limit` at all times.
4. Only the recorded borrower can increase debt.
5. Maturity stops new borrowing but never blocks repayment.
6. The worker cannot move borrower funds.
7. Borrower-profile debt equals aggregate borrowed minus aggregate repaid.

## Operational design

- Versioned migrations execute under a PostgreSQL advisory lock and preserve jobs/attempts. Normalization collisions abort with an actionable report; no evidence is silently removed.
- Wallet-scoped normalized transaction uniqueness prevents reservation abuse. Relayer advisory locks and a unique pending outbox serialize nonce allocation.
- The target deployment is one Railway worker replica in Singapore. Atomic row claiming remains safe if a second replica is introduced.
- Proof/RPC failures retry after 5, 30, and 120 seconds. Attestation polling and pending signed broadcasts are resumable 15-second steps and do not consume that proof retry budget or monopolize the queue.
- Typed challenges expire after a short window, authorize one transaction, and are consumed once.
- Transactional per-wallet quotas and IP rate limits bound relayer spend.
- Signed Creditcoin bytes and their hash are persisted atomically before broadcast. Uncertain broadcasts resend identical bytes, never a new transaction. Readiness failure blocks new broadcasts but not receipt reconciliation.
- Browser wallet transactions are journaled before confirmation by wallet, chain, and action; REST plus receipts recover state after refresh without rebroadcasting.
- SSE gives the browser immediate updates; REST remains the recovery path.
- `/ready` schema version 2 fails unless database, both RPCs, all deployed bytecode and immutable/one-time bindings, Sepolia ChainInfo registration, an observed height advance within the freshness window, ProofBuilder, and relayer funding pass. Its first height observation is intentionally not enough.
- `/api/stats` exposes aggregate counts without wallet lists. RPC failure returns the last snapshot as `stale`, or nullable fields as `unavailable`; `protocolObservedAt` and `asOfBlock` identify the observation.
- Readiness probes run independently with bounded timeouts, single-flight caching, and background sampling. Health probes bypass public quotas. SSE connections are bounded; proxy forwarding is trusted only for explicitly verified CIDRs.
- The implemented six-hour production smoke (inactive until live configuration is enabled) checks hosted endpoints, CORS, chain IDs, bytecode, native ChainInfo, relayer funding, and contract bindings.

## Creditcoin borrower profile

`CreditPool.borrowerProfiles(address)` accumulates `lineCount`, `totalCreditOpened`, `totalBorrowed`, `totalRepaid`, and `outstandingDebt`. A line affects the profile only after the ASC opens it. Borrow and repay accounting occurs only after successful token transfers. A third-party repayment updates the recorded borrower, not the payer.

## Intentionally excluded from V1

Native ETH, multiple collateral assets, price oracles, interest, liquidation, batch proofs, Attestcoin writability, mainnet, automatic borrowing, and LLM-driven financial decisions are outside the shipped boundary.
