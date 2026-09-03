import {
  COLLATERAL_BUFFER_SECONDS,
  LINE_DURATION_SECONDS,
  MIN_COLLATERAL,
  lockVaultAbi,
  type Job,
} from '@attestlock/shared';
import { Interface, getAddress, getBytes, isAddress, type JsonRpcProvider } from 'ethers';
import { RefusedError, TransientError, errorMessage } from './errors.js';

export interface SourceLockFact {
  blockNumber: number;
  lockId: string;
  amount: bigint;
  unlockAt: number;
}

export class SourceLockValidator {
  private readonly vaultInterface = new Interface(lockVaultAbi);

  constructor(
    private readonly provider: JsonRpcProvider,
    private readonly sourceVault: string,
    private readonly sourceToken: string
  ) {}

  async validate(job: Job): Promise<SourceLockFact> {
    let receipt;
    try {
      receipt = await this.provider.getTransactionReceipt(job.txHash);
    } catch (error) {
      throw new TransientError('SOURCE_RPC_UNAVAILABLE', errorMessage(error));
    }
    if (!receipt) {
      throw new RefusedError('SOURCE_TX_NOT_FOUND', 'The source transaction does not exist or is not mined.');
    }
    if (receipt.status !== 1) throw new RefusedError('SOURCE_TX_FAILED', 'The source transaction reverted.');
    if (!receipt.to || getAddress(receipt.to) !== this.sourceVault) {
      throw new RefusedError(
        'WRONG_SOURCE_CONTRACT',
        'The transaction did not call the registered LockVault.'
      );
    }

    const event = this.vaultInterface.getEvent('CollateralLocked');
    if (!event) throw new Error('CollateralLocked ABI entry is missing');
    const eventTopic = event.topicHash.toLowerCase();
    const candidates = receipt.logs.filter(
      (log) => getAddress(log.address) === this.sourceVault && log.topics[0]?.toLowerCase() === eventTopic
    );
    if (candidates.length === 0) {
      throw new RefusedError(
        'LOCK_EVENT_MISSING',
        'No CollateralLocked event was emitted by the registered vault.'
      );
    }
    if (candidates.length > 1) {
      throw new RefusedError(
        'AMBIGUOUS_LOCK_EVENTS',
        'The source transaction emitted more than one matching collateral lock.'
      );
    }

    const log = candidates[0]!;
    if (log.topics.length !== 4 || getBytes(log.data).length !== 64) {
      throw new RefusedError('MALFORMED_LOCK_EVENT', 'The collateral lock event has invalid fields.');
    }

    let parsed;
    try {
      parsed = this.vaultInterface.parseLog(log);
    } catch {
      throw new RefusedError('MALFORMED_LOCK_EVENT', 'The collateral lock event cannot be decoded.');
    }
    if (!parsed || parsed.name !== 'CollateralLocked') {
      throw new RefusedError('MALFORMED_LOCK_EVENT', 'The collateral lock event cannot be decoded.');
    }

    const borrower = getAddress(String(parsed.args.borrower));
    const token = getAddress(String(parsed.args.token));
    const amount = BigInt(parsed.args.amount);
    const unlockAt = Number(parsed.args.unlockAt);
    const lockId = String(parsed.args.lockId);
    if (!isAddress(borrower) || borrower !== getAddress(job.borrower)) {
      throw new RefusedError('BORROWER_MISMATCH', 'The signed wallet is not the collateral borrower.');
    }
    if (token !== this.sourceToken) {
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
  }
}
