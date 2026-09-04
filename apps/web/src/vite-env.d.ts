/// <reference types="vite/client" />

import type { Eip1193Provider } from 'ethers';

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_MOCK_USDC_ADDRESS?: string;
    readonly VITE_LOCK_VAULT_ADDRESS?: string;
    readonly VITE_CREDIT_POOL_ADDRESS?: string;
    readonly VITE_MOCK_USD_ADDRESS?: string;
    readonly VITE_INVALID_TX_HASH?: string;
    readonly VITE_PREVIEW_MODE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}

export {};
