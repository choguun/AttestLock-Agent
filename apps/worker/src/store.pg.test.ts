import { Wallet } from 'ethers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresJobStore } from './store.js';

const databaseUrl = process.env.DATABASE_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('PostgresJobStore', () => {
  const store = new PostgresJobStore(databaseUrl!);

  beforeAll(async () => {
    await store.init();
  });

  afterAll(async () => store.close());

  it('persists jobs, evidence, and restart recovery', async () => {
    const wallet = Wallet.createRandom().address;
    const txHash = Wallet.createRandom().privateKey;
    const job = await store.createJob(txHash, wallet);
    await store.transition(job.id, {
      status: 'preflight',
      evidence: { lockId: `0x${'78'.repeat(32)}` },
    });

    expect(await store.recoverInterrupted()).toBe(1);
    const recovered = await store.getJob(job.id);
    expect(recovered?.status).toBe('queued');
    expect(recovered?.evidence).toEqual({ lockId: `0x${'78'.repeat(32)}` });
  });

  it('atomically consumes a short-lived challenge', async () => {
    const challenge = await store.createChallenge(Wallet.createRandom().address);
    expect(await store.consumeChallenge(challenge.nonce)).toBe(true);
    expect(await store.consumeChallenge(challenge.nonce)).toBe(false);
  });
});
