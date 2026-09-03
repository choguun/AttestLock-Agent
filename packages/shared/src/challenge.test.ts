import { describe, expect, it } from 'vitest';
import { TypedDataEncoder } from 'ethers';
import { buildQueueAuthorization } from './challenge.js';

describe('buildQueueAuthorization', () => {
  it('binds wallet, transaction, vault, API origin, nonce and expiry', () => {
    const result = buildQueueAuthorization(
      '0x0000000000000000000000000000000000000001',
      `0x${'ab'.repeat(32)}`,
      'nonce-1',
      '2026-09-03T00:05:00.000Z',
      '0x0000000000000000000000000000000000000002',
      'https://api.attestlock.example'
    );
    expect(result.message.wallet).toBe('0x0000000000000000000000000000000000000001');
    expect(result.message.txHash).toBe(`0x${'ab'.repeat(32)}`);
    expect(result.message.apiOrigin).toBe('https://api.attestlock.example');
    expect(result.domain.verifyingContract).toBe('0x0000000000000000000000000000000000000002');
    expect(TypedDataEncoder.hash(result.domain, result.types, result.message)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
