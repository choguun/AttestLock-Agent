import {
  CREDITCOIN_EXPLORER_URL,
  CREDITCOIN_RPC_URL,
  CREDITCOIN_TESTNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_EXPLORER_URL,
} from '@attestlock/shared';
import { getAddress, isAddress, ZeroAddress } from 'ethers';

const env = import.meta.env;
const previewMode = env.VITE_PREVIEW_MODE === 'true';

export const config = {
  apiUrl: env.VITE_API_URL ?? (env.DEV ? 'http://localhost:3001' : ''),
  mockUsdcAddress: env.VITE_MOCK_USDC_ADDRESS ?? '',
  lockVaultAddress: env.VITE_LOCK_VAULT_ADDRESS ?? '',
  creditPoolAddress: env.VITE_CREDIT_POOL_ADDRESS ?? '',
  mockUsdAddress: env.VITE_MOCK_USD_ADDRESS ?? '',
  invalidTxHash: env.VITE_INVALID_TX_HASH ?? `0x${'00'.repeat(32)}`,
  previewMode,
  sepoliaChainId: SEPOLIA_CHAIN_ID,
  creditcoinChainId: CREDITCOIN_TESTNET_CHAIN_ID,
  sepoliaExplorer: SEPOLIA_EXPLORER_URL,
  creditcoinExplorer: CREDITCOIN_EXPLORER_URL,
  creditcoinRpc: CREDITCOIN_RPC_URL,
} as const;

function isDeployedAddress(value: string): boolean {
  return isAddress(value) && getAddress(value) !== ZeroAddress;
}

export const isConfigured =
  Boolean(config.apiUrl) &&
  [config.mockUsdcAddress, config.lockVaultAddress, config.creditPoolAddress, config.mockUsdAddress].every(
    isDeployedAddress
  );

if (env.PROD && !previewMode && !isConfigured) {
  throw new Error('Production requires a live API URL and all deployed contract addresses.');
}
