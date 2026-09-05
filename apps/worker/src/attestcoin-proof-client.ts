import { SEPOLIA_CHAIN_KEY, type JobEvidence } from '@attestlock/shared';
import type { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import { DeferredError, RefusedError, TransientError, errorMessage } from './errors.js';
import { isSupportedSourceChain } from './readiness-service.js';
import { bounded } from './timeouts.js';

type ChainInfoClient = Pick<
  chainInfo.ChainInfoProvider,
  'getSupportedChainByKey' | 'getLatestAttestedHeightAndHash'
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
      const registered = await bounded(this.chainInfoProvider.getSupportedChainByKey(SEPOLIA_CHAIN_KEY));
      if (!isSupportedSourceChain(registered)) throw new DeferredError('SOURCE_REGISTRATION_MISMATCH');
    } catch (error) {
      if (error instanceof DeferredError) throw error;
      throw new TransientError('ATTESTATION_READ_FAILED', errorMessage(error));
    }

    const latest = await bounded(
      this.chainInfoProvider.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY)
    ).catch((error) => {
      throw new TransientError('ATTESTATION_READ_FAILED', errorMessage(error));
    });
    if (!latest.exists || latest.height < blockNumber) {
      throw new DeferredError('ATTESTATION_NOT_CONFIRMED');
    }
    const attestedAt = new Date().toISOString();

    let result: proofProvider.ProofResult;
    try {
      result = await bounded(this.proofBuilder.getProof(txHash), 30_000);
    } catch (error) {
      throw new TransientError('PROOF_BUILDER_UNAVAILABLE', errorMessage(error));
    }
    if (!result.success || !result.data) {
      throw new TransientError('PROOF_GENERATION_FAILED', result.error ?? 'No proof data returned');
    }
    if (
      result.data.chainKey !== SEPOLIA_CHAIN_KEY ||
      result.data.headerNumber !== blockNumber ||
      result.data.txHash?.toLowerCase() !== txHash.toLowerCase()
    ) {
      throw new RefusedError(
        'PROOF_DATA_MISMATCH',
        'ProofBuilder returned a proof for an unexpected chain or block.'
      );
    }

    return {
      proof: result.data,
      evidence: {
        attestedHeight: latest.height,
        attestedAt,
        proofMerkleRoot: result.data.merkleProof.root,
        continuityRootCount: result.data.continuityProof.roots.length,
        proofGeneratedAt: new Date().toISOString(),
      },
    };
  }
}
