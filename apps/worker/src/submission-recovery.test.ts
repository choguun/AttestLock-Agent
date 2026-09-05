import { attestLockAscAbi } from '@attestlock/shared';
import { Contract, Interface, Wallet, type JsonRpcProvider } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreditcoinSubmitter } from './creditcoin-submitter.js';
import { AttestcoinChainAdapter } from './chain-adapter.js';
import { SourceLockValidator } from './source-validator.js';
import { MemoryJobStore } from './store.js';
import { loadConfig } from './env.js';

const address = (byte: string) => `0x${byte.repeat(40)}`;
const hash = (byte: string) => `0x${byte.repeat(64)}`;
const config = () =>
  loadConfig({
    DATABASE_URL: 'postgres://test',
    SOURCE_CHAIN_RPC_URL: 'http://127.0.0.1:1',
    CREDITCOIN_RPC_URL: 'http://127.0.0.1:1',
    PROOF_BUILDER_URL: 'http://127.0.0.1:1',
    CREDITCOIN_RELAYER_PRIVATE_KEY: Wallet.createRandom().privateKey,
    SOURCE_VAULT_ADDRESS: address('1'),
    SOURCE_TOKEN_ADDRESS: address('2'),
    ATTESTLOCK_ASC_ADDRESS: address('3'),
    CREDIT_POOL_ADDRESS: address('4'),
    MOCK_USD_ADDRESS: address('5'),
    CREDITCOIN_DEPLOYMENT_BLOCK: '1',
  });

describe('submission and restart ordering', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reconciles a saved submission without source RPC or expired-loan revalidation', async () => {
    const store = new MemoryJobStore();
    const job = await store.createJob(hash('1'), address('6'));
    job.evidence = { lockId: hash('2'), creditcoinSubmissionTxHash: hash('3'), collateralUnlockAt: 1 };
    const validate = vi
      .spyOn(SourceLockValidator.prototype, 'validate')
      .mockRejectedValue(new Error('source RPC unavailable'));
    const reconcile = vi
      .spyOn(CreditcoinSubmitter.prototype, 'reconcile')
      .mockResolvedValue({ creditcoinTxHash: hash('3'), lockId: hash('2') });
    const adapter = new AttestcoinChainAdapter(config(), store);
    expect(await adapter.execute(job, async () => undefined)).toMatchObject({
      evidence: { creditcoinTxHash: hash('3') },
    });
    expect(reconcile).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
  });

  it('persists signed bytes before an uncertain broadcast, then reconciles the exact event and line after restart', async () => {
    const settings = config();
    const store = new MemoryJobStore();
    const borrower = address('6');
    const lockId = hash('2');
    const queryId = hash('3');
    await store.createJob(hash('1'), borrower);
    const job = (await store.claimNextRunnable())!;
    const realWallet = new Wallet(settings.CREDITCOIN_RELAYER_PRIVATE_KEY);
    const iface = new Interface(attestLockAscAbi);
    const args = [1, 42, '0x1234', hash('4'), [], hash('5'), []] as const;
    const execute = Object.assign(vi.fn(), {
      staticCall: vi.fn(async () => true),
      estimateGas: vi.fn(async () => 1_000_000n),
      populateTransaction: vi.fn(async () => ({
        to: settings.ATTESTLOCK_ASC_ADDRESS,
        data: iface.encodeFunctionData('verifyLockAndOpenLine', args),
      })),
    });
    const line = {
      borrower,
      queryId,
      limit: 50_000_000n,
      collateralAmount: 100_000_000n,
      maturity: 123n,
      collateralUnlockAt: 456n,
    };
    vi.spyOn(Contract.prototype, 'getFunction').mockImplementation(((name: string) => {
      if (name === 'verifyLockAndOpenLine') return execute;
      if (name === 'lines') return async () => line;
      return async () => true;
    }) as never);
    const wallet = {
      address: realWallet.address,
      populateTransaction: vi.fn(async (request) => ({
        ...request,
        chainId: 102031n,
        nonce: 0,
        type: 2,
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
      })),
      signTransaction: vi.fn((request) => realWallet.signTransaction(request)),
    };
    const provider = {
      broadcastTransaction: vi.fn(async (raw: string) => {
        expect((await store.getSubmission(job.id))?.rawTransaction).toBe(raw);
        expect((await store.getJob(job.id))?.evidence.creditcoinSubmissionTxHash).toBeTruthy();
        throw new Error('RPC response lost after broadcast');
      }),
      getTransactionReceipt: vi.fn<() => Promise<unknown>>(async () => null),
    };
    const submitter = new CreditcoinSubmitter(
      settings,
      provider as unknown as JsonRpcProvider,
      wallet as unknown as Wallet,
      store
    );
    await expect(
      submitter.submit(job, lockId, {}, args, async (status, evidence) => {
        await store.transition(job.id, { status, evidence }, job.leaseToken);
      })
    ).rejects.toMatchObject({ code: 'CREDITCOIN_TX_PENDING' });
    const saved = (await store.getSubmission(job.id))!;
    const restarted = new CreditcoinSubmitter(
      settings,
      provider as unknown as JsonRpcProvider,
      wallet as unknown as Wallet,
      store
    );
    await expect(restarted.reconcile(job, lockId)).rejects.toMatchObject({ code: 'CREDITCOIN_TX_PENDING' });
    expect(provider.broadcastTransaction).toHaveBeenCalledTimes(2);
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    const log = iface.encodeEventLog('LockVerifiedAndLineOpened', [
      queryId,
      lockId,
      borrower,
      line.collateralAmount,
      line.limit,
      line.maturity,
      line.collateralUnlockAt,
    ]);
    provider.getTransactionReceipt.mockResolvedValue({
      hash: saved.txHash,
      status: 1,
      blockNumber: 99,
      gasUsed: 650_000n,
      logs: [{ address: settings.ATTESTLOCK_ASC_ADDRESS, ...log }],
    });
    expect(await restarted.reconcile(job, lockId)).toMatchObject({
      creditcoinTxHash: saved.txHash,
      queryId,
      lockId,
      gasUsed: '650000',
    });
    expect(await store.hasPendingSubmission(saved.relayer)).toBe(false);
    provider.getTransactionReceipt.mockResolvedValue({ hash: saved.txHash, status: 1, logs: [] });
    await expect(restarted.reconcile(job, lockId)).rejects.toMatchObject({
      code: 'CREDITCOIN_EXECUTION_EVENT_MISSING',
    });
  });
});
