import { explainStatus, type JobStatus } from '@attestlock/shared';
import { describe, expect, it } from 'vitest';
import { RefusedError, TransientError } from './errors.js';
import { type ChainAdapter, JobProcessor } from './processor.js';
import { MemoryJobStore } from './store.js';

const borrower = '0x0000000000000000000000000000000000000001';
const txHash = `0x${'12'.repeat(32)}`;

describe('JobProcessor', () => {
  it('persists every proof stage and executes', async () => {
    const store = new MemoryJobStore();
    const job = await store.createJob(txHash, borrower);
    const seen: JobStatus[] = [];
    const adapter: ChainAdapter = {
      async execute(_job, transition) {
        for (const status of ['waiting_attestation', 'proving', 'preflight', 'submitting'] as const) {
          await transition(status);
        }
        return { evidence: { creditcoinTxHash: `0x${'34'.repeat(32)}` } };
      },
    };
    const processor = new JobProcessor(store, adapter, (updated) => seen.push(updated.status));

    const result = await processor.runNext();
    expect(result?.status).toBe('executed');
    expect(result?.explanation).toBe(explainStatus('executed'));
    expect(result?.evidence.creditcoinTxHash).toBe(`0x${'34'.repeat(32)}`);
    expect(seen).toEqual(['waiting_attestation', 'proving', 'preflight', 'submitting', 'executed']);
    expect((await store.getJob(job.id))?.status).toBe('executed');
  });

  it('records policy refusal without retrying', async () => {
    const store = new MemoryJobStore();
    await store.createJob(txHash, borrower);
    const processor = new JobProcessor(store, {
      async execute() {
        throw new RefusedError('WRONG_SOURCE_CONTRACT', 'The transaction did not call LockVault.');
      },
    });

    const result = await processor.runNext();
    expect(result?.status).toBe('refused');
    expect(result?.attemptCount).toBe(0);
    expect(result?.errorCode).toBe('WRONG_SOURCE_CONTRACT');
  });

  it('schedules bounded retries and then fails closed', async () => {
    const store = new MemoryJobStore();
    const job = await store.createJob(txHash, borrower);
    const processor = new JobProcessor(store, {
      async execute() {
        throw new TransientError('RPC_DOWN', 'rpc unavailable');
      },
    });
    let now = new Date('2026-09-03T00:00:00.000Z');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await processor.runNext(now);
      expect(result?.attemptCount).toBe(attempt);
      if (attempt < 4) {
        expect(result?.status).toBe('queued');
        now = new Date(result!.nextAttemptAt!);
      } else {
        expect(result?.status).toBe('failed');
        expect(result?.nextAttemptAt).toBeNull();
      }
    }
    expect((await store.getJob(job.id))?.status).toBe('failed');
  });

  it('recovers an interrupted proof stage after restart', async () => {
    const store = new MemoryJobStore();
    const job = await store.createJob(txHash, borrower);
    await store.transition(job.id, { status: 'submitting' });

    expect(await store.recoverInterrupted()).toBe(1);
    expect((await store.getJob(job.id))?.status).toBe('queued');
  });
});
