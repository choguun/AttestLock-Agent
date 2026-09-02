import { describe, expect, it } from 'vitest';
import { buildChallengeMessage } from './challenge.js';

describe('buildChallengeMessage', () => {
  it('binds the wallet, nonce, expiry and single authorized action', () => {
    const result = buildChallengeMessage(
      '0x0000000000000000000000000000000000000001',
      'nonce-1',
      '2026-09-03T00:05:00.000Z'
    );
    expect(result).toContain('Wallet: 0x0000000000000000000000000000000000000001');
    expect(result).toContain('Nonce: nonce-1');
    expect(result).toContain('Queue one Sepolia collateral proof job');
  });
});
