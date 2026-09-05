# AttestLock Agent

**Collateral stays on Ethereum; Creditcoin acts only on a proof.**

AttestLock is a DeFi-first, proof-gated credit prototype for the BUIDL CTC 2026 Fall hackathon. A borrower locks mock USDC in a Sepolia escrow. The worker waits for Attestcoin attestation, builds the official transaction proof, and submits it to Creditcoin. Only the destination contract can open a seven-day credit line, and only the borrower can draw it.

> Current status: local hardening is implemented and under release verification. The public site remains a preview. New encrypted testnet accounts have faucet funding; deployment, native proof, hosted execution, post-maturity repayment, and videos are separate pending gates. See the [claim-to-evidence ledger](docs/CLAIMS.md) and [completion status](docs/COMPLETION.md).

**Hosted preview:** https://attestlock-web-production.up.railway.app

## Why Attestcoin is load-bearing

The line-opening path is fail-closed:

```text
Sepolia LockVault
  └─ successful CollateralLocked event
       └─ Attestcoin Merkle + continuity proof
            └─ Creditcoin BlockProver 0x0FD2
                 └─ exact sender, destination, receipt, event, token, amount, and term checks
                      └─ CreditPool.openLine (only ASC)
                           └─ borrower signs borrow()
```

No valid proof means no line. The relayer cannot call `openLine`, draw another borrower's line, withdraw their collateral, or transfer their funds. Repayment is permissionless using the payer's own approved tokens; the worker never initiates repayment.

## Demo flow

1. Connect a wallet and switch to Sepolia.
2. Claim the one-time mock USDC faucet.
3. Approve and lock `100 mUSDC` for 15 days.
4. Sign short-lived EIP-712 data bound to the exact lock transaction; it is queued automatically.
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

Prerequisites: Node 22+, pnpm 11.24+, Foundry v1.7.1, and PostgreSQL 17 for the persistence and concurrency integration tests.

```bash
pnpm install --frozen-lockfile
(cd contracts && forge install foundry-rs/forge-std@v1.9.7 --no-git)
pnpm verify
pnpm contracts:coverage
pnpm test:e2e
```

Without `DATABASE_TEST_URL`, the PostgreSQL integration suite is skipped; all other tests run without secrets. To exercise it:

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

Never use a mainnet key. Import a dedicated testnet deployer into Foundry's encrypted local keystore; keep the separate relayer only in the worker's sealed environment.

```bash
cast wallet import attestlock-deployer --interactive
export DEPLOYER_ADDRESS=0x...
forge script contracts/script/DeploySource.s.sol:DeploySource \
  --root contracts --rpc-url "$SEPOLIA_RPC_URL" --broadcast \
  --account attestlock-deployer --sender "$DEPLOYER_ADDRESS"

export SOURCE_TOKEN_ADDRESS=0x...
export SOURCE_VAULT_ADDRESS=0x...
forge script contracts/script/DeployCreditcoin.s.sol:DeployCreditcoin \
  --root contracts --rpc-url https://rpc.cc3-testnet.creditcoin.network --broadcast \
  --account attestlock-deployer --sender "$DEPLOYER_ADDRESS"
```

Before any broadcast, run `VERIFIED_CI_RUN=<successful-main-run> PROVENANCE_FILE=.tmp/deployment-provenance.json pnpm deployments:prepare` from clean merged main. Keep that provenance unchanged. Generate sanitized manifests from the corresponding broadcasts and compiled artifacts:

```bash
PROVENANCE_FILE=.tmp/deployment-provenance.json \
DEPLOYMENT_NETWORK=sepolia \
BROADCAST_FILE=contracts/broadcast/DeploySource.s.sol/11155111/run-latest.json \
OUTPUT_FILE=deployments/sepolia.json \
DEPLOYMENT_RPC_URL="$SEPOLIA_RPC_URL" \
pnpm deployments:manifest

pnpm evidence:live
```

Set `REQUIRE_VERIFIED=true` when generating final manifests. Sepolia verification lookup additionally needs a local `ETHERSCAN_API_KEY`; it is queried but never written to the manifest.

Deployment is not “done” until the proof transaction and borrower-signed borrow are visible on both explorers.

## API

| Route                      | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `POST /api/challenges`     | Create a `{ wallet, txHash }` EIP-712 authorization              |
| `POST /api/jobs`           | Queue one source transaction after signature and quota checks    |
| `GET /api/jobs/:id`        | Read one proof job                                               |
| `GET /api/jobs?wallet=…`   | List a wallet's jobs                                             |
| `GET /api/events?wallet=…` | Stream job updates over SSE                                      |
| `GET /api/stats`           | Aggregate jobs, on-chain lines/draws, atomic totals, attestation |
| `GET /health`              | Railway health check                                             |
| `GET /ready`               | Schema-v2 DB/RPC/bindings/ChainInfo/prover/relayer readiness     |

The queue is idempotent by case-insensitive `(wallet, transaction hash)`. Typed challenges bind the wallet, transaction, Sepolia chain, source vault, API origin, nonce, and expiry. Quota enforcement and job claiming are transactional, and a wrong wallet cannot reserve another borrower's transaction. Different judges may queue the same junk hash; ownership is validated before proof acquisition.

Preview mode disables all transaction writes even if addresses are configured. A live production build additionally requires the API, all five contract addresses, and a known non-vault refusal transaction. This is intentional: a polished preview is not presented as chain evidence.

## Security boundaries

- The worker validates the Sepolia sender, destination, receipt, and lock before paying proof costs.
- The ASC independently verifies the proof-contained transaction sender/destination and every material receipt/event field.
- Query IDs and proof-derived lock IDs are both one-time.
- `CreditPool.openLine` is callable only by the immutable ASC configured once.
- The borrower must sign `borrow`; repayment remains available after maturity.
- A Creditcoin-native borrower profile counts only proof-opened lines and real draws/repayments.
- Wallet transaction hashes are journaled before confirmation so refresh recovery does not rebroadcast them.
- Transient infrastructure failures retry with bounded backoff; policy failures are terminal refusals.

See [Threat model](docs/THREAT_MODEL.md) for assumptions and intentionally unshipped controls.

## Judge package

- [Attestcoin integration](docs/ATTESTCOIN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Demo runbook](docs/DEMO.md)
- [Live evidence gate](docs/EVIDENCE.md)
- [Submission draft](docs/SUBMISSION.md)
- [Rubric and eligibility ledger](docs/RUBRIC.md)
- [Market and ecosystem thesis](docs/MARKET.md)
- [Competitive positioning](docs/COMPETITIVE.md)
- [Five-minute onboarding](docs/ONBOARDING.md)
- [90-second video script](docs/VIDEO_SCRIPT.md)
- [Draft six-slide deck — stale measurements; not final evidence (PPTX)](docs/deck/AttestLock-Hackathon-Deck.pptx)
- [Draft six-slide deck — stale screenshot; not final evidence (PDF)](docs/deck/AttestLock-Hackathon-Deck.pdf)

## Hackathon timing

The extended DoraHacks deadline is **September 13, 2026 at 23:59 ET**, equivalent to **September 14 at 10:59 Asia/Bangkok**. The internal freeze target is one day earlier.
Winners are scheduled to be announced on **September 20, 2026**.

## License

Original AttestLock code is MIT. Upstream libraries retain their licenses; archived research attribution is separate. Testnet software only; not audited and not financial advice.
