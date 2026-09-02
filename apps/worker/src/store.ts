import { randomUUID } from 'node:crypto';
import type { Challenge, Job, JobEvidence, JobStatus } from '@attestlock/shared';
import { buildChallengeMessage, CHALLENGE_TTL_SECONDS, explainStatus } from '@attestlock/shared';
import postgres, { type Sql } from 'postgres';

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
  recoverInterrupted(): Promise<number>;
  createChallenge(wallet: string, now?: Date): Promise<Challenge>;
  getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null>;
  consumeChallenge(nonce: string): Promise<boolean>;
  countRecentJobs(wallet: string, since: Date): Promise<number>;
  createJob(txHash: string, borrower: string): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  listJobs(borrower?: string): Promise<Job[]>;
  nextRunnable(now?: Date): Promise<Job | null>;
  transition(id: string, input: TransitionInput): Promise<Job>;
  close(): Promise<void>;
}

export class TransactionOwnerMismatchError extends Error {
  constructor() {
    super('This source transaction is already assigned to another borrower.');
  }
}

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
    await this.sql`
      create table if not exists challenges (
        nonce text primary key,
        wallet text not null,
        message text not null,
        expires_at timestamptz not null,
        used boolean not null default false,
        created_at timestamptz not null default now()
      )
    `;
    await this.sql`
      create table if not exists jobs (
        id uuid primary key,
        tx_hash text not null unique,
        borrower text not null,
        status text not null,
        explanation text not null,
        attempt_count integer not null default 0,
        next_attempt_at timestamptz,
        evidence jsonb not null default '{}'::jsonb,
        error_code text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await this.sql`create index if not exists jobs_borrower_created_idx on jobs (borrower, created_at desc)`;
    await this
      .sql`create index if not exists jobs_runnable_idx on jobs (status, next_attempt_at, created_at)`;
  }

  async recoverInterrupted(): Promise<number> {
    const rows = await this.sql<Array<{ id: string }>>`
      update jobs set
        status = 'queued',
        explanation = ${explainStatus('queued')},
        next_attempt_at = now(),
        updated_at = now()
      where status in ('waiting_attestation', 'proving', 'preflight', 'submitting')
      returning id
    `;
    return rows.length;
  }

  async createChallenge(wallet: string, now = new Date()): Promise<Challenge> {
    const nonce = randomUUID();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000);
    const message = buildChallengeMessage(wallet, nonce, expiresAt.toISOString());
    await this.sql`
      insert into challenges (nonce, wallet, message, expires_at)
      values (${nonce}, ${wallet}, ${message}, ${expiresAt})
    `;
    return { nonce, wallet, message, expiresAt: expiresAt.toISOString() };
  }

  async getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null> {
    const rows = await this.sql<
      Array<{ nonce: string; wallet: string; message: string; expires_at: Date; used: boolean }>
    >`select nonce, wallet, message, expires_at, used from challenges where nonce = ${nonce}`;
    const row = rows[0];
    return row
      ? {
          nonce: row.nonce,
          wallet: row.wallet,
          message: row.message,
          expiresAt: row.expires_at.toISOString(),
          used: row.used,
        }
      : null;
  }

  async consumeChallenge(nonce: string): Promise<boolean> {
    const rows = await this.sql<Array<{ nonce: string }>>`
      update challenges set used = true
      where nonce = ${nonce} and used = false and expires_at > now()
      returning nonce
    `;
    return rows.length === 1;
  }

  async countRecentJobs(wallet: string, since: Date): Promise<number> {
    const rows = await this.sql<Array<{ count: number }>>`
      select count(*)::int as count from jobs where borrower = ${wallet} and created_at >= ${since}
    `;
    return rows[0]?.count ?? 0;
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

  async nextRunnable(now = new Date()): Promise<Job | null> {
    const rows = await this.sql<Array<JobRow>>`
      select * from jobs
      where status = 'queued' and (next_attempt_at is null or next_attempt_at <= ${now})
      order by created_at asc limit 1
    `;
    return rows[0] ? toJob(rows[0]) : null;
  }

  async transition(id: string, input: TransitionInput): Promise<Job> {
    const evidenceValues = Object.fromEntries(
      Object.entries(input.evidence ?? {}).filter((entry) => entry[1] !== undefined)
    ) as Record<string, string | number>;
    const evidence = this.sql.json(evidenceValues);
    const rows = await this.sql<Array<JobRow>>`
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
    return toJob(rows[0]);
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

export class MemoryJobStore implements JobStore {
  readonly jobs = new Map<string, Job>();
  readonly challenges = new Map<string, Challenge & { used: boolean }>();

  async init(): Promise<void> {}

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

  async createChallenge(wallet: string, now = new Date()): Promise<Challenge> {
    const nonce = randomUUID();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const challenge = { nonce, wallet, message: buildChallengeMessage(wallet, nonce, expiresAt), expiresAt };
    this.challenges.set(nonce, { ...challenge, used: false });
    return challenge;
  }

  async getChallenge(nonce: string): Promise<(Challenge & { used: boolean }) | null> {
    return this.challenges.get(nonce) ?? null;
  }

  async consumeChallenge(nonce: string): Promise<boolean> {
    const challenge = this.challenges.get(nonce);
    if (!challenge || challenge.used || new Date(challenge.expiresAt).getTime() <= Date.now()) return false;
    challenge.used = true;
    return true;
  }

  async countRecentJobs(wallet: string, since: Date): Promise<number> {
    return [...this.jobs.values()].filter(
      (job) => job.borrower === wallet && new Date(job.createdAt) >= since
    ).length;
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

  async nextRunnable(now = new Date()): Promise<Job | null> {
    return (
      [...this.jobs.values()].find(
        (job) =>
          job.status === 'queued' &&
          (!job.nextAttemptAt || new Date(job.nextAttemptAt).getTime() <= now.getTime())
      ) ?? null
    );
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
