/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TOKEN_FACTORY_ADDRESS?: string;
  readonly VITE_SPOT_POOL_ADDRESS?: string;
  readonly VITE_TECHX_ADDRESS?: string;
  readonly VITE_ENERGYX_ADDRESS?: string;
  readonly VITE_ARCX_ADDRESS?: string;
  readonly VITE_DYNAMIC_ENV_ID?: string;

  /** WalletConnect / Reown project id for the walletConnect connector. */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}
