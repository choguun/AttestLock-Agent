import type { Job, JobEvidence, JobStatus } from '@attestlock/shared';
import { explainStatus } from '@attestlock/shared';
import { DeferredError, RefusedError, TransientError, publicRefusalMessage } from './errors.js';
import { JOB_LEASE_MS, LeaseLostError, type JobStore, type TransitionInput } from './store.js';

export interface ExecutionResult {
  explanation?: string;
  evidence: JobEvidence;
}
export interface ChainAdapter {
  execute(
    job: Job,
    transition: (status: JobStatus, evidence?: JobEvidence) => Promise<void>
  ): Promise<ExecutionResult>;
}
export type JobListener = (job: Job) => void;
const retryDelaysMs = [5_000, 30_000, 120_000];

export class JobProcessor {
  private running = false;
  private stopped = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: JobStore,
    private readonly adapter: ChainAdapter,
    private readonly listener: JobListener = () => undefined
  ) {}

  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle;
  }

  async runNext(now = new Date()): Promise<Job | null> {
    if (this.running || this.stopped) return null;
    // Acquire synchronously: no second caller may pass the guard during the claim await.
    this.running = true;
    let release!: () => void;
    this.idle = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const job = await this.store.claimNextRunnable(now);
      if (!job) return null;
      let lost = false;
      const renew = async () => {
        try {
          if (!(await this.store.renewLease(job.id, job.leaseToken))) lost = true;
        } catch {
          lost = true;
        }
      };
      heartbeat = setInterval(() => {
        void renew();
      }, JOB_LEASE_MS / 3);
      heartbeat.unref();
      const update = async (input: TransitionInput) => {
        if (lost) throw new LeaseLostError();
        const updated = await this.store.transition(job.id, input, job.leaseToken);
        Object.assign(job.evidence, updated.evidence);
        this.listener(updated);
        return updated;
      };
      try {
        const result = await this.adapter.execute(job, async (status, evidence) => {
          await renew();
          await update({ status, evidence, errorCode: null });
        });
        return await update({
          status: 'executed',
          explanation: result.explanation ?? explainStatus('executed'),
          evidence: result.evidence,
          errorCode: null,
        });
      } catch (error) {
        if (error instanceof LeaseLostError || lost) return null;
        if (error instanceof RefusedError) {
          return await update({
            status: 'refused',
            explanation: publicRefusalMessage(error.code),
            errorCode: error.code,
          });
        }
        // A recorded submission is reconciliation-only, including RPC uncertainty.
        if (error instanceof DeferredError || job.evidence.creditcoinSubmissionTxHash) {
          return await update({
            status: 'queued',
            explanation: job.evidence.creditcoinSubmissionTxHash
              ? 'Reconciling the recorded Creditcoin transaction; no replacement proof will be sent.'
              : 'Waiting for attestation or operational readiness; the job will resume automatically.',
            errorCode: error instanceof DeferredError ? error.code : 'SUBMISSION_RECONCILIATION_PENDING',
            nextAttemptAt: new Date(Date.now() + (error instanceof DeferredError ? error.delayMs : 15_000)),
          });
        }
        const attempt = job.attemptCount + 1;
        const delay = retryDelaysMs[attempt - 1];
        return await update({
          status: delay === undefined ? 'failed' : 'queued',
          explanation:
            delay === undefined
              ? 'Infrastructure retries were exhausted. Please check service readiness before retrying.'
              : `A temporary dependency failed; retry ${attempt} is scheduled.`,
          errorCode: error instanceof TransientError ? error.code : 'UNEXPECTED_ERROR',
          nextAttemptAt: delay === undefined ? null : new Date(Date.now() + delay),
          incrementAttempt: true,
        });
      }
    } finally {
      clearInterval(heartbeat);
      this.running = false;
      release();
    }
  }
}
