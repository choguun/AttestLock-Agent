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
  attestedHeight?: number;
  attestedAt?: string;
  lockId?: string;
  collateralAmount?: string;
  collateralUnlockAt?: number;
  proofMerkleRoot?: string;
  continuityRootCount?: number;
  proofGeneratedAt?: string;
  creditcoinTxHash?: string;
  creditcoinSubmissionTxHash?: string;
  creditcoinBlockNumber?: number;
  gasUsed?: string;
  processingDurationMs?: number;
  queryId?: string;
}

export interface PublicStats {
  generatedAt: string;
  totalJobs: number;
  uniqueWallets: number;
  executedJobs: number;
  refusedJobs: number;
  failedJobs: number;
  latestAttestedHeight: number | null;
  linesOpened: number;
  borrowersWhoDrew: number;
  totalCreditOpenedAtomic: string;
  totalBorrowedAtomic: string;
  totalRepaidAtomic: string;
  outstandingDebtAtomic: string;
}

export type JobStats = Pick<
  PublicStats,
  'totalJobs' | 'uniqueWallets' | 'executedJobs' | 'refusedJobs' | 'failedJobs'
>;

export type ProtocolStats = Pick<
  PublicStats,
  | 'linesOpened'
  | 'borrowersWhoDrew'
  | 'totalCreditOpenedAtomic'
  | 'totalBorrowedAtomic'
  | 'totalRepaidAtomic'
  | 'outstandingDebtAtomic'
>;

export interface ReadinessChecks {
  database: boolean;
  sourceRpc: boolean;
  destinationRpc: boolean;
  sourceContracts: boolean;
  destinationContracts: boolean;
  contractBindings: boolean;
  attestcoinChain: boolean;
  activeAttestation: boolean;
  proofBuilder: boolean;
  fundedRelayer: boolean;
}

export interface ReadinessReport {
  schemaVersion: 2;
  status: 'ready' | 'unavailable';
  version: string;
  checks: ReadinessChecks;
  latestAttestedHeight: number | null;
  attestationAdvancedAt: string | null;
  proofBuilderAttestedHeight: number | null;
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
