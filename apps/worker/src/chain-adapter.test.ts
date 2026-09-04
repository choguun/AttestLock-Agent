import { attestLockAscAbi } from '@attestlock/shared';
import { Contract, Interface } from 'ethers';
import { describe, expect, it } from 'vitest';
import {
  areContractBindingsValid,
  ascRefusalCode,
  isActiveAttestation,
  isProofBuilderReady,
  isRelayerFunded,
  isSupportedSourceChain,
  observeAttestationProgress,
  proofArguments,
  proofBuilderAttestedHeight,
} from './chain-adapter.js';

describe('Attestcoin proof adapter', () => {
  it('converts the official SDK response to the seven proof arguments without reordering', () => {
    const proof = {
      chainKey: 1,
      headerNumber: 42,
      txBytes: '0x1234',
      merkleProof: {
        root: `0x${'11'.repeat(32)}`,
        siblings: [{ hash: `0x${'22'.repeat(32)}`, isLeft: true }],
      },
      continuityProof: { lowerEndpointDigest: `0x${'33'.repeat(32)}`, roots: [`0x${'44'.repeat(32)}`] },
    };
    expect(proofArguments(proof as never)).toEqual([
      1,
      42,
      '0x1234',
      proof.merkleProof.root,
      proof.merkleProof.siblings,
      proof.continuityProof.lowerEndpointDigest,
      proof.continuityProof.roots,
    ]);
  });

  it('maps ASC custom errors to deterministic refusal codes', () => {
    const contract = new Contract('0x0000000000000000000000000000000000000001', attestLockAscAbi);
    const iface = new Interface(attestLockAscAbi);
    expect(ascRefusalCode(contract, { data: iface.encodeErrorResult('UnsupportedToken') })).toBe(
      'UNSUPPORTED_TOKEN'
    );
    expect(ascRefusalCode(contract, { data: '0xdeadbeef' })).toBe('ASC_PREFLIGHT_REVERTED');
  });

  it('fails readiness checks closed for registration, attestation, and funding mismatches', () => {
    expect(isSupportedSourceChain({ chainKey: 1, chainId: 11_155_111 })).toBe(true);
    expect(isSupportedSourceChain({ chainKey: 1, chainId: 1 })).toBe(false);
    expect(isSupportedSourceChain(null)).toBe(false);
    expect(isActiveAttestation({ exists: true, height: 42 })).toBe(true);
    expect(isActiveAttestation({ exists: false, height: 42 })).toBe(false);
    expect(isActiveAttestation({ exists: true, height: 0 })).toBe(false);
    expect(isRelayerFunded(10n, 10n)).toBe(true);
    expect(isRelayerFunded(9n, 10n)).toBe(false);
    expect(isProofBuilderReady({ attestedHeight: 42 })).toBe(true);
    expect(isProofBuilderReady({ attestedHeight: 42 }, 43, 1)).toBe(true);
    expect(isProofBuilderReady({ attestedHeight: 42 }, 44, 1)).toBe(false);
    expect(isProofBuilderReady({ attestedHeight: 0 })).toBe(false);
    expect(isProofBuilderReady({ height: 42 })).toBe(false);
    expect(isProofBuilderReady(null)).toBe(false);
    expect(proofBuilderAttestedHeight({ attestedHeight: 42 })).toBe(42);
    expect(proofBuilderAttestedHeight({ attestedHeight: 0 })).toBeNull();

    const expected = {
      SOURCE_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000001',
      SOURCE_VAULT_ADDRESS: '0x0000000000000000000000000000000000000002',
      CREDIT_POOL_ADDRESS: '0x0000000000000000000000000000000000000003',
      MOCK_USD_ADDRESS: '0x0000000000000000000000000000000000000004',
      ATTESTLOCK_ASC_ADDRESS: '0x0000000000000000000000000000000000000005',
    };
    const bindings = {
      vaultToken: expected.SOURCE_TOKEN_ADDRESS,
      ascVerifier: '0x0000000000000000000000000000000000000fd2',
      ascPool: expected.CREDIT_POOL_ADDRESS,
      ascVault: expected.SOURCE_VAULT_ADDRESS,
      ascToken: expected.SOURCE_TOKEN_ADDRESS,
      poolAsset: expected.MOCK_USD_ADDRESS,
      poolAsc: expected.ATTESTLOCK_ASC_ADDRESS,
    };
    expect(areContractBindingsValid(bindings, expected)).toBe(true);
    expect(areContractBindingsValid({ ...bindings, poolAsc: expected.CREDIT_POOL_ADDRESS }, expected)).toBe(
      false
    );
  });

  it('requires the attested height to keep advancing within the freshness window', () => {
    const first = observeAttestationProgress({ exists: true, height: 42 }, null, 1_000, 30_000);
    expect(first.active).toBe(false);
    expect(first.progress).toEqual({ height: 42, advancedAt: 1_000, verifiedAdvancement: false });
    expect(
      observeAttestationProgress({ exists: true, height: 42 }, first.progress, 30_000, 30_000).active
    ).toBe(false);
    expect(
      observeAttestationProgress({ exists: true, height: 42 }, first.progress, 31_001, 30_000).active
    ).toBe(false);
    expect(observeAttestationProgress({ exists: true, height: 43 }, first.progress, 31_001, 30_000)).toEqual({
      active: true,
      progress: { height: 43, advancedAt: 31_001, verifiedAdvancement: true },
    });
    const advanced = observeAttestationProgress({ exists: true, height: 43 }, first.progress, 2_000, 30_000);
    expect(
      observeAttestationProgress({ exists: true, height: 43 }, advanced.progress, 31_999, 30_000).active
    ).toBe(true);
    expect(
      observeAttestationProgress({ exists: true, height: 43 }, advanced.progress, 32_001, 30_000).active
    ).toBe(false);
    expect(
      observeAttestationProgress({ exists: true, height: 41 }, first.progress, 2_000, 30_000).active
    ).toBe(false);
    expect(
      observeAttestationProgress({ exists: false, height: 0 }, first.progress, 2_000, 30_000).active
    ).toBe(false);
  });
});
