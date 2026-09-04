export const jobStatuses = [
  'queued',
  'waiting_attestation',
  'proving',
  'preflight',
  'submitting',
  'executed',
  'refused',
  'failed',
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export interface JobEvidence {
  blockNumber?: number;
  lockId?: string;
  collateralAmount?: string;
  collateralUnlockAt?: number;
  proofMerkleRoot?: string;
  continuityRootCount?: number;
  creditcoinTxHash?: string;
  creditcoinSubmissionTxHash?: string;
  queryId?: string;
}

export interface Job {
  id: string;
  txHash: string;
  borrower: string;
  status: JobStatus;
  explanation: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  evidence: JobEvidence;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Challenge {
  nonce: string;
  wallet: string;
  txHash: string;
  expiresAt: string;
  typedData: QueueAuthorizationTypedData;
}

export interface QueueAuthorizationTypedData {
  domain: {
    name: 'AttestLock Agent';
    version: '1';
    chainId: number;
    verifyingContract: string;
  };
  types: {
    QueueProofJob: Array<{ name: string; type: string }>;
  };
  primaryType: 'QueueProofJob';
  message: {
    wallet: string;
    txHash: string;
    nonce: string;
    expiresAt: number;
    apiOrigin: string;
  };
}

export interface CreateJobRequest {
  txHash: string;
  wallet: string;
  signature: string;
  nonce: string;
}
