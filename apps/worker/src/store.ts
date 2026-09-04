import { randomUUID } from 'node:crypto';
import type { Challenge, Job, JobEvidence, JobStatus, PublicStats } from '@attestlock/shared';
import { buildQueueAuthorization, CHALLENGE_TTL_SECONDS, explainStatus } from '@attestlock/shared';
import postgres, { type Sql } from 'postgres';
import { migrations } from './migrations.js';

export interface TransitionInput {
  status: JobStatus;
  explanation?: string;
  evidence?: JobEvidence;
  errorCode?: string | null;
  nextAttemptAt?: Date | null;
  incrementAttempt?: boolean;
}

export interface JobStore {
  init(): Promise<void>;
  ping(): Promise<boolean>;
  recoverInterrupted(): Promise<number>;
  createChallenge(
    wallet: string,
    txHash: string,
    sourceVault: string,
    apiOrigin: string,
    now?: Date
  ): Promise<Challenge>;
  getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null>;
  authorizeJob(nonce: string, txHash: string, borrower: string, maxJobs: number, since: Date): Promise<Job>;
  cleanupExpiredChallenges(now?: Date): Promise<number>;
  createJob(txHash: string, borrower: string): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  listJobs(borrower?: string): Promise<Job[]>;
  getPublicStats(): Promise<Omit<PublicStats, 'generatedAt' | 'latestAttestedHeight'>>;
  claimNextRunnable(now?: Date): Promise<Job | null>;
  transition(id: string, input: TransitionInput): Promise<Job>;
  close(): Promise<void>;
}

export class TransactionOwnerMismatchError extends Error {
  constructor() {
    super('This source transaction is already assigned to another borrower.');
  }
}

export class ChallengeAuthorizationError extends Error {}
export class JobQuotaExceededError extends Error {}

interface JobRow {
  id: string;
  tx_hash: string;
  borrower: string;
  status: JobStatus;
  explanation: string;
  attempt_count: number;
  next_attempt_at: Date | null;
  evidence: JobEvidence;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ChallengeRow {
  nonce: string;
  wallet: string;
  tx_hash: string | null;
  typed_data: Challenge['typedData'] | null;
  expires_at: Date;
  used: boolean;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    txHash: row.tx_hash,
    borrower: row.borrower,
    status: row.status,
    explanation: row.explanation,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
    evidence: row.evidence ?? {},
    errorCode: row.error_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresJobStore implements JobStore {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 5 });
  }

  async init(): Promise<void> {
    await this.sql`create table if not exists schema_migrations (
      version integer primary key,
      applied_at timestamptz not null default now()
    )`;
    for (const migration of migrations) {
      await this.sql.begin(async (sql) => {
        const applied = await sql<Array<{ version: number }>>`
          select version from schema_migrations where version = ${migration.version}
        `;
        if (applied.length > 0) return;
        for (const statement of migration.statements) await sql.unsafe(statement);
        await sql`insert into schema_migrations (version) values (${migration.version})`;
      });
    }
  }

  async ping(): Promise<boolean> {
    const rows = await this.sql<Array<{ ok: number }>>`select 1::int as ok`;
    return rows[0]?.ok === 1;
  }

  async recoverInterrupted(): Promise<number> {
    return this.sql.begin(async (sql) => {
      await sql`
        update job_attempts set
          status = 'interrupted',
          outcome = 'interrupted',
          finished_at = now()
        where finished_at is null and job_id in (
          select id from jobs where status in ('waiting_attestation', 'proving', 'preflight', 'submitting')
        )
      `;
      const rows = await sql<Array<{ id: string }>>`
        update jobs set
          status = 'queued',
          explanation = ${explainStatus('queued')},
          attempt_count = attempt_count + 1,
          next_attempt_at = now(),
          updated_at = now()
        where status in ('waiting_attestation', 'proving', 'preflight', 'submitting')
        returning id
      `;
      return rows.length;
    });
  }

  async createChallenge(
    wallet: string,
    txHash: string,
    sourceVault: string,
    apiOrigin: string,
    now = new Date()
  ): Promise<Challenge> {
    const nonce = randomUUID();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000);
    const typedData = buildQueueAuthorization(
      wallet,
      txHash,
      nonce,
      expiresAt.toISOString(),
      sourceVault,
      apiOrigin
    );
    const encoded = this.sql.json(JSON.parse(JSON.stringify(typedData)));
    await this.sql`
      insert into challenges (nonce, wallet, message, tx_hash, typed_data, expires_at)
      values (${nonce}, ${wallet}, ${JSON.stringify(typedData)}, ${txHash}, ${encoded}, ${expiresAt})
    `;
    return { nonce, wallet, txHash, typedData, expiresAt: expiresAt.toISOString() };
  }

  async getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null> {
    const rows = await this.sql<Array<ChallengeRow>>`
      select nonce, wallet, tx_hash, typed_data, expires_at, used from challenges where nonce = ${nonce}
    `;
    const row = rows[0];
    return row?.tx_hash && row.typed_data
      ? {
          nonce: row.nonce,
          wallet: row.wallet,
          txHash: row.tx_hash,
          typedData: row.typed_data,
          expiresAt: row.expires_at.toISOString(),
          used: row.used,
        }
      : null;
  }

  async authorizeJob(
    nonce: string,
    txHash: string,
    borrower: string,
    maxJobs: number,
    since: Date
  ): Promise<Job> {
    return this.sql.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtext(${borrower}))`;
      const rows = await sql<Array<ChallengeRow>>`
        select nonce, wallet, tx_hash, typed_data, expires_at, used
        from challenges where nonce = ${nonce} for update
      `;
      const challenge = rows[0];
      if (
        !challenge ||
        challenge.used ||
        challenge.expires_at.getTime() <= Date.now() ||
        challenge.wallet !== borrower ||
        challenge.tx_hash?.toLowerCase() !== txHash.toLowerCase()
      ) {
        throw new ChallengeAuthorizationError('Challenge is missing, expired, consumed, or mismatched.');
      }
      const existing = await sql<Array<JobRow>>`select * from jobs where tx_hash = ${txHash}`;
      if (existing[0]) {
        const job = toJob(existing[0]);
        if (job.borrower !== borrower) throw new TransactionOwnerMismatchError();
        await sql`update challenges set used = true where nonce = ${nonce}`;
        return job;
      }
      const counts = await sql<Array<{ count: number }>>`
        select count(*)::int as count from jobs where borrower = ${borrower} and created_at >= ${since}
      `;
      if ((counts[0]?.count ?? 0) >= maxJobs) {
        throw new JobQuotaExceededError('Daily proof-job quota reached.');
      }
      await sql`update challenges set used = true where nonce = ${nonce}`;
      const id = randomUUID();
      const jobs = await sql<Array<JobRow>>`
        insert into jobs (id, tx_hash, borrower, status, explanation)
        values (${id}, ${txHash}, ${borrower}, 'queued', ${explainStatus('queued')})
        on conflict (tx_hash) do update set tx_hash = excluded.tx_hash
        returning *
      `;
      const job = toJob(jobs[0]!);
      if (job.borrower !== borrower) throw new TransactionOwnerMismatchError();
      return job;
    });
  }

  async cleanupExpiredChallenges(now = new Date()): Promise<number> {
    const rows = await this.sql<Array<{ nonce: string }>>`
      delete from challenges where expires_at < ${now} returning nonce
    `;
    return rows.length;
  }

  async createJob(txHash: string, borrower: string): Promise<Job> {
    const id = randomUUID();
    const rows = await this.sql<Array<JobRow>>`
      insert into jobs (id, tx_hash, borrower, status, explanation)
      values (${id}, ${txHash}, ${borrower}, 'queued', ${explainStatus('queued')})
      on conflict (tx_hash) do update set tx_hash = excluded.tx_hash
      returning *
    `;
    const job = toJob(rows[0]!);
    if (job.borrower !== borrower) throw new TransactionOwnerMismatchError();
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    const rows = await this.sql<Array<JobRow>>`select * from jobs where id = ${id}`;
    return rows[0] ? toJob(rows[0]) : null;
  }

  async listJobs(borrower?: string): Promise<Job[]> {
    const rows = borrower
      ? await this.sql<
          Array<JobRow>
        >`select * from jobs where borrower = ${borrower} order by created_at desc limit 100`
      : await this.sql<Array<JobRow>>`select * from jobs order by created_at desc limit 100`;
    return rows.map(toJob);
  }

  async getPublicStats(): Promise<Omit<PublicStats, 'generatedAt' | 'latestAttestedHeight'>> {
    const rows = await this.sql<
      Array<{
        total_jobs: number;
        unique_wallets: number;
        executed_jobs: number;
        refused_jobs: number;
        failed_jobs: number;
      }>
    >`
      select
        count(*)::int as total_jobs,
        count(distinct borrower)::int as unique_wallets,
        count(*) filter (where status = 'executed')::int as executed_jobs,
        count(*) filter (where status = 'refused')::int as refused_jobs,
        count(*) filter (where status = 'failed')::int as failed_jobs
      from jobs
    `;
    const row = rows[0]!;
    return {
      totalJobs: row.total_jobs,
      uniqueWallets: row.unique_wallets,
      executedJobs: row.executed_jobs,
      refusedJobs: row.refused_jobs,
      failedJobs: row.failed_jobs,
    };
  }

  async claimNextRunnable(now = new Date()): Promise<Job | null> {
    return this.sql.begin(async (sql) => {
      const rows = await sql<Array<JobRow>>`
        with candidate as (
          select id from jobs
          where status = 'queued' and (next_attempt_at is null or next_attempt_at <= ${now})
          order by created_at asc for update skip locked limit 1
        )
        update jobs set
          status = 'waiting_attestation',
          explanation = ${explainStatus('waiting_attestation')},
          next_attempt_at = null,
          updated_at = now()
        where id = (select id from candidate)
        returning *
      `;
      const row = rows[0];
      if (!row) return null;
      await sql`
        insert into job_attempts (job_id, attempt_number, status)
        values (${row.id}, ${row.attempt_count + 1}, 'waiting_attestation')
        on conflict (job_id, attempt_number) do nothing
      `;
      return toJob(row);
    });
  }

  async transition(id: string, input: TransitionInput): Promise<Job> {
    const evidenceValues = Object.fromEntries(
      Object.entries(input.evidence ?? {}).filter((entry) => entry[1] !== undefined)
    ) as Record<string, string | number>;
    const evidence = this.sql.json(evidenceValues);
    return this.sql.begin(async (sql) => {
      const rows = await sql<Array<JobRow>>`
        update jobs set
          status = ${input.status},
          explanation = ${input.explanation ?? explainStatus(input.status)},
          evidence = evidence || ${evidence},
          error_code = ${input.errorCode === undefined ? null : input.errorCode},
          next_attempt_at = ${input.nextAttemptAt ?? null},
          attempt_count = attempt_count + ${input.incrementAttempt ? 1 : 0},
          updated_at = now()
        where id = ${id}
        returning *
      `;
      if (!rows[0]) throw new Error(`Unknown job ${id}`);

      const outcome =
        input.status === 'queued'
          ? 'retry'
          : ['executed', 'refused', 'failed'].includes(input.status)
            ? input.status
            : null;
      if (outcome) {
        await sql`
          update job_attempts set
            status = ${input.status},
            outcome = ${outcome},
            error_code = ${input.errorCode ?? null},
            evidence = evidence || ${evidence},
            finished_at = now()
          where id = (
            select id from job_attempts where job_id = ${id} and finished_at is null
            order by attempt_number desc limit 1
          )
        `;
      } else {
        await sql`
          update job_attempts set
            status = ${input.status},
            error_code = ${input.errorCode ?? null},
            evidence = evidence || ${evidence}
          where id = (
            select id from job_attempts where job_id = ${id} and finished_at is null
            order by attempt_number desc limit 1
          )
        `;
      }
      return toJob(rows[0]);
    });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, Job>();
  readonly challenges = new Map<string, Challenge & { used: boolean }>();

  async init(): Promise<void> {}
  async ping(): Promise<boolean> {
    return true;
  }

  async recoverInterrupted(): Promise<number> {
    let recovered = 0;
    for (const job of this.jobs.values()) {
      if (!['waiting_attestation', 'proving', 'preflight', 'submitting'].includes(job.status)) continue;
      this.jobs.set(job.id, {
        ...job,
        status: 'queued',
        explanation: explainStatus('queued'),
        nextAttemptAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      recovered += 1;
    }
    return recovered;
  }

  async createChallenge(
    wallet: string,
    txHash: string,
    sourceVault: string,
    apiOrigin: string,
    now = new Date()
  ): Promise<Challenge> {
    const nonce = randomUUID();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const challenge = {
      nonce,
      wallet,
      txHash,
      typedData: buildQueueAuthorization(wallet, txHash, nonce, expiresAt, sourceVault, apiOrigin),
      expiresAt,
    };
    this.challenges.set(nonce, { ...challenge, used: false });
    return challenge;
  }

  async getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null> {
    return this.challenges.get(nonce) ?? null;
  }

  async authorizeJob(
    nonce: string,
    txHash: string,
    borrower: string,
    maxJobs: number,
    since: Date
  ): Promise<Job> {
    const challenge = this.challenges.get(nonce);
    if (
      !challenge ||
      challenge.used ||
      new Date(challenge.expiresAt).getTime() <= Date.now() ||
      challenge.wallet !== borrower ||
      challenge.txHash.toLowerCase() !== txHash.toLowerCase()
    ) {
      throw new ChallengeAuthorizationError('Challenge is missing, expired, consumed, or mismatched.');
    }
    const existing = [...this.jobs.values()].find((job) => job.txHash === txHash);
    if (existing) {
      if (existing.borrower !== borrower) throw new TransactionOwnerMismatchError();
      challenge.used = true;
      return existing;
    }
    if ((await this.countRecentJobs(borrower, since)) >= maxJobs) {
      throw new JobQuotaExceededError('Daily proof-job quota reached.');
    }
    challenge.used = true;
    return this.createJob(txHash, borrower);
  }

  async countRecentJobs(wallet: string, since: Date): Promise<number> {
    return [...this.jobs.values()].filter(
      (job) => job.borrower === wallet && new Date(job.createdAt) >= since
    ).length;
  }

  async cleanupExpiredChallenges(now = new Date()): Promise<number> {
    let removed = 0;
    for (const [nonce, challenge] of this.challenges) {
      if (new Date(challenge.expiresAt) >= now) continue;
      this.challenges.delete(nonce);
      removed += 1;
    }
    return removed;
  }

  async createJob(txHash: string, borrower: string): Promise<Job> {
    const existing = [...this.jobs.values()].find((job) => job.txHash === txHash);
    if (existing) {
      if (existing.borrower !== borrower) throw new TransactionOwnerMismatchError();
      return existing;
    }
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      txHash,
      borrower,
      status: 'queued',
      explanation: explainStatus('queued'),
      attemptCount: 0,
      nextAttemptAt: null,
      evidence: {},
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async listJobs(borrower?: string): Promise<Job[]> {
    return [...this.jobs.values()]
      .filter((job) => !borrower || job.borrower === borrower)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPublicStats(): Promise<Omit<PublicStats, 'generatedAt' | 'latestAttestedHeight'>> {
    const jobs = [...this.jobs.values()];
    return {
      totalJobs: jobs.length,
      uniqueWallets: new Set(jobs.map((job) => job.borrower)).size,
      executedJobs: jobs.filter((job) => job.status === 'executed').length,
      refusedJobs: jobs.filter((job) => job.status === 'refused').length,
      failedJobs: jobs.filter((job) => job.status === 'failed').length,
    };
  }

  async claimNextRunnable(now = new Date()): Promise<Job | null> {
    const job =
      [...this.jobs.values()].find(
        (job) =>
          job.status === 'queued' &&
          (!job.nextAttemptAt || new Date(job.nextAttemptAt).getTime() <= now.getTime())
      ) ?? null;
    if (!job) return null;
    const claimed: Job = {
      ...job,
      status: 'waiting_attestation',
      explanation: explainStatus('waiting_attestation'),
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, claimed);
    return claimed;
  }

  async transition(id: string, input: TransitionInput): Promise<Job> {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Unknown job ${id}`);
    const next: Job = {
      ...current,
      status: input.status,
      explanation: input.explanation ?? explainStatus(input.status),
      evidence: { ...current.evidence, ...(input.evidence ?? {}) },
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      nextAttemptAt: input.nextAttemptAt?.toISOString() ?? null,
      attemptCount: current.attemptCount + (input.incrementAttempt ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, next);
    return next;
  }

  async close(): Promise<void> {}
}
