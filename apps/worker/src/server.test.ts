import { Wallet } from 'ethers';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, InMemoryJobEvents } from './server.js';
import { MemoryJobStore } from './store.js';

describe('worker API', () => {
  const apps: Awaited<ReturnType<typeof buildServer>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('requires a matching one-time wallet signature', async () => {
    const store = new MemoryJobStore();
    const app = await buildServer(
      store,
      { CORS_ORIGINS: 'http://localhost:5173', MAX_JOBS_PER_WALLET_PER_DAY: 5 },
      new InMemoryJobEvents()
    );
    apps.push(app);
    const wallet = Wallet.createRandom();
    const challengeResponse = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      payload: { wallet: wallet.address },
    });
    const challenge = challengeResponse.json();
    const signature = await wallet.signMessage(challenge.message);
    const txHash = `0x${'ab'.repeat(32)}`;

    const created = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { txHash, wallet: wallet.address, signature, nonce: challenge.nonce },
    });
    expect(created.statusCode).toBe(202);
    expect(created.json().status).toBe('queued');

    const replay = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { txHash, wallet: wallet.address, signature, nonce: challenge.nonce },
    });
    expect(replay.statusCode).toBe(401);
  });
});
