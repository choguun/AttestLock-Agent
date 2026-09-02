import { type CreateJobRequest, type Job } from '@attestlock/shared';
import cors from '@fastify/cors';
import { getAddress, isAddress, isHexString, verifyMessage } from 'ethers';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkerConfig } from './env.js';
import { TransactionOwnerMismatchError, type JobStore } from './store.js';

const challengeBody = z.object({ wallet: z.string().refine(isAddress) });
const createJobBody = z.object({
  txHash: z.string().refine((value) => isHexString(value, 32), 'Expected a 32-byte transaction hash'),
  wallet: z.string().refine(isAddress),
  signature: z.string().refine((value) => isHexString(value), 'Expected a hex signature'),
  nonce: z.string().uuid(),
});
const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({ wallet: z.string().refine(isAddress).optional() });

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
  config: Pick<WorkerConfig, 'CORS_ORIGINS' | 'MAX_JOBS_PER_WALLET_PER_DAY'>,
  events: JobEvents
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST'],
  });

  app.get('/health', async () => ({ status: 'ok', service: 'attestlock-worker' }));

  app.post('/api/challenges', async (request, reply) => {
    const parsed = challengeBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return store.createChallenge(getAddress(parsed.data.wallet));
  });

  app.post<{ Body: CreateJobRequest }>('/api/jobs', async (request, reply) => {
    const parsed = createJobBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const wallet = getAddress(parsed.data.wallet);
    const challenge = await store.getChallenge(parsed.data.nonce);
    if (!challenge || challenge.used || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return reply.code(401).send({ error: 'Challenge is missing, expired, or already used.' });
    }
    if (
      challenge.wallet !== wallet ||
      getAddress(verifyMessage(challenge.message, parsed.data.signature)) !== wallet
    ) {
      return reply.code(401).send({ error: 'Wallet signature does not match the challenge.' });
    }
    const recent = await store.countRecentJobs(wallet, new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (recent >= config.MAX_JOBS_PER_WALLET_PER_DAY) {
      return reply.code(429).send({ error: 'Daily proof-job quota reached.' });
    }
    if (!(await store.consumeChallenge(parsed.data.nonce))) {
      return reply.code(409).send({ error: 'Challenge was already consumed.' });
    }
    let job: Job;
    try {
      job = await store.createJob(parsed.data.txHash.toLowerCase(), wallet);
    } catch (error) {
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
    return store.listJobs(parsed.data.wallet ? getAddress(parsed.data.wallet) : undefined);
  });

  app.get('/api/events', async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const wallet = parsed.data.wallet ? getAddress(parsed.data.wallet) : undefined;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': config.CORS_ORIGINS.split(',')[0] ?? '*',
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
