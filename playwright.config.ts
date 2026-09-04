import { defineConfig, devices } from '@playwright/test';

const liveEnvironment = [
  'VITE_PREVIEW_MODE=false',
  'VITE_API_URL=http://127.0.0.1:4301',
  'VITE_MOCK_USDC_ADDRESS=0x1111111111111111111111111111111111111111',
  'VITE_LOCK_VAULT_ADDRESS=0x2222222222222222222222222222222222222222',
  'VITE_CREDIT_POOL_ADDRESS=0x3333333333333333333333333333333333333333',
  'VITE_ATTESTLOCK_ASC_ADDRESS=0x5555555555555555555555555555555555555555',
  'VITE_MOCK_USD_ADDRESS=0x4444444444444444444444444444444444444444',
  `VITE_INVALID_TX_HASH=0x${'99'.repeat(32)}`,
].join(' ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'VITE_PREVIEW_MODE=true VITE_API_URL=http://127.0.0.1:3999 pnpm --filter @attestlock/web dev --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${liveEnvironment} pnpm --filter @attestlock/web dev --host 127.0.0.1 --port 4174`,
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
