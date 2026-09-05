import { randomUUID } from 'node:crypto';
import type { Challenge, Job, JobEvidence, JobStats, JobStatus } from '@attestlock/shared';
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

export const JOB_LEASE_MS = 60_000;
export interface ClaimedJob extends Job {
  leaseToken: string;
}
export class LeaseLostError extends Error {
  constructor() {
    super('The job lease is no longer owned by this processor.');
  }
}
export interface SignedSubmission {
  jobId: string;
  relayer: string;
  txHash: string;
  rawTransaction: string;
}

export interface JobStore {
  init(): Promise<void>;
  ping(): Promise<boolean>;
  recoverInterrupted(now?: Date): Promise<number>;
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
  getPublicStats(): Promise<JobStats>;
  claimNextRunnable(now?: Date): Promise<ClaimedJob | null>;
  renewLease(id: string, token: string, now?: Date): Promise<boolean>;
  transition(id: string, input: TransitionInput, leaseToken?: string): Promise<Job>;
  withRelayerLock<T>(relayer: string, work: () => Promise<T>): Promise<T>;
  getSubmission(jobId: string): Promise<SignedSubmission | null>;
  hasPendingSubmission(relayer: string): Promise<boolean>;
  saveSubmission(submission: SignedSubmission, leaseToken: string): Promise<void>;
  finalizeSubmission(jobId: string): Promise<void>;
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
  lease_token: string | null;
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

function normalizeTxHash(txHash: string): string {
  return txHash.toLowerCase();
}

export class PostgresJobStore implements JobStore {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 5 });
  }

  async init(): Promise<void> {
    await this.sql.begin(async (sql) => {
      // The lock also covers initial schema creation and the complete migration sequence.
      await sql`select pg_advisory_xact_lock(771940281)`;
      await sql`create table if not exists schema_migrations (
      version integer primary key,
      applied_at timestamptz not null default now()
    )`;
      for (const migration of migrations) {
        const applied = await sql<Array<{ version: number }>>`
          select version from schema_migrations where version = ${migration.version}
        `;
        if (applied.length > 0) continue;
        if (migration.version === 4) {
          const collisions = await sql`
            select lower(tx_hash) from jobs group by lower(tx_hash) having count(*) > 1
          `;
          if (collisions.length)
            throw new Error(
              'Migration 4 normalization collision: inspect jobs grouped by lower(tx_hash). Preserve historical jobs and attempts; resolve conflicts before retrying.'
            );
        }
        for (const statement of migration.statements) await sql.unsafe(statement);
        await sql`insert into schema_migrations (version) values (${migration.version})`;
      }
    });
  }

  async ping(): Promise<boolean> {
    const rows = await this.sql<Array<{ ok: number }>>`select 1::int as ok`;
    return rows[0]?.ok === 1;
  }

  async recoverInterrupted(now = new Date()): Promise<number> {
    return this.sql.begin(async (sql) => {
      const rows = await sql<Array<{ id: string }>>`
        update jobs set
          status = 'queued',
          explanation = ${explainStatus('queued')},
          lease_token = null,
          lease_expires_at = null,
          next_attempt_at = ${now},
          updated_at = now()
        where status in ('waiting_attestation', 'proving', 'preflight', 'submitting')
          and (lease_expires_at is null or lease_expires_at <= ${now})
        returning id
      `;
      if (rows.length)
        await sql`update job_attempts set status = 'interrupted', outcome = 'interrupted', finished_at = now()
        where finished_at is null and job_id in ${sql(rows.map((row) => row.id))}`;
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
    txHash = normalizeTxHash(txHash);
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
    txHash = normalizeTxHash(txHash);
    return this.sql.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtext(${borrower.toLowerCase()}))`;
      const rows = await sql<Array<ChallengeRow>>`
        select nonce, wallet, tx_hash, typed_data, expires_at, used
        from challenges where nonce = ${nonce} for update
      `;
      const challenge = rows[0];
      if (
        !challenge ||
        challenge.used ||
        challenge.expires_at.getTime() <= Date.now() ||
        challenge.wallet.toLowerCase() !== borrower.toLowerCase() ||
        challenge.tx_hash?.toLowerCase() !== txHash.toLowerCase()
      ) {
        throw new ChallengeAuthorizationError('Challenge is missing, expired, consumed, or mismatched.');
      }
      const existing = await sql<
        Array<JobRow>
      >`select * from jobs where lower(tx_hash) = ${txHash} and lower(borrower) = ${borrower.toLowerCase()}`;
      if (existing[0]) {
        const job = toJob(existing[0]);
        await sql`update challenges set used = true where nonce = ${nonce}`;
        return job;
      }
      const counts = await sql<Array<{ count: number }>>`
        select count(*)::int as count from jobs where lower(borrower) = ${borrower.toLowerCase()} and created_at >= ${since}
      `;
      if ((counts[0]?.count ?? 0) >= maxJobs) {
        throw new JobQuotaExceededError('Daily proof-job quota reached.');
      }
      await sql`update challenges set used = true where nonce = ${nonce}`;
      const id = randomUUID();
      const jobs = await sql<Array<JobRow>>`
        insert into jobs (id, tx_hash, borrower, status, explanation)
        values (${id}, ${txHash}, ${borrower}, 'queued', ${explainStatus('queued')})
        on conflict (lower(borrower), lower(tx_hash)) do update set tx_hash = excluded.tx_hash
        returning *
      `;
      const job = toJob(jobs[0]!);
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
    txHash = normalizeTxHash(txHash);
    const id = randomUUID();
    const rows = await this.sql<Array<JobRow>>`
      insert into jobs (id, tx_hash, borrower, status, explanation)
      values (${id}, ${txHash}, ${borrower}, 'queued', ${explainStatus('queued')})
      on conflict (lower(borrower), lower(tx_hash)) do update set tx_hash = excluded.tx_hash
      returning *
    `;
    const job = toJob(rows[0]!);
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
        >`select * from jobs where lower(borrower) = ${borrower.toLowerCase()} order by created_at desc limit 100`
      : await this.sql<Array<JobRow>>`select * from jobs order by created_at desc limit 100`;
    return rows.map(toJob);
  }

  async getPublicStats(): Promise<JobStats> {
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
        count(distinct lower(borrower))::int as unique_wallets,
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

  async claimNextRunnable(now = new Date()): Promise<ClaimedJob | null> {
    await this.recoverInterrupted(now);
    const token = randomUUID();
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
          lease_token = ${token},
          lease_expires_at = ${new Date(now.getTime() + JOB_LEASE_MS)},
          updated_at = now()
        where id = (select id from candidate)
        returning *
      `;
      const row = rows[0];
      if (!row) return null;
      await sql`
        insert into job_attempts (job_id, attempt_number, status)
        select ${row.id}, coalesce(max(attempt_number), 0) + 1, 'waiting_attestation'
        from job_attempts where job_id = ${row.id}
      `;
      return { ...toJob(row), leaseToken: token };
    });
  }

  async renewLease(id: string, token: string, now = new Date()): Promise<boolean> {
    const rows = await this.sql`update jobs set lease_expires_at = ${new Date(now.getTime() + JOB_LEASE_MS)}
      where id = ${id} and lease_token = ${token} and lease_expires_at > ${now} returning id`;
    return rows.length === 1;
  }

  async transition(id: string, input: TransitionInput, leaseToken?: string): Promise<Job> {
    const releaseLease = ['queued', 'executed', 'refused', 'failed'].includes(input.status);
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
          lease_token = case when ${releaseLease} then null else lease_token end,
          lease_expires_at = case when ${releaseLease} then null else lease_expires_at end,
          updated_at = now()
        where id = ${id}
          and lease_token is not distinct from ${leaseToken ?? null}::uuid
          and (lease_expires_at is null or lease_expires_at > now())
        returning *
      `;
      if (!rows[0]) throw new LeaseLostError();

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

  async withRelayerLock<T>(relayer: string, work: () => Promise<T>): Promise<T> {
    // A transaction-scoped advisory lock survives async RPC calls and is released on disconnect.
    return this.sql.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${relayer}, 719))`;
      return work();
    }) as Promise<T>;
  }

  async getSubmission(jobId: string): Promise<SignedSubmission | null> {
    const rows = await this
      .sql`select job_id, relayer, tx_hash, raw_transaction from signed_submissions where job_id = ${jobId}`;
    const row = rows[0];
    return row
      ? { jobId: row.job_id, relayer: row.relayer, txHash: row.tx_hash, rawTransaction: row.raw_transaction }
      : null;
  }

  async hasPendingSubmission(relayer: string): Promise<boolean> {
    const rows = await this
      .sql`select job_id from signed_submissions where relayer = ${relayer} and not finalized limit 1`;
    return rows.length > 0;
  }

  async saveSubmission(submission: SignedSubmission, leaseToken: string): Promise<void> {
    await this.sql.begin(async (sql) => {
      const rows =
        await sql`update jobs set evidence = evidence || ${sql.json({ creditcoinSubmissionTxHash: submission.txHash })}, updated_at = now()
        where id = ${submission.jobId} and lease_token = ${leaseToken} and lease_expires_at > now() returning id`;
      if (!rows.length) throw new LeaseLostError();
      await sql`insert into signed_submissions (job_id, relayer, tx_hash, raw_transaction)
        values (${submission.jobId}, ${submission.relayer}, ${submission.txHash}, ${submission.rawTransaction})`;
    });
  }

  async finalizeSubmission(jobId: string): Promise<void> {
    await this.sql`update signed_submissions set finalized = true where job_id = ${jobId}`;
  }
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, Job>();
  readonly challenges = new Map<string, Challenge & { used: boolean }>();
  private authorizationTail: Promise<void> = Promise.resolve();
  private readonly leases = new Map<string, { token: string; expiresAt: number }>();
  private readonly submissions = new Map<string, SignedSubmission & { finalized: boolean }>();
  private relayerTail: Promise<unknown> = Promise.resolve();

  async init(): Promise<void> {}
  async ping(): Promise<boolean> {
    return true;
  }

  async recoverInterrupted(now = new Date()): Promise<number> {
    let recovered = 0;
    for (const job of this.jobs.values()) {
      if (!['waiting_attestation', 'proving', 'preflight', 'submitting'].includes(job.status)) continue;
      if ((this.leases.get(job.id)?.expiresAt ?? 0) > now.getTime()) continue;
      this.leases.delete(job.id);
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
    txHash = normalizeTxHash(txHash);
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
    txHash = normalizeTxHash(txHash);
    const previous = this.authorizationTail;
    let release!: () => void;
    this.authorizationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const challenge = this.challenges.get(nonce);
      if (
        !challenge ||
        challenge.used ||
        new Date(challenge.expiresAt).getTime() <= Date.now() ||
        challenge.wallet.toLowerCase() !== borrower.toLowerCase() ||
        challenge.txHash !== txHash
      ) {
        throw new ChallengeAuthorizationError('Challenge is missing, expired, consumed, or mismatched.');
      }
      const existing = [...this.jobs.values()].find(
        (job) => job.txHash === txHash && job.borrower.toLowerCase() === borrower.toLowerCase()
      );
      if (existing) {
        challenge.used = true;
        return existing;
      }
      if ((await this.countRecentJobs(borrower, since)) >= maxJobs) {
        throw new JobQuotaExceededError('Daily proof-job quota reached.');
      }
      challenge.used = true;
      return this.createJob(txHash, borrower);
    } finally {
      release();
    }
  }

  async countRecentJobs(wallet: string, since: Date): Promise<number> {
    return [...this.jobs.values()].filter(
      (job) => job.borrower.toLowerCase() === wallet.toLowerCase() && new Date(job.createdAt) >= since
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
    txHash = normalizeTxHash(txHash);
    const existing = [...this.jobs.values()].find(
      (job) => job.txHash === txHash && job.borrower.toLowerCase() === borrower.toLowerCase()
    );
    if (existing) {
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
      .filter((job) => !borrower || job.borrower.toLowerCase() === borrower.toLowerCase())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPublicStats(): Promise<JobStats> {
    const jobs = [...this.jobs.values()];
    return {
      totalJobs: jobs.length,
      uniqueWallets: new Set(jobs.map((job) => job.borrower.toLowerCase())).size,
      executedJobs: jobs.filter((job) => job.status === 'executed').length,
      refusedJobs: jobs.filter((job) => job.status === 'refused').length,
      failedJobs: jobs.filter((job) => job.status === 'failed').length,
    };
  }

  async claimNextRunnable(now = new Date()): Promise<ClaimedJob | null> {
    await this.recoverInterrupted(now);
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
    const token = randomUUID();
    this.leases.set(job.id, { token, expiresAt: now.getTime() + JOB_LEASE_MS });
    return { ...claimed, leaseToken: token };
  }

  async renewLease(id: string, token: string, now = new Date()): Promise<boolean> {
    const lease = this.leases.get(id);
    if (!lease || lease.token !== token || lease.expiresAt <= now.getTime()) return false;
    lease.expiresAt = now.getTime() + JOB_LEASE_MS;
    return true;
  }

  async transition(id: string, input: TransitionInput, leaseToken?: string): Promise<Job> {
    const lease = this.leases.get(id);
    if (lease?.token !== leaseToken || (lease && lease.expiresAt <= Date.now())) throw new LeaseLostError();
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
    if (['queued', 'executed', 'refused', 'failed'].includes(input.status)) this.leases.delete(id);
    return next;
  }

  async close(): Promise<void> {}

  async withRelayerLock<T>(_relayer: string, work: () => Promise<T>): Promise<T> {
    const result = this.relayerTail.then(work);
    this.relayerTail = result.catch(() => undefined);
    return result;
  }
  async getSubmission(jobId: string): Promise<SignedSubmission | null> {
    return this.submissions.get(jobId) ?? null;
  }
  async hasPendingSubmission(relayer: string): Promise<boolean> {
    return [...this.submissions.values()].some((s) => s.relayer === relayer && !s.finalized);
  }
  async saveSubmission(submission: SignedSubmission, leaseToken: string): Promise<void> {
    if (this.submissions.has(submission.jobId) || (await this.hasPendingSubmission(submission.relayer)))
      throw new Error('A signed submission is already pending.');
    await this.transition(
      submission.jobId,
      { status: 'submitting', evidence: { creditcoinSubmissionTxHash: submission.txHash } },
      leaseToken
    );
    this.submissions.set(submission.jobId, { ...submission, finalized: false });
  }
  async finalizeSubmission(jobId: string): Promise<void> {
    const submission = this.submissions.get(jobId);
    if (submission) submission.finalized = true;
  }
}
