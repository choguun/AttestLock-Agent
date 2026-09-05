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
  assertJournalAvailable,
  updateTransaction,
  walletTransactions,
  type JournalAction,
  type JournalEntry,
  type TransactionIdentity,
  resolveReplacement,
} from './transaction-journal';
import { mergeJobs } from './job-recovery';
import { JudgeEvidence } from './JudgeEvidence';

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-button"
      type="button"
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }
    >
      {copied ? 'Copied' : `Copy ${label}`}
    </button>
  );
}

function ReplacementRecovery({
  entry,
  onResolve,
}: {
  entry: JournalEntry;
  onResolve: (hash: string) => Promise<void>;
}) {
  const [hash, setHash] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <details>
      <summary>Resolve replaced or cancelled {entry.action} transaction</summary>
      <p>
        The original stays pending until a receipt or a confirmed same-wallet, same-nonce replacement is
        verified. No transaction is sent here.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setMessage('Checking replacement…');
          void onResolve(hash)
            .then(() => setMessage('Replacement reconciled.'))
            .catch(() =>
              setMessage(
                'Cannot verify this replacement. Check its chain, wallet, nonce, and confirmed receipt.'
              )
            )
            .finally(() => setPending(false));
        }}
      >
        <label htmlFor={`replacement-${entry.key}`}>Confirmed replacement hash for {entry.action}</label>
        <input
          id={`replacement-${entry.key}`}
          value={hash}
          onChange={(event) => setHash(event.target.value)}
          pattern="0x[0-9a-fA-F]{64}"
          required
        />
        <button disabled={pending} className="button secondary">
          Check replacement
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
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
  const sessionRef = useRef<WalletSession | null>(null);
  sessionRef.current = session;
  const walletRevision = useRef(0);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [selectedLock, setSelectedLock] = useState('');
  const selectedLockRef = useRef('');
  selectedLockRef.current = selectedLock;
  const [, tick] = useState(0);
  const pendingWalletTx = journal.some(
    (entry) => entry.status === 'pending' && entry.action !== 'queue' && entry.chainId === session?.chainId
  );
  const pendingQueue = journal.find((entry) => entry.action === 'queue' && entry.status === 'pending');
  const latest = jobs[0];
  const creditJobs = jobs.filter((job) => job.status === 'executed' && job.evidence.lockId);
  const executed = creditJobs.find((job) => job.evidence.lockId === selectedLock) ?? creditJobs[0];

  const refreshJobs = useCallback(async (address: string) => {
    const revision = walletRevision.current;
    const next = await api.listJobs(address);
    if (
      revision !== walletRevision.current ||
      sessionRef.current?.address.toLowerCase() !== address.toLowerCase()
    )
      return;
    setJobs((current) => mergeJobs(current, next, address));
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    const revision = walletRevision.current;
    void restoreWallet()
      .then((restored) => {
        if (restored && revision === walletRevision.current) setSession(restored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session || !isConfigured) return;
    let disposed = false;
    const refresh = () => {
      if (!disposed) void refreshJobs(session.address).catch(() => undefined);
    };
    refresh();
    const poll = window.setInterval(refresh, 5_000);
    const stream = new EventSource(
      `${config.apiUrl}/api/events?wallet=${encodeURIComponent(session.address)}`
    );
    stream.addEventListener('job', (event) => {
      if (disposed) return;
      try {
        const job = JSON.parse((event as MessageEvent).data) as Job;
        setJobs((current) => mergeJobs(current, [job], session.address));
      } catch {
        refresh();
      }
    });
    stream.addEventListener('open', refresh);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      stream.close();
    };
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
    if (!window.ethereum) return;
    return watchWallet(() => {
      walletRevision.current += 1;
      sessionRef.current = null;
      setSession(null);
      setJobs([]);
      setJournal([]);
      setLine(null);
      setProfile(null);
      setBalances({});
      setCreditTx(null);
      setSourceTx(null);
      setSelectedLock('');
      setBusy(null);
      recoveredEntries.current.clear();
      const revision = walletRevision.current;
      void restoreWallet()
        .then((next) => {
          if (revision !== walletRevision.current) return;
          setSession(next);
          setNotice(
            next
              ? `Wallet changed to ${shortAddress(next.address)} on ${chainLabel(next.chainId)}.`
              : 'Wallet disconnected.'
          );
        })
        .catch(() => {
          if (revision === walletRevision.current) setNotice('Wallet disconnected.');
        });
    });
  }, []);

  useEffect(() => {
    if (!session || !isConfigured) return;
    void refreshBalancesFor(session);
    void recoverTransactions(session);
    const timer = window.setInterval(() => {
      void recoverTransactions(session);
      tick((value) => value + 1);
    }, 4_000);
    return () => window.clearInterval(timer);
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
    if (busy !== null) return;
    const revision = walletRevision.current;
    setBusy(label);
    setNotice(`${label}…`);
    try {
      assertJournalAvailable();
      await action();
    } catch (error) {
      if (revision === walletRevision.current) setNotice(walletErrorMessage(error));
    } finally {
      if (revision === walletRevision.current) setBusy(null);
    }
  }

  async function refreshBalancesFor(currentSession: WalletSession) {
    try {
      const next = await readBalances(currentSession);
      if (sessionRef.current !== currentSession) return;
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
      if (
        sessionRef.current !== currentSession ||
        (selectedLockRef.current && selectedLockRef.current !== lockId)
      )
        return;
      setLine(nextLine);
      setProfile(nextProfile);
    } catch {
      if (sessionRef.current !== currentSession) return;
      setLine(null);
      setProfile(null);
    }
  }

  function track(
    currentSession: WalletSession,
    action: JournalAction,
    txHash: string,
    lockId?: string,
    identity?: TransactionIdentity
  ): JournalEntry {
    const entry = recordTransaction(
      currentSession.address,
      currentSession.chainId,
      action,
      txHash,
      lockId,
      identity
    );
    assertCurrent(currentSession);
    setJournal(walletTransactions(currentSession.address));
    return entry;
  }

  function assertCurrent(currentSession: WalletSession): void {
    if (sessionRef.current !== currentSession)
      throw new Error('Wallet changed. Resume from the transaction journal.');
  }

  async function queueFor(currentSession: WalletSession, txHash: string) {
    assertCurrent(currentSession);
    if (!isConfigured || currentSession.chainId !== config.sepoliaChainId)
      throw new Error('Switch to Sepolia to authorize this proof.');
    const journal = recordTransaction(currentSession.address, config.sepoliaChainId, 'queue', txHash);
    const challenge = await api.challenge(currentSession.address, txHash);
    assertCurrent(currentSession);
    const signature = await currentSession.signer.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );
    assertCurrent(currentSession);
    const job = await api.createJob({
      txHash,
      wallet: currentSession.address,
      signature,
      nonce: challenge.nonce,
    });
    updateTransaction(journal, 'confirmed', job.evidence.lockId);
    assertCurrent(currentSession);
    setJournal(walletTransactions(currentSession.address));
    setJobs((current) => mergeJobs(current, [job], currentSession.address));
    setNotice('Proof job queued. The worker can prove the lock, but it cannot borrow for you.');
  }

  async function queue(txHash: string) {
    if (!session) throw new Error('Connect a wallet first.');
    return queueFor(session, txHash);
  }

  async function recoverTransactions(currentSession: WalletSession) {
    if (sessionRef.current !== currentSession) return;
    const entries = walletTransactions(currentSession.address);
    for (const locked of entries.filter((entry) => entry.action === 'lock' && entry.status === 'confirmed')) {
      if (!entries.some((entry) => entry.action === 'queue' && entry.txHash === locked.txHash)) {
        recordTransaction(
          currentSession.address,
          config.sepoliaChainId,
          'queue',
          locked.txHash,
          locked.lockId
        );
      }
    }
    for (const authorization of entries.filter(
      (entry) => entry.action === 'queue' && entry.status === 'pending'
    )) {
      const existing = jobsRef.current.find((job) => job.txHash.toLowerCase() === authorization.txHash);
      if (existing) updateTransaction(authorization, 'confirmed', existing.evidence.lockId);
    }
    setJournal(entries);
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
        recoveredEntries.current.delete(entry.key);
        continue;
      }
      if (entry.chainId !== currentSession.chainId) {
        recoveredEntries.current.delete(entry.key);
        continue;
      }
      try {
        const receipt = await currentSession.provider.getTransactionReceipt(entry.txHash);
        if (sessionRef.current !== currentSession) return;
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
          recordTransaction(
            currentSession.address,
            config.sepoliaChainId,
            'queue',
            entry.txHash,
            fact.lockId
          );
          setNotice(
            'Lock confirmed. Resume authorization when you are ready; no signature is requested automatically.'
          );
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
    if (sessionRef.current === currentSession) setJournal(walletTransactions(currentSession.address));
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
      {pendingWalletTx && (
        <div className="banner" role="status">
          A wallet transaction is pending on this network. Its receipt is being checked; duplicate sends are
          disabled.
        </div>
      )}
      {pendingQueue && (
        <button
          className="button secondary"
          disabled={!isConfigured || busy !== null || session?.chainId !== config.sepoliaChainId}
          onClick={() => void act('Resuming authorization', () => queue(pendingQueue.txHash))}
        >
          Resume authorization
        </button>
      )}

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
                !session ||
                session.chainId !== config.sepoliaChainId ||
                !isConfigured ||
                busy !== null ||
                pendingWalletTx
              }
              onClick={() =>
                void act('Claiming faucet tokens', async () => {
                  let journal: JournalEntry | undefined;
                  const hash = await faucet(session!.signer, (submitted, identity) => {
                    journal = track(session!, 'faucet', submitted, undefined, identity);
                    setSourceTx({ label: 'Faucet', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed');
                  assertCurrent(session!);
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
                !session ||
                session.chainId !== config.sepoliaChainId ||
                !isConfigured ||
                busy !== null ||
                pendingWalletTx
              }
              onClick={() =>
                void act('Approving vault', async () => {
                  let journal: JournalEntry | undefined;
                  const hash = await approveCollateral(session!.signer, (submitted, identity) => {
                    journal = track(session!, 'approve', submitted, undefined, identity);
                    setSourceTx({ label: 'Approval', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed');
                  assertCurrent(session!);
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
                !session ||
                session.chainId !== config.sepoliaChainId ||
                !isConfigured ||
                busy !== null ||
                pendingWalletTx
              }
              onClick={() =>
                void act('Locking collateral', async () => {
                  let journal: JournalEntry | undefined;
                  const locked = await lockCollateral(session!.signer, (submitted, identity) => {
                    journal = track(session!, 'lock', submitted, undefined, identity);
                    setSourceTx({ label: 'Lock', hash: submitted });
                  });
                  if (journal) updateTransaction(journal, 'confirmed', locked.lockId);
                  recordTransaction(
                    session!.address,
                    config.sepoliaChainId,
                    'queue',
                    locked.txHash,
                    locked.lockId
                  );
                  assertCurrent(session!);
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
          {creditJobs.length > 0 && (
            <label>
              Credit line history
              <select
                aria-label="Credit line history"
                value={executed?.evidence.lockId ?? ''}
                onChange={(event) => {
                  setSelectedLock(event.target.value);
                  setLine(null);
                }}
              >
                {creditJobs.map((job) => (
                  <option key={job.id} value={job.evidence.lockId}>
                    {job.evidence.lockId?.slice(0, 12)}… · {new Date(job.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                !isConfigured ||
                pendingWalletTx ||
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
                    (submitted, identity) => {
                      journal = track(session!, 'borrow', submitted, executed!.evidence.lockId!, identity);
                      setCreditTx(submitted);
                    }
                  );
                  if (journal) updateTransaction(journal, 'confirmed');
                  assertCurrent(session!);
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
                !isConfigured ||
                pendingWalletTx ||
                busy !== null
              }
              onClick={() =>
                void act('Repaying debt', async () => {
                  const journals: JournalEntry[] = [];
                  const hash = await repay(
                    session!.signer,
                    executed!.evidence.lockId!,
                    line!.debt,
                    (action, submitted, identity) => {
                      journals.push(track(session!, action, submitted, executed!.evidence.lockId!, identity));
                      setCreditTx(submitted);
                    }
                  );
                  journals.forEach((journal) => updateTransaction(journal, 'confirmed'));
                  assertCurrent(session!);
                  setCreditTx(hash);
                  await refreshCreditState(session!, executed!.evidence.lockId!);
                  await refreshBalancesFor(session!);
                  setNotice('Repayment confirmed.');
                })
              }
            >
              {journal.some(
                (entry) =>
                  entry.action === 'repay_approve' &&
                  entry.status === 'confirmed' &&
                  entry.lockId === executed?.evidence.lockId
              )
                ? 'Continue repayment'
                : 'Repay all'}
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
          <strong>
            {stats?.outstandingDebtAtomic != null
              ? `${formatUnits(stats.outstandingDebtAtomic, 6)} mUSD`
              : '—'}
          </strong>
        </div>
        <div>
          <span>Latest Sepolia attestation</span>
          <strong>{stats?.latestAttestedHeight?.toLocaleString() ?? '—'}</strong>
        </div>
        <small>
          Wallet counts are aggregate protocol activity, not verified unique people. Chain metrics:{' '}
          {stats?.protocolStatus ?? 'unavailable'}
          {stats?.asOfBlock != null ? ` at block ${stats.asOfBlock}` : ''}.
        </small>
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

      {session && pendingWalletTx && (
        <section className="refusal-demo" aria-label="Transaction recovery">
          <div>
            <h2>Pending wallet transactions</h2>
            {journal
              .filter(
                (entry) =>
                  entry.status === 'pending' && entry.action !== 'queue' && entry.chainId === session.chainId
              )
              .map((entry) => (
                <ReplacementRecovery
                  key={entry.key}
                  entry={entry}
                  onResolve={async (hash) => {
                    const current = session;
                    assertCurrent(current);
                    const [replacement, receipt, original] = await Promise.all([
                      current.provider.getTransaction(hash),
                      current.provider.getTransactionReceipt(hash),
                      entry.identity ? Promise.resolve(null) : current.provider.getTransaction(entry.txHash),
                    ]);
                    assertCurrent(current);
                    if (!replacement || !receipt) throw new Error('Replacement is not confirmed.');
                    const identity =
                      entry.identity ??
                      (original
                        ? {
                            nonce: original.nonce,
                            to: original.to,
                            data: original.data,
                            value: original.value.toString(),
                          }
                        : undefined);
                    resolveReplacement({ ...entry, identity }, replacement, receipt);
                    await recoverTransactions(current);
                  }}
                />
              ))}
          </div>
        </section>
      )}
      <JudgeEvidence />

      <footer>
        <p>AttestLock is a testnet prototype. No interest, liquidation, or mainnet funds.</p>
        <p>Built for Creditcoin · DeFi track · Sepolia collateral</p>
      </footer>
    </main>
  );
}
