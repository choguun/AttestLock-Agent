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
  message: string;
  expiresAt: string;
}

export interface CreateJobRequest {
  txHash: string;
  wallet: string;
  signature: string;
  nonce: string;
}
