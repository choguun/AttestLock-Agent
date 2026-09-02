import {
  COLLATERAL_BUFFER_SECONDS,
  LINE_DURATION_SECONDS,
  MIN_COLLATERAL,
  SEPOLIA_CHAIN_KEY,
  attestLockAscAbi,
  lockVaultAbi,
  type Job,
  type JobEvidence,
  type JobStatus,
} from '@attestlock/shared';
import { proofProvider } from '@gluwa/usc-sdk';
import { Contract, Interface, JsonRpcProvider, Wallet, getAddress, isAddress } from 'ethers';
import type { WorkerConfig } from './env.js';
import { RefusedError, TransientError, errorMessage } from './errors.js';
import type { ChainAdapter, ExecutionResult } from './processor.js';

interface LockFact {
  blockNumber: number;
  lockId: string;
  amount: bigint;
  unlockAt: number;
}

export class AttestcoinChainAdapter implements ChainAdapter {
  private readonly sourceProvider: JsonRpcProvider;
  private readonly creditcoinProvider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly asc: Contract;
  private readonly vaultInterface = new Interface(lockVaultAbi);
  private readonly proofBuilder: proofProvider.service.ProofBuilder;

  constructor(private readonly config: WorkerConfig) {
    this.sourceProvider = new JsonRpcProvider(config.SOURCE_CHAIN_RPC_URL);
    this.creditcoinProvider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL);
    this.wallet = new Wallet(config.CREDITCOIN_RELAYER_PRIVATE_KEY, this.creditcoinProvider);
    this.asc = new Contract(config.ATTESTLOCK_ASC_ADDRESS, attestLockAscAbi, this.wallet);
    this.proofBuilder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, config.PROOF_BUILDER_URL);
  }

  async execute(
    job: Job,
    transition: (status: JobStatus, evidence?: JobEvidence) => Promise<void>
  ): Promise<ExecutionResult> {
    const fact = await this.validateSourceTransaction(job);
    await transition('waiting_attestation', {
      blockNumber: fact.blockNumber,
      lockId: fact.lockId,
      collateralAmount: fact.amount.toString(),
      collateralUnlockAt: fact.unlockAt,
    });

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
    const args = [
      proof.chainKey,
      proof.headerNumber,
      proof.txBytes,
      proof.merkleProof.root,
      proof.merkleProof.siblings,
      proof.continuityProof.lowerEndpointDigest,
      proof.continuityProof.roots,
    ] as const;
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
          'ASC_PREFLIGHT_REVERTED',
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
      const receipt = await response.wait();
      if (!receipt || receipt.status !== 1) {
        throw new TransientError('CREDITCOIN_TX_FAILED', 'Creditcoin transaction was not successful');
      }
      let queryId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = this.asc.interface.parseLog(log);
          if (parsed?.name === 'LockVerifiedAndLineOpened') queryId = String(parsed.args.queryId);
        } catch {
          // Ignore unrelated logs, including the precompile event.
        }
      }
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

  private async validateSourceTransaction(job: Job): Promise<LockFact> {
    let receipt;
    try {
      receipt = await this.sourceProvider.getTransactionReceipt(job.txHash);
    } catch (error) {
      throw new TransientError('SOURCE_RPC_UNAVAILABLE', errorMessage(error));
    }
    if (!receipt)
      throw new RefusedError('SOURCE_TX_NOT_FOUND', 'The source transaction does not exist or is not mined.');
    if (receipt.status !== 1) throw new RefusedError('SOURCE_TX_FAILED', 'The source transaction reverted.');
    if (!receipt.to || getAddress(receipt.to) !== this.config.SOURCE_VAULT_ADDRESS) {
      throw new RefusedError(
        'WRONG_SOURCE_CONTRACT',
        'The transaction did not call the registered LockVault.'
      );
    }

    const candidates = receipt.logs.filter(
      (log) => getAddress(log.address) === this.config.SOURCE_VAULT_ADDRESS
    );
    for (const log of candidates) {
      try {
        const parsed = this.vaultInterface.parseLog(log);
        if (parsed?.name !== 'CollateralLocked') continue;
        const borrower = getAddress(String(parsed.args.borrower));
        const token = getAddress(String(parsed.args.token));
        const amount = BigInt(parsed.args.amount);
        const unlockAt = Number(parsed.args.unlockAt);
        const lockId = String(parsed.args.lockId);
        if (!isAddress(borrower) || borrower !== getAddress(job.borrower)) {
          throw new RefusedError('BORROWER_MISMATCH', 'The signed wallet is not the collateral borrower.');
        }
        if (token !== this.config.SOURCE_TOKEN_ADDRESS) {
          throw new RefusedError('UNSUPPORTED_TOKEN', 'The lock uses an unsupported source token.');
        }
        if (amount < MIN_COLLATERAL) {
          throw new RefusedError('COLLATERAL_TOO_SMALL', 'The lock is below the 100 mUSDC minimum.');
        }
        const required = Math.floor(Date.now() / 1000) + LINE_DURATION_SECONDS + COLLATERAL_BUFFER_SECONDS;
        if (unlockAt < required) {
          throw new RefusedError(
            'LOCK_TERM_TOO_SHORT',
            'The remaining lock term cannot cover the line and safety buffer.'
          );
        }
        return { blockNumber: receipt.blockNumber, lockId, amount, unlockAt };
      } catch (error) {
        if (error instanceof RefusedError) throw error;
      }
    }
    throw new RefusedError(
      'LOCK_EVENT_MISSING',
      'No valid CollateralLocked event was emitted by the registered vault.'
    );
  }

  private async findExistingExecution(lockId: string): Promise<JobEvidence | null> {
    const latest = await this.creditcoinProvider.getBlockNumber();
    const fragment = this.asc.interface.getEvent('LockVerifiedAndLineOpened');
    if (!fragment) throw new Error('LockVerifiedAndLineOpened ABI entry is missing');
    const topics = this.asc.interface.encodeFilterTopics(fragment, [null, lockId]);
    const logs = await this.creditcoinProvider.getLogs({
      address: this.config.ATTESTLOCK_ASC_ADDRESS,
      topics,
      fromBlock: Math.max(0, latest - 50_000),
      toBlock: latest,
    });
    const log = logs.at(-1);
    if (!log) return null;
    return { creditcoinTxHash: log.transactionHash, lockId };
  }
}
