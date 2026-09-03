# 90-second live demo runbook

## Pre-stage

- Open the hosted app, Sepolia explorer, and Creditcoin Blockscout.
- Connect a wallet with Sepolia ETH and Creditcoin testnet gas.
- Claim and approve mock USDC before recording if network latency is high.
- Keep one known normal Sepolia transfer hash for the refusal path.
- Confirm `/health`, `/ready`, relayer balance, both RPCs, and nonzero production contract addresses.
- Open the hosted app in a clean logged-out browser first; every explorer, deck, repository, and video link must resolve without an authenticated session.

## Scripted path

|   Time | Screen        | Narration                                                                      |
| -----: | ------------- | ------------------------------------------------------------------------------ |
|  0–10s | Hero          | “Collateral stays on Ethereum. Creditcoin acts only on a proof.”               |
| 10–25s | Lock panel    | Lock 100 mUSDC for 15 days and wallet-sign the tx-bound EIP-712 proof request. |
| 25–48s | Proof panel   | Show attestation, proof creation, fail-closed preflight, and submission.       |
| 48–62s | Blockscout    | Open the verified Creditcoin line transaction and point to lock ID/query ID.   |
| 62–75s | Credit panel  | Switch networks and borrower-sign the 50 mUSD draw.                            |
| 75–86s | Refusal panel | Queue a junk transaction and show deterministic refusal.                       |
| 86–90s | Hero          | “No asset bridge, no oracle signer, no proof—no credit.”                       |

## Recovery plan

- Attestation slow: use the previously captured valid live job, but still lock a fresh transaction on screen.
- RPC transient: show the scheduled retry and state that no line exists yet.
- Browser refresh after proof submission: show the persisted destination transaction and reconciled line rather than starting a second submission.
- Wallet network error: use the explicit switch buttons.
- Never replace a failed live proof with mocked UI data without saying so.

## Pass criteria

The recording must visibly include a Sepolia lock URL, a Creditcoin proof URL, a borrower-signed borrow URL, the query ID and lock ID, and a deterministic refusal. If any is absent, the video is a draft, not submission evidence.
