# Five-minute onboarding and integration

AttestLock's first user is a Creditcoin testnet lending or risk team that needs a bounded credit decision from a collateral fact on another chain without bridge custody.

Five minutes is a setup target, not an end-to-end latency guarantee. Faucet, wallet, attestation, and proof-builder delays vary. The hosted app now has verified live addresses and a healthy worker; the complete real browser-wallet path remains separately tracked in [LIVE_TESTNET.md](LIVE_TESTNET.md).

## Borrower path

1. Open the hosted app and choose your wallet provider, then connect. [EIP-6963 discovery](https://eips.ethereum.org/EIPS/eip-6963) keeps reads, network switching, and signing on the selected provider. Provider names are self-reported, not verified identities; legacy injection is only a fallback when no providers announce themselves.
2. Obtain free Sepolia ETH and Creditcoin testnet CTC using the in-app setup links. Switch to Sepolia, claim the one-time `1,000 mUSDC` faucet, and approve the vault. Already-claimed faucets and locks without 100 mUSDC balance/allowance remain disabled. A positive native balance is checked, but the wallet still estimates the actual gas cost before signing.
3. Lock `100 mUSDC` for 15 days. The app immediately asks for an EIP-712 signature authorizing only that transaction hash.
4. Follow the persisted job through attestation, proof generation, preflight, and Creditcoin execution. Refreshing during the proof recovers jobs over REST/SSE; already-submitted wallet transactions are read from the local journal rather than broadcast again.
5. Switch to Creditcoin testnet. Confirm the 50 mUSD line, borrower profile, proof transaction, and source transaction.
6. Borrow with the connected wallet. The worker cannot sign this transaction.

The live path requires preview mode to be explicitly disabled as well as valid deployed addresses and the worker origin. Restoration never opens a signature prompt: choose Resume authorization or Continue repayment. Confirmed replacements/cancellations can be reconciled by hash in the journal; pending transactions continue to block duplicate sends.

## Wallet-free judge route

Select **View verified example** without connecting a wallet. The published historical snapshot contains the native proof, borrower draw, negative receipts, readable mUSD accounting, and UTC maturity. Open the keyboard-scrollable proof payload or download the exact atomic-unit JSON. A junk source receipt may succeed while its job is refused: the labels now distinguish source success from destination acceptance. Refused/failed jobs do not imply earlier stages executed.

The setup panel links the repository, this API example, partial-evidence PDF deck, gas faucets, and worker readiness. Videos remain labelled unpublished until real public URLs exist. Public metrics retain previous values but show stale after a failed refresh or more than two minutes without a fresh observation; unavailable values never become invented zero activity. Connected-wallet balances and selected line/profile are refreshed periodically, including external repayments.

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

V1 exposes job and wallet totals without publishing wallet lists. Visits and connects are not measured; distinct wallets that drew are observable from public pool events, not proof of independent people. Full conversion analytics require privacy-preserving product instrumentation later; no interviews, pilots, or user counts are claimed for this hackathon build.
