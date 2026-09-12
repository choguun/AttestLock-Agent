# AttestLock Agent

**Collateral stays on Ethereum; Creditcoin acts only on a proof.**

[Live testnet app](https://attestlock-web-production.up.railway.app/) · [Project deck (PDF)](docs/deck/AttestLock-Hackathon-Deck-2026-09-12.pdf) · [Integration documentation](docs/ATTESTCOIN.md)

## Project sector

- **Sector:** DeFi & AI
- **Positioning:** Proof-gated cross-chain credit origination
- **Supporting feature:** An automated proof-processing agent
- **Primary hackathon track:** DeFi. The shipped agent runs deterministic proof workflows, not LLM-driven lending decisions.

## Project description

AttestLock Agent is a DeFi prototype that turns an Ethereum collateral lock into a proof-gated credit line on Creditcoin—without bridging the collateral.

Users lock mock USDC in a Sepolia vault. An automated worker obtains an Attestcoin proof, and a Creditcoin smart contract verifies it through the native BlockProver precompile (`0x0FD2`). The contract checks the successful transaction, exact vault event, borrower, token, amount, remaining lock term, and replay protection before opening a seven-day credit line at 50% loan-to-value.

The borrower explicitly signs each MockUSD draw; the worker cannot borrow or transfer user assets. Borrowing and repayment update an on-chain borrower profile, creating an auditable credit history on Creditcoin.

Built as a reference for lending and risk teams, AttestLock demonstrates how verified cross-chain collateral facts can support credit origination. It is testnet-only: trustless liquidation and source-chain release enforcement remain future work.

## USC integration summary

AttestLock uses USC (Attestcoin) to verify Ethereum collateral facts on Creditcoin without bridging the collateral.

After a user locks mock USDC in the Sepolia vault, the worker waits for attestation and obtains the transaction’s Merkle and continuity proofs using `@gluwa/usc-sdk`. It submits these proofs to `AttestLockASC` on Creditcoin, which calls the native BlockProver precompile at `0x0FD2`.

The contract validates the source chain, successful receipt, exact vault event, borrower, supported token, collateral amount, and remaining lock term. Query-ID and lock-ID replay protection prevent duplicate credit creation. Only after these checks pass does it open a seven-day MockUSD credit line at 50% LTV.

USC is essential to the flow: **without a valid proof, no credit line can open.** Borrowing remains explicitly wallet-signed; the worker cannot draw funds. The prototype is testnet-only and does not yet provide trustless liquidation or source-chain release enforcement.

## Recorded testnet evidence

The September 12, 2026 browser recording completed a new lock, native proof, and borrower-signed draw on the same line:

| Step                    | Verified result     | Receipt                                                                                                                            |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sepolia escrow          | 100 mUSDC locked    | [Block 11,687,768](https://eth-sepolia.blockscout.com/tx/0x9a46973c40b14bc6d03379cf6e6f9080d3f691273b2cff7dbd021eadf56442a8)       |
| Creditcoin native proof | 50 mUSD line opened | [Block 5,474,092](https://creditcoin-testnet.blockscout.com/tx/0xe8425adb65010af562d37c133607723fadfe8b8baf3b2c736ad91ab6ee75ab87) |
| Borrower draw           | 50 mUSD transferred | [Block 5,474,098](https://creditcoin-testnet.blockscout.com/tx/0xaabe12b96e8ba5fffc1121e490edbffd8eec7fcc50a22c251d17404c69fc722a) |

The proof job took **8m 15s**, including attestation wait, and used **287,238 gas**. A separate token approval received a [`WRONG_SOURCE_CONTRACT` refusal](https://attestlock-worker-production.up.railway.app/api/jobs/82447acc-d03f-4994-8335-974e1c555f6f), without a destination submission. The deck includes real captures and explorer links.

The 90-second prototype video is recorded locally; public upload remains pending. Time cuts and off-capture wallet signatures are disclosed. This new line matures **September 19, 2026 at 08:40:45 UTC**. Its recording is not evidence of post-maturity repayment or completed submission acceptance. See [live observations](docs/LIVE_TESTNET.md) and [remaining gates](docs/COMPLETION.md).

## Try the prototype

1. Connect a testnet wallet and switch to Sepolia.
2. Claim the one-time **1,000 mUSDC** faucet, approve, and lock **100 mUSDC** for 15 days.
3. Sign the short-lived authorization to queue that lock transaction.
4. Follow attestation and proof status, then switch to Creditcoin testnet (`102031`).
5. Sign a draw of up to **50 mUSD**, or try the non-vault refusal example.

Attestation time varies. Preview mode disables transaction writes. Repayment uses the payer’s approved tokens, can come from a third party, and remains available after maturity. The worker never initiates borrowing or repayment.

## Run locally

Requires Node 22+, pnpm 11.24+, Foundry v1.7.1, and PostgreSQL 17 for database integration tests.

```bash
pnpm install --frozen-lockfile
(cd contracts && forge install foundry-rs/forge-std@v1.9.7 --no-git)
pnpm verify
pnpm contracts:coverage
pnpm test:e2e
pnpm --filter @attestlock/web dev
```

Set `DATABASE_TEST_URL` to a dedicated test database to run PostgreSQL tests; they skip when it is absent. Configure [worker environment variables](apps/worker/.env.example) before running `pnpm --filter @attestlock/worker dev`. Use dedicated testnet keys only; never commit secrets or put them in frontend variables.

## Implementation

| Area                                | Responsibility                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| [Contracts](contracts/src)          | Sepolia vault, native proof verification, credit pool, and borrower profile        |
| [Worker](apps/worker)               | Signed queue API, PostgreSQL persistence, proof acquisition, simulation, and relay |
| [Web](apps/web)                     | Wallet actions, job recovery, line history, and evidence views                     |
| [Shared package](packages/shared)   | ABIs, network constants, API types, and status messages                            |
| [Deployment manifests](deployments) | Source and destination contract provenance                                         |

**Stack:** Solidity `0.8.28`, Foundry, OpenZeppelin `5.4.0`, `@gluwa/asc-contracts@0.2.1`, `@gluwa/usc-sdk@0.18.0`, TypeScript, Fastify, PostgreSQL, ethers v6, React, and Vite.

**API:** `POST /api/challenges`, `POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs?wallet=…`, `GET /api/events?wallet=…` (SSE), `GET /api/stats`, `GET /health`, and `GET /ready`. Queue requests require transaction-bound EIP-712 authorization and quotas. Only the configured ASC can open lines.

## Documentation and limitations

- [Architecture](docs/ARCHITECTURE.md) and [USC / Attestcoin integration](docs/ATTESTCOIN.md)
- [Threat model](docs/THREAT_MODEL.md) and [claim ledger](docs/CLAIMS.md)
- [Market thesis](docs/MARKET.md) and [competitor comparison](docs/COMPETITIVE.md)
- [September 12 project deck](docs/deck/AttestLock-Hackathon-Deck-2026-09-12.pdf)

V1 uses mock assets and excludes interest, liquidation, and trustless source-chain release/default enforcement. Source collateral becomes withdrawable by its borrower after expiry; Creditcoin cannot seize it. Demo activity is not independent user validation, and no hackathon score or placement is guaranteed.

## License

Original code is [MIT licensed](LICENSE). Dependencies retain their own licenses; archived research has separate attribution. Testnet software only, unaudited, and not financial advice.
