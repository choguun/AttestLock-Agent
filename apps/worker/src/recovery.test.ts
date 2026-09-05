import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredError, RefusedError } from './errors.js';
import { JobProcessor } from './processor.js';
import { JOB_LEASE_MS, LeaseLostError, MemoryJobStore } from './store.js';

const wallet = `0x${'ab'.repeat(20)}`;
const other = `0x${'cd'.repeat(20)}`;
const txHash = `0x${'12'.repeat(32)}`;

describe('audit recovery regressions', () => {
  afterEach(() => vi.useRealTimers());

  it('cannot reserve a victim transaction, and allows a shared junk transaction', async () => {
    const store = new MemoryJobStore();
    const attacker = await store.createJob(txHash, other);
    await store.transition(attacker.id, { status: 'refused', errorCode: 'BORROWER_MISMATCH' });
    const actual = await store.createJob(txHash, wallet);
    expect(actual.id).not.toBe(attacker.id);
    const same = await store.createJob(txHash.toUpperCase(), wallet.toUpperCase());
    expect(same.id).toBe(actual.id);
    expect(await store.getPublicStats()).toMatchObject({ totalJobs: 2, uniqueWallets: 2 });
  });

  it('sets the single-processor guard before asynchronous claiming', async () => {
    const store = new MemoryJobStore();
    await store.createJob(txHash, wallet);
    await store.createJob(`0x${'34'.repeat(32)}`, wallet);
    const original = store.claimNextRunnable.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claim = vi.spyOn(store, 'claimNextRunnable').mockImplementation(async () => {
      await gate;
      return original();
    });
    const execute = vi.fn(async () => ({ evidence: {} }));
    const processor = new JobProcessor(store, { execute });
    const first = processor.runNext();
    expect(await processor.runNext()).toBeNull();
    release();
    await first;
    expect(claim).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not steal active leases and fences expired owners after reclamation', async () => {
    vi.useFakeTimers();
    const store = new MemoryJobStore();
    await store.createJob(txHash, wallet);
    const first = (await store.claimNextRunnable())!;
    expect(await store.recoverInterrupted()).toBe(0);
    vi.advanceTimersByTime(JOB_LEASE_MS + 1);
    expect(await store.renewLease(first.id, first.leaseToken)).toBe(false);
    const second = (await store.claimNextRunnable())!;
    expect(second.leaseToken).not.toBe(first.leaseToken);
    await expect(store.transition(first.id, { status: 'executed' }, first.leaseToken)).rejects.toBeInstanceOf(
      LeaseLostError
    );
    expect((await store.transition(second.id, { status: 'executed' }, second.leaseToken)).status).toBe(
      'executed'
    );
  });

  it('polling and pending broadcasts do not exhaust the proof retry budget or starve later jobs', async () => {
    vi.useFakeTimers();
    const store = new MemoryJobStore();
    const pending = await store.createJob(txHash, wallet);
    const junk = await store.createJob(`0x${'34'.repeat(32)}`, other);
    const processor = new JobProcessor(store, {
      async execute(job) {
        if (job.id === pending.id) throw new DeferredError('ATTESTATION_NOT_CONFIRMED');
        throw new RefusedError('WRONG_SOURCE_CONTRACT', 'https://secret:password@rpc.test/key');
      },
    });
    expect((await processor.runNext())?.attemptCount).toBe(0);
    expect((await processor.runNext())?.id).toBe(junk.id);
    expect(JSON.stringify(await store.getJob(junk.id))).not.toContain('password');
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(15_000);
      expect((await processor.runNext())?.attemptCount).toBe(0);
    }
  });

  it('serializes relayers and persists a private outbox plus public identity atomically', async () => {
    const store = new MemoryJobStore();
    await store.createJob(txHash, wallet);
    const job = (await store.claimNextRunnable())!;
    const submission = { jobId: job.id, txHash, relayer: '102031:test', rawTransaction: '0xdeadbeef' };
    await expect(store.saveSubmission(submission, 'wrong-token')).rejects.toBeInstanceOf(LeaseLostError);
    expect(await store.getSubmission(job.id)).toBeNull();
    await store.withRelayerLock(submission.relayer, () => store.saveSubmission(submission, job.leaseToken));
    expect(await store.hasPendingSubmission(submission.relayer)).toBe(true);
    expect((await store.getJob(job.id))?.evidence.creditcoinSubmissionTxHash).toBe(txHash);
    expect(JSON.stringify(await store.getJob(job.id))).not.toContain('deadbeef');
    await store.finalizeSubmission(job.id);
    expect(await store.hasPendingSubmission(submission.relayer)).toBe(false);
  });
});
