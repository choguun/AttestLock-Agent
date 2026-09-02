/// <reference types="vite/client" />

import type { Eip1193Provider } from 'ethers';

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_MOCK_USDC_ADDRESS?: string;
    readonly VITE_LOCK_VAULT_ADDRESS?: string;
    readonly VITE_CREDIT_POOL_ADDRESS?: string;
    readonly VITE_MOCK_USD_ADDRESS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export {};
