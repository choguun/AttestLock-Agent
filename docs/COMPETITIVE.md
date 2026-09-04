# Competitive positioning

Research snapshot: September 4, 2026. This is a primary-source comparison of public BUIDL CTC repositories, not a claim about judging rank, completeness, adoption, or production safety.

| Project                                                | Publicly stated proof-to-action flow                                                                                                 | Primary distinction from AttestLock                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [AttestDesk](https://github.com/Qidianyan/attestdesk)  | Proves a Sepolia invoice-settlement receipt before recording a haircut-adjusted credit advance                                       | AttestLock starts from escrowed fungible collateral, creates an explicit capped line, and leaves the draw to the borrower wallet |
| [CrossCredit](https://github.com/OoJae/crosscredit)    | Imports proven Aave repayment history into a score/tier and undercollateralized lending policy                                       | AttestLock prices one new line from a current capital lock rather than historical repayment reputation                           |
| [VeriSettle](https://github.com/anhquan075/verisettle) | Proves a Sepolia order-acceptance receipt before releasing Creditcoin escrow                                                         | AttestLock originates destination-chain credit; it does not release payment or claim cross-chain delivery                        |
| [LoomCredit](https://github.com/Anand-0038/loomcredit) | Registers proven supplier-finance evidence, then gates an accounting-only reservation with a model proposal and deterministic policy | AttestLock has no model or quote signer and demonstrates a real mock-token draw controlled only by the borrower                  |
| [Index41](https://github.com/edycutjong/index41)       | Proves transaction ordering and swap facts before paying a sandwich victim from a relay bond                                         | AttestLock proves one receipt-level collateral event; it does not attempt transaction-order forensics or compensation            |

## Defensible wedge

AttestLock's narrow product sentence is: **escrow → native proof → bounded line → user-signed draw**.

That sequence combines four properties in one judge-visible path:

- current collateral rather than only reputation;
- no bridge custody of the collateral asset;
- line creation is synchronous with native `0x0FD2` verification and policy checks;
- automation stops before borrowing, so the relayer cannot move borrower funds.

The reusable `BorrowerProfile` records only proof-opened lines and real draws/repayments. It is intentionally not an NFT, risk score, identity credential, or claim of creditworthiness.

## Market evidence boundary

Creditcoin's [Credal case study](https://creditcoin.org/Credal) describes transaction-authenticated credit history and future access to financial services as part of the network's credit thesis. That supports building a reusable Creditcoin-native repayment footprint. It does not establish demand for AttestLock itself.

This submission uses public research only. It does not invent TAM, interviews, pilots, commitments, partners, or user counts. Live aggregate usage, when available, comes from `/api/stats`.
