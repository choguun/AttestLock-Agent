import { Interface } from 'ethers';

export const proofInterface = new Interface([
  'function verifyLockAndOpenLine(uint64,uint64,bytes,bytes32,(bytes32 hash,bool isLeft)[],bytes32,bytes32[]) returns (bool)',
]);

// A later proof may extend the continuity chain as more source blocks are attested.
// All transaction/query fields must remain identical. Both counterparts must also
// be verified against historical native state by the caller, not just compared.
export function validateTamperLinkage(successfulCalldata, tamperedCalldata, originalProofArguments) {
  const original = proofInterface.encodeFunctionData('verifyLockAndOpenLine', originalProofArguments);
  const success = proofInterface.decodeFunctionData('verifyLockAndOpenLine', successfulCalldata);
  const originalArgs = proofInterface.decodeFunctionData('verifyLockAndOpenLine', original);
  const tampered = proofInterface.decodeFunctionData('verifyLockAndOpenLine', tamperedCalldata);
  const expected = [...originalArgs];
  expected[2] = tampered[2];
  if (
    originalArgs[2] === tampered[2] ||
    proofInterface.encodeFunctionData('verifyLockAndOpenLine', expected).toLowerCase() !==
      tamperedCalldata.toLowerCase()
  )
    throw new Error('Tamper must change only txBytes of its recorded original proof.');
  const sameTransaction = [...success];
  sameTransaction[6] = originalArgs[6];
  if (
    proofInterface.encodeFunctionData('verifyLockAndOpenLine', sameTransaction).toLowerCase() !==
    original.toLowerCase()
  )
    throw new Error('Original and successful proofs differ in transaction/query fields.');
  if (
    originalArgs[6].length > success[6].length ||
    originalArgs[6].some((root, index) => root.toLowerCase() !== success[6][index].toLowerCase())
  )
    throw new Error('Successful continuity path must extend the original prefix.');
  return original;
}
