import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const addressKeys = [
  'VITE_MOCK_USDC_ADDRESS',
  'VITE_LOCK_VAULT_ADDRESS',
  'VITE_CREDIT_POOL_ADDRESS',
  'VITE_ATTESTLOCK_ASC_ADDRESS',
  'VITE_MOCK_USD_ADDRESS',
] as const;

function assertLiveConfiguration(env: Record<string, string | undefined>) {
  const api = new URL(env.VITE_API_URL ?? '');
  if (api.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(api.hostname)) {
    throw new Error('Live production requires a public HTTPS VITE_API_URL.');
  }
  for (const key of addressKeys) {
    const value = env[key] ?? '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(value) || BigInt(value) === 0n) {
      throw new Error(`Live production requires a nonzero ${key}.`);
    }
  }
  const invalidTxHash = env.VITE_INVALID_TX_HASH ?? '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(invalidTxHash) || BigInt(invalidTxHash) === 0n) {
    throw new Error('Live production requires a nonzero VITE_INVALID_TX_HASH.');
  }
}

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build' && env.VITE_PREVIEW_MODE !== 'true') assertLiveConfiguration(env);
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test-setup.ts',
    },
  };
});
