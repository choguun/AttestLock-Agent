# Live evidence gate

This checklist prevents build output or mocked fixtures from being presented as a deployed integration.

## Repository verification snapshot

Verified locally on `2026-09-04T02:15:07Z` from branch `codex/hackathon-90-plus` at implementation commit `e4e7bf1c10355803251999fa4fc810dc94d4fb5c`:

- `pnpm verify` passed with PostgreSQL enabled: 54 shared, worker, web, and Foundry tests; zero failures and zero skips.
- Playwright passed two Chromium paths: preview fail-closed plus the mocked wallet lock, authorization, SSE, refresh recovery, profile, borrow, repay, refusal, explorer-link, and accessibility journey.
- Measured Foundry coverage is 94.29% lines, 92.40% statements, 66.67% branches, and 84.21% functions.
- `forge lint --root contracts` completed with only the expected timestamp-policy warnings for maturity and expiry checks.
- The production build fails closed unless `VITE_PREVIEW_MODE=true` or the live API and deployed contract addresses are present.
- The production audit is not claimed for this snapshot: the local registry returned pnpm error `(23)` after bounded retries; the branch CI must provide the authoritative result.
- The six-slide PPTX passed package, template-fidelity, heading-fit, layout, and re-import checks; the six-page PDF was rendered and visually inspected.

This snapshot is repository evidence, not live-chain proof.

## Gate 1 — deployments

- [ ] `MockUSDC` and `LockVault` deployed on Sepolia `11155111`.
- [ ] `MockUSD`, `CreditPool`, and `AttestLockASC` deployed on Creditcoin testnet `102031`.
- [ ] Pool ASC is configured exactly once.
- [ ] Pool holds enough mock USD.
- [ ] Sanitized deployment JSON contains addresses, tx hashes, UTC timestamps, commit SHA, compiler, and dependency versions.

## Gate 2 — positive path

- [ ] Faucet, approve, and lock 100 mUSDC.
- [ ] Source receipt succeeded and emitted the exact event from the registered vault.
- [ ] Block height became attested.
- [ ] Proof Builder returned Merkle and continuity data.
- [ ] `eth_call` preflight succeeded.
- [ ] Live `0x0FD2` verification transaction succeeded.
- [ ] Line contains the expected borrower, 50 mUSD limit, zero initial debt, seven-day maturity, and source lock data.
- [ ] Borrower wallet—not relayer—borrowed 50 mUSD.

## Gate 3 — negative paths

- [ ] Normal/junk transaction is refused and state is unchanged.
- [ ] Locally tampered proof reverts and state is unchanged.
- [ ] Repeating the successful query reverts.
- [ ] Reusing the source lock through another proof reverts.

## Evidence table

| Field                   | Value                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Public repository       | https://github.com/choguun/AttestLock-Agent                                          |
| Baseline commit         | `b1711566d8af508bea249519ed6ece91fb9d0c10`                                           |
| Release candidate       | `c19283e824a5bc9848fdded9ca89d578a8a38430`                                           |
| Completion branch/PR    | `codex/hackathon-90-plus` / https://github.com/choguun/AttestLock-Agent/pull/2       |
| Sepolia deployment      | Pending                                                                              |
| Creditcoin deployment   | Pending                                                                              |
| Sepolia lock tx         | Pending                                                                              |
| Attested block/time     | Pending                                                                              |
| Sanitized proof fixture | Pending                                                                              |
| Creditcoin proof tx     | Pending                                                                              |
| Creditcoin borrow tx    | Pending                                                                              |
| Junk refusal job        | Pending                                                                              |
| Hosted web URL          | https://attestlock-web-production.up.railway.app                                     |
| Hosted web deployment   | Railway `0f514b7b-2ada-47f6-9868-bf05ae323756`                                       |
| Judge deck              | `docs/deck/AttestLock-Hackathon-Deck.pdf`                                            |
| Worker health URL       | https://attestlock-worker-production.up.railway.app — domain reserved; no deployment |
| Baseline CI run         | https://github.com/choguun/AttestLock-Agent/actions/runs/33672258023                 |
| Merged-main CI run      | https://github.com/choguun/AttestLock-Agent/actions/runs/33825126459                 |
| 90+ branch CI run       | https://github.com/choguun/AttestLock-Agent/actions/runs/33829174378                 |

## Railway observation

Observed again with the Railway CLI at `2026-09-04T02:15:07Z`:

- `attestlock-web` deployment `0f514b7b-2ada-47f6-9868-bf05ae323756` passed its `/` health check in Singapore; the page and public logo both returned HTTP 200;
- private PostgreSQL is running with a persistent volume;
- `attestlock-worker` has a reserved public domain but no active deployment and no repository source;
- the worker is intentionally not connected/deployed until Sepolia RPC, Creditcoin RPC, proof-builder URL, funded relayer key, source addresses, destination address, and deployment block are available.

Connecting the worker early would create a knowingly failed public deployment and would not satisfy the live gate.

## Sanitization

Commit proof input bytes and public chain data only. Remove RPC tokens, database URLs, private keys, authorization headers, account cookies, and Railway sealed-variable output. Run the secret scan before pushing.

No box may be checked from a unit test, mock precompile, local database, or verbal claim.
