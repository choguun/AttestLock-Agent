import {
  type CreateJobRequest,
  type Job,
  type ProtocolStats,
  type PublicStats,
  type ReadinessChecks,
  type ReadinessReport,
} from '@attestlock/shared';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getAddress, isAddress, isHexString, verifyTypedData } from 'ethers';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkerConfig } from './env.js';
import { bounded } from './timeouts.js';
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

export interface ChainReadiness {
  checks: Omit<ReadinessChecks, 'database'>;
  latestAttestedHeight: number | null;
  attestationAdvancedAt: string | null;
  proofBuilderAttestedHeight: number | null;
}

const healthyChainReadiness: ChainReadiness = {
  checks: {
    sourceRpc: true,
    destinationRpc: true,
    sourceContracts: true,
    destinationContracts: true,
    contractBindings: true,
    attestcoinChain: true,
    activeAttestation: true,
    proofBuilder: true,
    fundedRelayer: true,
  },
  latestAttestedHeight: 1,
  attestationAdvancedAt: new Date(0).toISOString(),
  proofBuilderAttestedHeight: 1,
};

export async function buildServer(
  store: JobStore,
  config: Pick<
    WorkerConfig,
    | 'CORS_ORIGINS'
    | 'MAX_JOBS_PER_WALLET_PER_DAY'
    | 'MAX_REQUESTS_PER_MINUTE'
    | 'SOURCE_VAULT_ADDRESS'
    | 'PUBLIC_API_ORIGIN'
    | 'RAILWAY_GIT_COMMIT_SHA'
  > &
    Partial<Pick<WorkerConfig, 'TRUSTED_PROXY_CIDRS'>>,
  events: JobEvents,
  chainReadiness: () => Promise<ChainReadiness> = async () => {
    throw new Error('Chain observer not configured');
  },
  protocolStats: () => Promise<ProtocolStats & { asOfBlock?: number }> = async () => {
    throw new Error('Protocol observer not configured');
  }
): Promise<FastifyInstance> {
  const trustedProxyCidrs = config.TRUSTED_PROXY_CIDRS?.split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean);
  const app = Fastify({ logger: true, trustProxy: trustedProxyCidrs?.length ? trustedProxyCidrs : false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, {
    max: config.MAX_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    reply.code(status === 429 ? 429 : status === 400 ? 400 : 503).send({
      error:
        status === 429
          ? 'Request quota exceeded.'
          : status === 400
            ? 'Malformed request.'
            : 'Service temporarily unavailable.',
    });
  });
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    service: 'attestlock-worker',
  }));
  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const database = await bounded(store.ping()).catch(() => false);
    const chain = await bounded(chainReadiness()).catch(() => ({
      checks: Object.fromEntries(
        Object.keys(healthyChainReadiness.checks).map((key) => [key, false])
      ) as ChainReadiness['checks'],
      latestAttestedHeight: null,
      attestationAdvancedAt: null,
      proofBuilderAttestedHeight: null,
    }));
    const checks: ReadinessChecks = { database, ...chain.checks };
    const ready = Object.values(checks).every(Boolean);
    const report: ReadinessReport = {
      schemaVersion: 2,
      status: ready ? 'ready' : 'unavailable',
      version: config.RAILWAY_GIT_COMMIT_SHA,
      checks,
      latestAttestedHeight: chain.latestAttestedHeight,
      attestationAdvancedAt: chain.attestationAdvancedAt,
      proofBuilderAttestedHeight: chain.proofBuilderAttestedHeight,
    };
    return reply.code(ready ? 200 : 503).send(report);
  });

  let statsCache: { expiresAt: number; value: PublicStats } | null = null;
  let statsPending: Promise<PublicStats> | null = null;
  let lastProtocol: { value: ProtocolStats & { asOfBlock?: number }; at: string } | null = null;
  app.get('/api/stats', async () => {
    if (statsCache && statsCache.expiresAt > Date.now()) return statsCache.value;
    if (statsPending) return statsPending;
    statsPending = (async () => {
      const [counts, chain, protocol] = await Promise.all([
        bounded(store.getPublicStats()),
        bounded(chainReadiness()).catch(() => null),
        bounded(protocolStats()).catch(() => null),
      ]);
      if (protocol) lastProtocol = { value: protocol, at: new Date().toISOString() };
      const value: PublicStats = {
        generatedAt: new Date().toISOString(),
        ...counts,
        linesOpened: null,
        borrowersWhoDrew: null,
        totalCreditOpenedAtomic: null,
        totalBorrowedAtomic: null,
        totalRepaidAtomic: null,
        outstandingDebtAtomic: null,
        ...lastProtocol?.value,
        protocolStatus: protocol ? 'current' : lastProtocol ? 'stale' : 'unavailable',
        protocolObservedAt: lastProtocol?.at ?? null,
        asOfBlock: lastProtocol?.value.asOfBlock ?? null,
        latestAttestedHeight: chain?.latestAttestedHeight ?? null,
      };
      statsCache = { expiresAt: Date.now() + 60_000, value };
      return value;
    })().finally(() => {
      statsPending = null;
    });
    return statsPending;
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

  const connections = new Map<string, number>();
  const closeStreams = new Set<() => void>();
  app.addHook('preClose', async () => {
    for (const close of closeStreams) close();
  });
  app.get('/api/events', async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const wallet = getAddress(parsed.data.wallet);
    const origins = config.CORS_ORIGINS.split(',').map((origin) => origin.trim());
    const requestOrigin = request.headers.origin;
    if (requestOrigin && !origins.includes(requestOrigin))
      return reply.code(403).send({ error: 'Origin not allowed.' });
    const connectionKey = request.ip;
    if ((connections.get(connectionKey) ?? 0) >= 5 || closeStreams.size >= 100)
      return reply.code(429).send({ error: 'Too many event streams.' });
    connections.set(connectionKey, (connections.get(connectionKey) ?? 0) + 1);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...(requestOrigin ? { 'Access-Control-Allow-Origin': requestOrigin } : {}),
      Vary: 'Origin',
    });
    reply.raw.write(': connected\n\n');
    const unsubscribe = events.subscribe(wallet, (job) => {
      if (!reply.raw.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`)) close();
    });
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 20_000);
    const close = () => {
      if (!closeStreams.delete(close)) return;
      clearInterval(heartbeat);
      unsubscribe();
      const remaining = (connections.get(connectionKey) ?? 1) - 1;
      if (remaining) connections.set(connectionKey, remaining);
      else connections.delete(connectionKey);
      reply.raw.end();
    };
    closeStreams.add(close);
    reply.raw.on('close', close);
  });

  return app;
}
