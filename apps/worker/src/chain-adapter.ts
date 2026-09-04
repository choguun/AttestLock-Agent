import {
  CREDITCOIN_TESTNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_KEY,
  attestLockAscAbi,
  creditPoolAbi,
  type Job,
  type JobEvidence,
  type JobStatus,
} from '@attestlock/shared';
import { proofProvider } from '@gluwa/usc-sdk';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import type { WorkerConfig } from './env.js';
import { RefusedError, TransientError, errorMessage } from './errors.js';
import type { ChainAdapter, ExecutionResult } from './processor.js';
import { SourceLockValidator } from './source-validator.js';

export function proofArguments(proof: proofProvider.ContinuityResponse) {
  return [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings,
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ] as const;
}

const refusalCodes: Record<string, string> = {
  UnsupportedChain: 'UNSUPPORTED_CHAIN',
  QueryAlreadyProcessed: 'QUERY_ALREADY_PROCESSED',
  ProofVerificationFailed: 'PROOF_VERIFICATION_FAILED',
  UnsupportedTransactionType: 'UNSUPPORTED_TRANSACTION_TYPE',
  SourceTransactionFailed: 'SOURCE_TRANSACTION_FAILED',
  MissingLockEvent: 'LOCK_EVENT_MISSING',
  AmbiguousLockEvents: 'AMBIGUOUS_LOCK_EVENTS',
  MalformedLockEvent: 'MALFORMED_LOCK_EVENT',
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

export class AttestcoinChainAdapter implements ChainAdapter {
  private readonly sourceProvider: JsonRpcProvider;
  private readonly creditcoinProvider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly asc: Contract;
  private readonly sourceValidator: SourceLockValidator;
  private readonly proofBuilder: proofProvider.service.ProofBuilder;

  constructor(private readonly config: WorkerConfig) {
    this.sourceProvider = new JsonRpcProvider(config.SOURCE_CHAIN_RPC_URL);
    this.creditcoinProvider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL);
    this.wallet = new Wallet(config.CREDITCOIN_RELAYER_PRIVATE_KEY, this.creditcoinProvider);
    this.asc = new Contract(config.ATTESTLOCK_ASC_ADDRESS, attestLockAscAbi, this.wallet);
    this.sourceValidator = new SourceLockValidator(
      this.sourceProvider,
      config.SOURCE_VAULT_ADDRESS,
      config.SOURCE_TOKEN_ADDRESS
    );
    this.proofBuilder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, config.PROOF_BUILDER_URL);
  }

  async isReady(): Promise<boolean> {
    const [sourceNetwork, destinationNetwork, vaultCode, tokenCode, ascCode] = await Promise.all([
      this.sourceProvider.getNetwork(),
      this.creditcoinProvider.getNetwork(),
      this.sourceProvider.getCode(this.config.SOURCE_VAULT_ADDRESS),
      this.sourceProvider.getCode(this.config.SOURCE_TOKEN_ADDRESS),
      this.creditcoinProvider.getCode(this.config.ATTESTLOCK_ASC_ADDRESS),
    ]);
    return (
      sourceNetwork.chainId === BigInt(SEPOLIA_CHAIN_ID) &&
      destinationNetwork.chainId === BigInt(CREDITCOIN_TESTNET_CHAIN_ID) &&
      vaultCode !== '0x' &&
      tokenCode !== '0x' &&
      ascCode !== '0x'
    );
  }

  async execute(
    job: Job,
    transition: (status: JobStatus, evidence?: JobEvidence) => Promise<void>
  ): Promise<ExecutionResult> {
    const fact = await this.sourceValidator.validate(job);
    await transition('waiting_attestation', {
      blockNumber: fact.blockNumber,
      lockId: fact.lockId,
      collateralAmount: fact.amount.toString(),
      collateralUnlockAt: fact.unlockAt,
    });

    const reconciled = await this.reconcileSubmission(job, fact.lockId);
    if (reconciled) return { evidence: reconciled };

    try {
      await this.proofBuilder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, fact.blockNumber, 15_000, 1_200_000);
    } catch (error) {
      throw new TransientError('ATTESTATION_TIMEOUT', errorMessage(error));
    }

    await transition('proving');
    let proofResult: proofProvider.ProofResult;
    try {
      proofResult = await this.proofBuilder.getProof(job.txHash);
    } catch (error) {
      throw new TransientError('PROOF_BUILDER_UNAVAILABLE', errorMessage(error));
    }
    if (!proofResult.success || !proofResult.data) {
      throw new TransientError('PROOF_GENERATION_FAILED', proofResult.error ?? 'No proof data returned');
    }

    const proof = proofResult.data;
    const args = proofArguments(proof);
    const proofEvidence: JobEvidence = {
      proofMerkleRoot: proof.merkleProof.root,
      continuityRootCount: proof.continuityProof.roots.length,
    };
    await transition('preflight', proofEvidence);

    const execute = this.asc.getFunction('verifyLockAndOpenLine');
    try {
      await execute.staticCall(...args);
    } catch (error) {
      const message = errorMessage(error);
      const code = (error as { code?: string }).code;
      if (code === 'CALL_EXCEPTION') {
        const existing = await this.findExistingExecution(fact.lockId);
        if (existing) return { evidence: { ...proofEvidence, ...existing } };
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
      const response = await execute(...args, { gasLimit });
      await transition('submitting', { creditcoinSubmissionTxHash: response.hash });
      const receipt = await response.wait();
      if (!receipt || receipt.status !== 1) {
        throw new TransientError('CREDITCOIN_TX_FAILED', 'Creditcoin transaction was not successful');
      }
      const queryId = this.queryIdFromLogs(receipt.logs);
      return {
        evidence: {
          ...proofEvidence,
          creditcoinTxHash: response.hash,
          queryId,
        },
      };
    } catch (error) {
      if (error instanceof RefusedError || error instanceof TransientError) throw error;
      throw new TransientError('CREDITCOIN_SUBMISSION_FAILED', errorMessage(error));
    }
  }

  private async findExistingExecution(lockId: string): Promise<JobEvidence | null> {
    if (!(await this.asc.getFunction('usedLocks')(lockId))) return null;
    const latest = await this.creditcoinProvider.getBlockNumber();
    const fragment = this.asc.interface.getEvent('LockVerifiedAndLineOpened');
    if (!fragment) throw new Error('LockVerifiedAndLineOpened ABI entry is missing');
    const topics = this.asc.interface.encodeFilterTopics(fragment, [null, lockId]);
    const logs = await this.creditcoinProvider.getLogs({
      address: this.config.ATTESTLOCK_ASC_ADDRESS,
      topics,
      fromBlock: this.config.CREDITCOIN_DEPLOYMENT_BLOCK,
      toBlock: latest,
    });
    const log = logs.at(-1);
    if (!log) return null;
    const parsed = this.asc.interface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'LockVerifiedAndLineOpened') return null;
    const poolAddress = await this.asc.getFunction('pool')();
    const pool = new Contract(poolAddress, creditPoolAbi, this.creditcoinProvider);
    const line = await pool.getFunction('lines')(lockId);
    if (
      String(line.borrower).toLowerCase() !== String(parsed.args.borrower).toLowerCase() ||
      String(line.queryId).toLowerCase() !== String(parsed.args.queryId).toLowerCase()
    ) {
      return null;
    }
    return {
      creditcoinTxHash: log.transactionHash,
      lockId,
      queryId: String(parsed.args.queryId),
    };
  }

  private async reconcileSubmission(job: Job, lockId: string): Promise<JobEvidence | null> {
    const submission = job.evidence.creditcoinSubmissionTxHash;
    if (submission) {
      try {
        const receipt = await this.creditcoinProvider.getTransactionReceipt(submission);
        if (!receipt)
          throw new TransientError('CREDITCOIN_TX_PENDING', 'Submitted proof transaction is pending.');
        if (receipt.status === 1) {
          return {
            creditcoinSubmissionTxHash: submission,
            creditcoinTxHash: submission,
            lockId,
            queryId: this.queryIdFromLogs(receipt.logs),
          };
        }
        const existing = await this.findExistingExecution(lockId);
        if (existing) return { ...existing, creditcoinSubmissionTxHash: submission };
        throw new RefusedError(
          'CREDITCOIN_TX_REVERTED',
          'The recorded Creditcoin proof transaction reverted and changed no protocol state.'
        );
      } catch (error) {
        if (error instanceof RefusedError || error instanceof TransientError) throw error;
        throw new TransientError('CREDITCOIN_RECONCILIATION_FAILED', errorMessage(error));
      }
    }
    return this.findExistingExecution(lockId);
  }

  private queryIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): string | undefined {
    for (const log of logs) {
      try {
        const parsed = this.asc.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'LockVerifiedAndLineOpened') return String(parsed.args.queryId);
      } catch {
        // Ignore unrelated logs, including the precompile event.
      }
    }
    return undefined;
  }
}
