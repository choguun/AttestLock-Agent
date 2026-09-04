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

async function installWallet(page: Page) {
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
    ({ account, collateralVault, creditPool, event, calls, values }) => {
      let chainId = 11_155_111;
      let nonce = 0;
      let debt = 0;
      let borrowed = 0;
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const transactions = new Map<string, { from: string; to: string; input: string; nonce: number }>();

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
            return '0x';
          }
          if (method === 'eth_sendTransaction') {
            const tx = params[0] as { from: string; to: string; data: string };
            const hash = `0x${(++nonce).toString(16).padStart(64, '0')}`;
            transactions.set(hash, { ...tx, input: tx.data, nonce: nonce - 1 });
            const call = tx.data.slice(0, 10);
            if (call === calls.borrow) {
              debt = 50_000_000;
              borrowed = 50_000_000;
            }
            if (call === calls.repay) {
              debt = 0;
            }
            return hash;
          }
          if (method === 'eth_getTransactionByHash') return transaction(params[0] as string);
          if (method === 'eth_getTransactionReceipt') {
            const hash = params[0] as string;
            const tx = transactions.get(hash)!;
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
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => undefined },
        configurable: true,
      });
      void creditPool;
    },
    {
      account: wallet,
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
      },
      values: {
        balance: encoded.balance,
        line: [encoded.line(0n), encoded.line(50_000_000n)],
        profileInitial: encoded.profile(0n, 0n, 0n),
        profileBorrowed: encoded.profile(50_000_000n, 0n, 50_000_000n),
        profileRepaid: encoded.profile(50_000_000n, 50_000_000n, 0n),
      },
    }
  );
}

function job(txHash: string, status: 'executed' | 'refused') {
  const now = new Date().toISOString();
  return {
    id:
      status === 'executed' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
    txHash,
    borrower: wallet,
    status,
    explanation:
      status === 'executed'
        ? 'The Sepolia lock proof opened a bounded Creditcoin line.'
        : 'The source transaction did not emit the required vault event.',
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

async function mockApi(page: Page) {
  const jobs: ReturnType<typeof job>[] = [];
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
              QueueAuthorization: [
                { name: 'wallet', type: 'address' },
                { name: 'txHash', type: 'bytes32' },
                { name: 'nonce', type: 'string' },
              ],
            },
            message: {
              wallet: body.wallet,
              txHash: body.txHash,
              nonce: '33333333-3333-4333-8333-333333333333',
            },
          },
        },
      });
    }
    if (url.pathname === '/api/jobs' && request.method() === 'POST') {
      const body = request.postDataJSON() as { txHash: string };
      const created = job(body.txHash, body.txHash === junkTx ? 'refused' : 'executed');
      jobs.unshift(created);
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

  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByText('Sepolia', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Public protocol activity')).toContainText('11,630,230');

  await page.getByRole('button', { name: 'Claim faucet' }).click();
  await expect(page.getByRole('status')).toContainText('Faucet transaction confirmed');
  await page.getByRole('button', { name: 'Approve 100' }).click();
  await page.getByRole('button', { name: 'Lock + prove' }).click();
  await expect(page.getByText('VERIFIED')).toBeVisible();
  await expect(page.getByText('Attested height').locator('..')).toContainText('11,630,230');
  await expect(page.getByRole('link', { name: /Proof transaction/ })).toHaveAttribute(
    'href',
    `https://creditcoin-testnet.blockscout.com/tx/${proofTx}`
  );

  await page.getByRole('button', { name: 'Switch to Creditcoin' }).click();
  await expect(page.getByText('Creditcoin testnet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Creditcoin borrower profile')).toContainText('50.0 mUSD');
  await page.getByRole('button', { name: 'Borrow 50' }).click();
  await expect(page.getByRole('status')).toContainText('Borrow confirmed by your wallet');
  await expect(page.getByLabel('Creditcoin borrower profile')).toContainText('50.0 mUSD');
  await page.getByRole('button', { name: 'Repay all' }).click();
  await expect(page.getByRole('status')).toContainText('Repayment confirmed');
  await expect(page.getByText('Current debt').locator('..')).toContainText('0.0 mUSD');

  await page.getByRole('button', { name: 'Prove it fails' }).click();
  await expect(page.getByText('REFUSED')).toBeVisible();
  await expect(page.getByText(/did not emit the required vault event/)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
