import { attestLockAscAbi, creditPoolAbi } from '@attestlock/shared';
import { Contract, Interface } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import {
  aggregatePoolEvents,
  ascRefusalCode,
  executionStateMatches,
  getLogsInRanges,
  matchingAscExecutionEvents,
} from './creditcoin-submitter.js';

const poolAddress = '0x0000000000000000000000000000000000000001';
const borrower = '0x0000000000000000000000000000000000000002';
const lockId = `0x${'11'.repeat(32)}`;
const queryId = `0x${'22'.repeat(32)}`;

describe('CreditcoinSubmitter helpers', () => {
  it('aggregates only public protocol counts and atomic amounts', () => {
    const iface = new Interface(creditPoolAbi);
    const event = (name: string, values: readonly unknown[]) => {
      const encoded = iface.encodeEventLog(iface.getEvent(name)!, values);
      return { topics: encoded.topics, data: encoded.data };
    };
    const contract = new Contract(poolAddress, creditPoolAbi);
    const stats = aggregatePoolEvents(contract, [
      event('CreditLineOpened', [lockId, borrower, 50_000_000n, 100, queryId]),
      event('Borrowed', [lockId, borrower, 30_000_000n, 30_000_000n]),
      event('Borrowed', [lockId, borrower, 20_000_000n, 50_000_000n]),
      event('Repaid', [lockId, borrower, 10_000_000n, 40_000_000n]),
      { topics: [], data: '0x' },
    ]);

    expect(stats).toEqual({
      linesOpened: 1,
      borrowersWhoDrew: 1,
      totalCreditOpenedAtomic: '50000000',
      totalBorrowedAtomic: '50000000',
      totalRepaidAtomic: '10000000',
      outstandingDebtAtomic: '40000000',
    });
    expect(JSON.stringify(stats)).not.toContain(borrower);
  });

  it('scans deployment history in bounded ranges', async () => {
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    const getLogs = vi.fn(async (filter: { fromBlock: number; toBlock: number }) => {
      calls.push(filter);
      return [];
    });
    await getLogsInRanges({ getLogs } as never, { address: poolAddress }, 100, 105, 2);
    expect(calls.map((filter) => [filter.fromBlock, filter.toBlock])).toEqual([
      [100, 101],
      [102, 103],
      [104, 105],
    ]);
    expect(await getLogsInRanges({ getLogs } as never, {}, 5, 4)).toEqual([]);
  });

  it('decodes every business-policy ASC rejection deterministically', () => {
    const contract = new Contract(poolAddress, [
      'error WrongSourceTransaction()',
      'error InvalidLockIdentity()',
      'error BorrowerMismatch()',
    ]);
    expect(
      ascRefusalCode(contract, {
        data: contract.interface.encodeErrorResult('WrongSourceTransaction'),
      })
    ).toBe('WRONG_SOURCE_TRANSACTION');
    expect(
      ascRefusalCode(contract, { data: contract.interface.encodeErrorResult('InvalidLockIdentity') })
    ).toBe('INVALID_LOCK_IDENTITY');
    expect(ascRefusalCode(contract, { data: contract.interface.encodeErrorResult('BorrowerMismatch') })).toBe(
      'BORROWER_MISMATCH'
    );
  });

  it('requires one exact ASC event and a matching pool line', () => {
    const asc = new Contract(poolAddress, attestLockAscAbi);
    const encoded = asc.interface.encodeEventLog(asc.interface.getEvent('LockVerifiedAndLineOpened')!, [
      queryId,
      lockId,
      borrower,
      100_000_000n,
      50_000_000n,
      1_000,
      90_000,
    ]);
    const log = { address: poolAddress, topics: encoded.topics, data: encoded.data };
    const matches = matchingAscExecutionEvents(asc, poolAddress, [log], lockId);
    expect(matches).toHaveLength(1);
    expect(matchingAscExecutionEvents(asc, poolAddress, [log], `0x${'33'.repeat(32)}`)).toEqual([]);
    expect(
      executionStateMatches(
        {
          borrower,
          queryId,
          limit: 50_000_000n,
          collateralAmount: 100_000_000n,
          maturity: 1_000,
          collateralUnlockAt: 90_000,
        },
        matches[0]!
      )
    ).toBe(true);
    expect(
      executionStateMatches(
        {
          borrower,
          queryId,
          limit: 49_000_000n,
          collateralAmount: 100_000_000n,
          maturity: 1_000,
          collateralUnlockAt: 90_000,
        },
        matches[0]!
      )
    ).toBe(false);
  });
});
