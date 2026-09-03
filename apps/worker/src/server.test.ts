import { Wallet } from 'ethers';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, InMemoryJobEvents } from './server.js';
import { MemoryJobStore } from './store.js';

describe('worker API', () => {
  const sourceVault = '0x0000000000000000000000000000000000000002';
  const config = {
    CORS_ORIGINS: 'http://localhost:5173',
    MAX_JOBS_PER_WALLET_PER_DAY: 1,
    MAX_REQUESTS_PER_MINUTE: 100,
    SOURCE_VAULT_ADDRESS: sourceVault,
    PUBLIC_API_ORIGIN: 'http://localhost:3001',
  };
  const apps: Awaited<ReturnType<typeof buildServer>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('requires a matching one-time wallet signature', async () => {
    const store = new MemoryJobStore();
    const app = await buildServer(store, config, new InMemoryJobEvents());
    apps.push(app);
    const wallet = Wallet.createRandom();
    const txHash = `0x${'ab'.repeat(32)}`;
    const challengeResponse = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      payload: { wallet: wallet.address, txHash },
    });
    const challenge = challengeResponse.json();
    const signature = await wallet.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );

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

  it('binds authorization to one transaction and enforces the wallet quota atomically', async () => {
    const store = new MemoryJobStore();
    const app = await buildServer(store, config, new InMemoryJobEvents());
    apps.push(app);
    const wallet = Wallet.createRandom();
    const firstHash = `0x${'11'.repeat(32)}`;
    const challenge = (
      await app.inject({
        method: 'POST',
        url: '/api/challenges',
        payload: { wallet: wallet.address, txHash: firstHash },
      })
    ).json();
    const signature = await wallet.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );

    const swapped = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { txHash: `0x${'22'.repeat(32)}`, wallet: wallet.address, signature, nonce: challenge.nonce },
    });
    expect(swapped.statusCode).toBe(401);

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { txHash: firstHash, wallet: wallet.address, signature, nonce: challenge.nonce },
    });
    expect(accepted.statusCode).toBe(202);

    const secondHash = `0x${'33'.repeat(32)}`;
    const second = (
      await app.inject({
        method: 'POST',
        url: '/api/challenges',
        payload: { wallet: wallet.address, txHash: secondHash },
      })
    ).json();
    const secondSignature = await wallet.signTypedData(
      second.typedData.domain,
      second.typedData.types,
      second.typedData.message
    );
    const limited = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        txHash: secondHash,
        wallet: wallet.address,
        signature: secondSignature,
        nonce: second.nonce,
      },
    });
    expect(limited.statusCode).toBe(429);
  });

  it('requires wallet filters and exposes liveness and readiness', async () => {
    const app = await buildServer(new MemoryJobStore(), config, new InMemoryJobEvents());
    apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/events' })).statusCode).toBe(400);
  });

  it('keeps liveness healthy when configured chains are not ready', async () => {
    const app = await buildServer(new MemoryJobStore(), config, new InMemoryJobEvents(), async () => false);
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
  });

  it('publishes job events only to the matching wallet', () => {
    const events = new InMemoryJobEvents();
    const firstWallet = Wallet.createRandom().address;
    const secondWallet = Wallet.createRandom().address;
    const received: string[] = [];
    const unsubscribe = events.subscribe(firstWallet, (job) => received.push(job.id));

    events.publish({ id: 'matching', borrower: firstWallet } as never);
    events.publish({ id: 'other', borrower: secondWallet } as never);
    unsubscribe();
    events.publish({ id: 'after-unsubscribe', borrower: firstWallet } as never);

    expect(received).toEqual(['matching']);
  });
});
