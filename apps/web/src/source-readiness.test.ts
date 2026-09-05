import { describe, expect, it, vi } from 'vitest';
import { boundedWalletRead, sourceActions } from './source-readiness';

const ready = { claimed: true, balance: 900_000_000n, allowance: 100_000_000n, gas: 1n };
describe('source prerequisites', () => {
  it('bounds an unresponsive provider instead of keeping stale eligibility indefinitely', async () => {
    vi.useFakeTimers();
    try {
      const result = expect(boundedWalletRead(new Promise(() => undefined))).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(8_000);
      await result;
      expect(await boundedWalletRead(Promise.resolve(123))).toBe(123);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('requires known prerequisites; rejects claimed faucet and absent allowance', () => {
    expect(sourceActions(null)).toEqual({ faucet: false, approve: false, lock: false });
    expect(sourceActions({ ...ready, allowance: 0n })).toEqual({ faucet: false, approve: true, lock: false });
    expect(sourceActions(ready)).toEqual({ faucet: false, approve: false, lock: true });
  });
  it('allows a fresh faucet but never a lock without collateral or native gas', () => {
    expect(sourceActions({ ...ready, claimed: false, balance: 0n })).toEqual({
      faucet: true,
      approve: false,
      lock: false,
    });
    expect(sourceActions({ ...ready, gas: 0n })).toEqual({ faucet: false, approve: false, lock: false });
    expect(sourceActions({ ...ready, balance: 99_999_999n }).lock).toBe(false);
    expect(sourceActions({ ...ready, allowance: 99_999_999n }).lock).toBe(false);
  });
});
