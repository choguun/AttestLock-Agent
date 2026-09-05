import type { Job } from '@attestlock/shared';

/** REST and SSE may race. Terminal evidence must never be overwritten by older observations. */
export function mergeJobs(current: Job[], incoming: Job[], wallet: string): Job[] {
  const result = new Map(
    current.filter((job) => job.borrower.toLowerCase() === wallet.toLowerCase()).map((job) => [job.id, job])
  );
  for (const job of incoming) {
    if (job.borrower.toLowerCase() !== wallet.toLowerCase()) continue;
    const old = result.get(job.id);
    if (old && Date.parse(old.updatedAt) > Date.parse(job.updatedAt)) continue;
    if (
      old &&
      ['executed', 'refused', 'failed'].includes(old.status) &&
      !['executed', 'refused', 'failed'].includes(job.status)
    )
      continue;
    result.set(job.id, job);
  }
  return [...result.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
