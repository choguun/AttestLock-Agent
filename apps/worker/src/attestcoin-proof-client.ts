import { SEPOLIA_CHAIN_KEY, type JobEvidence } from '@attestlock/shared';
import type { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import { TransientError, errorMessage } from './errors.js';

type ChainInfoClient = Pick<
  chainInfo.ChainInfoProvider,
  'waitUntilHeightAttested' | 'getLatestAttestedHeightAndHash'
>;

interface ProofBuilderClient {
  getProof(txHash: string): Promise<proofProvider.ProofResult>;
}

export interface AcquiredProof {
  proof: proofProvider.ContinuityResponse;
  evidence: JobEvidence;
}

export function proofArguments(proof: proofProvider.ContinuityResponse) {
  return [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings,
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ] as const;
}

/** Follows the official sequence: ChainInfo attestation first, ProofBuilder second. */
export class AttestcoinProofClient {
  constructor(
    private readonly chainInfoProvider: ChainInfoClient,
    private readonly proofBuilder: ProofBuilderClient
  ) {}

  async acquire(txHash: string, blockNumber: number): Promise<AcquiredProof> {
    try {
      await this.chainInfoProvider.waitUntilHeightAttested(
        SEPOLIA_CHAIN_KEY,
        blockNumber,
        15_000,
        1_200_000,
        15_000
      );
    } catch (error) {
      throw new TransientError('ATTESTATION_TIMEOUT', errorMessage(error));
    }

    const latest = await this.chainInfoProvider
      .getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY)
      .catch((error) => {
        throw new TransientError('ATTESTATION_READ_FAILED', errorMessage(error));
      });
    if (!latest.exists || latest.height < blockNumber) {
      throw new TransientError('ATTESTATION_NOT_CONFIRMED', 'The source block is not attested yet.');
    }

    let result: proofProvider.ProofResult;
    try {
      result = await this.proofBuilder.getProof(txHash);
    } catch (error) {
      throw new TransientError('PROOF_BUILDER_UNAVAILABLE', errorMessage(error));
    }
    if (!result.success || !result.data) {
      throw new TransientError('PROOF_GENERATION_FAILED', result.error ?? 'No proof data returned');
    }
    if (result.data.chainKey !== SEPOLIA_CHAIN_KEY || result.data.headerNumber !== blockNumber) {
      throw new TransientError(
        'PROOF_DATA_MISMATCH',
        'ProofBuilder returned a proof for an unexpected chain or block.'
      );
    }

    return {
      proof: result.data,
      evidence: {
        attestedHeight: latest.height,
        attestedAt: new Date().toISOString(),
        proofMerkleRoot: result.data.merkleProof.root,
        continuityRootCount: result.data.continuityProof.roots.length,
        proofGeneratedAt: new Date().toISOString(),
      },
    };
  }
}
