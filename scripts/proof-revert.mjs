import { Interface } from 'ethers';
const errors = new Interface(['error ProofVerificationFailed()', 'error QueryAlreadyProcessed()']);

/** Exact accepted verifier failures only; the live checker separately binds calldata and state/order. */
export function isExpectedProofRevert(data, name) {
  if (typeof data !== 'string') return false;
  if (data === errors.encodeErrorResult(name)) return true;
  return (
    name === 'ProofVerificationFailed' &&
    data === errors.encodeErrorResult('Error', ['Merkle proof validation failed'])
  );
}
