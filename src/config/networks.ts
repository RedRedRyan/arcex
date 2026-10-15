/**
 * config/networks.ts — the single source of truth for every chain-specific
 * value in the app.
 *
 * RULE: no chain id, RPC URL, explorer URL, contract address, or token decimal
 * may appear anywhere else in the codebase. Components and data hooks read from
 * `NETWORKS` / `activeNetworkConfig()` instead.
 *
 * Arc-specific behavior (from docs.arc.io/arc/references/evm-differences):
 *  - USDC is the native gas token. The NATIVE balance uses 18 decimals while
 *    the ERC-20 interface uses 6. Display native gas at 18 decimals; use the
 *    ERC-20 interface (6 decimals) for all transfer amounts.
 *  - The mempool enforces a 20 Gwei `maxFeePerGas` floor and silently drops
 *    anything lower — no revert, the tx simply never lands. `minGasPriceWei`
 *    below is applied to every Arc write.
 *
 * Sources:
 *  - https://docs.arc.io/arc/references/connect-to-arc (chain ids, RPCs)
 *  - https://docs.arc.io/arc/references/contract-addresses (addresses)
 *  - https://docs.arc.io/arc/references/evm-differences (gas, decimals)
 */

import { defineChain } from "viem";
import type { Chain } from "viem";
import { base, mainnet } from "viem/chains";
import type { AssetConfig } from "./assets";
import {
  MAINNET_ARCX,
  MAINNET_ENERGYX,
  MAINNET_SPOT_POOL,
  MAINNET_TECHX,
  MAINNET_TOKEN_FACTORY,
  ZERO_ADDRESS,
} from "./addresses";

/** Sentinel for "not deployed on this network yet". */
export const NOT_DEPLOYED = ZERO_ADDRESS;

export type NetworkName = "testnet" | "mainnet";

/** Feature keys that can be gated per network. */
export type FeatureKey = "bridge" | "faucet" | "trade" | "createToken" | "earn";

export interface PairConfig {
  id: number;
  /** Base token ticker, e.g. "TECHx" or "BTC". */
  ticker: string;
  /** Human name, e.g. "TechX". */
  name: string;
  /** Quote asset — always USDC. */
  quote: string;
  /** Base token address on this network. */
  baseToken: `0x${string}`;
  /** Display color. */
  color: string;
}

/** One chain where the wallet can hold USDC, for the Portfolio USDC list. */
export interface UsdcChainConfig {
  chainId: number;
  /** Display label, e.g. "Arc" or "Ethereum". */
  label: string;
  explorerUrl: string;
  /** USDC ERC-20 contract address on this chain. */
  tokenAddress: `0x${string}`;
}

export interface SwapTokenConfig {
  id: string;
  symbol: string;
  name: string;
  address: `0x${string}`;
  chainId: number;
  networkId: string;
  networkName: string;
  explorerUrl: string;
  decimals: number;
  color: string;
}

export interface NetworkConfig {
  name: NetworkName;
  /** UI label. */
  label: string;
  /** Short badge label. */
  shortLabel: string;
  /** EVM chain id. */
  chainId: number;
  /** RPC URLs, primary first. */
  rpcUrls: string[];
  /** Block explorer base URL (no trailing slash). */
  explorerUrl: string;
  /**
   * USDC as seen by the ERC-20 interface. On Arc this address serves both the
   * native and ERC-20 views of the same balance.
   */
  usdcAddress: `0x${string}`;
  /**
   * Decimals for TRANSFER amounts. Always 6 — including on Arc, where the
   * native gas token uses 18 but the ERC-20 interface uses 6.
   */
  usdcDecimals: number;
  /** Decimals for the NATIVE gas balance display. */
  nativeDecimals: number;
  /** Gas token symbol shown in the UI. */
  gasSymbol: string;
  /**
   * Arc's mempool drops any tx whose `maxFeePerGas` is below 20 Gwei. Applied
   * to every write on Arc networks.
   */
  minGasPriceWei: bigint;
  /** True on Arc networks (native USDC gas + the rules that follow from it). */
  isArc: boolean;
  /**
   * Buffer held back when the user clicks "Max" on Arc, so they keep enough
   * native USDC to pay gas. 18-decimal native units.
   */
  gasBufferWei: bigint;
  /** Testnet faucet available? */
  faucetAvailable: boolean;
  /** Per-feature availability. */
  features: Record<FeatureKey, boolean>;
  /** Deployed contracts. ZERO_ADDRESS means "not deployed here". */
  contracts: {
    /** Permissionless ERC-20 creation. */
    tokenFactory: `0x${string}`;
    /** Constant-product AMM with a dynamic pair registry. */
    spotPool: `0x${string}`;
  };
  /** Tradable pairs on this network. */
  pairs: PairConfig[];
  /**
   * Chains on which the wallet may hold USDC, used by the Portfolio page to
   * list per-chain balances. Mainnet lists Arc, Ethereum and Base; testnet
   * lists only its own chain.
   */
  usdcChains: UsdcChainConfig[];
  /**
   * ERC-20 assets held on this network. Mainnet assets are derived from its
   * configured spot pairs; testnet uses `pairs` for its synthetic holdings.
   */
  assets: readonly AssetConfig[];
  /** viem chain object, used by wagmi transports. */
  chain: Chain;
}

// ── Chain definitions ────────────────────────────────────────────────────────

export const arcTestnetChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const arcMainnetChain = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://explorer.arc.io" } },
});

/** 20 Gwei, the Arc mempool floor. */
const ARC_MIN_GAS_WEI = 20_000_000_000n;

/** 0.01 native USDC held back for gas on Arc (18 decimals). */
const ARC_GAS_BUFFER_WEI = 10_000_000_000_000_000n;

/**
 * Deployed contract addresses.
 *
 * MAINNET: deployed + verified on Arc Mainnet (chain 5042), 2026-10-14.
 * TESTNET: not deployed yet — stays NOT_DEPLOYED until a testnet deploy.
 *
 * Each value reads its VITE_ env var first (so a redeploy repoints the app
 * without a code change) and falls back to the deployed mainnet address.
 */
const deployed = (envKey: string, fallback: `0x${string}`): `0x${string}` => {
  const fromEnv = import.meta.env[envKey] as string | undefined;
  return (fromEnv as `0x${string}` | undefined) ?? fallback;
};

/**
 * Mainnet seed pairs — the three USDC-quoted pools deployed with
 * SpotPoolFactoryV2 (pair ids 0/1/2). Base token addresses resolve from the
 * env with the deployed mainnet addresses as fallback.
 */
const mainnetPairs: PairConfig[] = [
  {
    id: 0,
    ticker: "TECHx",
    name: "TechX",
    quote: "USDC",
    baseToken: deployed("VITE_TECHX_ADDRESS", MAINNET_TECHX),
    color: "#fb4f1f",
  },
  {
    id: 1,
    ticker: "ENERGYx",
    name: "EnergyX",
    quote: "USDC",
    baseToken: deployed("VITE_ENERGYX_ADDRESS", MAINNET_ENERGYX),
    color: "#ffa04d",
  },
  {
    id: 2,
    ticker: "ARCx",
    name: "ArcX",
    quote: "USDC",
    baseToken: deployed("VITE_ARCX_ADDRESS", MAINNET_ARCX),
    color: "#ffb347",
  },
];

/** Testnet has no deployed pairs — empty until a testnet deploy. */
const testnetPairs: PairConfig[] = [];

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: "testnet",
    label: "Arc Testnet",
    shortLabel: "Testnet",
    chainId: arcTestnetChain.id,
    rpcUrls: [
      "https://rpc.testnet.arc.io",
      "https://rpc.blockdaemon.testnet.arc.io",
      "https://rpc.drpc.testnet.arc.io",
    ],
    explorerUrl: "https://testnet.arcscan.app",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    usdcDecimals: 6,
    nativeDecimals: 18,
    gasSymbol: "USDC",
    minGasPriceWei: ARC_MIN_GAS_WEI,
    isArc: true,
    gasBufferWei: ARC_GAS_BUFFER_WEI,
    faucetAvailable: true,
    features: {
      bridge: false,
      faucet: true,
      trade: false,
      createToken: false,
      earn: false,
    },
    // Not deployed on testnet yet — trade/create stay off.
    contracts: {
      tokenFactory: NOT_DEPLOYED,
      spotPool: NOT_DEPLOYED,
    },
    pairs: testnetPairs,
    usdcChains: [
      {
        chainId: arcTestnetChain.id,
        label: "Arc Testnet",
        explorerUrl: "https://testnet.arcscan.app",
        tokenAddress: "0x3600000000000000000000000000000000000000",
      },
    ],
    assets: [],
    chain: arcTestnetChain,
  },

  mainnet: {
    name: "mainnet",
    label: "Arc Mainnet",
    shortLabel: "Mainnet",
    chainId: arcMainnetChain.id,
    rpcUrls: [
      "https://rpc.mainnet.arc.io",
      "https://rpc.blockdaemon.mainnet.arc.io",
      "https://rpc.drpc.mainnet.arc.io",
    ],
    explorerUrl: "https://explorer.arc.io",
    // Same USDC address on testnet and mainnet, per docs.arc.io.
    usdcAddress: "0x3600000000000000000000000000000000000000",
    usdcDecimals: 6,
    nativeDecimals: 18,
    gasSymbol: "USDC",
    minGasPriceWei: ARC_MIN_GAS_WEI,
    isArc: true,
    gasBufferWei: ARC_GAS_BUFFER_WEI,
    faucetAvailable: false,
    features: {
      bridge: true,
      faucet: false,
      trade: true,
      createToken: true,
      earn: true,
    },
    // Deployed + verified on Arc Mainnet, 2026-10-14.
    contracts: {
      tokenFactory: deployed("VITE_TOKEN_FACTORY_ADDRESS", MAINNET_TOKEN_FACTORY),
      spotPool: deployed("VITE_SPOT_POOL_ADDRESS", MAINNET_SPOT_POOL),
    },
    pairs: mainnetPairs,
    usdcChains: [
      {
        chainId: 8453,
        label: "Base",
        explorerUrl: "https://basescan.org",
        tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      },
      {
        chainId: arcMainnetChain.id,
        label: "Arc Mainnet",
        explorerUrl: "https://explorer.arc.io",
        tokenAddress: "0x3600000000000000000000000000000000000000",
      },
      {
        chainId: 1,
        label: "Ethereum",
        explorerUrl: "https://etherscan.io",
        tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      },
    ],
    assets: mainnetPairs.map((pair): AssetConfig => ({
      symbol: pair.ticker,
      name: pair.name,
      chainId: arcMainnetChain.id,
      address: pair.baseToken,
      decimals: 18,
      pairId: pair.id,
    })),
    chain: arcMainnetChain,
  },
};

/** Tokens supported by the Dynamic swap quote UI, grouped by network. */
export const SWAP_TOKENS: SwapTokenConfig[] = [
  {
    id: "arc-testnet-usdc",
    symbol: "USDC",
    name: "USD Coin",
    address: NETWORKS.testnet.usdcAddress,
    chainId: NETWORKS.testnet.chainId,
    networkId: String(NETWORKS.testnet.chainId),
    networkName: NETWORKS.testnet.label,
    explorerUrl: NETWORKS.testnet.explorerUrl,
    decimals: NETWORKS.testnet.usdcDecimals,
    color: "#2775ca",
  },
  {
    id: "arc-usdc",
    symbol: "USDC",
    name: "USD Coin",
    address: NETWORKS.mainnet.usdcAddress,
    chainId: NETWORKS.mainnet.chainId,
    networkId: String(NETWORKS.mainnet.chainId),
    networkName: NETWORKS.mainnet.label,
    explorerUrl: NETWORKS.mainnet.explorerUrl,
    decimals: NETWORKS.mainnet.usdcDecimals,
    color: "#2775ca",
  },
  {
    id: "ethereum-usdc",
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: mainnet.id,
    networkId: String(mainnet.id),
    networkName: "Ethereum",
    explorerUrl: mainnet.blockExplorers.default.url,
    decimals: 6,
    color: "#2775ca",
  },
  {
    id: "ethereum-weth",
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    chainId: mainnet.id,
    networkId: String(mainnet.id),
    networkName: "Ethereum",
    explorerUrl: mainnet.blockExplorers.default.url,
    decimals: 18,
    color: "#627eea",
  },
  {
    id: "base-usdc",
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: base.id,
    networkId: String(base.id),
    networkName: "Base",
    explorerUrl: base.blockExplorers.default.url,
    decimals: 6,
    color: "#2775ca",
  },
  {
    id: "base-weth",
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006",
    chainId: base.id,
    networkId: String(base.id),
    networkName: "Base",
    explorerUrl: base.blockExplorers.default.url,
    decimals: 18,
    color: "#627eea",
  },
];

/**
 * Every coin listed in the swap UI, with its chain + contract address.
 *
 * Single source of truth shared by the Swap page (token dropdowns) and the
 * Portfolio page (which whitelists these addresses in the Dynamic balance
 * query so none are spam-filtered, and shows a card per holding). Native
 * assets use the zero address.
 *
 * Verify Ethereum / Base addresses on their block explorers before shipping.
 */
export const SWAP_COIN_ADDRESSES: ReadonlyArray<{
  chainId: number;
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}> = [
  // Arc mainnet
  { chainId: 5042, symbol: "EURC", address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6 },
  { chainId: 5042, symbol: "WETH", address: "0x128cC466B61f542da60c70E3aA11c10e19B84EDB", decimals: 18 },
  { chainId: 5042, symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
  // Ethereum
  { chainId: 1, symbol: "ETH", address: "0x0000000000000000000000000000000000000000", decimals: 18 },
  { chainId: 1, symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { chainId: 1, symbol: "EURC", address: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", decimals: 6 },
  { chainId: 1, symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { chainId: 1, symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { chainId: 1, symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
  // Base
  { chainId: 8453, symbol: "ETH", address: "0x0000000000000000000000000000000000000000", decimals: 18 },
  { chainId: 8453, symbol: "EURC", address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", decimals: 6 },
  { chainId: 8453, symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
  { chainId: 8453, symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
];

/** Contract addresses (non-native) to whitelist in the Dynamic balance query. */
export const SWAP_WHITELISTED_CONTRACTS: readonly `0x${string}`[] =
  SWAP_COIN_ADDRESSES.filter(
    (c) => c.address !== "0x0000000000000000000000000000000000000000",
  ).map((c) => c.address);

/** localStorage key for the persisted network choice. */
export const NETWORK_STORAGE_KEY = "arcex.network";

/** Default network — mainnet, where the trading contracts live. */
export const DEFAULT_NETWORK: NetworkName = "mainnet";

/**
 * Reads the persisted network without touching localStorage on the server.
 * Safe to call during render: no hydration mismatch, since the first client
 * read always falls back to DEFAULT_NETWORK when storage is unavailable.
 */
export function readStoredNetwork(): NetworkName {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  try {
    const raw = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    return raw === "mainnet" || raw === "testnet" ? raw : DEFAULT_NETWORK;
  } catch {
    return DEFAULT_NETWORK;
  }
}

export function writeStoredNetwork(network: NetworkName): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    // Private mode / quota — the choice simply won't persist.
  }
}

export function networkByChainId(chainId: number | undefined): NetworkName | undefined {
  if (chainId === undefined) return undefined;
  if (chainId === NETWORKS.testnet.chainId) return "testnet";
  if (chainId === NETWORKS.mainnet.chainId) return "mainnet";
  return undefined;
}

/** Explorer link helpers, bound to a network. */
export function explorerTxUrl(network: NetworkName, hash: string): string {
  return `${NETWORKS[network].explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(network: NetworkName, address: string): string {
  return `${NETWORKS[network].explorerUrl}/address/${address}`;
}
