import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { borrowInterface, validateBorrowEvidence } from './borrow-evidence.mjs';

const recorded = JSON.parse(
  await readFile(new URL('../evidence/borrow-2026-09-05.json', import.meta.url), 'utf8')
);

test('real borrower draw binds calldata, block, token movement, replay flags and profile deltas', () => {
  assert.equal(validateBorrowEvidence(recorded), recorded);
  assert.equal(recorded.receipt.blockNumber, 5434865);
  assert.equal(recorded.after.borrowerBalanceAtomic, '50000000');
});

const mutations = {
  'relayer instead of borrower': (v) => {
    v.transaction.from = v.expected.asc;
  },
  'wrong pool': (v) => {
    v.transaction.to = v.expected.asset;
  },
  'wrong chain': (v) => {
    v.transaction.chainId = '1';
  },
  'native payment': (v) => {
    v.transaction.value = '1';
  },
  'failed receipt': (v) => {
    v.receipt.status = 0;
  },
  'unlinked receipt': (v) => {
    v.receipt.hash = `0x${'12'.repeat(32)}`;
  },
  'unlinked block': (v) => {
    v.block.hash = `0x${'12'.repeat(32)}`;
  },
  'different lock calldata': (v) => {
    v.transaction.data = borrowInterface.encodeFunctionData('borrow', [`0x${'12'.repeat(32)}`, 50000000n]);
  },
  'smaller draw': (v) => {
    v.transaction.data = borrowInterface.encodeFunctionData('borrow', [v.expected.lockId, 1n]);
  },
  'extra calldata bytes': (v) => {
    v.transaction.data += '00';
  },
  'missing events': (v) => {
    v.receipt.logs = [];
  },
  'spoofed token emitter': (v) => {
    v.receipt.logs.find((l) => l.address.toLowerCase() === v.expected.asset.toLowerCase()).address =
      v.expected.pool;
  },
  'duplicate draw events': (v) => {
    v.receipt.logs.push(...structuredClone(v.receipt.logs));
  },
  'maturity already reached': (v) => {
    v.block.timestamp = Number(v.after.line[3]);
  },
  'unrelated query': (v) => {
    v.after.line[6] = `0x${'12'.repeat(32)}`;
  },
  'changed credit limit': (v) => {
    v.after.line[1] = '100000000';
  },
  'used lock flag absent': (v) => {
    v.before.usedLock = false;
  },
  'used query flag absent': (v) => {
    v.after.usedQuery = false;
  },
  'borrower tokens missing': (v) => {
    v.after.borrowerBalanceAtomic = '0';
  },
  'pool did not pay': (v) => {
    v.after.poolBalanceAtomic = v.before.poolBalanceAtomic;
  },
  'profile debt mismatch': (v) => {
    v.after.profile[4] = '0';
  },
  'unrelated profile line opened': (v) => {
    v.after.profile[0] = '2';
  },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`refuses ${name} as draw evidence`, () => {
    const changed = structuredClone(recorded);
    mutate(changed);
    assert.throws(() => validateBorrowEvidence(changed));
  });
}
