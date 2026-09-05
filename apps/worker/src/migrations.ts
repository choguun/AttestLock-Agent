export interface Migration {
  version: number;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      `create table if not exists challenges (
        nonce text primary key,
        wallet text not null,
        message text not null,
        expires_at timestamptz not null,
        used boolean not null default false,
        created_at timestamptz not null default now()
      )`,
      `create table if not exists jobs (
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
      )`,
      `create index if not exists jobs_borrower_created_idx on jobs (borrower, created_at desc)`,
      `create index if not exists jobs_runnable_idx on jobs (status, next_attempt_at, created_at)`,
    ],
  },
  {
    version: 2,
    statements: [
      `alter table challenges add column if not exists tx_hash text`,
      `alter table challenges add column if not exists typed_data jsonb`,
      `create index if not exists challenges_expiry_idx on challenges (expires_at)`,
    ],
  },
  {
    version: 3,
    statements: [
      `create table if not exists job_attempts (
        id bigserial primary key,
        job_id uuid not null references jobs(id) on delete cascade,
        attempt_number integer not null,
        status text not null,
        outcome text,
        error_code text,
        evidence jsonb not null default '{}'::jsonb,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        unique (job_id, attempt_number)
      )`,
      `create index if not exists job_attempts_job_started_idx
        on job_attempts (job_id, started_at desc)`,
    ],
  },
  {
    version: 4,
    statements: [
      `update jobs set tx_hash = lower(tx_hash)`,
      `update challenges set tx_hash = lower(tx_hash) where tx_hash is not null`,
      `create unique index if not exists jobs_tx_hash_lower_unique on jobs (lower(tx_hash))`,
      `create index if not exists challenges_tx_hash_lower_idx on challenges (lower(tx_hash))`,
    ],
  },
  {
    version: 5,
    statements: [
      `do $$ begin
        if exists (select 1 from jobs group by lower(borrower), lower(tx_hash) having count(*) > 1) then
          raise exception 'Wallet/transaction normalization collision. Inspect jobs grouped by lower(borrower), lower(tx_hash); preserve jobs and attempts and resolve evidence manually before retrying migration 5.';
        end if;
      end $$`,
      `alter table jobs drop constraint if exists jobs_tx_hash_key`,
      `drop index if exists jobs_tx_hash_lower_unique`,
      `create unique index jobs_wallet_tx_unique on jobs (lower(borrower), lower(tx_hash))`,
      `alter table jobs add column lease_token uuid`,
      `alter table jobs add column lease_expires_at timestamptz`,
      `create index jobs_lease_expiry_idx on jobs (lease_expires_at)`,
    ],
  },
  {
    version: 6,
    statements: [
      `create table signed_submissions (
        job_id uuid primary key references jobs(id),
        relayer text not null,
        tx_hash text not null unique,
        raw_transaction text not null,
        finalized boolean not null default false,
        created_at timestamptz not null default now()
      )`,
      `create unique index one_pending_submission_per_relayer on signed_submissions (relayer) where not finalized`,
    ],
  },
];
