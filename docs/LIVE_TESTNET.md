# Live testnet observations — September 5, 2026

This is **partial live evidence**, not submission completion or a 93/100 claim. The deployed Solidity comes from green merged commit `6aec094ed321675199eaa2ff818e4a719c67a37b`, [CI 33959893700](https://github.com/choguun/AttestLock-Agent/actions/runs/33959893700). Compiler/artifact provenance was captured before any broadcast.

## Verified deployments

| Network           | Contract      | Verified address                                                                                                                           |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sepolia           | MockUSDC      | [0x619d67E4765b22dd847144Ac4D39027753d60Eff](https://eth-sepolia.blockscout.com/address/0x619d67E4765b22dd847144Ac4D39027753d60Eff)        |
| Sepolia           | LockVault     | [0x531B08Eff2D067E9Bd86212E599457877Fc5D372](https://eth-sepolia.blockscout.com/address/0x531B08Eff2D067E9Bd86212E599457877Fc5D372)        |
| Creditcoin 102031 | MockUSD       | [0x531B08Eff2D067E9Bd86212E599457877Fc5D372](https://creditcoin-testnet.blockscout.com/address/0x531B08Eff2D067E9Bd86212E599457877Fc5D372) |
| Creditcoin 102031 | CreditPool    | [0x2E6C991d87424f3318d0d050ee340bbEfEC94634](https://creditcoin-testnet.blockscout.com/address/0x2E6C991d87424f3318d0d050ee340bbEfEC94634) |
| Creditcoin 102031 | AttestLockASC | [0x1CA573B695309b2Bfaf7F306B76dc16443708117](https://creditcoin-testnet.blockscout.com/address/0x1CA573B695309b2Bfaf7F306B76dc16443708117) |

[Sepolia manifest](../deployments/sepolia.json), [Creditcoin manifest](../deployments/creditcoin-testnet.json): real receipt/block/UTC times, creation arguments, runtime code hashes, actual compiler/dependencies and certified SHA. Source block: **11639710**; destination first deployment block: **5434262**. Pool funding: **1,000,000 mUSD**. Matching numeric addresses on different networks are not the same contract.

Deployment tools encountered two real-world differences. Foundry required `FOUNDRY_BYPASS_PREVRANDAO=true` for Frontier simulation; no contract depends on randomness and no bytecode/compiler target was changed. This follows the [official Creditcoin Foundry template](https://github.com/gluwa/creditcoin-foundry-template). Foundry's source broadcast JSON associated two transaction hashes with the wrong CREATE metadata; the exporter resolves receipts by contract address and verifies actual transaction bytecode. Both reported and authoritative hashes remain in the manifest, and a regression test covers the mismatch.

## Real source lock and native rejection

- Dedicated borrower `0xdc56fd8775Fe11B8E881A300aA878EAc7Bb1637A` claimed 1,000 mUSDC and approved/locked **100 mUSDC**.
- [Lock receipt](https://eth-sepolia.blockscout.com/tx/0xf93882f35ac789132fbe46205d699fbbb01b254862b0624e3ea20f4d11491b8f): block **11639758**, **2026-09-05 10:24:24 UTC**, gas **148,876**.
- Lock ID: `0xaab90d516e9c2f35987d428c3466d6c7ea7785004b2adf682a04a98c39d0ec3e`; collateral unlock timestamp **1789817040**.
- [Real ProofBuilder fixture](../fixtures/proofs/sepolia-lock-2026-09-05.json) acquired at **10:32:55.028 UTC**, native attested height **11639760**. Observed lock-to-payload time was approximately **511 seconds**, not a promised SLA. The fixture regression checks the tuple, index/query packing, receipt, borrower, token, lock fact and expected 50 mUSD limit.
- [Tampered proof](https://creditcoin-testnet.blockscout.com/tx/0xe13fdfc8175bad436c3ae45b71e85a744ae2f4c3f42caef8b25b3645a7fc2312): block **5434321**, status **0**, gas **148,120**. Only encoded transaction bytes were mutated. The query was unused, and line/replay/profile/token state stayed unchanged.
- Native `0x0FD2` returned exact `Error("Merkle proof validation failed")`, not a false boolean. Both worker classification and the strict evidence checker now recognize that exact observed reason. Other revert strings do not satisfy the negative gate.
- Query ID: `0x7bb52ea9c6053bfce048d4a6186186004ebd72d38aded14e618c6c1778dd680f`.

[Public source/funding/negative transcript](../evidence/testnet-origination-inputs-2026-09-05.json). Source actions were signed locally through the encrypted demo-borrower keystore; this does **not** establish the hosted browser-wallet acceptance path.

## Successful native origination

- [Native proof transaction](https://creditcoin-testnet.blockscout.com/tx/0xa064d130e0aaaa4e6068e0cb2bb3f50d46bc531a004273d8dc28827ff91a05d9): block **5434496**, **2026-09-05 11:21:15 UTC**, status **1**, gas **350,379**, signer the separate Railway relayer `0xeD699A3FDe6C3552f312fAD2b38208b22186ef01`.
- The exact line is **100,000,000 collateral / 50,000,000 credit atomic units**, borrower `0xdc56…637A`, matching query and lock. Initial profile: one line, 50,000,000 credit opened, no draw or debt yet.
- **Maturity: September 12, 2026, 11:21:15 UTC / 18:21:15 Bangkok**, derived from the actual opening block plus seven days. Post-maturity repayment must wait for this time.
- [Executed API job](https://attestlock-worker-production.up.railway.app/api/jobs/bd5fdaf1-8a8f-4334-ae1f-6a5916080f28): **59,568 ms** queue-to-executed reconciliation, after source attestation was already available. This is not end-to-end lock latency or an SLA.
- [Identical-calldata query replay](https://creditcoin-testnet.blockscout.com/tx/0x4f608b360d164a90d9609036e2f2dfc0bcd4682072d87534347d7a02d14f5a6c): block **5434507**, status **0**, gas **163,226**, exact `QueryAlreadyProcessed`; line, profile, both replay flags and pool/borrower balances unchanged.
- [Actual junk refusal](https://attestlock-worker-production.up.railway.app/api/jobs/f41b50b0-f121-4cfb-9ec2-3dac4d8e603b): known non-vault source hash, `WRONG_SOURCE_CONTRACT`, no funded Creditcoin submission.
- [Executed proof fixture](../fixtures/proofs/creditcoin-executed-2026-09-05.json) encodes the actual successful calldata. ProofBuilder extended continuity from **3 to 43 roots** between initial acquisition/tamper and execution; all transaction/query fields are unchanged. The checker verifies the prefix extension, exact byte-only tamper, and successful **historical native call of its original unmutated counterpart** before the unused-query rejection. It does not treat a changed proof anchor as an identical payload.

[Native origination transcript](../evidence/native-origination-2026-09-05.json). `node scripts/publish-origination-evidence.mjs` rechecks the actual positive and negative receipts and historical states and publishes an explicitly **partial native-origination** wallet-free snapshot. This cannot certify draw, repayment, videos or final submission. The default full evidence command remains fail-closed without every required receipt.

## Hosted borrower draw — 12:53:30 UTC

- [Borrow transaction](https://creditcoin-testnet.blockscout.com/tx/0xb631739d1a05410e3ca6a26b88de068ea514cec1d18b758d8aebde49e684dba4): Creditcoin block **5434865**, **2026-09-05 12:53:30 UTC**, status **1**, gas **141,434**. Signer is the exact source borrower, not the relayer.
- The hosted app connected to the imported dedicated Rabby account, switched to Creditcoin and initiated `borrow(lockId, 50000000)`. The receipt proves the borrower signature; the wallet approval modal itself was not visible to automation and was not recorded. No duplicate transaction was sent when the user requested a retry.
- [Sanitized draw fixture](../evidence/borrow-2026-09-05.json) contains calldata, receipt logs, canonical block linkage and historical before/after state. The checker requires the exact pool `Borrowed` and profile events, MockUSD `Transfer`, 50 mUSD pool-to-borrower balance deltas, unchanged line terms/replay flags and matching profile deltas.
- Profile at the draw block: **1 line / 50 mUSD credit opened / 50 borrowed / 0 repaid / 50 debt**. The borrower received **50 mUSD**; maturity remains September 12 at 18:21:15 Bangkok.
- Reproduce with `BORROW_TX_HASH=0xb631739d1a05410e3ca6a26b88de068ea514cec1d18b758d8aebde49e684dba4 pnpm evidence:origination`. This also rechecks the original proof and negatives, then publishes stage **`borrow-demonstrated`**. It does not claim repayment or complete browser onboarding: the original faucet/approval/lock were signed locally.

## Hosting and remaining gates

The separate capped relayer was sealed directly into Railway. PostgreSQL remains private. Worker source is now connected to public main, with one always-on Singapore replica and bounded restarts. Its first deployment (`de198beb-c017-400e-b327-a718bbfe3742`) built the web bundle due to legacy root TOML selection and failed to start the worker. A failed build is not availability.

The platform rejects new custom TOML paths. The replacement [.railway configuration](../.railway/README.md) was imported with secrets represented by `preserve()` and its initial plan verified no changes. The removed TOML files are recoverable from Git; no Railway service, database or volume was deleted. [Railway migration documentation](https://docs.railway.com/infrastructure-as-code).

**Recovery verified:** release `8d2c2bf13c3a5d1d3ecfeef6e41245c9245e6d7b`, [merged-main CI 33961818287](https://github.com/choguun/AttestLock-Agent/actions/runs/33961818287), runs as worker deployment `b63fc834-34b7-4003-a756-dd882f048d77` and live web deployment `95ef618d-c767-44ac-b5a0-5139c5e4203f`. `/ready` observed advancement before permitting broadcast. Database, source/destination RPCs, bytecode, immutable bindings, ChainInfo, ProofBuilder and relayer funding all passed.

[Production smoke 33963339337](https://github.com/choguun/AttestLock-Agent/actions/runs/33963339337) passed via manual dispatch. The existing six-hour schedule is enabled; a successful scheduled run against the final submission release remains a separate gate. Observed aggregate activity was two jobs, one authorized operator wallet, one executed and one refused—not independent users or market validation.

**Later release observation:** PR #6 merged as `b7e71f25ea0fed3e851ef6ae2bdf5b04975d1c36`; [main CI 33964655735](https://github.com/choguun/AttestLock-Agent/actions/runs/33964655735) passed 111 tests with zero skips and seven browser paths. Worker `8cf69ba0-3c19-4dd6-9078-cac29df92924` and web `d07c07ef-2237-46d1-a7a5-aff42eb41332` ran that release. [Scheduled smoke 33966292097](https://github.com/choguun/AttestLock-Agent/actions/runs/33966292097) actually executed `pnpm smoke:production` and passed at 12:31 UTC; this is not a skipped workflow or merely a manual dispatch. Future submission commits must obtain their own passing schedule.

Pending: full live browser-wallet onboarding, actual seven-day repayment, final-release scheduled smoke, final media and public videos. Ingress proxy semantics remain unverified; no arbitrary forwarded headers are trusted. The full evidence checker intentionally still fails without the complete receipt set, especially post-maturity repayment. Use the executed fixture as `PROOF_FIXTURE_FILE` and the original fixture as `TAMPER_PROOF_FIXTURE_FILE` when rerunning it.
