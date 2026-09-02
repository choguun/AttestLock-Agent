# Live evidence gate

This checklist prevents build output or mocked fixtures from being presented as a deployed integration.

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

| Field                   | Value   |
| ----------------------- | ------- |
| Git commit              | Pending |
| Sepolia deployment      | Pending |
| Creditcoin deployment   | Pending |
| Sepolia lock tx         | Pending |
| Attested block/time     | Pending |
| Sanitized proof fixture | Pending |
| Creditcoin proof tx     | Pending |
| Creditcoin borrow tx    | Pending |
| Junk refusal job        | Pending |
| Hosted web URL          | Pending |
| Worker health URL       | Pending |
| CI run                  | Pending |

## Sanitization

Commit proof input bytes and public chain data only. Remove RPC tokens, database URLs, private keys, authorization headers, account cookies, and Railway sealed-variable output. Run the secret scan before pushing.

No box may be checked from a unit test, mock precompile, local database, or verbal claim.
