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

[Public source/funding/negative transcript](../evidence/testnet-origination-inputs-2026-09-05.json). Source actions were signed locally through the encrypted demo-borrower keystore; this does **not** establish the hosted browser-wallet acceptance path. The valid proof passes a live call simulation but has not yet opened a line in a successful transaction.

## Hosting and remaining gates

The separate capped relayer was sealed directly into Railway. PostgreSQL remains private. Worker source is now connected to public main, with one always-on Singapore replica and bounded restarts. Its first deployment (`de198beb-c017-400e-b327-a718bbfe3742`) built the web bundle due to legacy root TOML selection and failed to start the worker. A failed build is not availability.

The platform rejects new custom TOML paths. The replacement [.railway configuration](../.railway/README.md) was imported with secrets represented by `preserve()` and its initial plan verified no changes. The removed TOML files are recoverable from Git; no Railway service, database or volume was deleted. [Railway migration documentation](https://docs.railway.com/infrastructure-as-code).

Pending: healthy hosted worker, valid native proof transaction, borrower draw, replay and junk record, live web/browser flow, actual seven-day repayment, scheduled smoke, final deck and public videos. Ingress proxy semantics remain unverified; no arbitrary forwarded headers are trusted. The final evidence checker intentionally still fails without the complete receipt set, especially post-maturity repayment.
