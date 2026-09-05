import {
  attestLockAscAbi,
  creditPoolAbi,
  type Job,
  type JobEvidence,
  type JobStatus,
  type ProtocolStats,
} from '@attestlock/shared';
import {
  Contract,
  type ContractTransactionReceipt,
  type Filter,
  type JsonRpcProvider,
  type Log,
  type Wallet,
  keccak256,
} from 'ethers';
import type { WorkerConfig } from './env.js';
import { DeferredError, RefusedError, TransientError, errorMessage } from './errors.js';
import type { ClaimedJob, JobStore } from './store.js';

const refusalCodes: Record<string, string> = {
  UnsupportedChain: 'UNSUPPORTED_CHAIN',
  QueryAlreadyProcessed: 'QUERY_ALREADY_PROCESSED',
  ProofVerificationFailed: 'PROOF_VERIFICATION_FAILED',
  UnsupportedTransactionType: 'UNSUPPORTED_TRANSACTION_TYPE',
  WrongSourceTransaction: 'WRONG_SOURCE_TRANSACTION',
  SourceTransactionFailed: 'SOURCE_TRANSACTION_FAILED',
  MissingLockEvent: 'LOCK_EVENT_MISSING',
  AmbiguousLockEvents: 'AMBIGUOUS_LOCK_EVENTS',
  MalformedLockEvent: 'MALFORMED_LOCK_EVENT',
  InvalidLockIdentity: 'INVALID_LOCK_IDENTITY',
  BorrowerMismatch: 'BORROWER_MISMATCH',
  UnsupportedToken: 'UNSUPPORTED_TOKEN',
  CollateralBelowMinimum: 'COLLATERAL_TOO_SMALL',
  InsufficientRemainingLock: 'LOCK_TERM_TOO_SHORT',
  LockAlreadyUsed: 'LOCK_ALREADY_USED',
};

export function ascRefusalCode(contract: Contract, error: unknown): string {
  const data =
    (error as { data?: string; info?: { error?: { data?: string } } }).data ??
    (error as { info?: { error?: { data?: string } } }).info?.error?.data;
  if (!data) return 'ASC_PREFLIGHT_REVERTED';
  try {
    const decoded = contract.interface.parseError(data);
    return decoded ? (refusalCodes[decoded.name] ?? 'ASC_PREFLIGHT_REVERTED') : 'ASC_PREFLIGHT_REVERTED';
  } catch {
    return 'ASC_PREFLIGHT_REVERTED';
  }
}

export async function getLogsInRanges(
  provider: JsonRpcProvider,
  filter: Omit<Filter, 'fromBlock' | 'toBlock'>,
  fromBlock: number,
  toBlock: number,
  rangeSize = 50_000
): Promise<Log[]> {
  if (toBlock < fromBlock) return [];
  const logs: Log[] = [];
  for (let start = fromBlock; start <= toBlock; start += rangeSize) {
    const end = Math.min(start + rangeSize - 1, toBlock);
    logs.push(...(await provider.getLogs({ ...filter, fromBlock: start, toBlock: end })));
  }
  return logs;
}

export function aggregatePoolEvents(
  pool: Contract,
  logs: readonly { topics: readonly string[]; data: string }[]
) {
  let linesOpened = 0;
  let totalCreditOpened = 0n;
  let totalBorrowed = 0n;
  let totalRepaid = 0n;
  const borrowersWhoDrew = new Set<string>();
  for (const log of logs) {
    try {
      const parsed = pool.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'CreditLineOpened') {
        linesOpened += 1;
        totalCreditOpened += BigInt(parsed.args.limit);
      } else if (parsed?.name === 'Borrowed') {
        totalBorrowed += BigInt(parsed.args.amount);
        borrowersWhoDrew.add(String(parsed.args.borrower).toLowerCase());
      } else if (parsed?.name === 'Repaid') {
        totalRepaid += BigInt(parsed.args.amount);
      }
    } catch {
      // Ignore unrelated logs.
    }
  }
  if (totalRepaid > totalBorrowed) throw new Error('Pool event accounting is inconsistent.');
  const outstanding = totalBorrowed - totalRepaid;
  return {
    linesOpened,
    borrowersWhoDrew: borrowersWhoDrew.size,
    totalCreditOpenedAtomic: totalCreditOpened.toString(),
    totalBorrowedAtomic: totalBorrowed.toString(),
    totalRepaidAtomic: totalRepaid.toString(),
    outstandingDebtAtomic: outstanding.toString(),
  } satisfies ProtocolStats;
}

export function matchingAscExecutionEvents(
  asc: Contract,
  ascAddress: string,
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
  lockId: string
) {
  return logs.flatMap((log) => {
    if (log.address.toLowerCase() !== ascAddress.toLowerCase()) return [];
    try {
      const parsed = asc.interface.parseLog({ topics: [...log.topics], data: log.data });
      return parsed?.name === 'LockVerifiedAndLineOpened' &&
        String(parsed.args.lockId).toLowerCase() === lockId.toLowerCase()
        ? [parsed]
        : [];
    } catch {
      return [];
    }
  });
}

export function executionStateMatches(
  line: {
    borrower: unknown;
    queryId: unknown;
    limit: unknown;
    collateralAmount: unknown;
    maturity: unknown;
    collateralUnlockAt: unknown;
  },
  event: { args: unknown }
) {
  const args = event.args as {
    queryId: unknown;
    borrower: unknown;
    creditLimit: unknown;
    collateralAmount: unknown;
    maturity: unknown;
    collateralUnlockAt: unknown;
  };
  const queryId = String(args.queryId);
  return (
    String(line.borrower).toLowerCase() === String(args.borrower).toLowerCase() &&
    String(line.queryId).toLowerCase() === queryId.toLowerCase() &&
    BigInt(String(line.limit)) === BigInt(String(args.creditLimit)) &&
    BigInt(String(line.collateralAmount)) === BigInt(String(args.collateralAmount)) &&
    BigInt(String(line.maturity)) === BigInt(String(args.maturity)) &&
    BigInt(String(line.collateralUnlockAt)) === BigInt(String(args.collateralUnlockAt))
  );
}

type ProofArguments = readonly [
  number,
  number,
  string,
  string,
  readonly { hash: string; isLeft: boolean }[],
  string,
  readonly string[],
];

export class CreditcoinSubmitter {
  private readonly asc: Contract;
  private readonly pool: Contract;

  constructor(
    private readonly config: WorkerConfig,
    private readonly provider: JsonRpcProvider,
    private readonly wallet: Wallet,
    private readonly store: JobStore
  ) {
    this.asc = new Contract(config.ATTESTLOCK_ASC_ADDRESS, attestLockAscAbi, wallet);
    this.pool = new Contract(config.CREDIT_POOL_ADDRESS, creditPoolAbi, provider);
  }

  async submit(
    job: Job,
    lockId: string,
    proofEvidence: JobEvidence,
    args: ProofArguments,
    transition: (status: JobStatus, evidence?: JobEvidence) => Promise<void>
  ): Promise<JobEvidence> {
    const execute = this.asc.getFunction('verifyLockAndOpenLine');
    try {
      await execute.staticCall(...args);
    } catch (error) {
      const message = errorMessage(error);
      if ((error as { code?: string }).code === 'CALL_EXCEPTION') {
        const existing = await this.findExistingExecution(lockId);
        if (existing) return { ...proofEvidence, ...existing };
        throw new RefusedError(
          ascRefusalCode(this.asc, error),
          `Creditcoin preflight refused the proof: ${message}`
        );
      }
      throw new TransientError('CREDITCOIN_PREFLIGHT_FAILED', message);
    }

    await transition('submitting');
    try {
      let gasLimit = 1_200_000n;
      try {
        const estimate = await execute.estimateGas(...args);
        const buffered = (estimate * 135n) / 100n;
        gasLimit = buffered > 900_000n ? buffered : 900_000n;
      } catch {
        // pallet-evm precompile estimation can fail; bounded fallback is intentional.
      }
      if (gasLimit > 5_000_000n)
        throw new RefusedError('PROOF_GAS_LIMIT_EXCEEDED', 'Proof exceeds the relayer gas budget.');
      const relayer = `102031:${this.wallet.address.toLowerCase()}`;
      await this.store.withRelayerLock(relayer, async () => {
        if (await this.store.getSubmission(job.id)) return;
        if (await this.store.hasPendingSubmission(relayer)) throw new DeferredError('RELAYER_NONCE_BUSY');
        const request = await this.wallet.populateTransaction({
          ...(await execute.populateTransaction(...args)),
          gasLimit,
        });
        if (request.chainId !== 102031n) throw new DeferredError('DESTINATION_CHAIN_MISMATCH');
        const rawTransaction = await this.wallet.signTransaction(request);
        const txHash = keccak256(rawTransaction).toLowerCase();
        // Atomically fence the job and save both the outbox and its public identity before RPC broadcast.
        await this.store.saveSubmission(
          { jobId: job.id, relayer, txHash, rawTransaction },
          (job as ClaimedJob).leaseToken
        );
        job.evidence.creditcoinSubmissionTxHash = txHash;
      });
      const saved = await this.store.getSubmission(job.id);
      if (!saved) throw new Error('Signed submission was not persisted.');
      await transition('submitting', { creditcoinSubmissionTxHash: saved.txHash });
      // Rebroadcasting identical signed bytes is safe and cannot consume a second nonce.
      await this.provider.broadcastTransaction(saved.rawTransaction).catch(() => undefined);
      throw new DeferredError('CREDITCOIN_TX_PENDING');
    } catch (error) {
      if (error instanceof RefusedError || error instanceof TransientError || error instanceof DeferredError)
        throw error;
      throw new TransientError('CREDITCOIN_SUBMISSION_FAILED', errorMessage(error));
    }
  }

  async reconcile(job: Job, lockId: string): Promise<JobEvidence | null> {
    const saved = await this.store.getSubmission(job.id);
    const submission = saved?.txHash ?? job.evidence.creditcoinSubmissionTxHash?.toLowerCase();
    if (!submission) return this.findExistingExecution(lockId);
    try {
      const receipt = await this.provider.getTransactionReceipt(submission);
      if (!receipt) {
        if (saved) await this.provider.broadcastTransaction(saved.rawTransaction).catch(() => undefined);
        throw new DeferredError('CREDITCOIN_TX_PENDING');
      }
      await this.store.finalizeSubmission(job.id);
      if (receipt.status === 1) {
        return {
          ...(await this.executionEvidence(receipt, lockId)),
          creditcoinSubmissionTxHash: submission,
          processingDurationMs: Date.now() - new Date(job.createdAt).getTime(),
        };
      }
      const existing = await this.findExistingExecution(lockId);
      if (existing) return { ...existing, creditcoinSubmissionTxHash: submission };
      throw new RefusedError(
        'CREDITCOIN_TX_REVERTED',
        'The recorded Creditcoin proof transaction reverted and changed no protocol state.'
      );
    } catch (error) {
      if (error instanceof RefusedError || error instanceof TransientError || error instanceof DeferredError)
        throw error;
      throw new TransientError('CREDITCOIN_RECONCILIATION_FAILED', errorMessage(error));
    }
  }

  async publicStats(): Promise<ProtocolStats & { asOfBlock: number }> {
    const latest = await this.provider.getBlockNumber();
    const logs = await getLogsInRanges(
      this.provider,
      { address: this.config.CREDIT_POOL_ADDRESS },
      this.config.CREDITCOIN_DEPLOYMENT_BLOCK,
      latest
    );
    return { ...aggregatePoolEvents(this.pool, logs), asOfBlock: latest };
  }

  private async findExistingExecution(lockId: string): Promise<JobEvidence | null> {
    if (!(await this.asc.getFunction('usedLocks')(lockId))) return null;
    const latest = await this.provider.getBlockNumber();
    const fragment = this.asc.interface.getEvent('LockVerifiedAndLineOpened');
    if (!fragment) throw new Error('LockVerifiedAndLineOpened ABI entry is missing');
    const topics = this.asc.interface.encodeFilterTopics(fragment, [null, lockId]);
    const logs = await getLogsInRanges(
      this.provider,
      { address: this.config.ATTESTLOCK_ASC_ADDRESS, topics },
      this.config.CREDITCOIN_DEPLOYMENT_BLOCK,
      latest
    );
    const log = logs.at(-1);
    if (!log) {
      throw new TransientError(
        'CREDITCOIN_EXECUTION_EVENT_MISSING',
        'The lock is marked used but its ASC execution event was not found.'
      );
    }
    const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
    if (!receipt || receipt.status !== 1) {
      throw new TransientError(
        'CREDITCOIN_EXECUTION_RECEIPT_MISSING',
        'The ASC event transaction receipt is missing or unsuccessful.'
      );
    }
    return this.executionEvidence(receipt, lockId);
  }

  private async executionEvidence(
    receipt: ContractTransactionReceipt | Awaited<ReturnType<JsonRpcProvider['getTransactionReceipt']>>,
    lockId: string
  ): Promise<JobEvidence> {
    if (!receipt) throw new TransientError('CREDITCOIN_EXECUTION_RECEIPT_MISSING', 'Receipt unavailable.');
    const matches = matchingAscExecutionEvents(
      this.asc,
      this.config.ATTESTLOCK_ASC_ADDRESS,
      receipt.logs,
      lockId
    );
    if (matches.length !== 1) {
      throw new TransientError(
        'CREDITCOIN_EXECUTION_EVENT_MISSING',
        'A successful proof transaction must contain exactly one matching ASC execution event.'
      );
    }
    const event = matches[0]!;
    const queryId = String(event.args.queryId);
    const [usedLock, usedQuery, line] = await Promise.all([
      this.asc.getFunction('usedLocks')(lockId),
      this.asc.getFunction('processedQueries')(queryId),
      this.pool.getFunction('lines')(lockId),
    ]);
    const lineMatches = executionStateMatches(line, event);
    if (!usedLock || !usedQuery || !lineMatches) {
      throw new TransientError(
        'CREDITCOIN_EXECUTION_STATE_MISMATCH',
        'ASC replay flags, execution event, and pool line do not agree.'
      );
    }
    return {
      creditcoinTxHash: receipt.hash.toLowerCase(),
      creditcoinBlockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      lockId,
      queryId,
    };
  }
}
