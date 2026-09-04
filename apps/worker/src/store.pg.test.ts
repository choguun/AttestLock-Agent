import { Wallet } from 'ethers';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresJobStore } from './store.js';

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('PostgresJobStore', () => {
  const store = new PostgresJobStore(databaseUrl!);
  const sql = postgres(databaseUrl!, { max: 1 });

  beforeAll(async () => {
    await store.init();
  });

  beforeEach(async () => {
    await sql`truncate table job_attempts, challenges, jobs restart identity cascade`;
  });

  afterAll(async () => {
    await Promise.all([store.close(), sql.end()]);
  });

  it('persists jobs, evidence, and restart recovery', async () => {
    const wallet = Wallet.createRandom().address;
    const txHash = Wallet.createRandom().privateKey;
    const job = await store.createJob(txHash, wallet);
    expect((await store.claimNextRunnable())?.id).toBe(job.id);
    await store.transition(job.id, {
      status: 'preflight',
      evidence: { lockId: `0x${'78'.repeat(32)}` },
    });

    expect(await store.recoverInterrupted()).toBe(1);
    const recovered = await store.getJob(job.id);
    expect(recovered?.status).toBe('queued');
    expect(recovered?.attemptCount).toBe(1);
    expect(recovered?.evidence).toEqual({ lockId: `0x${'78'.repeat(32)}` });

    const attempts = await sql<Array<{ outcome: string }>>`
      select outcome from job_attempts where job_id = ${job.id}
    `;
    expect(attempts).toEqual([{ outcome: 'interrupted' }]);
  });

  it('atomically consumes a short-lived challenge', async () => {
    const wallet = Wallet.createRandom().address;
    const txHash = Wallet.createRandom().privateKey;
    const challenge = await store.createChallenge(
      wallet,
      txHash,
      '0x0000000000000000000000000000000000000002',
      'https://api.attestlock.example'
    );
    expect((await store.authorizeJob(challenge.nonce, txHash, wallet, 5, new Date(0))).status).toBe('queued');
    await expect(store.authorizeJob(challenge.nonce, txHash, wallet, 5, new Date(0))).rejects.toThrow();
  });

  it('enforces the daily quota under concurrent authorizations', async () => {
    const wallet = Wallet.createRandom().address;
    const firstHash = Wallet.createRandom().privateKey;
    const secondHash = Wallet.createRandom().privateKey;
    const [first, second] = await Promise.all([
      store.createChallenge(
        wallet,
        firstHash,
        '0x0000000000000000000000000000000000000002',
        'https://api.attestlock.example'
      ),
      store.createChallenge(
        wallet,
        secondHash,
        '0x0000000000000000000000000000000000000002',
        'https://api.attestlock.example'
      ),
    ]);

    const results = await Promise.allSettled([
      store.authorizeJob(first.nonce, firstHash, wallet, 1, new Date(0)),
      store.authorizeJob(second.nonce, secondHash, wallet, 1, new Date(0)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('claims runnable jobs atomically for concurrent workers', async () => {
    const first = await store.createJob(Wallet.createRandom().privateKey, Wallet.createRandom().address);
    const second = await store.createJob(Wallet.createRandom().privateKey, Wallet.createRandom().address);

    const claimed = await Promise.all([store.claimNextRunnable(), store.claimNextRunnable()]);
    expect(new Set(claimed.map((job) => job?.id))).toEqual(new Set([first.id, second.id]));
    expect(claimed.every((job) => job?.status === 'waiting_attestation')).toBe(true);
    const attempts = await sql<Array<{ job_id: string }>>`
      select job_id from job_attempts where job_id in (${first.id}, ${second.id})
    `;
    expect(new Set(attempts.map((attempt) => attempt.job_id))).toEqual(new Set([first.id, second.id]));
  });

  it('returns aggregate public statistics without borrower identities', async () => {
    const firstWallet = Wallet.createRandom().address;
    const secondWallet = Wallet.createRandom().address;
    const first = await store.createJob(Wallet.createRandom().privateKey, firstWallet);
    await store.createJob(Wallet.createRandom().privateKey, firstWallet);
    const third = await store.createJob(Wallet.createRandom().privateKey, secondWallet);
    await store.transition(first.id, { status: 'executed' });
    await store.transition(third.id, { status: 'refused' });

    expect(await store.getPublicStats()).toEqual({
      totalJobs: 3,
      uniqueWallets: 2,
      executedJobs: 1,
      refusedJobs: 1,
      failedJobs: 0,
    });
  });

  it('normalizes transaction hashes before enforcing uniqueness', async () => {
    const wallet = Wallet.createRandom().address;
    const mixedCaseHash = `0x${'Ab'.repeat(32)}`;
    const first = await store.createJob(mixedCaseHash, wallet);
    const second = await store.createJob(mixedCaseHash.toLowerCase(), wallet);

    expect(first.id).toBe(second.id);
    expect(first.txHash).toBe(mixedCaseHash.toLowerCase());
    const rows = await sql<Array<{ count: number }>>`select count(*)::int as count from jobs`;
    expect(rows[0]?.count).toBe(1);
  });
});
