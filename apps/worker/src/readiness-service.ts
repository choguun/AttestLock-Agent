import {
  CREDITCOIN_TESTNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_KEY,
  attestLockAscAbi,
  creditPoolAbi,
  lockVaultAbi,
} from '@attestlock/shared';
import type { chainInfo } from '@gluwa/usc-sdk';
import { Contract, getAddress, type JsonRpcProvider, type Wallet } from 'ethers';
import type { WorkerConfig } from './env.js';
import type { ChainReadiness } from './server.js';
import { bounded } from './timeouts.js';

const BLOCK_PROVER_ADDRESS = '0x0000000000000000000000000000000000000FD2';

export function isSupportedSourceChain(registered: { chainKey: number; chainId: number } | null): boolean {
  return registered?.chainKey === SEPOLIA_CHAIN_KEY && registered.chainId === SEPOLIA_CHAIN_ID;
}

export function isActiveAttestation(latest: { exists: boolean; height: number }): boolean {
  return latest.exists && latest.height > 0;
}

export function isRelayerFunded(balance: bigint, minimumBalance: bigint): boolean {
  return balance >= minimumBalance;
}

export function proofBuilderAttestedHeight(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const height = (payload as { attestedHeight?: unknown }).attestedHeight;
  return typeof height === 'number' && Number.isSafeInteger(height) && height > 0 ? height : null;
}

export function isProofBuilderReady(
  payload: unknown,
  latestChainHeight: number | null = null,
  maxLagBlocks = 500
): boolean {
  const height = proofBuilderAttestedHeight(payload);
  return height !== null && (latestChainHeight === null || height + maxLagBlocks >= latestChainHeight);
}

export interface AttestationProgress {
  height: number;
  advancedAt: number;
  verifiedAdvancement: boolean;
}

export function observeAttestationProgress(
  latest: { exists: boolean; height: number },
  previous: AttestationProgress | null,
  now: number,
  maxStalenessMs: number
): { active: boolean; progress: AttestationProgress | null } {
  if (!isActiveAttestation(latest)) return { active: false, progress: previous };
  if (!previous) {
    return {
      active: false,
      progress: { height: latest.height, advancedAt: now, verifiedAdvancement: false },
    };
  }
  if (latest.height < previous.height) return { active: false, progress: previous };
  if (latest.height > previous.height) {
    return {
      active: true,
      progress: { height: latest.height, advancedAt: now, verifiedAdvancement: true },
    };
  }
  return {
    active: previous.verifiedAdvancement && now - previous.advancedAt <= maxStalenessMs,
    progress: previous,
  };
}

function sameAddress(actual: unknown, expected: string): boolean {
  try {
    return getAddress(String(actual)) === getAddress(expected);
  } catch {
    return false;
  }
}

export interface ContractBindings {
  vaultToken: unknown;
  ascVerifier: unknown;
  ascPool: unknown;
  ascVault: unknown;
  ascToken: unknown;
  poolAsset: unknown;
  poolAsc: unknown;
}

export function areContractBindingsValid(
  bindings: ContractBindings,
  expected: Pick<
    WorkerConfig,
    | 'SOURCE_TOKEN_ADDRESS'
    | 'SOURCE_VAULT_ADDRESS'
    | 'CREDIT_POOL_ADDRESS'
    | 'MOCK_USD_ADDRESS'
    | 'ATTESTLOCK_ASC_ADDRESS'
  >
): boolean {
  return (
    sameAddress(bindings.vaultToken, expected.SOURCE_TOKEN_ADDRESS) &&
    sameAddress(bindings.ascVerifier, BLOCK_PROVER_ADDRESS) &&
    sameAddress(bindings.ascPool, expected.CREDIT_POOL_ADDRESS) &&
    sameAddress(bindings.ascVault, expected.SOURCE_VAULT_ADDRESS) &&
    sameAddress(bindings.ascToken, expected.SOURCE_TOKEN_ADDRESS) &&
    sameAddress(bindings.poolAsset, expected.MOCK_USD_ADDRESS) &&
    sameAddress(bindings.poolAsc, expected.ATTESTLOCK_ASC_ADDRESS)
  );
}

export class ChainReadinessService {
  private attestationProgress: AttestationProgress | null = null;
  private readonly sourceVault: Contract;
  private readonly asc: Contract;
  private readonly pool: Contract;

  constructor(
    private readonly config: WorkerConfig,
    private readonly sourceProvider: JsonRpcProvider,
    private readonly creditcoinProvider: JsonRpcProvider,
    private readonly wallet: Wallet,
    private readonly chainInfoProvider: chainInfo.ChainInfoProvider
  ) {
    this.sourceVault = new Contract(config.SOURCE_VAULT_ADDRESS, lockVaultAbi, sourceProvider);
    this.asc = new Contract(config.ATTESTLOCK_ASC_ADDRESS, attestLockAscAbi, creditcoinProvider);
    this.pool = new Contract(config.CREDIT_POOL_ADDRESS, creditPoolAbi, creditcoinProvider);
  }

  private pending: Promise<ChainReadiness> | null = null;
  private cached: { at: number; value: ChainReadiness } | null = null;

  async check(): Promise<ChainReadiness> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.cached.at < 10_000) return this.cached.value;
    this.pending = this.sample()
      .then((value) => {
        this.cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private async sample(): Promise<ChainReadiness> {
    const probe = <T>(promise: Promise<T>) => bounded(promise).catch(() => null);
    const [
      sourceNetwork,
      destinationNetwork,
      sourceCode,
      destinationCode,
      bindings,
      registered,
      latest,
      balance,
      payload,
    ] = await Promise.all([
      probe(this.sourceProvider.getNetwork()),
      probe(this.creditcoinProvider.getNetwork()),
      probe(
        Promise.all([
          this.sourceProvider.getCode(this.config.SOURCE_VAULT_ADDRESS),
          this.sourceProvider.getCode(this.config.SOURCE_TOKEN_ADDRESS),
        ])
      ),
      probe(
        Promise.all([
          this.creditcoinProvider.getCode(this.config.ATTESTLOCK_ASC_ADDRESS),
          this.creditcoinProvider.getCode(this.config.CREDIT_POOL_ADDRESS),
          this.creditcoinProvider.getCode(this.config.MOCK_USD_ADDRESS),
        ])
      ),
      probe(
        Promise.all([
          this.sourceVault.getFunction('collateralToken')(),
          this.asc.getFunction('verifier')(),
          this.asc.getFunction('pool')(),
          this.asc.getFunction('sourceVault')(),
          this.asc.getFunction('sourceToken')(),
          this.pool.getFunction('asset')(),
          this.pool.getFunction('asc')(),
        ])
      ),
      probe(this.chainInfoProvider.getSupportedChainByKey(SEPOLIA_CHAIN_KEY)),
      probe(this.chainInfoProvider.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY)),
      probe(this.creditcoinProvider.getBalance(this.wallet.address)),
      probe(
        fetch(new URL(`/api/v1/attested-height/${SEPOLIA_CHAIN_KEY}`, this.config.PROOF_BUILDER_URL), {
          signal: AbortSignal.timeout(9_000),
        }).then(async (response) => (response.ok ? response.json() : null))
      ),
    ]);
    const observation = observeAttestationProgress(
      latest ?? { exists: false, height: 0 },
      this.attestationProgress,
      Date.now(),
      this.config.MAX_ATTESTATION_STALENESS_MS
    );
    this.attestationProgress = observation.progress;
    const height = latest && isActiveAttestation(latest) ? latest.height : null;
    const [vaultToken, ascVerifier, ascPool, ascVault, ascToken, poolAsset, poolAsc] = bindings ?? [];
    return {
      checks: {
        sourceRpc: sourceNetwork?.chainId === BigInt(SEPOLIA_CHAIN_ID),
        destinationRpc: destinationNetwork?.chainId === BigInt(CREDITCOIN_TESTNET_CHAIN_ID),
        sourceContracts: Boolean(sourceCode?.every((code) => code !== '0x')),
        destinationContracts: Boolean(destinationCode?.every((code) => code !== '0x')),
        contractBindings: Boolean(
          bindings &&
          areContractBindingsValid(
            { vaultToken, ascVerifier, ascPool, ascVault, ascToken, poolAsset, poolAsc },
            this.config
          )
        ),
        attestcoinChain: isSupportedSourceChain(registered),
        activeAttestation: observation.active,
        fundedRelayer:
          balance !== null && isRelayerFunded(balance, BigInt(this.config.MIN_RELAYER_BALANCE_WEI)),
        proofBuilder:
          height !== null && isProofBuilderReady(payload, height, this.config.MAX_PROOF_BUILDER_LAG_BLOCKS),
      },
      latestAttestedHeight: height,
      attestationAdvancedAt: observation.progress?.verifiedAdvancement
        ? new Date(observation.progress.advancedAt).toISOString()
        : null,
      proofBuilderAttestedHeight: proofBuilderAttestedHeight(payload),
    };
  }
}
