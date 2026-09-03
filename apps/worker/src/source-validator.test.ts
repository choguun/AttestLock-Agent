import { lockVaultAbi, MIN_COLLATERAL } from '@attestlock/shared';
import { Interface, Wallet, type JsonRpcProvider } from 'ethers';
import { describe, expect, it } from 'vitest';
import { RefusedError } from './errors.js';
import { SourceLockValidator } from './source-validator.js';

const vault = Wallet.createRandom().address;
const token = Wallet.createRandom().address;
const borrower = Wallet.createRandom().address;
const txHash = `0x${'12'.repeat(32)}`;
const lockId = `0x${'34'.repeat(32)}`;

function receipt(overrides: Record<string, unknown> = {}) {
  const iface = new Interface(lockVaultAbi);
  const event = iface.encodeEventLog(iface.getEvent('CollateralLocked')!, [
    lockId,
    borrower,
    token,
    MIN_COLLATERAL,
    Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60,
  ]);
  return {
    status: 1,
    to: vault,
    blockNumber: 123,
    logs: [{ address: vault, topics: event.topics, data: event.data }],
    ...overrides,
  };
}

function validator(value: ReturnType<typeof receipt> | null) {
  const provider = { getTransactionReceipt: async () => value } as unknown as JsonRpcProvider;
  return new SourceLockValidator(provider, vault, token);
}

describe('SourceLockValidator', () => {
  it('extracts one exact valid lock fact', async () => {
    await expect(validator(receipt()).validate({ txHash, borrower } as never)).resolves.toMatchObject({
      blockNumber: 123,
      lockId,
      amount: MIN_COLLATERAL,
    });
  });

  it.each([
    [null, 'SOURCE_TX_NOT_FOUND'],
    [receipt({ status: 0 }), 'SOURCE_TX_FAILED'],
    [receipt({ to: Wallet.createRandom().address }), 'WRONG_SOURCE_CONTRACT'],
  ])('refuses invalid source receipts', async (value, code) => {
    try {
      await validator(value).validate({ txHash, borrower } as never);
      throw new Error('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(RefusedError);
      expect((error as RefusedError).code).toBe(code);
    }
  });

  it.each([
    [
      () => {
        const valid = receipt();
        return receipt({ logs: [...valid.logs, ...valid.logs] });
      },
      'AMBIGUOUS_LOCK_EVENTS',
    ],
    [
      () => {
        const valid = receipt();
        return receipt({ logs: [{ ...valid.logs[0], data: '0x' }] });
      },
      'MALFORMED_LOCK_EVENT',
    ],
  ])('classifies invalid vault logs deterministically', async (makeReceipt, code) => {
    try {
      await validator(makeReceipt()).validate({ txHash, borrower } as never);
      throw new Error('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(RefusedError);
      expect((error as RefusedError).code).toBe(code);
    }
  });
});
