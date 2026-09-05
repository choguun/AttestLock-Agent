import { describe, expect, it } from 'vitest';
import { mergeJobs } from './job-recovery';
import type { Job } from '@attestlock/shared';
const wallet = '0x1111111111111111111111111111111111111111';
describe('REST/SSE reconciliation', () => {
  it('ignores old events, cross-wallet data, and stale REST responses', () => {
    const executed = {
      id: 'one',
      borrower: wallet,
      status: 'executed',
      updatedAt: '2026-09-05T00:01:00Z',
      createdAt: '2026-09-05T00:00:00Z',
    } as Job;
    const old = { ...executed, status: 'proving', updatedAt: '2026-09-05T00:00:30Z' } as Job;
    expect(mergeJobs([executed], [old, { ...old, id: 'other', borrower: '0x2222' }], wallet)).toEqual([
      executed,
    ]);
    expect(mergeJobs([executed], [{ ...old, updatedAt: executed.updatedAt }], wallet)).toEqual([executed]);
  });
});
