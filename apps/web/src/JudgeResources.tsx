import { config, isConfigured } from './config';

export const repositoryUrl = 'https://github.com/choguun/AttestLock-Agent';

export function JudgeResources() {
  return (
    <section className="judge-resources" id="getting-started" aria-label="Judge guide and resources">
      <h2>Start here. No wallet needed to inspect.</h2>
      <p>
        Lending and risk teams: inspect the published proof first, then try the fixed-term testnet flow. Setup
        takes about five minutes; faucet availability and attestation waiting time vary.
      </p>
      <ol>
        <li>
          Choose your testnet wallet above. Check its displayed address and network before every signature.
        </li>
        <li>
          Get free Sepolia ETH and Creditcoin testnet CTC. Never use mainnet funds or import a personal wallet
          key here.
        </li>
        <li>On Sepolia, claim the one-time 1,000 mUSDC faucet, approve 100, then lock for 15 days.</li>
        <li>Authorize the proof job. Wait for verification, switch to Creditcoin, and sign your own draw.</li>
        <li>
          Repay on Creditcoin, including after maturity. V1 has no liquidation or trustless source release.
        </li>
      </ol>
      <div className="resource-links">
        <a href={`${repositoryUrl}#readme`} target="_blank" rel="noreferrer">
          Repository / README ↗
        </a>
        <a href={`${repositoryUrl}/blob/main/docs/ONBOARDING.md`} target="_blank" rel="noreferrer">
          Onboarding guide ↗
        </a>
        <a
          href={`${repositoryUrl}/blob/main/docs/ONBOARDING.md#api-example`}
          target="_blank"
          rel="noreferrer"
        >
          API and integration ↗
        </a>
        <a
          href={`${repositoryUrl}/blob/main/docs/deck/AttestLock-Hackathon-Deck-borrow.pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Six-slide deck (partial evidence) ↗
        </a>
        <a href="https://ethereum.org/developers/docs/networks/#sepolia" target="_blank" rel="noreferrer">
          Sepolia gas faucets ↗
        </a>
        <a href="https://docs.creditcoin.org/wallets/using-testnet-faucet" target="_blank" rel="noreferrer">
          Creditcoin gas faucet ↗
        </a>
        {isConfigured && (
          <a href={`${config.apiUrl}/ready`} target="_blank" rel="noreferrer">
            Worker readiness ↗
          </a>
        )}
      </div>
      <p className="microcopy">
        Submission video and uncut technical appendix: not published yet. The example below explicitly lists
        its remaining acceptance gates.
      </p>
    </section>
  );
}
