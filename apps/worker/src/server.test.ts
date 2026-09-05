import { Wallet } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    RAILWAY_GIT_COMMIT_SHA: 'test-sha',
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
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
    const stats = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toMatchObject({
      totalJobs: 0,
      uniqueWallets: 0,
      latestAttestedHeight: null,
      linesOpened: null,
      totalCreditOpenedAtomic: null,
      protocolStatus: 'unavailable',
    });
    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/events' })).statusCode).toBe(400);
  });

  it('keeps liveness healthy when configured chains are not ready', async () => {
    const app = await buildServer(new MemoryJobStore(), config, new InMemoryJobEvents(), async () => ({
      checks: {
        sourceRpc: true,
        destinationRpc: true,
        sourceContracts: true,
        destinationContracts: true,
        contractBindings: false,
        attestcoinChain: false,
        activeAttestation: false,
        proofBuilder: true,
        fundedRelayer: true,
      },
      latestAttestedHeight: null,
      attestationAdvancedAt: null,
      proofBuilderAttestedHeight: null,
    }));
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      status: 'unavailable',
      schemaVersion: 2,
      version: 'test-sha',
      latestAttestedHeight: null,
      checks: { database: true, attestcoinChain: false, activeAttestation: false },
    });
  });

  it('publishes aggregate statistics without wallet identifiers', async () => {
    const store = new MemoryJobStore();
    const wallet = Wallet.createRandom().address;
    await store.createJob(`0x${'55'.repeat(32)}`, wallet);
    await store.createJob(`0x${'66'.repeat(32)}`, wallet);
    const app = await buildServer(store, config, new InMemoryJobEvents(), undefined, async () => ({
      linesOpened: 3,
      borrowersWhoDrew: 2,
      totalCreditOpenedAtomic: '150000000',
      totalBorrowedAtomic: '100000000',
      totalRepaidAtomic: '25000000',
      outstandingDebtAtomic: '75000000',
    }));
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      totalJobs: 2,
      uniqueWallets: 1,
      linesOpened: 3,
      borrowersWhoDrew: 2,
      outstandingDebtAtomic: '75000000',
    });
    expect(response.body).not.toContain(wallet);
  });

  it('caches aggregate chain statistics for one minute', async () => {
    const protocolStats = vi.fn(async () => ({
      linesOpened: 0,
      borrowersWhoDrew: 0,
      totalCreditOpenedAtomic: '0',
      totalBorrowedAtomic: '0',
      totalRepaidAtomic: '0',
      outstandingDebtAtomic: '0',
    }));
    const app = await buildServer(
      new MemoryJobStore(),
      config,
      new InMemoryJobEvents(),
      undefined,
      protocolStats
    );
    apps.push(app);
    await app.inject({ method: 'GET', url: '/api/stats' });
    await app.inject({ method: 'GET', url: '/api/stats' });
    expect(protocolStats).toHaveBeenCalledTimes(1);
  });

  it('keeps the last successful aggregate snapshot explicitly stale on RPC failure', async () => {
    const observer = vi.fn().mockResolvedValueOnce({
      linesOpened: 2,
      borrowersWhoDrew: 1,
      totalCreditOpenedAtomic: '100000000',
      totalBorrowedAtomic: '50000000',
      totalRepaidAtomic: '0',
      outstandingDebtAtomic: '50000000',
      asOfBlock: 123,
    });
    const app = await buildServer(new MemoryJobStore(), config, new InMemoryJobEvents(), undefined, observer);
    apps.push(app);
    const first = (await app.inject({ method: 'GET', url: '/api/stats' })).json();
    expect(first).toMatchObject({ protocolStatus: 'current', linesOpened: 2, asOfBlock: 123 });
    observer.mockRejectedValue(new Error('https://private:credential@rpc.example/token'));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    try {
      const second = (await app.inject({ method: 'GET', url: '/api/stats' })).json();
      expect(second).toMatchObject({
        protocolStatus: 'stale',
        linesOpened: 2,
        asOfBlock: 123,
        protocolObservedAt: first.protocolObservedAt,
      });
      expect(JSON.stringify(second)).not.toContain('credential');
    } finally {
      clock.mockRestore();
    }
  });

  it('does not trust forged forwarding headers and rejects disallowed SSE origins', async () => {
    const app = await buildServer(
      new MemoryJobStore(),
      { ...config, MAX_REQUESTS_PER_MINUTE: 2 },
      new InMemoryJobEvents()
    );
    apps.push(app);
    const wallet = Wallet.createRandom().address;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/events?wallet=${wallet}`,
          headers: { origin: 'https://evil.example' },
        })
      ).statusCode
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/stats', headers: { 'x-forwarded-for': '1.1.1.1' } }))
        .statusCode
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/stats', headers: { 'x-forwarded-for': '2.2.2.2' } }))
        .statusCode
    ).toBe(429);
  });

  it('rejects malformed and expired authorization requests', async () => {
    const store = new MemoryJobStore();
    const app = await buildServer(store, config, new InMemoryJobEvents());
    apps.push(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/challenges',
          payload: { wallet: 'not-an-address', txHash: '0x12' },
        })
      ).statusCode
    ).toBe(400);

    const wallet = Wallet.createRandom();
    const txHash = `0x${'77'.repeat(32)}`;
    const challenge = await store.createChallenge(
      wallet.address,
      txHash,
      sourceVault,
      config.PUBLIC_API_ORIGIN,
      new Date('2000-01-01T00:00:00.000Z')
    );
    const signature = await wallet.signTypedData(
      challenge.typedData.domain,
      challenge.typedData.types,
      challenge.typedData.message
    );
    const expired = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { wallet: wallet.address, txHash, signature, nonce: challenge.nonce },
    });
    expect(expired.statusCode).toBe(401);
  });

  it('allows configured CORS and rate-limits abusive clients', async () => {
    const app = await buildServer(
      new MemoryJobStore(),
      { ...config, MAX_REQUESTS_PER_MINUTE: 1 },
      new InMemoryJobEvents()
    );
    apps.push(app);
    const first = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(first.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/stats' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/stats' })).statusCode).toBe(429);
  });

  it('enforces concurrent quota requests at the authorization boundary', async () => {
    const store = new MemoryJobStore();
    const app = await buildServer(store, config, new InMemoryJobEvents());
    apps.push(app);
    const wallet = Wallet.createRandom();
    const signedRequest = async (byte: string) => {
      const txHash = `0x${byte.repeat(64)}`;
      const challenge = (
        await app.inject({
          method: 'POST',
          url: '/api/challenges',
          payload: { wallet: wallet.address, txHash },
        })
      ).json();
      const signature = await wallet.signTypedData(
        challenge.typedData.domain,
        challenge.typedData.types,
        challenge.typedData.message
      );
      return { wallet: wallet.address, txHash, signature, nonce: challenge.nonce };
    };
    const [first, second] = await Promise.all([signedRequest('8'), signedRequest('9')]);
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/jobs', payload: first }),
      app.inject({ method: 'POST', url: '/api/jobs', payload: second }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([202, 429]);
  });

  it('streams actual SSE job progression only to the requested wallet', async () => {
    const events = new InMemoryJobEvents();
    const app = await buildServer(new MemoryJobStore(), config, events);
    apps.push(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    const wallet = Wallet.createRandom().address;
    const other = Wallet.createRandom().address;
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/events?wallet=${wallet}`, {
      headers: { origin: 'http://localhost:5173' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain(': connected');
    events.publish({ id: 'private-other', borrower: other } as never);
    events.publish({ id: 'matching-job', borrower: wallet, status: 'proving' } as never);
    const event = decoder.decode((await reader.read()).value);
    expect(event).toContain('matching-job');
    expect(event).not.toContain('private-other');
    controller.abort();
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
