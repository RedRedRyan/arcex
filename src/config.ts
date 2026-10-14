/**
 * wagmi + Dynamic configuration
 *
 * Arc Mainnet (5042) is the trading chain. Arc Testnet remains available for
 * the faucet; Ethereum and Base serve as bridge partners for DynamicBridgeWidget.
 */

import { fallback, http, createConfig, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import { mainnet, base } from "wagmi/chains";
import { arcTestnet, arc } from "viem/chains";
import { registerChain } from "./tracing";
import type { EvmNetwork } from "@dynamic-labs/sdk-react-core"; // re-exported from @dynamic-labs/types

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

const arcTestnetRpc =
  arcTestnet.rpcUrls.default.http[2] ?? arcTestnet.rpcUrls.default.http[0];
const arcTestnetFallbackRpc =
  arcTestnet.rpcUrls.default.http[0] ?? arcTestnetRpc;
const arcTestnetRpcUrls = [arcTestnetRpc, arcTestnetFallbackRpc];

// Pre-register chain RPC URLs for Arc Studio trace labelling
registerChain(arcTestnet.id, arcTestnetRpc);
registerChain(arc.id, arc.rpcUrls.default.http[0]);
registerChain(mainnet.id, mainnet.rpcUrls.default.http[0]);
registerChain(base.id, base.rpcUrls.default.http[0]);

// ── Dynamic custom network definitions ──────────────────────────────────────
// Passed to DynamicContextProvider.settings.overrides.evmNetworks, which
// REPLACES the dashboard list entirely.

const arcTestnetNetwork: EvmNetwork = {
  chainId: arcTestnet.id,
  networkId: arcTestnet.id,
  chainName: arcTestnet.name,
  name: arcTestnet.name,
  vanityName: "Arc Testnet",
  nativeCurrency: {
    decimals: arcTestnet.nativeCurrency.decimals,
    name: arcTestnet.nativeCurrency.name,
    symbol: arcTestnet.nativeCurrency.symbol,
  },
  rpcUrls: arcTestnetRpcUrls,
  blockExplorerUrls: [arcTestnet.blockExplorers?.default.url ?? ""],
  iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
};

const arcMainnetNetwork: EvmNetwork = {
  chainId: arc.id,
  networkId: arc.id,
  chainName: arc.name,
  name: arc.name,
  vanityName: "Arc Mainnet",
  nativeCurrency: {
    decimals: arc.nativeCurrency.decimals,
    name: arc.nativeCurrency.name,
    symbol: arc.nativeCurrency.symbol,
  },
  rpcUrls: [arc.rpcUrls.default.http[0]],
  blockExplorerUrls: [arc.blockExplorers?.default.url ?? ""],
  iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
};

const mainnetNetwork: EvmNetwork = {
  chainId: mainnet.id,
  networkId: mainnet.id,
  chainName: mainnet.name,
  name: mainnet.name,
  vanityName: "Ethereum",
  nativeCurrency: {
    decimals: mainnet.nativeCurrency.decimals,
    name: mainnet.nativeCurrency.name,
    symbol: mainnet.nativeCurrency.symbol,
  },
  rpcUrls: [...mainnet.rpcUrls.default.http],
  blockExplorerUrls: [mainnet.blockExplorers?.default.url ?? ""],
  iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
};

const baseNetwork: EvmNetwork = {
  chainId: base.id,
  networkId: base.id,
  chainName: base.name,
  name: base.name,
  vanityName: "Base",
  nativeCurrency: {
    decimals: base.nativeCurrency.decimals,
    name: base.nativeCurrency.name,
    symbol: base.nativeCurrency.symbol,
  },
  rpcUrls: [...base.rpcUrls.default.http],
  blockExplorerUrls: [base.blockExplorers?.default.url ?? ""],
  iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
};

export const arcEvmNetworks: EvmNetwork[] = [
  arcMainnetNetwork,
  mainnetNetwork,
  baseNetwork,
];

/**
 * The networks the wallet can switch between. Mirrors `arcEvmNetworks` in a
 * shape components can use for labels and ids without importing Dynamic types.
 */
export const SWITCHABLE_NETWORKS = [
  { id: arcTestnet.id, label: "Arc Testnet" },
  { id: arc.id, label: "Arc Mainnet" },
  { id: mainnet.id, label: "Ethereum" },
  { id: base.id, label: "Base" },
] as const;

/** The chain the app trades on — used for the "wrong network" prompt. */
export const TRADING_CHAIN_ID = arc.id;

// ── wagmi config ─────────────────────────────────────────────────────────────
// multiInjectedProviderDiscovery: false — Dynamic handles EIP-6963 itself.
// mainnet also serves ENS resolution.
// Connectors: injected (browser extension) + walletConnect (mobile / Relay).
// WalletConnect throws at config-construction time when projectId is empty, so
// it is only registered when the env var is actually present.
export const config = createConfig({
  chains: [arcTestnet, arc, mainnet, base],
  multiInjectedProviderDiscovery: false,
  connectors: [
    injected({ shimDisconnect: true }),
    ...(WC_PROJECT_ID
      ? [
          walletConnect({
            projectId: WC_PROJECT_ID,
            metadata: {
              name: "arcex",
              description: "Onchain spot DEX on Arc",
              url:
                typeof window !== "undefined"
                  ? window.location.origin
                  : "https://localhost",
              icons: ["https://localhost/favicon.ico"],
            },
            showQrModal: true,
          }),
        ]
      : []),
  ],
  transports: {
    [arcTestnet.id]: fallback(
      arcTestnetRpcUrls.map((url) =>
        http(url, { batch: { wait: 20, batchSize: 100 } }),
      ),
    ),
    [arc.id]: http(arc.rpcUrls.default.http[0]),
    [mainnet.id]: http(), // ENS resolution + bridge
    [base.id]: http(),
  },
});
