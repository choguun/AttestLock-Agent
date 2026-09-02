import { getAddress } from 'ethers';

export const CHALLENGE_TTL_SECONDS = 5 * 60;

export function buildChallengeMessage(wallet: string, nonce: string, expiresAt: string): string {
  return [
    'AttestLock Agent job authorization',
    `Wallet: ${getAddress(wallet)}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    'Action: Queue one Sepolia collateral proof job.',
  ].join('\n');
}
