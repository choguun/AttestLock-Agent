import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCreationReceipt } from './broadcast-receipts.mjs';

test('CREATE receipts bind to address even when Foundry parallel transaction hashes are swapped', () => {
  const creation = { contractName: 'Token', contractAddress: '0xAa', hash: 'vault-hash' };
  const token = { contractAddress: '0xaa', transactionHash: 'token-hash', status: '0x1' };
  const vault = { contractAddress: '0xbb', transactionHash: 'vault-hash', status: '0x1' };
  assert.equal(resolveCreationReceipt(creation, [vault, token]), token);
});

test('missing, failed, or ambiguous CREATE receipts cannot produce a manifest', () => {
  const creation = { contractName: 'Token', contractAddress: '0xaa' };
  const receipt = { contractAddress: '0xaa', transactionHash: 'token-hash', status: 1 };
  assert.throws(() => resolveCreationReceipt(creation, []));
  assert.throws(() => resolveCreationReceipt(creation, [{ ...receipt, status: 0 }]));
  assert.throws(() => resolveCreationReceipt(creation, [receipt, receipt]));
});
