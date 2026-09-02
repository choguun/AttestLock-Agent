import type { JobStatus } from './types.js';

const explanations: Record<JobStatus, string> = {
  queued: 'The lock transaction is queued for validation.',
  waiting_attestation:
    'The lock is valid; the agent is waiting for Creditcoin attestors to anchor its block.',
  proving: 'The source block is attested; the agent is requesting Merkle and continuity proofs.',
  preflight: 'The proof is ready; the exact Creditcoin contract call is being simulated fail-closed.',
  submitting: 'Preflight passed; the proof transaction is being submitted to Creditcoin.',
  executed: 'Attestcoin verified the lock and Creditcoin opened the bounded credit line.',
  refused: 'The transaction did not satisfy the proof-gated collateral policy, so no credit was opened.',
  failed: 'Infrastructure retries were exhausted; no credit was opened.',
};

export function explainStatus(status: JobStatus): string {
  return explanations[status];
}
