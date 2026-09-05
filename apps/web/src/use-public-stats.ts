import { useEffect, useState } from 'react';
import type { PublicStats } from '@attestlock/shared';
import { api } from './api';

export const STATS_MAX_AGE_MS = 120_000;

export function statsStatus(stats: PublicStats | null, receivedAt: number, failed: boolean, now: number) {
  if (!stats || stats.protocolStatus === 'unavailable') return 'unavailable';
  const observed = Date.parse(stats.protocolObservedAt ?? '');
  return failed ||
    stats.protocolStatus === 'stale' ||
    !Number.isFinite(observed) ||
    now - receivedAt > STATS_MAX_AGE_MS ||
    now - observed > STATS_MAX_AGE_MS ||
    observed > now + 30_000
    ? 'stale'
    : 'current';
}

export function usePublicStats(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{
    stats: PublicStats | null;
    receivedAt: number;
    failed: boolean;
  }>({ stats: null, receivedAt: 0, failed: false });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const stats = await api.stats();
        if (!disposed) setSnapshot({ stats, receivedAt: Date.now(), failed: false });
      } catch {
        if (!disposed) setSnapshot((old) => ({ ...old, failed: true }));
      } finally {
        running = false;
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [enabled]);
  return {
    stats: snapshot.stats,
    status: statsStatus(snapshot.stats, snapshot.receivedAt, snapshot.failed, now),
    refreshFailed: snapshot.failed,
  };
}
