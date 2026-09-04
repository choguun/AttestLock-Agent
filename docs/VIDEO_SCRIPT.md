# 90-second video script

**0:00–0:10**
“Collateral on one chain should not require a bridge or oracle signer to become useful elsewhere. AttestLock keeps mock USDC on Sepolia and lets Creditcoin act only on a cryptographic proof.”

**0:10–0:25**
“I lock 100 mock USDC for 15 days. The vault emits one exact collateral fact, and my wallet signs a short-lived EIP-712 request bound to this transaction.”

**0:25–0:48**
“The worker checks the receipt, waits for Attestcoin attestation, builds Merkle and continuity proofs, and simulates the destination call. Creditcoin's BlockProver verifies the proof on-chain; the ASC then checks the vault, event, borrower, token, amount, term, and both replay keys.”

**0:48–1:02**
“Here is the successful Creditcoin transaction. It opened exactly a 50 mUSD line from 100 mUSDC collateral.”

**1:02–1:15**
“The relayer stops there. Only my wallet can borrow, so I explicitly sign the 50 mUSD draw.”

**1:15–1:26**
“Now I use the one-click junk transaction. It has no registered lock event, so the job is refused and destination state stays unchanged.”

**1:26–1:30**
“Collateral stays on Ethereum. No valid proof means no Creditcoin credit.”

## Uncut technical appendix

Record a second, unedited walkthrough after the submission cut. It must show the sanitized seven-field ProofBuilder tuple, source receipt and decoded lock event, native `0x0FD2` proof receipt, matching ASC event and pool line, borrower-signed draw, post-maturity repayment, both replay flags, and borrower-profile accounting. Then show the junk refusal plus broadcast tampered-proof and duplicate-query reverts with the live-evidence command's before/after state assertions. Keep RPC credentials, database URLs, wallet secrets, and browser extension internals off-screen.
