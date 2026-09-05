import { Contract, Wallet, type JsonRpcProvider } from 'ethers';
import type { chainInfo } from '@gluwa/usc-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './env.js';
import { ChainReadinessService } from './readiness-service.js';

function setup() {
  const address = (digit: string) => `0x${digit.repeat(40)}`;
  const config = loadConfig({
    DATABASE_URL: 'postgres://test',
    SOURCE_CHAIN_RPC_URL: 'http://localhost:1',
    CREDITCOIN_RPC_URL: 'http://localhost:1',
    PROOF_BUILDER_URL: 'http://localhost:1',
    CREDITCOIN_RELAYER_PRIVATE_KEY: Wallet.createRandom().privateKey,
    SOURCE_VAULT_ADDRESS: address('1'),
    SOURCE_TOKEN_ADDRESS: address('2'),
    ATTESTLOCK_ASC_ADDRESS: address('3'),
    CREDIT_POOL_ADDRESS: address('4'),
    MOCK_USD_ADDRESS: address('5'),
    CREDITCOIN_DEPLOYMENT_BLOCK: '1',
    MAX_ATTESTATION_STALENESS_MS: '30000',
  });
  const bindings: Record<string, string> = {
    collateralToken: address('2'),
    verifier: '0x0000000000000000000000000000000000000FD2',
    pool: address('4'),
    sourceVault: address('1'),
    sourceToken: address('2'),
    asset: address('5'),
    asc: address('3'),
  };
  vi.spyOn(Contract.prototype, 'getFunction').mockImplementation(
    ((name: string) => async () => bindings[name]) as never
  );
  const source = {
    getNetwork: vi.fn(async () => ({ chainId: 11155111n })),
    getCode: vi.fn(async () => '0x1234'),
  };
  const destination = {
    getNetwork: vi.fn(async () => ({ chainId: 102031n })),
    getCode: vi.fn(async () => '0x1234'),
    getBalance: vi.fn(async () => 10n ** 18n),
  };
  const native = {
    getSupportedChainByKey: vi.fn(async () => ({ chainKey: 1, chainId: 11155111 })),
    getLatestAttestedHeightAndHash: vi.fn(async () => ({ exists: true, height: 100 })),
  };
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ attestedHeight: 100 }) }));
  vi.stubGlobal('fetch', fetcher);
  const service = new ChainReadinessService(
    config,
    source as unknown as JsonRpcProvider,
    destination as unknown as JsonRpcProvider,
    new Wallet(config.CREDITCOIN_RELAYER_PRIVATE_KEY),
    native as unknown as chainInfo.ChainInfoProvider
  );
  return { service, source, destination, native, fetcher };
}

describe('independent readiness sampling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('single-flights probes, requires advancement, and expires that advancement', async () => {
    vi.useFakeTimers();
    const { service, native, fetcher } = setup();
    const [first, second] = await Promise.all([service.check(), service.check()]);
    expect(first).toEqual(second);
    expect(first.checks.activeAttestation).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    native.getLatestAttestedHeightAndHash.mockResolvedValue({ exists: true, height: 101 });
    vi.advanceTimersByTime(11000);
    expect((await service.check()).checks.activeAttestation).toBe(true);
    vi.advanceTimersByTime(31000);
    expect((await service.check()).checks.activeAttestation).toBe(false);
  });

  it('times out a hung source without hiding healthy destination/proof components', async () => {
    vi.useFakeTimers();
    const { service, source, destination } = setup();
    source.getNetwork.mockImplementation(() => new Promise(() => undefined));
    const result = service.check();
    await vi.advanceTimersByTimeAsync(10001);
    expect((await result).checks).toMatchObject({
      sourceRpc: false,
      destinationRpc: true,
      proofBuilder: true,
      contractBindings: true,
    });
    destination.getBalance.mockResolvedValue(0n);
    vi.advanceTimersByTime(11000);
    const unfunded = service.check();
    await vi.advanceTimersByTimeAsync(10001);
    expect((await unfunded).checks.fundedRelayer).toBe(false);
  });
});
