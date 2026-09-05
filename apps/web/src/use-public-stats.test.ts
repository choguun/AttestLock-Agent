import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicStats } from '@attestlock/shared';
import { api } from './api';
import { statsStatus, usePublicStats } from './use-public-stats';

describe('public snapshot freshness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const now = Date.parse('2026-09-05T15:00:00Z');
  const sample = {
    protocolStatus: 'current',
    protocolObservedAt: new Date(now).toISOString(),
    linesOpened: 1,
  } as PublicStats;
  it('ages local and upstream snapshots, including disconnected and invalid timestamps', () => {
    expect(statsStatus(null, now, false, now)).toBe('unavailable');
    expect(statsStatus(sample, now, false, now)).toBe('current');
    expect(statsStatus(sample, now, true, now)).toBe('stale');
    expect(statsStatus(sample, now, false, now + 120_001)).toBe('stale');
    expect(statsStatus({ ...sample, protocolObservedAt: null }, now, false, now)).toBe('stale');
    expect(statsStatus({ ...sample, protocolStatus: 'stale' }, now, false, now)).toBe('stale');
    expect(statsStatus({ ...sample, protocolStatus: 'unavailable' }, now, false, now)).toBe('unavailable');
  });
  it('preserves last values on request failure, then recovers to current without leaking raw errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const request = vi
      .spyOn(api, 'stats')
      .mockResolvedValueOnce(sample)
      .mockRejectedValueOnce(new Error('private RPC'))
      .mockResolvedValue({ ...sample, protocolObservedAt: new Date(now + 120_000).toISOString() });
    const { result } = renderHook(() => usePublicStats(true));
    await act(async () => {});
    expect(result.current.status).toBe('current');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe('stale');
    expect(result.current.stats?.linesOpened).toBe(1);
    expect(result.current.refreshFailed).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe('current');
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('never overlaps slow polling requests', async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(api, 'stats').mockImplementation(() => new Promise(() => undefined));
    const { unmount } = renderHook(() => usePublicStats(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
  });
});
