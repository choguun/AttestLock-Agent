import { useEffect, useState } from 'react';
import { config } from './config';
import { formatUnits } from 'ethers';
import { repositoryUrl } from './JudgeResources';

export interface JudgeArtifact {
  schemaVersion: 1;
  acceptanceStage: 'complete' | 'native-origination' | 'borrow-demonstrated';
  checkedAt: string;
  proofArguments: unknown[];
  lock: {
    lockId: string;
    queryId: string;
    limitAtomic: string;
    collateralAmountAtomic: string;
    maturity: number;
  };
  profile: { totalBorrowedAtomic: string; totalRepaidAtomic: string; outstandingDebtAtomic: string };
  transactions: Record<string, { hash: string; blockNumber: number; status: number }>;
  invalidPathStateInvariant: true;
  queryProcessed: true;
}

export function parseJudgeArtifact(value: unknown): JudgeArtifact {
  const artifact = value as JudgeArtifact;
  const hash = (input: unknown) =>
    typeof input === 'string' && /^0x[0-9a-f]{64}$/i.test(input) && !/^0x0{64}$/i.test(input);
  if (
    !artifact ||
    artifact.schemaVersion !== 1 ||
    !['complete', 'native-origination', 'borrow-demonstrated'].includes(artifact.acceptanceStage) ||
    !Number.isFinite(Date.parse(artifact.checkedAt)) ||
    !Array.isArray(artifact.proofArguments) ||
    artifact.proofArguments.length !== 7 ||
    !hash(artifact.lock?.lockId) ||
    !hash(artifact.lock?.queryId) ||
    artifact.lock.collateralAmountAtomic !== '100000000' ||
    artifact.lock.limitAtomic !== '50000000' ||
    !Number.isSafeInteger(artifact.lock.maturity) ||
    artifact.lock.maturity <= 0 ||
    artifact.invalidPathStateInvariant !== true ||
    artifact.queryProcessed !== true
  )
    throw new Error('Incomplete judge evidence.');
  const requiredReceipts = ['lock', 'proof', 'junk', 'tamperedProof', 'duplicateQuery'];
  if (artifact.acceptanceStage !== 'native-origination') requiredReceipts.push('borrow');
  if (artifact.acceptanceStage === 'complete') requiredReceipts.push('repay');
  for (const name of requiredReceipts) {
    const receipt = artifact.transactions?.[name];
    if (
      !receipt ||
      !hash(receipt.hash) ||
      !Number.isSafeInteger(receipt.blockNumber) ||
      receipt.blockNumber <= 0 ||
      receipt.status !== (['tamperedProof', 'duplicateQuery'].includes(name) ? 0 : 1)
    )
      throw new Error('Missing required receipt.');
  }
  const profile = artifact.profile;
  if (
    !profile ||
    ![profile.totalBorrowedAtomic, profile.totalRepaidAtomic, profile.outstandingDebtAtomic].every((v) =>
      /^\d+$/.test(v)
    ) ||
    BigInt(profile.totalBorrowedAtomic) - BigInt(profile.totalRepaidAtomic) !==
      BigInt(profile.outstandingDebtAtomic)
  )
    throw new Error('Invalid profile accounting.');
  return artifact;
}

export function JudgeEvidence() {
  const [artifact, setArtifact] = useState<JudgeArtifact | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/evidence/verified.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Not published');
        return response.json();
      })
      .then(parseJudgeArtifact)
      .then((value) => {
        if (!controller.signal.aborted) setArtifact(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <section
      className="refusal-demo judge-evidence"
      id="judge-evidence"
      aria-label="Wallet-free judge evidence"
    >
      <div>
        <p className="eyebrow">No wallet required</p>
        <h2>Inspect the evidence.</h2>
        {!artifact ? (
          <p>
            No verified example has been published yet. Preview screens and mocked tests are not live-chain
            evidence.
          </p>
        ) : (
          <>
            <p>
              Published checker snapshot: {artifact.checkedAt}. This is historical evidence, not a live
              balance. Re-run the{' '}
              <a href={`${repositoryUrl}/blob/main/docs/EVIDENCE.md`} target="_blank" rel="noreferrer">
                documented evidence command
              </a>{' '}
              to verify current chain state.
            </p>
            <p>
              100 mUSDC collateral → 50 mUSD limit. Lock: <code>{artifact.lock.lockId}</code>
            </p>
            {artifact.acceptanceStage === 'native-origination' ? (
              <p>
                Partial live evidence: native proof opened the exact line; junk refusal, unused-query tamper
                and query replay were verified. This snapshot does not certify a browser draw, post-maturity
                repayment, videos, or submission readiness.
              </p>
            ) : artifact.acceptanceStage === 'borrow-demonstrated' ? (
              <p>
                Partial live evidence: native proof opened the exact line and the borrower signed a 50 mUSD
                draw. The checker verified calldata, token movement, profile accounting, junk refusal, tamper
                and query replay. Post-maturity repayment, the full browser onboarding, videos, and submission
                readiness are not certified by this snapshot.
              </p>
            ) : (
              <p>
                Policy checker: exact receipt/event, borrower-signed draw, post-maturity repayment, replay
                rejection, and unchanged invalid-path state.
              </p>
            )}
            <p>
              Borrower accounting: {formatUnits(artifact.profile.totalBorrowedAtomic, 6)} mUSD borrowed −{' '}
              {formatUnits(artifact.profile.totalRepaidAtomic, 6)} mUSD repaid ={' '}
              {formatUnits(artifact.profile.outstandingDebtAtomic, 6)} mUSD debt.
            </p>
            <p>
              Line maturity (UTC):{' '}
              <time dateTime={new Date(artifact.lock.maturity * 1000).toISOString()}>
                {new Date(artifact.lock.maturity * 1000).toISOString()}
              </time>
              . Post-maturity repayment must be evidenced after this timestamp.
            </p>
            <p>
              Policy checks: 100 mUSDC → 50 mUSD; query recorded; rejected-path state unchanged. Full atomic
              amounts and the query ID are in the downloadable evidence.
            </p>
            <ul>
              {Object.entries(artifact.transactions).map(([name, receipt]) => (
                <li key={name}>
                  <a
                    href={`${['lock', 'junk'].includes(name) ? config.sepoliaExplorer : config.creditcoinExplorer}/tx/${receipt.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {name}: block {receipt.blockNumber}, receipt status {receipt.status} ↗
                  </a>
                  {name === 'junk' && (
                    <p>
                      Source transfer succeeded, but the worker refused it as a non-vault transaction. No
                      destination proof submission or credit line was created for this job.
                    </p>
                  )}
                  {name === 'tamperedProof' && (
                    <p>Expected revert: mutated proof rejected while its query was unused.</p>
                  )}
                  {name === 'duplicateQuery' && (
                    <p>Expected revert: identical proof calldata rejected after the valid execution.</p>
                  )}
                </li>
              ))}
            </ul>
            <details>
              <summary>Official seven-argument proof payload</summary>
              <pre tabIndex={0} aria-label="Scrollable official proof payload">
                {JSON.stringify(artifact.proofArguments, null, 2)}
              </pre>
            </details>
            <a href="/evidence/verified.json" download>
              Download sanitized checker evidence
            </a>
          </>
        )}
      </div>
    </section>
  );
}
