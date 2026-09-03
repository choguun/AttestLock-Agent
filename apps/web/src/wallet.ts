import {
  BrowserProvider,
  Contract,
  Interface,
  formatUnits,
  getAddress,
  parseUnits,
  type Eip1193Provider,
  type JsonRpcSigner,
} from 'ethers';
import {
  CREDITCOIN_TESTNET_CHAIN_ID,
  MIN_COLLATERAL,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_RPC_URL,
  creditPoolAbi,
  lockVaultAbi,
  mockUsdAbi,
  mockUsdcAbi,
} from '@attestlock/shared';
import { config } from './config';

export interface WalletSession {
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
}

type ObservableProvider = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function injected(): Eip1193Provider {
  if (!window.ethereum) throw new Error('Install an EIP-1193 wallet such as MetaMask to continue.');
  return window.ethereum;
}

export async function connectWallet(): Promise<WalletSession> {
  const provider = new BrowserProvider(injected());
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  return { provider, signer, address: await signer.getAddress(), chainId: Number(network.chainId) };
}

export async function switchChain(chainId: number): Promise<WalletSession> {
  const ethereum = injected();
  const hexChainId = `0x${chainId.toString(16)}`;
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    const isCreditcoin = chainId === CREDITCOIN_TESTNET_CHAIN_ID;
    if (!isCreditcoin && chainId !== SEPOLIA_CHAIN_ID) throw error;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexChainId,
          chainName: isCreditcoin ? 'Creditcoin Testnet' : 'Sepolia',
          nativeCurrency: isCreditcoin
            ? { name: 'Test Creditcoin', symbol: 'tCTC', decimals: 18 }
            : { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [isCreditcoin ? config.creditcoinRpc : SEPOLIA_RPC_URL],
          blockExplorerUrls: [isCreditcoin ? config.creditcoinExplorer : SEPOLIA_EXPLORER_URL],
        },
      ],
    });
  }
  return connectWallet();
}

export async function faucet(signer: JsonRpcSigner): Promise<string> {
  const token = new Contract(config.mockUsdcAddress, mockUsdcAbi, signer);
  const tx = await token.getFunction('faucet')();
  await tx.wait();
  return tx.hash;
}

export async function approveCollateral(signer: JsonRpcSigner): Promise<string> {
  const token = new Contract(config.mockUsdcAddress, mockUsdcAbi, signer);
  const tx = await token.getFunction('approve')(config.lockVaultAddress, MIN_COLLATERAL);
  await tx.wait();
  return tx.hash;
}

export async function lockCollateral(signer: JsonRpcSigner): Promise<{ txHash: string; lockId: string }> {
  const unlockAt = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60;
  const vault = new Contract(config.lockVaultAddress, lockVaultAbi, signer);
  const tx = await vault.getFunction('lock')(MIN_COLLATERAL, unlockAt);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Collateral lock was not successful.');
  const iface = new Interface(lockVaultAbi);
  for (const log of receipt.logs) {
    try {
      const event = iface.parseLog(log);
      if (event?.name === 'CollateralLocked') return { txHash: tx.hash, lockId: String(event.args.lockId) };
    } catch {
      // Ignore unrelated logs.
    }
  }
  throw new Error('CollateralLocked evidence was missing from the receipt.');
}

export interface CreditLineView {
  borrower: string;
  limit: string;
  debt: string;
  maturity: number;
  collateralAmount: string;
  collateralUnlockAt: number;
}

export function canBorrowLine(
  address: string | undefined,
  chainId: number | undefined,
  lockId: string | undefined,
  line: CreditLineView | null
): boolean {
  return Boolean(
    address &&
    chainId === CREDITCOIN_TESTNET_CHAIN_ID &&
    lockId &&
    line &&
    getAddress(line.borrower) === getAddress(address) &&
    Number(line.debt) < Number(line.limit) &&
    line.maturity > Math.floor(Date.now() / 1000)
  );
}

export async function readCreditLine(signer: JsonRpcSigner, lockId: string): Promise<CreditLineView> {
  const pool = new Contract(config.creditPoolAddress, creditPoolAbi, signer);
  const line = await pool.getFunction('lines')(lockId);
  return {
    borrower: getAddress(String(line.borrower)),
    limit: formatUnits(line.limit, 6),
    debt: formatUnits(line.debt, 6),
    maturity: Number(line.maturity),
    collateralAmount: formatUnits(line.collateralAmount, 6),
    collateralUnlockAt: Number(line.collateralUnlockAt),
  };
}

export async function readBalances(
  session: WalletSession
): Promise<Partial<{ collateral: string; credit: string }>> {
  if (session.chainId === SEPOLIA_CHAIN_ID) {
    const collateral = new Contract(config.mockUsdcAddress, mockUsdcAbi, session.signer);
    return { collateral: formatUnits(await collateral.getFunction('balanceOf')(session.address), 6) };
  }
  if (session.chainId === CREDITCOIN_TESTNET_CHAIN_ID) {
    const credit = new Contract(config.mockUsdAddress, mockUsdAbi, session.signer);
    return { credit: formatUnits(await credit.getFunction('balanceOf')(session.address), 6) };
  }
  return {};
}

export function watchWallet(onChange: () => void): () => void {
  const provider = injected() as ObservableProvider;
  const listener = () => onChange();
  provider.on?.('accountsChanged', listener);
  provider.on?.('chainChanged', listener);
  return () => {
    provider.removeListener?.('accountsChanged', listener);
    provider.removeListener?.('chainChanged', listener);
  };
}

export function formatTimestamp(timestamp: number): string {
  return timestamp > 0 ? new Date(timestamp * 1000).toLocaleString() : '—';
}

export function walletErrorMessage(error: unknown): string {
  const candidate = error as { code?: number | string; shortMessage?: string; message?: string };
  if (candidate?.code === 4001 || candidate?.code === 'ACTION_REJECTED') {
    return 'Wallet request was rejected.';
  }
  return candidate?.shortMessage ?? candidate?.message ?? String(error);
}

export async function borrow(signer: JsonRpcSigner, lockId: string, amount: string): Promise<string> {
  const pool = new Contract(config.creditPoolAddress, creditPoolAbi, signer);
  const tx = await pool.getFunction('borrow')(lockId, parseUnits(amount, 6));
  await tx.wait();
  return tx.hash;
}

export async function repay(signer: JsonRpcSigner, lockId: string, amount: string): Promise<string> {
  const value = parseUnits(amount, 6);
  const stable = new Contract(config.mockUsdAddress, mockUsdAbi, signer);
  const approval = await stable.getFunction('approve')(config.creditPoolAddress, value);
  await approval.wait();
  const pool = new Contract(config.creditPoolAddress, creditPoolAbi, signer);
  const tx = await pool.getFunction('repay')(lockId, value);
  await tx.wait();
  return tx.hash;
}

export function shortAddress(address: string): string {
  const value = getAddress(address);
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function chainLabel(chainId: number): string {
  if (chainId === SEPOLIA_CHAIN_ID) return 'Sepolia';
  if (chainId === CREDITCOIN_TESTNET_CHAIN_ID) return 'Creditcoin testnet';
  return `Unsupported (${chainId})`;
}
