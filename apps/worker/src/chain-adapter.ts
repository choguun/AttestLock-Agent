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
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import type { WorkerConfig } from './env.js';
import { RefusedError, TransientError, errorMessage } from './errors.js';
import type { ChainAdapter, ExecutionResult } from './processor.js';
import { SourceLockValidator } from './source-validator.js';
import type { ChainReadiness } from './server.js';

export function isSupportedSourceChain(registered: { chainKey: number; chainId: number } | null): boolean {
  return registered?.chainKey === SEPOLIA_CHAIN_KEY && registered.chainId === SEPOLIA_CHAIN_ID;
}

export function isActiveAttestation(latest: { exists: boolean; height: number }): boolean {
  return latest.exists && latest.height > 0;
}

export function isRelayerFunded(balance: bigint, minimumBalance: bigint): boolean {
  return balance >= minimumBalance;
}

export function isProofBuilderReady(
  payload: unknown,
  latestChainHeight: number | null = null,
  maxLagBlocks = 500
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const height = (payload as { attestedHeight?: unknown }).attestedHeight;
  return (
    typeof height === 'number' &&
    Number.isSafeInteger(height) &&
    height > 0 &&
    (latestChainHeight === null || height + maxLagBlocks >= latestChainHeight)
  );
}

export interface AttestationProgress {
  height: number;
  advancedAt: number;
}

export function observeAttestationProgress(
  latest: { exists: boolean; height: number },
  previous: AttestationProgress | null,
  now: number,
  maxStalenessMs: number
): { active: boolean; progress: AttestationProgress | null } {
  if (!isActiveAttestation(latest)) return { active: false, progress: previous };
  if (!previous || latest.height > previous.height) {
    return { active: true, progress: { height: latest.height, advancedAt: now } };
  }
  return { active: now - previous.advancedAt <= maxStalenessMs, progress: previous };
}

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
  private readonly chainInfoProvider: chainInfo.PrecompileChainInfoProvider;
  private attestationProgress: AttestationProgress | null = null;

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
    // The SDK pins its own ethers copy; both providers implement the same EIP-1193 surface.
    this.chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(this.creditcoinProvider as never);
  }

  async readiness(): Promise<ChainReadiness> {
    let sourceRpc = false;
    let destinationRpc = false;
    let sourceContracts = false;
    let destinationContracts = false;
    let attestcoinChain = false;
    let activeAttestation = false;
    let fundedRelayer = false;
    let latestAttestedHeight: number | null = null;

    try {
      const [network, vaultCode, tokenCode] = await Promise.all([
        this.sourceProvider.getNetwork(),
        this.sourceProvider.getCode(this.config.SOURCE_VAULT_ADDRESS),
        this.sourceProvider.getCode(this.config.SOURCE_TOKEN_ADDRESS),
      ]);
      sourceRpc = network.chainId === BigInt(SEPOLIA_CHAIN_ID);
      sourceContracts = vaultCode !== '0x' && tokenCode !== '0x';
    } catch {
      // Detailed readiness is returned instead of failing the liveness process.
    }

    try {
      const [network, ascCode, poolCode, assetCode, registered, latest, balance] = await Promise.all([
        this.creditcoinProvider.getNetwork(),
        this.creditcoinProvider.getCode(this.config.ATTESTLOCK_ASC_ADDRESS),
        this.creditcoinProvider.getCode(this.config.CREDIT_POOL_ADDRESS),
        this.creditcoinProvider.getCode(this.config.MOCK_USD_ADDRESS),
        this.chainInfoProvider.getSupportedChainByKey(SEPOLIA_CHAIN_KEY),
        this.chainInfoProvider.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY),
        this.creditcoinProvider.getBalance(this.wallet.address),
      ]);
      destinationRpc = network.chainId === BigInt(CREDITCOIN_TESTNET_CHAIN_ID);
      destinationContracts = ascCode !== '0x' && poolCode !== '0x' && assetCode !== '0x';
      attestcoinChain = isSupportedSourceChain(registered);
      const observation = observeAttestationProgress(
        latest,
        this.attestationProgress,
        Date.now(),
        this.config.MAX_ATTESTATION_STALENESS_MS
      );
      this.attestationProgress = observation.progress;
      activeAttestation = observation.active;
      latestAttestedHeight = isActiveAttestation(latest) ? latest.height : null;
      fundedRelayer = isRelayerFunded(balance, BigInt(this.config.MIN_RELAYER_BALANCE_WEI));
    } catch {
      // Component booleans remain false and /ready responds 503.
    }

    let proofBuilder = false;
    try {
      const endpoint = new URL(`/api/v1/attested-height/${SEPOLIA_CHAIN_KEY}`, this.config.PROOF_BUILDER_URL);
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(10_000),
      });
      proofBuilder =
        response.ok &&
        isProofBuilderReady(
          await response.json(),
          latestAttestedHeight,
          this.config.MAX_PROOF_BUILDER_LAG_BLOCKS
        );
    } catch {
      // A failed public service probe is a readiness failure, not liveness failure.
    }

    return {
      checks: {
        sourceRpc,
        destinationRpc,
        sourceContracts,
        destinationContracts,
        attestcoinChain,
        activeAttestation,
        proofBuilder,
        fundedRelayer,
      },
      latestAttestedHeight,
    };
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
    if (reconciled) {
      return {
        evidence: {
          ...reconciled,
          processingDurationMs:
            reconciled.processingDurationMs ?? Date.now() - new Date(job.createdAt).getTime(),
        },
      };
    }

    try {
      await this.proofBuilder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, fact.blockNumber, 15_000, 1_200_000);
    } catch (error) {
      throw new TransientError('ATTESTATION_TIMEOUT', errorMessage(error));
    }

    const latestAttestation = await this.chainInfoProvider
      .getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY)
      .catch((error) => {
        throw new TransientError('ATTESTATION_READ_FAILED', errorMessage(error));
      });
    if (!latestAttestation.exists || latestAttestation.height < fact.blockNumber) {
      throw new TransientError('ATTESTATION_NOT_CONFIRMED', 'The source block is not attested yet.');
    }

    await transition('proving', {
      attestedHeight: latestAttestation.height,
      attestedAt: new Date().toISOString(),
    });
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
      proofGeneratedAt: new Date().toISOString(),
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
          creditcoinBlockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          processingDurationMs: Date.now() - new Date(job.createdAt).getTime(),
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
    const receipt = await this.creditcoinProvider.getTransactionReceipt(log.transactionHash);
    return {
      creditcoinTxHash: log.transactionHash,
      creditcoinBlockNumber: log.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
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
            creditcoinBlockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            processingDurationMs: Date.now() - new Date(job.createdAt).getTime(),
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
