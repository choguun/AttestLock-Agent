import { getAddress, isHexString } from 'ethers';
import { SEPOLIA_CHAIN_ID } from './networks.js';
import type { QueueAuthorizationTypedData } from './types.js';

export const CHALLENGE_TTL_SECONDS = 5 * 60;

export function buildQueueAuthorization(
  wallet: string,
  txHash: string,
  nonce: string,
  expiresAt: string,
  sourceVault: string,
  apiOrigin: string
): QueueAuthorizationTypedData {
  if (!isHexString(txHash, 32)) throw new Error('Expected a 32-byte transaction hash');
  const expirySeconds = Math.floor(new Date(expiresAt).getTime() / 1000);
  if (!Number.isSafeInteger(expirySeconds)) throw new Error('Invalid challenge expiry');

  return {
    domain: {
      name: 'AttestLock Agent',
      version: '1',
      chainId: SEPOLIA_CHAIN_ID,
      verifyingContract: getAddress(sourceVault),
    },
    types: {
      QueueProofJob: [
        { name: 'wallet', type: 'address' },
        { name: 'txHash', type: 'bytes32' },
        { name: 'nonce', type: 'string' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'apiOrigin', type: 'string' },
      ],
    },
    primaryType: 'QueueProofJob',
    message: {
      wallet: getAddress(wallet),
      txHash: txHash.toLowerCase(),
      nonce,
      expiresAt: expirySeconds,
      apiOrigin,
    },
  };
}
