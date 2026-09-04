import { type CreateJobRequest, type Job } from '@attestlock/shared';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getAddress, isAddress, isHexString, verifyTypedData } from 'ethers';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkerConfig } from './env.js';
import {
  ChallengeAuthorizationError,
  JobQuotaExceededError,
  TransactionOwnerMismatchError,
  type JobStore,
} from './store.js';

const txHash = z.string().refine((value) => isHexString(value, 32), 'Expected a 32-byte transaction hash');
const challengeBody = z.object({ wallet: z.string().refine(isAddress), txHash });
const createJobBody = z.object({
  txHash,
  wallet: z.string().refine(isAddress),
  signature: z.string().refine((value) => isHexString(value), 'Expected a hex signature'),
  nonce: z.string().uuid(),
});
const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({ wallet: z.string().refine(isAddress) });

export interface JobEvents {
  publish(job: Job): void;
  subscribe(wallet: string | undefined, listener: (job: Job) => void): () => void;
}

export class InMemoryJobEvents implements JobEvents {
  private readonly listeners = new Set<{ wallet?: string; listener: (job: Job) => void }>();

  publish(job: Job): void {
    for (const entry of this.listeners) {
      if (!entry.wallet || entry.wallet === job.borrower) entry.listener(job);
    }
  }

  subscribe(wallet: string | undefined, listener: (job: Job) => void): () => void {
    const entry = { wallet, listener };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }
}

export async function buildServer(
  store: JobStore,
  config: Pick<
    WorkerConfig,
    | 'CORS_ORIGINS'
    | 'MAX_JOBS_PER_WALLET_PER_DAY'
    | 'MAX_REQUESTS_PER_MINUTE'
    | 'SOURCE_VAULT_ADDRESS'
    | 'PUBLIC_API_ORIGIN'
  >,
  events: JobEvents,
  chainReadiness: () => Promise<boolean> = async () => true
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, {
    max: config.MAX_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
  });

  app.get('/health', async () => ({ status: 'ok', service: 'attestlock-worker' }));
  app.get('/ready', async (_request, reply) => {
    const ready = await Promise.all([store.ping(), chainReadiness()])
      .then((checks) => checks.every(Boolean))
      .catch(() => false);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });

  app.post('/api/challenges', async (request, reply) => {
    const parsed = challengeBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return store.createChallenge(
      getAddress(parsed.data.wallet),
      parsed.data.txHash.toLowerCase(),
      config.SOURCE_VAULT_ADDRESS,
      config.PUBLIC_API_ORIGIN
    );
  });

  app.post<{ Body: CreateJobRequest }>('/api/jobs', async (request, reply) => {
    const parsed = createJobBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const wallet = getAddress(parsed.data.wallet);
    const challenge = await store.getChallenge(parsed.data.nonce);
    if (!challenge || challenge.used || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return reply.code(401).send({ error: 'Challenge is missing, expired, or already used.' });
    }
    let recovered: string | null = null;
    try {
      recovered = getAddress(
        verifyTypedData(
          challenge.typedData.domain,
          challenge.typedData.types,
          challenge.typedData.message,
          parsed.data.signature
        )
      );
    } catch {
      // Malformed and non-matching signatures are authorization failures, not server errors.
    }
    if (
      challenge.wallet !== wallet ||
      challenge.txHash !== parsed.data.txHash.toLowerCase() ||
      recovered !== wallet
    ) {
      return reply.code(401).send({ error: 'Wallet signature does not match the challenge.' });
    }
    let job: Job;
    try {
      job = await store.authorizeJob(
        parsed.data.nonce,
        parsed.data.txHash.toLowerCase(),
        wallet,
        config.MAX_JOBS_PER_WALLET_PER_DAY,
        new Date(Date.now() - 24 * 60 * 60 * 1000)
      );
    } catch (error) {
      if (error instanceof ChallengeAuthorizationError) {
        return reply.code(409).send({ error: error.message });
      }
      if (error instanceof JobQuotaExceededError) {
        return reply.code(429).send({ error: error.message });
      }
      if (error instanceof TransactionOwnerMismatchError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
    events.publish(job);
    return reply.code(202).send(job);
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const job = await store.getJob(parsed.data.id);
    return job ?? reply.code(404).send({ error: 'Job not found.' });
  });

  app.get('/api/jobs', async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return store.listJobs(getAddress(parsed.data.wallet));
  });

  app.get('/api/events', async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const wallet = getAddress(parsed.data.wallet);
    const origins = config.CORS_ORIGINS.split(',').map((origin) => origin.trim());
    const requestOrigin = request.headers.origin;
    const responseOrigin = requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0];
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': responseOrigin ?? 'null',
    });
    reply.raw.write(': connected\n\n');
    const unsubscribe = events.subscribe(wallet, (job) => {
      reply.raw.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 20_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return app;
}
