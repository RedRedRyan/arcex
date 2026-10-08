/**
 * wagmi + Dynamic configuration
 * Arc Testnet (5042002) and Arc Mainnet (5042) are registered as custom EVM
 * networks in Dynamic so the wallet modal shows them natively.
 */

import { fallback, http, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";
import { arcTestnet, arc } from "viem/chains";
import { registerChain } from "./tracing";
import type { EvmNetwork } from "@dynamic-labs/sdk-react-core"; // re-exported from @dynamic-labs/types

const arcTestnetRpc =
  arcTestnet.rpcUrls.default.http[2] ?? arcTestnet.rpcUrls.default.http[0];
const arcTestnetFallbackRpc =
  arcTestnet.rpcUrls.default.http[0] ?? arcTestnetRpc;
const arcTestnetRpcUrls = [arcTestnetRpc, arcTestnetFallbackRpc];

// Pre-register chain RPC URLs for Arc Studio trace labelling
registerChain(arcTestnet.id, arcTestnetRpc);
registerChain(arc.id, arc.rpcUrls.default.http[0]);

// ── Dynamic custom network definitions ──────────────────────────────────────
// These are passed to DynamicContextProvider.settings.evmNetworks so Dynamic
// shows Arc Testnet and Arc Mainnet in its wallet modal.

export const arcEvmNetworks: EvmNetwork[] = [
  {
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
  },
  {
    chainId: arc.id,
    networkId: arc.id,
    chainName: arc.name,
    name: arc.name,
    vanityName: "Arc",
    nativeCurrency: {
      decimals: arc.nativeCurrency.decimals,
      name: arc.nativeCurrency.name,
      symbol: arc.nativeCurrency.symbol,
    },
    rpcUrls: [arc.rpcUrls.default.http[0]],
    blockExplorerUrls: [arc.blockExplorers?.default.url ?? ""],
    iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
  },
];

// ── wagmi config ─────────────────────────────────────────────────────────────
// multiInjectedProviderDiscovery: false — Dynamic handles EIP-6963 itself.
// mainnet included for ENS resolution only.
export const config = createConfig({
  chains: [arcTestnet, arc, mainnet],
  multiInjectedProviderDiscovery: false,
  transports: {
    [arcTestnet.id]: fallback(
      arcTestnetRpcUrls.map((url) =>
        http(url, { batch: { wait: 20, batchSize: 100 } }),
      ),
    ),
    [arc.id]: http(arc.rpcUrls.default.http[0]),
    [mainnet.id]: http(), // ENS resolution
  },
});
