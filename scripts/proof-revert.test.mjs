import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { isExpectedProofRevert } from './proof-revert.mjs';
const errors = new Interface(['error ProofVerificationFailed()', 'error QueryAlreadyProcessed()']);
test('accepts only exact ASC or observed native inclusion errors', () => {
  assert.equal(
    isExpectedProofRevert(errors.encodeErrorResult('ProofVerificationFailed'), 'ProofVerificationFailed'),
    true
  );
  assert.equal(
    isExpectedProofRevert(
      errors.encodeErrorResult('Error', ['Merkle proof validation failed']),
      'ProofVerificationFailed'
    ),
    true
  );
  assert.equal(
    isExpectedProofRevert(errors.encodeErrorResult('Error', ['out of gas']), 'ProofVerificationFailed'),
    false
  );
  assert.equal(
    isExpectedProofRevert(errors.encodeErrorResult('QueryAlreadyProcessed'), 'ProofVerificationFailed'),
    false
  );
  assert.equal(isExpectedProofRevert('0x', 'ProofVerificationFailed'), false);
});
test('query replay cannot be satisfied by a native Merkle failure', () => {
  assert.equal(
    isExpectedProofRevert(errors.encodeErrorResult('QueryAlreadyProcessed'), 'QueryAlreadyProcessed'),
    true
  );
  assert.equal(
    isExpectedProofRevert(
      errors.encodeErrorResult('Error', ['Merkle proof validation failed']),
      'QueryAlreadyProcessed'
    ),
    false
  );
});
