import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { AbiCoder, Interface, keccak256, solidityPackedKeccak256 } from 'ethers';

test('real Sepolia fixture preserves native tuple, query, successful receipt, lock fact and 50% limit', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('../fixtures/proofs/sepolia-lock-2026-09-05.json', import.meta.url), 'utf8')
  );
  const args = fixture.proofArguments;
  assert.equal(args.length, 7);
  assert.equal(args[0], 1);
  assert.equal(args[1], fixture.lockFact.blockNumber);
  const txIndex = args[4].reduce(
    (index, entry, depth) => (entry.isLeft ? index | (1n << BigInt(depth)) : index),
    0n
  );
  assert.equal(txIndex.toString(), fixture.txIndex);
  assert.equal(
    solidityPackedKeccak256(['uint256', 'uint64', 'uint256'], [1, args[1], txIndex]),
    fixture.queryId
  );
  const abi = AbiCoder.defaultAbiCoder();
  const [type, chunks] = abi.decode(['uint8', 'bytes[]'], args[2]);
  assert.ok(type <= 4n);
  assert.equal(chunks.length, type <= 2n ? 3 : 4);
  assert.equal(keccak256(chunks[0]), fixture.lockFact.commonHash);
  assert.equal(keccak256(chunks.at(-1)), fixture.lockFact.receiptHash);
  const common = abi.decode(
    ['uint64', 'uint64', 'address', 'bool', 'address', 'uint256', 'bytes'],
    chunks[0]
  );
  assert.equal(common[2].toLowerCase(), fixture.borrower.toLowerCase());
  assert.equal(common[3], false);
  assert.equal(common[4].toLowerCase(), fixture.sourceVault.toLowerCase());
  const receipt = abi.decode(['uint8', 'uint64', 'tuple(address,bytes32[],bytes)[]', 'bytes'], chunks.at(-1));
  assert.equal(receipt[0], 1n);
  assert.equal(receipt[1].toString(), fixture.sourceReceipt.gasUsed);
  const iface = new Interface([
    'event CollateralLocked(bytes32 indexed lockId,address indexed borrower,address indexed token,uint256 amount,uint64 unlockAt)',
  ]);
  const log = receipt[2].find((entry) => entry[0].toLowerCase() === fixture.sourceVault.toLowerCase());
  const event = iface.parseLog({ topics: [...log[1]], data: log[2] });
  assert.equal(event.args.lockId, fixture.lockFact.lockId);
  assert.equal(event.args.borrower.toLowerCase(), fixture.borrower.toLowerCase());
  assert.equal(event.args.token.toLowerCase(), fixture.sourceToken.toLowerCase());
  assert.equal(event.args.amount, 100000000n);
  assert.equal(event.args.unlockAt, BigInt(fixture.lockFact.unlockAt));
  assert.equal((event.args.amount / 2n).toString(), fixture.expectedCreditLimit);
});
