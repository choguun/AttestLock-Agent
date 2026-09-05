import assert from 'node:assert/strict';
import { Contract, Interface, getAddress } from 'ethers';

export const borrowInterface = new Interface([
  'function borrow(bytes32 lockId,uint256 amount)',
  'event Borrowed(bytes32 indexed lockId,address indexed borrower,uint256 amount,uint256 debt)',
  'event BorrowerProfileUpdated(address indexed borrower,uint256 lineCount,uint256 totalCreditOpened,uint256 totalBorrowed,uint256 totalRepaid,uint256 outstandingDebt)',
]);
const tokenInterface = new Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const equalAddress = (actual, expected) => assert.equal(getAddress(actual), getAddress(expected));
const integers = (values) => values.map((value) => BigInt(value));

function oneEvent(receipt, address, abi, name) {
  const events = receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== address.toLowerCase()) return [];
    try {
      const event = abi.parseLog(log);
      return event?.name === name ? [event] : [];
    } catch {
      return [];
    }
  });
  assert.equal(events.length, 1, `Expected one ${name} from the configured contract`);
  return events[0];
}

// Pure validation also runs against the committed, public-chain fixture in clean-clone CI.
// Historical block snapshots deliberately fail if unrelated same-block activity obscures the deltas.
export function validateBorrowEvidence(evidence) {
  const { transaction: tx, receipt, block, before, after, expected } = evidence;
  equalAddress(tx.from, expected.borrower);
  equalAddress(tx.to, expected.pool);
  assert.equal(BigInt(tx.chainId), 102031n, 'Wrong draw chain');
  assert.equal(BigInt(tx.value), 0n, 'Draw must not send native funds');
  assert.equal(receipt.status, 1, 'Draw receipt must succeed');
  assert.equal(receipt.hash, tx.hash, 'Receipt/transaction mismatch');
  assert.equal(receipt.blockNumber, block.number);
  assert.equal(receipt.blockHash, block.hash);
  assert.equal(tx.blockHash, block.hash);
  assert.equal(tx.blockNumber, block.number);
  const call = borrowInterface.parseTransaction({ data: tx.data });
  assert.equal(call?.name, 'borrow');
  assert.equal(call.args.lockId, expected.lockId);
  assert.equal(call.args.amount, 50000000n, 'Exact 50 mUSD draw required');
  assert.equal(
    tx.data.toLowerCase(),
    borrowInterface.encodeFunctionData('borrow', [expected.lockId, 50000000n]).toLowerCase()
  );
  for (const state of [before, after]) {
    equalAddress(state.line[0], expected.borrower);
    assert.equal(BigInt(state.line[1]), 50000000n);
    assert.equal(BigInt(state.line[4]), 100000000n);
    assert.equal(state.line[6], expected.queryId);
    assert.equal(BigInt(state.line[3]), BigInt(expected.proofTimestamp) + 604800n);
    assert.ok(BigInt(state.line[5]) >= BigInt(state.line[3]) + 86400n);
    assert.ok(block.timestamp < Number(state.line[3]), 'Draw must precede maturity');
    assert.equal(state.usedLock, true);
    assert.equal(state.usedQuery, true);
    const p = integers(state.profile);
    assert.equal(p[2] - p[3], p[4], 'Profile accounting mismatch');
  }
  assert.equal(BigInt(before.line[2]), 0n, 'Demonstrated line must be undrawn');
  assert.equal(BigInt(after.line[2]), 50000000n);
  assert.deepEqual(
    before.line.filter((_, i) => i !== 2),
    after.line.filter((_, i) => i !== 2)
  );
  const prior = integers(before.profile),
    current = integers(after.profile);
  assert.deepEqual(current, [prior[0], prior[1], prior[2] + 50000000n, prior[3], prior[4] + 50000000n]);
  assert.equal(BigInt(before.poolBalanceAtomic) - BigInt(after.poolBalanceAtomic), 50000000n);
  assert.equal(BigInt(after.borrowerBalanceAtomic) - BigInt(before.borrowerBalanceAtomic), 50000000n);
  const draw = oneEvent(receipt, expected.pool, borrowInterface, 'Borrowed');
  assert.equal(draw.args.lockId, expected.lockId);
  equalAddress(draw.args.borrower, expected.borrower);
  assert.equal(draw.args.amount, 50000000n);
  assert.equal(draw.args.debt, 50000000n);
  const transfer = oneEvent(receipt, expected.asset, tokenInterface, 'Transfer');
  equalAddress(transfer.args.from, expected.pool);
  equalAddress(transfer.args.to, expected.borrower);
  assert.equal(transfer.args.value, 50000000n);
  const profile = oneEvent(receipt, expected.pool, borrowInterface, 'BorrowerProfileUpdated');
  equalAddress(profile.args.borrower, expected.borrower);
  assert.deepEqual([...profile.args].slice(1), current);
  return evidence;
}

export async function collectBorrowEvidence(provider, hash, expected) {
  assert.equal((await provider.getNetwork()).chainId, 102031n);
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(hash),
    provider.getTransactionReceipt(hash),
  ]);
  assert.ok(tx && receipt, 'Draw transaction/receipt unavailable');
  const block = await provider.getBlock(receipt.blockNumber);
  assert.ok(block, 'Draw block unavailable');
  const pool = new Contract(
    expected.pool,
    [
      'function lines(bytes32) view returns(address,uint256,uint256,uint64,uint256,uint64,bytes32)',
      'function borrowerProfiles(address) view returns(uint256,uint256,uint256,uint256,uint256)',
    ],
    provider
  );
  const asc = new Contract(
    expected.asc,
    [
      'function usedLocks(bytes32) view returns(bool)',
      'function processedQueries(bytes32) view returns(bool)',
    ],
    provider
  );
  const asset = new Contract(expected.asset, ['function balanceOf(address) view returns(uint256)'], provider);
  async function snapshot(blockTag) {
    const overrides = { blockTag };
    const [line, profile, usedLock, usedQuery, poolBalance, borrowerBalance] = await Promise.all([
      pool.lines(expected.lockId, overrides),
      pool.borrowerProfiles(expected.borrower, overrides),
      asc.usedLocks(expected.lockId, overrides),
      asc.processedQueries(expected.queryId, overrides),
      asset.balanceOf(expected.pool, overrides),
      asset.balanceOf(expected.borrower, overrides),
    ]);
    return {
      line: [...line].map(String),
      profile: [...profile].map(String),
      usedLock,
      usedQuery,
      poolBalanceAtomic: String(poolBalance),
      borrowerBalanceAtomic: String(borrowerBalance),
    };
  }
  const [before, after] = await Promise.all([
    snapshot(receipt.blockNumber - 1),
    snapshot(receipt.blockNumber),
  ]);
  return validateBorrowEvidence({
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    expected,
    transaction: {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      chainId: String(tx.chainId),
      value: String(tx.value),
      data: tx.data,
      blockHash: tx.blockHash,
      blockNumber: tx.blockNumber,
    },
    receipt: {
      hash: receipt.hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: String(receipt.gasUsed),
      logs: receipt.logs.map(({ address, topics, data }) => ({ address, topics, data })),
    },
    block: {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
      utc: new Date(block.timestamp * 1000).toISOString(),
    },
    before,
    after,
  });
}
