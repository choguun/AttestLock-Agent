# Live evidence gate

This checklist prevents build output or mocked fixtures from being presented as a deployed integration.

## Repository verification snapshot

Verified locally on `2026-09-03T16:39:00Z` from branch `codex/hackathon-completion`:

- `pnpm verify` passed with PostgreSQL enabled: 49 tests, zero failures, zero skips.
- `pnpm audit --prod` reported no known vulnerabilities.
- `forge lint --root contracts` completed with only the expected timestamp-policy warnings for maturity and expiry checks.
- The production build fails closed unless `VITE_PREVIEW_MODE=true` or the live API and deployed contract addresses are present.
- Browser QA passed at 1440×900 and 390×844 with no horizontal overflow or console errors.
- The six-slide PPTX passed template fidelity and overflow checks; the six-page PDF was rendered and inspected page by page.

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

| Field                   | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Public repository       | https://github.com/choguun/AttestLock-Agent                           |
| Baseline commit         | `b1711566d8af508bea249519ed6ece91fb9d0c10`                            |
| Completion branch/PR    | `codex/hackathon-completion` / Pending                                |
| Sepolia deployment      | Pending                                                               |
| Creditcoin deployment   | Pending                                                               |
| Sepolia lock tx         | Pending                                                               |
| Attested block/time     | Pending                                                               |
| Sanitized proof fixture | Pending                                                               |
| Creditcoin proof tx     | Pending                                                               |
| Creditcoin borrow tx    | Pending                                                               |
| Junk refusal job        | Pending                                                               |
| Hosted web URL          | https://attestlock-web-production.up.railway.app                      |
| Judge deck              | `docs/deck/AttestLock-Hackathon-Deck.pdf`                             |
| Worker health URL       | Pending — worker has no deployment while chain credentials are absent |
| Baseline CI run         | https://github.com/choguun/AttestLock-Agent/actions/runs/33672258023  |
| Completion CI run       | Pending PR                                                            |

## Railway observation

Observed at `2026-09-03T16:23:40Z`:

- `attestlock-web` is running in Singapore at https://attestlock-web-production.up.railway.app.
- private PostgreSQL is running with a persistent volume;
- `attestlock-worker` has no active deployment and no public domain;
- the worker is intentionally not connected/deployed until Sepolia RPC, Creditcoin RPC, proof-builder URL, funded relayer key, source addresses, destination address, and deployment block are available.

Connecting the worker early would create a knowingly failed public deployment and would not satisfy the live gate.

## Sanitization

Commit proof input bytes and public chain data only. Remove RPC tokens, database URLs, private keys, authorization headers, account cookies, and Railway sealed-variable output. Run the secret scan before pushing.

No box may be checked from a unit test, mock precompile, local database, or verbal claim.
