# AttestLock Agent

**Collateral stays on Ethereum; Creditcoin acts only on a proof.**

AttestLock is a DeFi-first, proof-gated credit prototype for the BUIDL CTC 2026 Fall hackathon. A borrower locks mock USDC in a Sepolia escrow. An always-on worker waits for Attestcoin attestation, builds the official transaction proof, and submits it to Creditcoin. Only the destination contract can open a seven-day credit line, and only the borrower can draw it.

> Current status: implementation and automated tests are complete locally. Live Sepolia/Creditcoin deployments, hosted URLs, and explorer evidence remain blocked on funded testnet credentials and are deliberately not claimed.

## Why Attestcoin is load-bearing

The line-opening path is fail-closed:

```text
Sepolia LockVault
  └─ successful CollateralLocked event
       └─ Attestcoin Merkle + continuity proof
            └─ Creditcoin BlockProver 0x0FD2
                 └─ exact receipt, vault, event, token, amount, and term checks
                      └─ CreditPool.openLine (only ASC)
                           └─ borrower signs borrow()
```

No valid proof means no line. The relayer cannot call `openLine`, borrow, repay, withdraw collateral, or transfer user funds.

## Demo flow

1. Connect a wallet and switch to Sepolia.
2. Claim the one-time mock USDC faucet.
3. Approve and lock `100 mUSDC` for 15 days.
4. Sign a short-lived queue challenge; the lock transaction is queued automatically.
5. Watch `queued → waiting_attestation → proving → preflight → submitting → executed`.
6. Switch to Creditcoin testnet and borrow up to `50 mUSD` with the borrower wallet.
7. Paste the pre-filled junk transaction and see a deterministic refusal with no state change.

The prototype does **not** claim trustless cross-chain liquidation or release. Sepolia collateral is withdrawable by the borrower after expiry; Attestcoin writability is roadmap work.

## Repository map

| Area                       | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `contracts/src/source`     | Six-decimal test collateral and Sepolia escrow                                  |
| `contracts/src/creditcoin` | Proof-gated ASC, bounded credit pool, borrow asset                              |
| `contracts/test`           | Positive, negative, replay, maturity, repayment, and invariant tests            |
| `apps/worker`              | PostgreSQL job state, signed API, proof builder, preflight, relayer             |
| `apps/web`                 | Vite React wallet and evidence console                                          |
| `packages/shared`          | ABIs, network constants, API types, deterministic status copy                   |
| `docs`                     | Integration, architecture, threat model, demo, evidence, and submission package |
| `deployments`              | Sanitized deployment manifests; live values are pending                         |

## Stack and pinned protocol dependencies

- Solidity `0.8.28`, Foundry, OpenZeppelin `5.4.0`
- `@gluwa/asc-contracts@0.2.1`
- `@gluwa/usc-sdk@0.18.0`
- TypeScript, Fastify, PostgreSQL, ethers v6
- React, Vite, pnpm workspace

The proof payload and decoder follow the [current official Attestcoin examples](https://github.com/gluwa/attestcoin-protocol-examples), not older tutorial paths retained in the research snapshot.

## Local verification

Prerequisites: Node 22+, pnpm 11.24+, Foundry, and optionally PostgreSQL 17 for the persistence integration test.

```bash
pnpm install --frozen-lockfile
forge install foundry-rs/forge-std@v1.9.7 --no-git
pnpm verify
```

Without `DATABASE_TEST_URL`, the PostgreSQL integration test is skipped; all other tests run without secrets. To exercise it:

```bash
export DATABASE_TEST_URL=postgres://attestlock:attestlock@127.0.0.1:5432/attestlock_test
pnpm --filter @attestlock/worker test
```

Run the UI in safe preview mode:

```bash
pnpm --filter @attestlock/web dev
```

Run the worker only after copying `apps/worker/.env.example` to `apps/worker/.env` and setting dedicated testnet values:

```bash
pnpm --filter @attestlock/worker dev
```

## Testnet deployment

Never use a mainnet key. Use a dedicated testnet deployer and relayer.

```bash
export DEPLOYER_PRIVATE_KEY=0x...
forge script contracts/script/DeploySource.s.sol:DeploySource \
  --root contracts --rpc-url "$SEPOLIA_RPC_URL" --broadcast

export SOURCE_TOKEN_ADDRESS=0x...
export SOURCE_VAULT_ADDRESS=0x...
forge script contracts/script/DeployCreditcoin.s.sol:DeployCreditcoin \
  --root contracts --rpc-url https://rpc.cc3-testnet.creditcoin.network --broadcast
```

Copy broadcast results into new non-example deployment JSON files, then follow [the evidence runbook](docs/EVIDENCE.md). Deployment is not “done” until the proof transaction and borrower-signed borrow are visible on both explorers.

## API

| Route                      | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `POST /api/challenges`     | Create a short-lived wallet-signing challenge                 |
| `POST /api/jobs`           | Queue one source transaction after signature and quota checks |
| `GET /api/jobs/:id`        | Read one proof job                                            |
| `GET /api/jobs?wallet=…`   | List a wallet's jobs                                          |
| `GET /api/events?wallet=…` | Stream job updates over SSE                                   |
| `GET /health`              | Railway health check                                          |

The queue is idempotent by transaction hash, challenges are one-time, and another wallet cannot claim an existing source transaction.

## Security boundaries

- The worker validates the Sepolia receipt before paying proof costs.
- The ASC independently verifies the proof and every material event field.
- Query IDs and proof-derived lock IDs are both one-time.
- `CreditPool.openLine` is callable only by the immutable ASC configured once.
- The borrower must sign `borrow`; repayment remains available after maturity.
- Transient infrastructure failures retry with bounded backoff; policy failures are terminal refusals.

See [Threat model](docs/THREAT_MODEL.md) for assumptions and intentionally unshipped controls.

## Judge package

- [Attestcoin integration](docs/ATTESTCOIN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Demo runbook](docs/DEMO.md)
- [Live evidence gate](docs/EVIDENCE.md)
- [Submission draft](docs/SUBMISSION.md)
- [90-second video script](docs/VIDEO_SCRIPT.md)

## Hackathon timing

The extended DoraHacks deadline is **September 13, 2026 at 23:59 ET**, equivalent to **September 14 at 10:59 Asia/Bangkok**. The internal freeze target is one day earlier.

## License

MIT. Testnet software only; not audited and not financial advice.
