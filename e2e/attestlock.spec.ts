import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AbiCoder, Interface, id } from 'ethers';

const wallet = '0x5555555555555555555555555555555555555555';
const vault = '0x2222222222222222222222222222222222222222';
const pool = '0x3333333333333333333333333333333333333333';
const lockId = `0x${'ab'.repeat(32)}`;
const queryId = `0x${'cd'.repeat(32)}`;
const proofTx = `0x${'34'.repeat(32)}`;
const junkTx = `0x${'99'.repeat(32)}`;

function selector(signature: string) {
  return id(signature).slice(0, 10);
}

async function installWallet(page: Page, hold = '', initialDebt = 0) {
  const lockEvent = new Interface([
    'event CollateralLocked(bytes32 indexed lockId,address indexed borrower,address indexed token,uint256 amount,uint64 unlockAt)',
  ]).encodeEventLog('CollateralLocked', [
    lockId,
    wallet,
    '0x1111111111111111111111111111111111111111',
    100_000_000n,
    2_000_000_000,
  ]);
  const encoded = {
    balance: AbiCoder.defaultAbiCoder().encode(['uint256'], [100_000_000n]),
    line: (debt: bigint) =>
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'uint256', 'uint64', 'uint256', 'uint64', 'bytes32'],
        [wallet, 50_000_000n, debt, 2_000_000_000, 100_000_000n, 2_000_100_000, queryId]
      ),
    profile: (borrowed: bigint, repaid: bigint, debt: bigint) =>
      AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        [1n, 50_000_000n, borrowed, repaid, debt]
      ),
  };
  await page.addInitScript(
    ({ account, collateralVault, creditPool, event, calls, values, hold, initialDebt }) => {
      const previous = JSON.parse(localStorage.getItem('attestlock.mockchain') ?? 'null');
      let chainId = previous?.chainId ?? 11_155_111;
      let nonce = previous?.nonce ?? 0;
      let debt = previous?.debt ?? initialDebt;
      let borrowed = previous?.borrowed ?? initialDebt;
      let allowance = previous?.allowance ?? 0;
      let held = previous?.held ?? hold;
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const transactions = new Map<
        string,
        { from: string; to: string; input: string; nonce: number; mined?: boolean }
      >(previous?.transactions ?? []);
      const save = () =>
        localStorage.setItem(
          'attestlock.mockchain',
          JSON.stringify({ chainId, nonce, debt, borrowed, allowance, held, transactions: [...transactions] })
        );
      (window as unknown as { __mine(): void }).__mine = () => {
        held = '';
        save();
      };

      function hex(value: number | bigint) {
        return `0x${BigInt(value).toString(16)}`;
      }

      function transaction(hash: string) {
        const tx = transactions.get(hash)!;
        return {
          hash,
          blockHash: `0x${'77'.repeat(32)}`,
          blockNumber: '0x64',
          transactionIndex: '0x0',
          from: tx.from,
          to: tx.to,
          gas: '0x30d40',
          gasPrice: '0x3b9aca00',
          maxPriorityFeePerGas: '0x3b9aca00',
          maxFeePerGas: '0x3b9aca00',
          input: tx.input,
          nonce: hex(tx.nonce),
          value: '0x0',
          type: '0x2',
          accessList: [],
          chainId: hex(chainId),
          v: '0x0',
          r: `0x${'01'.repeat(32)}`,
          s: `0x${'02'.repeat(32)}`,
          yParity: '0x0',
        };
      }

      const provider = {
        on(eventName: string, listener: (...args: unknown[]) => void) {
          const group = listeners.get(eventName) ?? new Set();
          group.add(listener);
          listeners.set(eventName, group);
        },
        removeListener(eventName: string, listener: (...args: unknown[]) => void) {
          listeners.get(eventName)?.delete(listener);
        },
        async request({ method, params = [] }: { method: string; params?: unknown[] }) {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
          if (method === 'eth_chainId') return hex(chainId);
          if (method === 'net_version') return String(chainId);
          if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
            const requested = Number((params[0] as { chainId: string }).chainId);
            chainId = requested;
            save();
            for (const listener of listeners.get('chainChanged') ?? []) listener(hex(chainId));
            return null;
          }
          if (method === 'eth_signTypedData_v4') return `0x${'11'.repeat(65)}`;
          if (method === 'eth_blockNumber') return '0x64';
          if (method === 'eth_getTransactionCount') return hex(nonce);
          if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
          if (method === 'eth_estimateGas') return '0x30d40';
          if (method === 'eth_call') {
            const tx = params[0] as { to: string; data: string };
            const call = tx.data.slice(0, 10);
            if (call === calls.lines) return values.line[debt === 0 ? 0 : 1];
            if (call === calls.profile) {
              if (debt === 0 && borrowed > 0) return values.profileRepaid;
              return debt === 0 ? values.profileInitial : values.profileBorrowed;
            }
            if (call === calls.balance) return values.balance;
            if (call === calls.allowance) return allowance ? values.balance : values.zero;
            return '0x';
          }
          if (method === 'eth_sendTransaction') {
            const tx = params[0] as { from: string; to: string; data: string };
            const hash = `0x${(++nonce).toString(16).padStart(64, '0')}`;
            transactions.set(hash, { ...tx, input: tx.data, nonce: nonce - 1 });
            const call = tx.data.slice(0, 10);
            void call;
            save();
            return hash;
          }
          if (method === 'eth_getTransactionByHash') return transaction(params[0] as string);
          if (method === 'eth_getTransactionReceipt') {
            const hash = params[0] as string;
            const tx = transactions.get(hash)!;
            if (!tx || (held && tx.input.startsWith(held))) return null;
            if (!tx.mined) {
              if (tx.input.startsWith(calls.borrow)) {
                debt = 50_000_000;
                borrowed += 50_000_000;
              }
              if (tx.input.startsWith(calls.repay)) debt = 0;
              if (tx.input.startsWith(calls.approve)) allowance = 100_000_000;
              tx.mined = true;
              save();
            }
            const isLock = tx.input.slice(0, 10) === calls.lock;
            return {
              transactionHash: hash,
              transactionIndex: '0x0',
              blockHash: `0x${'77'.repeat(32)}`,
              blockNumber: '0x64',
              from: tx.from,
              to: tx.to,
              cumulativeGasUsed: '0x30d40',
              gasUsed: '0x30d40',
              contractAddress: null,
              logsBloom: `0x${'00'.repeat(256)}`,
              status: '0x1',
              type: '0x2',
              effectiveGasPrice: '0x3b9aca00',
              logs: isLock
                ? [
                    {
                      address: collateralVault,
                      blockHash: `0x${'77'.repeat(32)}`,
                      blockNumber: '0x64',
                      data: event.data,
                      logIndex: '0x0',
                      removed: false,
                      topics: event.topics,
                      transactionHash: hash,
                      transactionIndex: '0x0',
                    },
                  ]
                : [],
            };
          }
          throw new Error(`Unhandled wallet RPC method: ${method}`);
        },
      };
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
      const streams = new Set<{
        emit(name: string, detail: unknown): void;
        close(): void;
      }>();
      class MockEventSource {
        private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
        constructor(url: string) {
          void url;
          streams.add(this);
        }
        addEventListener(name: string, listener: (event: MessageEvent) => void) {
          const group = this.listeners.get(name) ?? new Set();
          group.add(listener);
          this.listeners.set(name, group);
        }
        emit(name: string, detail: unknown) {
          const event = new MessageEvent(name, { data: JSON.stringify(detail) });
          for (const listener of this.listeners.get(name) ?? []) listener(event);
        }
        close() {
          streams.delete(this);
        }
      }
      Object.defineProperty(window, 'EventSource', { value: MockEventSource, configurable: true });
      (window as unknown as { __emitAttestLockJob(job: unknown): void }).__emitAttestLockJob = (job) => {
        for (const stream of streams) stream.emit('job', job);
      };
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => undefined },
        configurable: true,
      });
      void creditPool;
    },
    {
      account: wallet,
      hold,
      initialDebt,
      collateralVault: vault,
      creditPool: pool,
      event: lockEvent,
      calls: {
        balance: selector('balanceOf(address)'),
        borrow: selector('borrow(bytes32,uint256)'),
        lines: selector('lines(bytes32)'),
        lock: selector('lock(uint256,uint64)'),
        profile: selector('borrowerProfiles(address)'),
        repay: selector('repay(bytes32,uint256)'),
        approve: selector('approve(address,uint256)'),
        allowance: selector('allowance(address,address)'),
      },
      values: {
        balance: encoded.balance,
        zero: AbiCoder.defaultAbiCoder().encode(['uint256'], [0n]),
        line: [encoded.line(0n), encoded.line(50_000_000n)],
        profileInitial: encoded.profile(0n, 0n, 0n),
        profileBorrowed: encoded.profile(50_000_000n, 0n, 50_000_000n),
        profileRepaid: encoded.profile(50_000_000n, 50_000_000n, 0n),
      },
    }
  );
}

function job(txHash: string, status: 'queued' | 'proving' | 'executed' | 'refused') {
  const now = new Date().toISOString();
  return {
    id:
      status === 'refused' ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
    txHash,
    borrower: wallet,
    status,
    explanation:
      status === 'executed'
        ? 'The Sepolia lock proof opened a bounded Creditcoin line.'
        : status === 'refused'
          ? 'The source transaction did not emit the required vault event.'
          : status === 'proving'
            ? 'Attestation confirmed. Generating the official proof payload.'
            : 'Proof job queued for deterministic validation.',
    attemptCount: 1,
    nextAttemptAt: null,
    evidence:
      status === 'executed'
        ? {
            lockId,
            queryId,
            creditcoinTxHash: proofTx,
            proofMerkleRoot: `0x${'ee'.repeat(32)}`,
            attestedHeight: 11_630_230,
            creditcoinBlockNumber: 9_876_543,
            gasUsed: '650000',
            processingDurationMs: 42_000,
          }
        : {},
    errorCode: status === 'refused' ? 'LOCK_EVENT_MISSING' : null,
    createdAt: now,
    updatedAt: now,
  };
}

async function mockApi(page: Page, jobs: ReturnType<typeof job>[] = []) {
  await page.route('http://127.0.0.1:4301/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/stats') {
      return route.fulfill({
        json: {
          generatedAt: new Date().toISOString(),
          totalJobs: 3,
          uniqueWallets: 2,
          executedJobs: 1,
          refusedJobs: 1,
          failedJobs: 0,
          latestAttestedHeight: 11_630_230,
          linesOpened: 1,
          borrowersWhoDrew: 1,
          totalCreditOpenedAtomic: '50000000',
          totalBorrowedAtomic: '50000000',
          totalRepaidAtomic: '50000000',
          outstandingDebtAtomic: '0',
        },
      });
    }
    if (url.pathname === '/api/jobs' && request.method() === 'GET') return route.fulfill({ json: jobs });
    if (url.pathname === '/api/challenges') {
      const body = request.postDataJSON() as { wallet: string; txHash: string };
      return route.fulfill({
        json: {
          nonce: '33333333-3333-4333-8333-333333333333',
          wallet: body.wallet,
          txHash: body.txHash,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          typedData: {
            domain: { name: 'AttestLock Agent', version: '1', chainId: 11_155_111, verifyingContract: vault },
            types: {
              QueueProofJob: [
                { name: 'wallet', type: 'address' },
                { name: 'txHash', type: 'bytes32' },
                { name: 'nonce', type: 'string' },
                { name: 'expiresAt', type: 'uint64' },
                { name: 'apiOrigin', type: 'string' },
              ],
            },
            primaryType: 'QueueProofJob',
            message: {
              wallet: body.wallet,
              txHash: body.txHash,
              nonce: '33333333-3333-4333-8333-333333333333',
              expiresAt: Math.floor(Date.now() / 1000) + 60,
              apiOrigin: 'http://127.0.0.1:4301',
            },
          },
        },
      });
    }
    if (url.pathname === '/api/jobs' && request.method() === 'POST') {
      const body = request.postDataJSON() as { txHash: string };
      const created = job(body.txHash, body.txHash === junkTx ? 'refused' : 'queued');
      jobs.unshift(created);
      if (body.txHash !== junkTx) {
        setTimeout(() => {
          Object.assign(created, job(body.txHash, 'proving'));
          void page
            .evaluate((next) => {
              (window as unknown as { __emitAttestLockJob(job: unknown): void }).__emitAttestLockJob(next);
            }, created)
            .catch(() => undefined);
        }, 150);
        setTimeout(() => {
          Object.assign(created, job(body.txHash, 'executed'));
          void page
            .evaluate((next) => {
              (window as unknown as { __emitAttestLockJob(job: unknown): void }).__emitAttestLockJob(next);
            }, created)
            .catch(() => undefined);
        }, 900);
      }
      return route.fulfill({
        status: 202,
        json: created,
      });
    }
    return route.abort();
  });
}

test('preview mode fails closed without deployments', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('.banner')).toContainText('judge-safe preview mode');
  await expect(page.getByRole('button', { name: 'Lock + prove' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Borrow 50' })).toBeDisabled();
  await expect(page.getByLabel('Public protocol activity')).toContainText('—');
});

test('mocked judge path remains wallet-signed and exposes evidence', async ({ page }) => {
  await installWallet(page);
  await mockApi(page);
  await page.goto('http://127.0.0.1:4174');

  await expect(page.getByRole('button', { name: '0x5555…5555' })).toBeVisible();
  await expect(page.getByText('Sepolia', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Public protocol activity')).toContainText('11,630,230');

  await page.getByRole('button', { name: 'Claim faucet' }).click();
  await expect(page.locator('.notice')).toContainText('Faucet transaction confirmed');
  await page.getByRole('button', { name: 'Approve 100' }).click();
  await page.getByRole('button', { name: 'Lock + prove' }).click();
  await expect(page.getByLabel('Proof job progress').locator('[aria-current="step"]')).toContainText(
    'proving'
  );
  await page.reload();
  await expect(page.getByText('Sepolia', { exact: true })).toBeVisible();
  await expect(page.getByText('VERIFIED', { exact: true })).toBeVisible();
  await expect(page.getByText('Attested height').locator('..')).toContainText('11,630,230');
  await expect(page.getByRole('link', { name: /Proof transaction/ })).toHaveAttribute(
    'href',
    `https://creditcoin-testnet.blockscout.com/tx/${proofTx}`
  );

  await page.getByRole('button', { name: 'Switch to Creditcoin' }).click();
  await expect(page.getByText('Creditcoin testnet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Creditcoin borrower profile')).toContainText('50.0 mUSD');
  await page.getByRole('button', { name: 'Borrow 50' }).click();
  await expect(page.locator('.notice')).toContainText('Borrow confirmed by your wallet');
  await expect(page.getByLabel('Creditcoin borrower profile')).toContainText('50.0 mUSD');
  await page.getByRole('button', { name: 'Repay all' }).click();
  await expect(page.locator('.notice')).toContainText('Repayment confirmed');
  await expect(page.getByText('Current debt').locator('..')).toContainText('0.0 mUSD');

  await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
  await page.getByRole('button', { name: 'Prove it fails' }).click();
  await expect(page.getByText('REFUSED', { exact: true })).toBeVisible();
  await expect(page.getByText(/did not emit the required vault event/)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

for (const stage of ['approve', 'lock', 'borrow', 'repay_approve', 'repay'] as const) {
  test(`refresh during ${stage} recovers the receipt without a duplicate wallet send`, async ({ page }) => {
    const credit = ['borrow', 'repay_approve', 'repay'].includes(stage);
    const held = selector(
      stage.includes('approve')
        ? 'approve(address,uint256)'
        : stage === 'lock'
          ? 'lock(uint256,uint64)'
          : `${stage}(bytes32,uint256)`
    );
    await installWallet(page, held, stage.startsWith('repay') ? 50_000_000 : 0);
    await mockApi(page, credit ? [job(`0x${'01'.repeat(32)}`, 'executed')] : []);
    await page.goto('http://127.0.0.1:4174');
    if (credit) await page.getByRole('button', { name: 'Switch to Creditcoin' }).click();
    const button =
      stage === 'approve'
        ? 'Approve 100'
        : stage === 'lock'
          ? 'Lock + prove'
          : stage === 'borrow'
            ? 'Borrow 50'
            : 'Repay all';
    await page.getByRole('button', { name: button }).click();
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('attestlock.mockchain')!).transactions.length)
      )
      .toBe(stage === 'repay' ? 2 : 1);
    const sends = await page.evaluate(
      () => JSON.parse(localStorage.getItem('attestlock.mockchain')!).transactions.length
    );
    await page.reload();
    await expect(page.getByText(/A wallet transaction is pending/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: stage.startsWith('repay') ? /Repay all|Continue repayment/ : button })
    ).toBeDisabled();
    await page.evaluate(() => (window as unknown as { __mine(): void }).__mine());
    await expect(page.getByText(/A wallet transaction is pending/)).not.toBeVisible({ timeout: 12_000 });
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('attestlock.mockchain')!).transactions.length)
    ).toBe(sends);
    if (stage === 'lock')
      await expect(page.getByRole('button', { name: 'Resume authorization' })).toBeVisible();
    if (stage === 'repay_approve')
      await expect(page.getByRole('button', { name: 'Continue repayment' })).toBeEnabled();
  });
}
