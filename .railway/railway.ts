import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: 'asia-southeast1-eqsg3a' });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'asia-southeast1-eqsg3a',
    sizeMB: 5000,
  });
  const attestlockWeb = service('attestlock-web', {
    source: github('choguun/AttestLock-Agent'),
    build: {
      buildCommand: 'pnpm --filter @attestlock/shared build && pnpm --filter @attestlock/web build',
      buildEnvironment: 'V3',
      builder: 'RAILPACK',
      watchPatterns: [
        'apps/web/**',
        'packages/shared/**',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
    },
    start: '',
    healthcheck: '/',
    healthcheckTimeout: 30,
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      RAILPACK_NODE_VERSION: preserve(),
      RAILPACK_SPA_OUTPUT_DIR: preserve(),
      RAILPACK_STATIC_FILE_ROOT: preserve(),
      VITE_PREVIEW_MODE: preserve(),
      VITE_API_URL: preserve(),
      VITE_MOCK_USDC_ADDRESS: preserve(),
      VITE_LOCK_VAULT_ADDRESS: preserve(),
      VITE_CREDIT_POOL_ADDRESS: preserve(),
      VITE_ATTESTLOCK_ASC_ADDRESS: preserve(),
      VITE_MOCK_USD_ADDRESS: preserve(),
      VITE_INVALID_TX_HASH: preserve(),
    },
  });
  const attestlockWorker = service('attestlock-worker', {
    source: github('choguun/AttestLock-Agent'),
    build: {
      buildCommand: 'pnpm --filter @attestlock/shared build && pnpm --filter @attestlock/worker build',
      buildEnvironment: 'V3',
      builder: 'RAILPACK',
      watchPatterns: [
        'apps/worker/**',
        'packages/shared/**',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'tsconfig.base.json',
      ],
    },
    start: 'pnpm --filter @attestlock/worker start',
    healthcheck: '/health',
    healthcheckTimeout: 120,
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyMaxRetries: 5 },
    env: {
      ATTESTLOCK_ASC_ADDRESS: preserve(),
      CORS_ORIGINS: preserve(),
      CREDITCOIN_DEPLOYMENT_BLOCK: preserve(),
      CREDITCOIN_RELAYER_PRIVATE_KEY: preserve(),
      CREDITCOIN_RPC_URL: preserve(),
      CREDIT_POOL_ADDRESS: preserve(),
      DATABASE_URL: preserve(),
      MAX_ATTESTATION_STALENESS_MS: preserve(),
      MAX_JOBS_PER_WALLET_PER_DAY: preserve(),
      MAX_PROOF_BUILDER_LAG_BLOCKS: preserve(),
      MAX_REQUESTS_PER_MINUTE: preserve(),
      MIN_RELAYER_BALANCE_WEI: preserve(),
      MOCK_USD_ADDRESS: preserve(),
      PROOF_BUILDER_URL: preserve(),
      PUBLIC_API_ORIGIN: preserve(),
      RAILPACK_NODE_VERSION: preserve(),
      SOURCE_CHAIN_RPC_URL: preserve(),
      SOURCE_TOKEN_ADDRESS: preserve(),
      SOURCE_VAULT_ADDRESS: preserve(),
      TRUSTED_PROXY_CIDRS: preserve(),
    },
  });

  return project('attestlock-agent', {
    resources: [Postgres, attestlockWeb, attestlockWorker, postgresVolume],
  });
});
