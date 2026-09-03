import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job } from '@attestlock/shared';
import { api } from './api';
import { config, isConfigured } from './config';
import { StatusTimeline } from './StatusTimeline';
import {
  approveCollateral,
  borrow,
  canBorrowLine,
  chainLabel,
  connectWallet,
  faucet,
  formatTimestamp,
  lockCollateral,
  readBalances,
  readCreditLine,
  repay,
  shortAddress,
  switchChain,
  watchWallet,
  type CreditLineView,
  type WalletSession,
  walletErrorMessage,
} from './wallet';

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <button className="copy-button" type="button" onClick={() => void navigator.clipboard.writeText(value)}>
      Copy {label}
    </button>
  );
}

export default function App() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [manualTx, setManualTx] = useState(config.invalidTxHash);
  const [notice, setNotice] = useState('Connect a wallet to begin.');
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<CreditLineView | null>(null);
  const [creditTx, setCreditTx] = useState<string | null>(null);
  const [sourceTx, setSourceTx] = useState<{ label: string; hash: string } | null>(null);
  const [balances, setBalances] = useState<Partial<{ collateral: string; credit: string }>>({});
  const latest = jobs[0];
  const executed = jobs.find((job) => job.status === 'executed' && job.evidence.lockId);

  const refreshJobs = useCallback(async (address: string) => {
    const next = await api.listJobs(address);
    setJobs(next);
  }, []);

  useEffect(() => {
    if (!session || !isConfigured) return;
    void refreshJobs(session.address);
    const stream = new EventSource(
      `${config.apiUrl}/api/events?wallet=${encodeURIComponent(session.address)}`
    );
    stream.addEventListener('job', (event) => {
      const job = JSON.parse((event as MessageEvent).data) as Job;
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    });
    return () => stream.close();
  }, [refreshJobs, session]);

  useEffect(() => {
    if (!session) return;
    return watchWallet(() => {
      void connectWallet().then((next) => {
        setSession(next);
        setLine(null);
        setBalances({});
        setNotice(`Wallet changed to ${shortAddress(next.address)} on ${chainLabel(next.chainId)}.`);
      });
    });
  }, [session?.address]);

  useEffect(() => {
    if (!session || !isConfigured) return;
    void refreshBalancesFor(session);
  }, [session]);

  useEffect(() => {
    if (!session || session.chainId !== config.creditcoinChainId || !executed?.evidence.lockId) return;
    void readCreditLine(session.signer, executed.evidence.lockId)
      .then(setLine)
      .catch(() => setLine(null));
  }, [executed?.evidence.lockId, session]);

  const proofFact = useMemo(() => {
    if (!latest) return 'No proof job yet.';
    return latest.explanation;
  }, [latest]);

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice(`${label}…`);
    try {
      await action();
    } catch (error) {
      setNotice(walletErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function refreshBalancesFor(currentSession: WalletSession) {
    try {
      const next = await readBalances(currentSession);
      setBalances((current) => ({ ...current, ...next }));
    } catch {
      // Balance evidence is helpful but does not control transaction safety.
    }
  }

  async function queue(txHash: string) {
    if (!session) throw new Error('Connect a wallet first.');
    const challenge = await api.challenge(session.address, txHash);
    const signature = await session.signer.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );
    const job = await api.createJob({ txHash, wallet: session.address, signature, nonce: challenge.nonce });
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    setNotice('Proof job queued. The worker can prove the lock, but it cannot borrow for you.');
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="AttestLock home">
          <span className="brand-mark">A</span>AttestLock
        </a>
        <div className="nav-actions">
          {session && <span className="network-pill">{chainLabel(session.chainId)}</span>}
          <button
            className="button secondary compact"
            onClick={() =>
              void act('connect', async () => {
                const connected = await connectWallet();
                setSession(connected);
                setNotice(`Connected ${shortAddress(connected.address)}.`);
              })
            }
          >
            {session ? shortAddress(session.address) : 'Connect wallet'}
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Proof-gated credit · live testnets</p>
          <h1>
            Collateral stays on Ethereum.
            <br />
            <em>Credit moves on proof.</em>
          </h1>
          <p className="hero-copy">
            Lock mock USDC on Sepolia. Attestcoin proves the exact successful escrow event. Creditcoin opens a
            50% line—then only you can borrow.
          </p>
        </div>
        <div className="proof-card" aria-label="Protocol guarantee">
          <span className="signal">
            <i /> FAIL CLOSED
          </span>
          <strong>0 valid proofs</strong>
          <p>means</p>
          <strong>0 credit lines</strong>
          <small>No oracle signer. No bridge custody. No agent discretion.</small>
        </div>
      </section>

      {!isConfigured && (
        <div className="banner" role="status">
          Contract addresses are not configured. The interface is in judge-safe preview mode; transactions
          stay disabled.
        </div>
      )}
      <div className="notice" role="status" aria-live="polite">
        {busy ? `${busy}…` : notice}
      </div>

      <section className="workspace" aria-label="AttestLock demo workspace">
        <article className="panel source-panel">
          <header>
            <span className="step">01</span>
            <div>
              <p>Ethereum Sepolia</p>
              <h2>Lock collateral</h2>
            </div>
          </header>
          <div className="metric">
            <span>You lock</span>
            <strong>
              100.00 <small>mUSDC</small>
            </strong>
          </div>
          <div className="term-row">
            <span>Term</span>
            <strong>15 days</strong>
          </div>
          <div className="term-row compact-row">
            <span>Wallet balance</span>
            <strong>{balances?.collateral ?? '—'} mUSDC</strong>
          </div>
          <div className="action-grid">
            <button
              className="button secondary"
              disabled={!session || !isConfigured || busy !== null}
              onClick={() =>
                void act('Switching network', async () =>
                  setSession(await switchChain(config.sepoliaChainId))
                )
              }
            >
              Switch to Sepolia
            </button>
            <button
              className="button secondary"
              disabled={
                !session || session.chainId !== config.sepoliaChainId || !isConfigured || busy !== null
              }
              onClick={() =>
                void act('Claiming faucet tokens', async () => {
                  const hash = await faucet(session!.signer);
                  setSourceTx({ label: 'Faucet', hash });
                  await refreshBalancesFor(session!);
                  setNotice('Faucet transaction confirmed.');
                })
              }
            >
              Claim faucet
            </button>
            <button
              className="button secondary"
              disabled={
                !session || session.chainId !== config.sepoliaChainId || !isConfigured || busy !== null
              }
              onClick={() =>
                void act('Approving vault', async () => {
                  const hash = await approveCollateral(session!.signer);
                  setSourceTx({ label: 'Approval', hash });
                  setNotice('Vault approval confirmed.');
                })
              }
            >
              Approve 100
            </button>
            <button
              className="button primary"
              disabled={
                !session || session.chainId !== config.sepoliaChainId || !isConfigured || busy !== null
              }
              onClick={() =>
                void act('Locking collateral', async () => {
                  const locked = await lockCollateral(session!.signer);
                  setSourceTx({ label: 'Lock', hash: locked.txHash });
                  await refreshBalancesFor(session!);
                  setNotice(`Collateral locked as ${locked.lockId.slice(0, 12)}…`);
                  await queue(locked.txHash);
                })
              }
            >
              Lock + prove
            </button>
          </div>
          {sourceTx && (
            <p className="transaction-link">
              <ExternalLink href={`${config.sepoliaExplorer}/tx/${sourceTx.hash}`}>
                {sourceTx.label} transaction
              </ExternalLink>{' '}
              <CopyValue value={sourceTx.hash} label="hash" />
            </p>
          )}
          <p className="microcopy">
            Withdrawal is available from the source vault only after expiry. Creditcoin cannot seize the
            Sepolia collateral in V1.
          </p>
        </article>

        <article className="panel proof-panel">
          <header>
            <span className="step">02</span>
            <div>
              <p>Attestcoin</p>
              <h2>Verify evidence</h2>
            </div>
          </header>
          {latest ? (
            <StatusTimeline status={latest.status} />
          ) : (
            <div className="empty-state">
              <span>PROOF</span>
              <p>A signed queue request starts deterministic verification.</p>
            </div>
          )}
          <div className={`verdict ${latest?.status ?? ''}`}>
            <span>
              {latest?.status === 'refused'
                ? 'REFUSED'
                : latest?.status === 'executed'
                  ? 'VERIFIED'
                  : 'POLICY'}
            </span>
            <p>{proofFact}</p>
          </div>
          {latest && (
            <dl className="evidence-list">
              <div>
                <dt>Source tx</dt>
                <dd>
                  <ExternalLink href={`${config.sepoliaExplorer}/tx/${latest.txHash}`}>
                    {latest.txHash.slice(0, 12)}…
                  </ExternalLink>
                </dd>
              </div>
              {latest.evidence.proofMerkleRoot && (
                <div>
                  <dt>Merkle root</dt>
                  <dd>{latest.evidence.proofMerkleRoot.slice(0, 12)}…</dd>
                </div>
              )}
              {latest.evidence.queryId && (
                <div>
                  <dt>Query ID</dt>
                  <dd>
                    {latest.evidence.queryId.slice(0, 12)}…{' '}
                    <CopyValue value={latest.evidence.queryId} label="query ID" />
                  </dd>
                </div>
              )}
              {latest.evidence.lockId && (
                <div>
                  <dt>Lock ID</dt>
                  <dd>
                    {latest.evidence.lockId.slice(0, 12)}…{' '}
                    <CopyValue value={latest.evidence.lockId} label="lock ID" />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </article>

        <article className="panel credit-panel">
          <header>
            <span className="step">03</span>
            <div>
              <p>Creditcoin</p>
              <h2>Use the line</h2>
            </div>
          </header>
          <div className="metric accent">
            <span>Maximum credit</span>
            <strong>
              {line?.limit ?? '—'} <small>mUSD</small>
            </strong>
          </div>
          <div className="term-row">
            <span>Current debt</span>
            <strong>{line?.debt ?? '—'} mUSD</strong>
          </div>
          <div className="line-details">
            <span>
              Line maturity <strong>{line ? formatTimestamp(line.maturity) : '—'}</strong>
            </span>
            <span>
              Collateral expiry <strong>{line ? formatTimestamp(line.collateralUnlockAt) : '—'}</strong>
            </span>
            <span>
              Wallet balance <strong>{balances?.credit ?? '—'} mUSD</strong>
            </span>
          </div>
          <button
            className="button secondary full"
            disabled={!session || busy !== null}
            onClick={() =>
              void act('Switching network', async () =>
                setSession(await switchChain(config.creditcoinChainId))
              )
            }
          >
            Switch to Creditcoin
          </button>
          <div className="action-grid">
            <button
              className="button primary"
              disabled={
                !canBorrowLine(session?.address, session?.chainId, executed?.evidence.lockId, line) ||
                busy !== null
              }
              onClick={() =>
                void act('Borrowing 50 mUSD', async () => {
                  const hash = await borrow(session!.signer, executed!.evidence.lockId!, '50');
                  setCreditTx(hash);
                  setLine(await readCreditLine(session!.signer, executed!.evidence.lockId!));
                  await refreshBalancesFor(session!);
                  setNotice('Borrow confirmed by your wallet.');
                })
              }
            >
              Borrow 50
            </button>
            <button
              className="button secondary"
              disabled={
                !session ||
                session.chainId !== config.creditcoinChainId ||
                !executed?.evidence.lockId ||
                !line ||
                Number(line.debt) === 0 ||
                busy !== null
              }
              onClick={() =>
                void act('Repaying debt', async () => {
                  const hash = await repay(session!.signer, executed!.evidence.lockId!, line!.debt);
                  setCreditTx(hash);
                  setLine(await readCreditLine(session!.signer, executed!.evidence.lockId!));
                  await refreshBalancesFor(session!);
                  setNotice('Repayment confirmed.');
                })
              }
            >
              Repay all
            </button>
          </div>
          {executed?.evidence.creditcoinTxHash && (
            <ExternalLink href={`${config.creditcoinExplorer}/tx/${executed.evidence.creditcoinTxHash}`}>
              Proof transaction
            </ExternalLink>
          )}
          {creditTx && (
            <>
              <span> · </span>
              <ExternalLink href={`${config.creditcoinExplorer}/tx/${creditTx}`}>
                Latest credit transaction
              </ExternalLink>
            </>
          )}
          <p className="microcopy">
            The relayer can open a bounded line. It cannot call <code>borrow</code> for you.
          </p>
        </article>
      </section>

      <section className="refusal-demo">
        <div>
          <p className="eyebrow">Negative-path evidence</p>
          <h2>Try a junk transaction.</h2>
          <p>
            A normal transfer, failed receipt, wrong vault, wrong event, expired term, tampered proof, or
            replay must leave credit state unchanged.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act('Queueing refusal demo', () => queue(manualTx));
          }}
        >
          <label htmlFor="invalid-tx">Sepolia transaction hash</label>
          <input
            id="invalid-tx"
            value={manualTx}
            onChange={(event) => setManualTx(event.target.value)}
            spellCheck={false}
          />
          <button className="button danger" disabled={!session || !isConfigured || busy !== null}>
            Prove it fails
          </button>
        </form>
      </section>

      <footer>
        <p>AttestLock is a testnet prototype. No interest, liquidation, or mainnet funds.</p>
        <p>Built for Creditcoin · DeFi track</p>
      </footer>
    </main>
  );
}
