import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job, PublicStats } from '@attestlock/shared';
import { formatUnits } from 'ethers';
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
  lockFactFromReceipt,
  readBalances,
  readBorrowerProfile,
  readCreditLine,
  repay,
  restoreWallet,
  shortAddress,
  switchChain,
  watchWallet,
  type BorrowerProfileView,
  type CreditLineView,
  type WalletSession,
  walletErrorMessage,
} from './wallet';
import {
  recordTransaction,
  updateTransaction,
  walletTransactions,
  type JournalAction,
  type JournalEntry,
} from './transaction-journal';

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
  const [profile, setProfile] = useState<BorrowerProfileView | null>(null);
  const [creditTx, setCreditTx] = useState<string | null>(null);
  const [sourceTx, setSourceTx] = useState<{ label: string; hash: string } | null>(null);
  const [balances, setBalances] = useState<Partial<{ collateral: string; credit: string }>>({});
  const [stats, setStats] = useState<PublicStats | null>(null);
  const recoveredEntries = useRef(new Set<string>());
  const latest = jobs[0];
  const executed = jobs.find((job) => job.status === 'executed' && job.evidence.lockId);

  const refreshJobs = useCallback(async (address: string) => {
    const next = await api.listJobs(address);
    setJobs(next);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    void restoreWallet()
      .then((restored) => {
        if (restored) setSession(restored);
      })
      .catch(() => undefined);
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
    if (!isConfigured) return;
    const refresh = () =>
      void api
        .stats()
        .then(setStats)
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    return watchWallet(() => {
      void connectWallet().then((next) => {
        setSession(next);
        setLine(null);
        setProfile(null);
        setBalances({});
        setNotice(`Wallet changed to ${shortAddress(next.address)} on ${chainLabel(next.chainId)}.`);
      });
    });
  }, [session?.address]);

  useEffect(() => {
    if (!session || !isConfigured) return;
    void refreshBalancesFor(session);
    void recoverTransactions(session);
  }, [session]);

  useEffect(() => {
    if (!session || session.chainId !== config.creditcoinChainId || !executed?.evidence.lockId) return;
    void refreshCreditState(session, executed.evidence.lockId);
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

  async function refreshCreditState(currentSession: WalletSession, lockId: string) {
    try {
      const [nextLine, nextProfile] = await Promise.all([
        readCreditLine(currentSession.signer, lockId),
        readBorrowerProfile(currentSession.signer, currentSession.address),
      ]);
      setLine(nextLine);
      setProfile(nextProfile);
    } catch {
      setLine(null);
      setProfile(null);
    }
  }

  function track(
    currentSession: WalletSession,
    action: JournalAction,
    txHash: string,
    lockId?: string
  ): JournalEntry {
    return recordTransaction(currentSession.address, currentSession.chainId, action, txHash, lockId);
  }

  async function queueFor(currentSession: WalletSession, txHash: string) {
    const journal = recordTransaction(currentSession.address, config.sepoliaChainId, 'queue', txHash);
    const challenge = await api.challenge(currentSession.address, txHash);
    const signature = await currentSession.signer.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );
    const job = await api.createJob({
      txHash,
      wallet: currentSession.address,
      signature,
      nonce: challenge.nonce,
    });
    updateTransaction(journal, 'confirmed', job.evidence.lockId);
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    setNotice('Proof job queued. The worker can prove the lock, but it cannot borrow for you.');
  }

  async function queue(txHash: string) {
    if (!session) throw new Error('Connect a wallet first.');
    return queueFor(session, txHash);
  }

  async function recoverTransactions(currentSession: WalletSession) {
    const entries = walletTransactions(currentSession.address);
    const source = entries.find(
      (entry) => entry.chainId === config.sepoliaChainId && entry.action !== 'queue'
    );
    const credit = entries.find(
      (entry) => entry.chainId === config.creditcoinChainId && ['borrow', 'repay'].includes(entry.action)
    );
    if (source) setSourceTx({ label: source.action === 'lock' ? 'Lock' : 'Recovered', hash: source.txHash });
    if (credit) setCreditTx(credit.txHash);

    for (const entry of entries.filter((candidate) => candidate.status === 'pending')) {
      if (recoveredEntries.current.has(entry.key)) continue;
      recoveredEntries.current.add(entry.key);
      if (entry.action === 'queue') {
        try {
          await queueFor(currentSession, entry.txHash);
        } catch {
          recoveredEntries.current.delete(entry.key);
        }
        continue;
      }
      if (entry.chainId !== currentSession.chainId) {
        recoveredEntries.current.delete(entry.key);
        continue;
      }
      try {
        const receipt = await currentSession.provider.getTransactionReceipt(entry.txHash);
        if (!receipt) {
          recoveredEntries.current.delete(entry.key);
          continue;
        }
        if (receipt.status !== 1) {
          updateTransaction(entry, 'failed');
          setNotice(`Recovered ${entry.action} transaction failed on-chain.`);
          continue;
        }
        if (entry.action === 'lock') {
          const fact = lockFactFromReceipt(receipt);
          updateTransaction(entry, 'confirmed', fact.lockId);
          setSourceTx({ label: 'Lock', hash: entry.txHash });
          await queueFor(currentSession, entry.txHash);
        } else {
          updateTransaction(entry, 'confirmed');
        }
        if (entry.lockId && currentSession.chainId === config.creditcoinChainId) {
          await refreshCreditState(currentSession, entry.lockId);
        }
        await refreshBalancesFor(currentSession);
      } catch {
        recoveredEntries.current.delete(entry.key);
      }
    }
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
          <p className="eyebrow">
            {config.previewMode || !isConfigured
              ? 'Proof-gated credit · judge-safe preview'
              : 'Proof-gated credit · live testnets'}
          </p>
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
                  let journal: JournalEntry | undefined;
                  const hash = await faucet(session!.signer, (submitted) => {
                    journal = track(session!, 'faucet', submitted);
                    setSourceTx({ label: 'Faucet', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed');
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
                  let journal: JournalEntry | undefined;
                  const hash = await approveCollateral(session!.signer, (submitted) => {
                    journal = track(session!, 'approve', submitted);
                    setSourceTx({ label: 'Approval', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed');
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
                  let journal: JournalEntry | undefined;
                  const locked = await lockCollateral(session!.signer, (submitted) => {
                    journal = track(session!, 'lock', submitted);
                    setSourceTx({ label: 'Lock', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed', locked.lockId);
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
              {latest.evidence.attestedHeight && (
                <div>
                  <dt>Attested height</dt>
                  <dd>{latest.evidence.attestedHeight.toLocaleString()}</dd>
                </div>
              )}
              {latest.evidence.creditcoinBlockNumber && (
                <div>
                  <dt>Creditcoin block</dt>
                  <dd>{latest.evidence.creditcoinBlockNumber.toLocaleString()}</dd>
                </div>
              )}
              {latest.evidence.gasUsed && (
                <div>
                  <dt>Proof gas</dt>
                  <dd>{BigInt(latest.evidence.gasUsed).toLocaleString()}</dd>
                </div>
              )}
              {latest.evidence.processingDurationMs !== undefined && (
                <div>
                  <dt>Proof latency</dt>
                  <dd>{Math.round(latest.evidence.processingDurationMs / 1000)}s</dd>
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
                  let journal: JournalEntry | undefined;
                  const hash = await borrow(
                    session!.signer,
                    executed!.evidence.lockId!,
                    '50',
                    (submitted) => {
                      journal = track(session!, 'borrow', submitted, executed!.evidence.lockId!);
                      setCreditTx(submitted);
                    }
                  );
                  if (journal) updateTransaction(journal, 'confirmed');
                  setCreditTx(hash);
                  await refreshCreditState(session!, executed!.evidence.lockId!);
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
                  const journals: JournalEntry[] = [];
                  const hash = await repay(
                    session!.signer,
                    executed!.evidence.lockId!,
                    line!.debt,
                    (action, submitted) => {
                      journals.push(track(session!, action, submitted, executed!.evidence.lockId!));
                      setCreditTx(submitted);
                    }
                  );
                  journals.forEach((journal) => updateTransaction(journal, 'confirmed'));
                  setCreditTx(hash);
                  await refreshCreditState(session!, executed!.evidence.lockId!);
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
          <section className="credit-profile" aria-label="Creditcoin borrower profile">
            <div>
              <span>Proven lines</span>
              <strong>{profile?.lineCount ?? '—'}</strong>
            </div>
            <div>
              <span>Credit opened</span>
              <strong>{profile ? `${profile.totalCreditOpened} mUSD` : '—'}</strong>
            </div>
            <div>
              <span>Total borrowed</span>
              <strong>{profile ? `${profile.totalBorrowed} mUSD` : '—'}</strong>
            </div>
            <div>
              <span>Total repaid</span>
              <strong>{profile ? `${profile.totalRepaid} mUSD` : '—'}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{profile ? `${profile.outstandingDebt} mUSD` : '—'}</strong>
            </div>
          </section>
        </article>
      </section>

      <section className="protocol-stats" aria-label="Public protocol activity">
        <div>
          <span>Authorized wallets (aggregate)</span>
          <strong>{stats?.uniqueWallets ?? '—'}</strong>
        </div>
        <div>
          <span>Proof jobs</span>
          <strong>{stats?.totalJobs ?? '—'}</strong>
        </div>
        <div>
          <span>Executed</span>
          <strong>{stats?.executedJobs ?? '—'}</strong>
        </div>
        <div>
          <span>Refused</span>
          <strong>{stats?.refusedJobs ?? '—'}</strong>
        </div>
        <div>
          <span>Lines opened</span>
          <strong>{stats?.linesOpened ?? '—'}</strong>
        </div>
        <div>
          <span>Borrowers who drew</span>
          <strong>{stats?.borrowersWhoDrew ?? '—'}</strong>
        </div>
        <div>
          <span>Outstanding debt</span>
          <strong>{stats ? `${formatUnits(stats.outstandingDebtAtomic, 6)} mUSD` : '—'}</strong>
        </div>
        <div>
          <span>Latest Sepolia attestation</span>
          <strong>{stats?.latestAttestedHeight?.toLocaleString() ?? '—'}</strong>
        </div>
        <small>Wallet counts are aggregate protocol activity, not verified unique people.</small>
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
        <p>Built for Creditcoin · DeFi track · Sepolia collateral</p>
      </footer>
    </main>
  );
}
