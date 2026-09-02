import type { Job, JobEvidence, JobStatus } from '@attestlock/shared';
import { explainStatus } from '@attestlock/shared';
import { RefusedError, TransientError, errorMessage } from './errors.js';
import type { JobStore } from './store.js';

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

  constructor(
    private readonly store: JobStore,
    private readonly adapter: ChainAdapter,
    private readonly listener: JobListener = () => undefined
  ) {}

  async runNext(now = new Date()): Promise<Job | null> {
    if (this.running) return null;
    const job = await this.store.nextRunnable(now);
    if (!job) return null;

    this.running = true;
    try {
      const result = await this.adapter.execute(job, async (status, evidence) => {
        const updated = await this.store.transition(job.id, {
          status,
          evidence,
          errorCode: null,
          nextAttemptAt: null,
        });
        this.listener(updated);
      });
      const updated = await this.store.transition(job.id, {
        status: 'executed',
        explanation: result.explanation ?? explainStatus('executed'),
        evidence: result.evidence,
        errorCode: null,
        nextAttemptAt: null,
      });
      this.listener(updated);
      return updated;
    } catch (error) {
      if (error instanceof RefusedError) {
        const updated = await this.store.transition(job.id, {
          status: 'refused',
          explanation: error.message,
          errorCode: error.code,
          nextAttemptAt: null,
        });
        this.listener(updated);
        return updated;
      }

      const attempt = job.attemptCount + 1;
      const delay = retryDelaysMs[attempt - 1];
      const exhausted = delay === undefined;
      const code = error instanceof TransientError ? error.code : 'UNEXPECTED_ERROR';
      const updated = await this.store.transition(job.id, {
        status: exhausted ? 'failed' : 'queued',
        explanation: exhausted
          ? `Infrastructure retries were exhausted: ${errorMessage(error)}`
          : `A temporary dependency failed; retry ${attempt} is scheduled.`,
        errorCode: code,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + delay),
        incrementAttempt: true,
      });
      this.listener(updated);
      return updated;
    } finally {
      this.running = false;
    }
  }
}
