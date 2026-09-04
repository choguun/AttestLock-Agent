import { describe, expect, it, vi } from 'vitest';
import { AttestcoinProofClient } from './attestcoin-proof-client.js';

const proof = {
  chainKey: 1,
  headerNumber: 42,
  txBytes: '0x1234',
  merkleProof: { root: `0x${'11'.repeat(32)}`, siblings: [] },
  continuityProof: { lowerEndpointDigest: `0x${'22'.repeat(32)}`, roots: [] },
};

function clients(
  latest: { exists: boolean; height: number } = { exists: true, height: 45 },
  result: object = { success: true, data: proof }
) {
  const order: string[] = [];
  const chain = {
    waitUntilHeightAttested: vi.fn(async () => {
      order.push('chain-info');
    }),
    getLatestAttestedHeightAndHash: vi.fn(async () => ({ ...latest, hash: '0x', isAttestation: true })),
  };
  const builder = {
    getProof: vi.fn(async () => {
      order.push('proof-builder');
      return result;
    }),
  };
  return { chain, builder, order };
}

describe('AttestcoinProofClient', () => {
  it('waits through ChainInfo before requesting the exact proof', async () => {
    const { chain, builder, order } = clients();
    const acquired = await new AttestcoinProofClient(chain as never, builder as never).acquire(
      `0x${'33'.repeat(32)}`,
      42
    );

    expect(order).toEqual(['chain-info', 'proof-builder']);
    expect(chain.waitUntilHeightAttested).toHaveBeenCalledWith(1, 42, 15_000, 1_200_000, 15_000);
    expect(acquired.proof).toEqual(proof);
    expect(acquired.evidence).toMatchObject({
      attestedHeight: 45,
      proofMerkleRoot: proof.merkleProof.root,
      continuityRootCount: 0,
    });
  });

  it('fails closed when attestation is missing or ProofBuilder returns another block', async () => {
    const missing = clients({ exists: false, height: 0 });
    await expect(
      new AttestcoinProofClient(missing.chain as never, missing.builder as never).acquire('0x12', 42)
    ).rejects.toMatchObject({ code: 'ATTESTATION_NOT_CONFIRMED' });
    expect(missing.builder.getProof).not.toHaveBeenCalled();

    const mismatched = clients(
      { exists: true, height: 45 },
      { success: true, data: { ...proof, headerNumber: 41 } }
    );
    await expect(
      new AttestcoinProofClient(mismatched.chain as never, mismatched.builder as never).acquire('0x12', 42)
    ).rejects.toMatchObject({ code: 'PROOF_DATA_MISMATCH' });
  });

  it('classifies ChainInfo and ProofBuilder outages as retryable', async () => {
    const unavailable = clients();
    unavailable.chain.waitUntilHeightAttested.mockRejectedValueOnce(new Error('rpc down'));
    await expect(
      new AttestcoinProofClient(unavailable.chain as never, unavailable.builder as never).acquire('0x12', 42)
    ).rejects.toMatchObject({ code: 'ATTESTATION_TIMEOUT' });

    const failedProof = clients({ exists: true, height: 45 }, { success: false, error: 'not ready' });
    await expect(
      new AttestcoinProofClient(failedProof.chain as never, failedProof.builder as never).acquire('0x12', 42)
    ).rejects.toMatchObject({ code: 'PROOF_GENERATION_FAILED' });
  });
});
