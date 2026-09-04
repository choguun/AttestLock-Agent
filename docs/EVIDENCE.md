# Live evidence gate

This checklist prevents build output or mocked fixtures from being presented as a deployed integration.

## Repository verification snapshot

Verified locally on `2026-09-04T17:01:43Z` from branch `codex/hackathon-90-plus` at implementation commit `c1e7f20ad51d93f5e3ad931cf34fe14a2343fe21`:

- `pnpm verify` passed with PostgreSQL enabled: 77 shared, worker, web, and Foundry tests; zero failures and zero skips. The six PostgreSQL cases ran against a disposable local database.
- Playwright passed two Chromium paths: preview fail-closed plus the mocked wallet lock, authorization, SSE, refresh recovery, profile, borrow, repay, refusal, explorer-link, and accessibility journey.
- Measured Foundry coverage is 99.33% lines, 99.46% statements, 87.50% branches, and 100% functions, exceeding the enforced 95/93/85/90 floors.
- `forge lint --root contracts` completed with only the expected timestamp-policy warnings for maturity and expiry checks.
- The production build fails closed unless `VITE_PREVIEW_MODE=true` or a public HTTPS API, all five nonzero contract addresses, and a nonzero known refusal transaction are present.
- `pnpm audit --prod --audit-level high --ignore-registry-errors` reported no known vulnerabilities.
- Node syntax checks passed for the deployment-manifest, live-evidence, and production-smoke commands. GitHub CI remains the authoritative full-history secret and Markdown-link gate because `gitleaks` and `lychee` are not installed in this local environment.
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

## Gate 4 — public judge package

- [ ] Hosted live web, worker `/health`, schema-v2 `/ready`, `/api/stats`, and scheduled smoke pass.
- [ ] Public 90-second demo plays without authentication.
- [ ] Public uncut technical appendix plays without authentication.
- [ ] Every repository, explorer, deck, video, and hosted URL opens from a logged-out browser.

## Evidence table

| Field                   | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Public repository       | https://github.com/choguun/AttestLock-Agent                                    |
| Baseline commit         | `b1711566d8af508bea249519ed6ece91fb9d0c10`                                     |
| Release candidate       | `3b1987c5f72af7839f93ed69ee1c05f64940674f`                                     |
| Completion branch/PR    | `codex/hackathon-90-plus` / https://github.com/choguun/AttestLock-Agent/pull/2 |
| Sepolia deployment      | Pending                                                                        |
| Creditcoin deployment   | Pending                                                                        |
| Sepolia lock tx         | Pending                                                                        |
| Attested block/time     | Pending                                                                        |
| Sanitized proof fixture | Pending                                                                        |
| Creditcoin proof tx     | Pending                                                                        |
| Creditcoin borrow tx    | Pending                                                                        |
| Junk refusal job        | Pending                                                                        |
| Hosted web URL          | https://attestlock-web-production.up.railway.app                               |
| Hosted web deployment   | Railway `4695be59-8170-4620-9773-dcc039b38ba4`                                 |
| Judge deck              | `docs/deck/AttestLock-Hackathon-Deck.pdf`                                      |
| Worker health URL       | Reserved: `attestlock-worker-production.up.railway.app`; no deployment         |
| Baseline CI run         | https://github.com/choguun/AttestLock-Agent/actions/runs/33672258023           |
| Merged-main CI run      | https://github.com/choguun/AttestLock-Agent/actions/runs/33899486131           |
| Evidence-complete CI    | https://github.com/choguun/AttestLock-Agent/actions/runs/33899048858           |

## Railway observation

Observed again with the Railway CLI and public HTTP checks at `2026-09-04T17:19:55Z`:

- `attestlock-web` deployment `4695be59-8170-4620-9773-dcc039b38ba4` passed its `/` health check in Singapore; the page and public logo both returned HTTP 200, and its bundle identifies itself as a judge-safe preview rather than live testnets;
- private PostgreSQL is running with a persistent volume;
- `attestlock-worker` has a reserved public domain but no active deployment and no repository source;
- the worker is intentionally not connected/deployed until Sepolia RPC, Creditcoin RPC, proof-builder URL, funded relayer key, source addresses, destination address, and deployment block are available.

Connecting the worker early would create a knowingly failed public deployment and would not satisfy the live gate.

## Sanitization

Commit proof input bytes and public chain data only. Remove RPC tokens, database URLs, private keys, authorization headers, account cookies, and Railway sealed-variable output. Run the secret scan before pushing.

No box may be checked from a unit test, mock precompile, local database, or verbal claim.
