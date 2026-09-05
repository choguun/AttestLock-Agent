import { lockVaultAbi, MIN_COLLATERAL } from '@attestlock/shared';
import { AbiCoder, Interface, Wallet, type JsonRpcProvider } from 'ethers';
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
    gasUsed: 50_000n,
    logsBloom: '0x',
    logs: [{ address: vault, topics: event.topics, data: event.data }],
    ...overrides,
  };
}

function validator(value: ReturnType<typeof receipt> | null) {
  const provider = {
    getTransactionReceipt: async () => value,
    getTransaction: async () =>
      value ? { from: borrower, to: value.to, nonce: 1, gasLimit: 100_000n, value: 0n, data: '0x' } : null,
  } as unknown as JsonRpcProvider;
  return new SourceLockValidator(provider, vault, token);
}

describe('SourceLockValidator', () => {
  it('binds proof-contained common fields and receipt to the requested lock, not just its block', async () => {
    const sourceReceipt = receipt();
    const source = validator(sourceReceipt);
    const job = { txHash, borrower } as never;
    const fact = await source.validate(job);
    const abi = AbiCoder.defaultAbiCoder();
    const common = abi.encode(
      ['uint64', 'uint64', 'address', 'bool', 'address', 'uint256', 'bytes'],
      [1, 100_000, borrower, false, vault, 0, '0x']
    );
    const encodedReceipt = abi.encode(
      ['uint8', 'uint64', 'tuple(address,bytes32[],bytes)[]', 'bytes'],
      [1, 50_000, sourceReceipt.logs.map((log) => [log.address, log.topics, log.data]), '0x']
    );
    const encode = (chunks: string[], type = 2) => abi.encode(['uint8', 'bytes[]'], [type, chunks]);
    expect(() => source.assertProofMatches(encode([common, '0x', encodedReceipt]), job, fact)).not.toThrow();
    for (const tampered of [
      encode(['0x', '0x', encodedReceipt]),
      encode([common, '0x', '0x']),
      encode([common, '0x', encodedReceipt], 5),
      encode([common, '0x', encodedReceipt, '0x']),
      '0xdead',
    ]) {
      expect(() => source.assertProofMatches(tampered, job, fact)).toThrow(RefusedError);
    }
  });

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

  it('refuses a transaction whose sender differs from its event borrower', async () => {
    const provider = {
      getTransactionReceipt: async () => receipt(),
      getTransaction: async () => ({ from: Wallet.createRandom().address, to: vault }),
    } as unknown as JsonRpcProvider;
    await expect(
      new SourceLockValidator(provider, vault, token).validate({ txHash, borrower } as never)
    ).rejects.toMatchObject({ code: 'SOURCE_SENDER_MISMATCH' });
  });
});
