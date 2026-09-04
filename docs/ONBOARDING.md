# Five-minute onboarding and integration

AttestLock's first user is a Creditcoin testnet lending or risk team that needs a bounded credit decision from a collateral fact on another chain without bridge custody.

## Borrower path

1. Open the hosted app and connect an EIP-1193 wallet.
2. Switch to Sepolia, claim the one-time `100 mUSDC` faucet, and approve the vault.
3. Lock `100 mUSDC` for 15 days. The app immediately asks for an EIP-712 signature authorizing only that transaction hash.
4. Follow the persisted job through attestation, proof generation, preflight, and Creditcoin execution. Refreshing during the proof recovers jobs over REST/SSE; already-submitted wallet transactions are read from the local journal rather than broadcast again.
5. Switch to Creditcoin testnet. Confirm the 50 mUSD line, borrower profile, proof transaction, and source transaction.
6. Borrow with the connected wallet. The worker cannot sign this transaction.

The live path remains disabled until all deployed addresses and the worker origin are compiled into the production web bundle.

## API example

Create a challenge bound to the borrower and source transaction:

```http
POST /api/challenges
Content-Type: application/json

{
  "wallet": "0xBorrower",
  "txHash": "0xSepoliaLockTransaction"
}
```

Sign the returned EIP-712 `QueueProofJob`, then queue it:

```http
POST /api/jobs
Content-Type: application/json

{
  "wallet": "0xBorrower",
  "txHash": "0xSepoliaLockTransaction",
  "nonce": "challenge-uuid",
  "signature": "0xWalletSignature"
}
```

Recover with `GET /api/jobs?wallet=0xBorrower`, stream updates with `GET /api/events?wallet=0xBorrower`, and read aggregate-only activity with `GET /api/stats`.

## Collateral-event schema

```solidity
event CollateralLocked(
    bytes32 indexed lockId,
    address indexed borrower,
    address indexed token,
    uint256 amount,
    uint64 unlockAt
);
```

The deployed ASC accepts exactly one matching log from the immutable source vault. Receipt success, emitter, topic count, event signature, borrower, token, amount, remaining term, query ID, and lock ID are all enforced on Creditcoin.

## Integration checklist

- Deploy one immutable source vault and supported token on a ChainInfo-registered source chain.
- Bind the destination ASC to the chain key, vault, token, pool, and native verifier.
- Fund mock pool liquidity and set its ASC exactly once.
- Run the worker with a dedicated, capped testnet relayer and private PostgreSQL.
- Compile the web app with a live API origin, all five nonzero deployed addresses, and one verified non-vault Sepolia transaction for the refusal button.
- Verify `/health`, every `/ready` component, `/api/stats`, CORS, code hashes, and explorer links.
- Capture one valid proof, one borrower-signed draw, and unchanged state for rejected inputs.
- Never describe source liquidation or release as enforced until a separate authenticated write path exists.

## Adoption funnel

The public, aggregate-only funnel is:

`visit → wallet connect → source lock → executed proof → opened line → borrower draw`

V1 exposes job and wallet totals without publishing wallet lists. Connect and draw conversion require privacy-preserving product analytics later; no interviews, pilots, or user counts are claimed for this hackathon build.
