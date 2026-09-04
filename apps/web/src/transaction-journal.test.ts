import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTransactionJournal,
  recordTransaction,
  updateTransaction,
  walletTransactions,
} from './transaction-journal';

describe('transaction journal', () => {
  beforeEach(clearTransactionJournal);

  it('keys hashes by wallet, chain, and action and normalizes hash case', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    const txHash = `0x${'Ab'.repeat(32)}`;
    const first = recordTransaction(wallet, 11_155_111, 'lock', txHash);
    recordTransaction(wallet.toUpperCase(), 11_155_111, 'lock', txHash.toLowerCase(), `0x${'22'.repeat(32)}`);

    const entries = walletTransactions(wallet);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: first.key,
      txHash: txHash.toLowerCase(),
      status: 'pending',
      lockId: `0x${'22'.repeat(32)}`,
    });
  });

  it('retains confirmed and failed outcomes for refresh recovery evidence', () => {
    const wallet = '0x1111111111111111111111111111111111111111';
    const lock = recordTransaction(wallet, 11_155_111, 'lock', `0x${'33'.repeat(32)}`);
    const borrow = recordTransaction(wallet, 102_031, 'borrow', `0x${'44'.repeat(32)}`);
    updateTransaction(lock, 'confirmed', `0x${'55'.repeat(32)}`);
    updateTransaction(borrow, 'failed');

    expect(walletTransactions(wallet).map(({ action, status }) => ({ action, status }))).toEqual([
      { action: 'borrow', status: 'failed' },
      { action: 'lock', status: 'confirmed' },
    ]);
  });
});
