import type { Challenge, CreateJobRequest, Job, PublicStats } from '@attestlock/shared';
import { config } from './config';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as T & { error?: unknown };
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  challenge(wallet: string, txHash: string): Promise<Challenge> {
    return request('/api/challenges', { method: 'POST', body: JSON.stringify({ wallet, txHash }) });
  },
  createJob(input: CreateJobRequest): Promise<Job> {
    return request('/api/jobs', { method: 'POST', body: JSON.stringify(input) });
  },
  listJobs(wallet: string): Promise<Job[]> {
    return request(`/api/jobs?wallet=${encodeURIComponent(wallet)}`);
  },
  stats(): Promise<PublicStats> {
    return request('/api/stats');
  },
};
