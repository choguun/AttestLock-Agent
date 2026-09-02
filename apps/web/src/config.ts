import {
  CREDITCOIN_EXPLORER_URL,
  CREDITCOIN_RPC_URL,
  CREDITCOIN_TESTNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_EXPLORER_URL,
} from '@attestlock/shared';

export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  mockUsdcAddress: import.meta.env.VITE_MOCK_USDC_ADDRESS ?? '',
  lockVaultAddress: import.meta.env.VITE_LOCK_VAULT_ADDRESS ?? '',
  creditPoolAddress: import.meta.env.VITE_CREDIT_POOL_ADDRESS ?? '',
  mockUsdAddress: import.meta.env.VITE_MOCK_USD_ADDRESS ?? '',
  sepoliaChainId: SEPOLIA_CHAIN_ID,
  creditcoinChainId: CREDITCOIN_TESTNET_CHAIN_ID,
  sepoliaExplorer: SEPOLIA_EXPLORER_URL,
  creditcoinExplorer: CREDITCOIN_EXPLORER_URL,
  creditcoinRpc: CREDITCOIN_RPC_URL,
} as const;

export const isConfigured = Object.values({
  mockUsdcAddress: config.mockUsdcAddress,
  lockVaultAddress: config.lockVaultAddress,
  creditPoolAddress: config.creditPoolAddress,
  mockUsdAddress: config.mockUsdAddress,
}).every(Boolean);
