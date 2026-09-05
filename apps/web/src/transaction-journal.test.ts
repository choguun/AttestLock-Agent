import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTransactionJournal,
  recordTransaction,
  updateTransaction,
  walletTransactions,
  resolveReplacement,
} from './transaction-journal';

describe('transaction journal', () => {
  beforeEach(clearTransactionJournal);

  it('reconciles repricing only after a confirmed same-wallet same-nonce transaction', () => {
    const wallet = `0x${'11'.repeat(20)}`;
    const identity = { nonce: 7, to: `0x${'22'.repeat(20)}`, value: '0', data: '0xab' };
    const entry = recordTransaction(wallet, 102031, 'borrow', `0x${'33'.repeat(32)}`, undefined, identity);
    const tx = { ...identity, from: wallet, hash: `0x${'44'.repeat(32)}`, value: 0n };
    expect(() => resolveReplacement(entry, { ...tx, nonce: 8 }, { hash: tx.hash, status: 1 })).toThrow();
    expect(walletTransactions(wallet)[0]!.status).toBe('pending');
    expect(resolveReplacement(entry, tx, { hash: tx.hash, status: 1 })?.status).toBe('pending');
    expect(walletTransactions(wallet).find((value) => value.key === entry.key)?.status).toBe('failed');
  });

  it('does not mistake a cancellation for a successful borrow', () => {
    const wallet = `0x${'11'.repeat(20)}`;
    const identity = { nonce: 7, to: `0x${'22'.repeat(20)}`, value: '0', data: '0xab' };
    const entry = recordTransaction(wallet, 102031, 'borrow', `0x${'33'.repeat(32)}`, undefined, identity);
    const tx = { ...identity, to: wallet, data: '0x', from: wallet, hash: `0x${'44'.repeat(32)}`, value: 0n };
    expect(resolveReplacement(entry, tx, { hash: tx.hash, status: 1 })).toBeNull();
    expect(walletTransactions(wallet)).toHaveLength(1);
    expect(walletTransactions(wallet)[0]!.status).toBe('failed');
  });

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
