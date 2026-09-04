import { attestLockAscAbi } from '@attestlock/shared';
import { Contract, Interface } from 'ethers';
import { describe, expect, it } from 'vitest';
import { ascRefusalCode, proofArguments } from './chain-adapter.js';

describe('Attestcoin proof adapter', () => {
  it('converts the official SDK response to the seven proof arguments without reordering', () => {
    const proof = {
      chainKey: 1,
      headerNumber: 42,
      txBytes: '0x1234',
      merkleProof: {
        root: `0x${'11'.repeat(32)}`,
        siblings: [{ hash: `0x${'22'.repeat(32)}`, isLeft: true }],
      },
      continuityProof: { lowerEndpointDigest: `0x${'33'.repeat(32)}`, roots: [`0x${'44'.repeat(32)}`] },
    };
    expect(proofArguments(proof as never)).toEqual([
      1,
      42,
      '0x1234',
      proof.merkleProof.root,
      proof.merkleProof.siblings,
      proof.continuityProof.lowerEndpointDigest,
      proof.continuityProof.roots,
    ]);
  });

  it('maps ASC custom errors to deterministic refusal codes', () => {
    const contract = new Contract('0x0000000000000000000000000000000000000001', attestLockAscAbi);
    const iface = new Interface(attestLockAscAbi);
    expect(ascRefusalCode(contract, { data: iface.encodeErrorResult('UnsupportedToken') })).toBe(
      'UNSUPPORTED_TOKEN'
    );
    expect(ascRefusalCode(contract, { data: '0xdeadbeef' })).toBe('ASC_PREFLIGHT_REVERTED');
  });
});
