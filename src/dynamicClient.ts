import {
  createDynamicClient,
  type NetworkData,
} from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { base, mainnet } from "viem/chains";
import { arcMainnetChain, arcTestnetChain } from "./config/networks";

const environmentId =
  import.meta.env.VITE_DYNAMIC_ENV_ID ?? "1d61f791-1b14-4925-9c30-93046ff38e52";

const supportedEvmNetworks: NetworkData[] = [
  {
    chain: "EVM",
    networkId: String(arcTestnetChain.id),
    name: `evm-${arcTestnetChain.id}`,
    displayName: arcTestnetChain.name,
    iconUrl: "https://app.dynamic.xyz/assets/networks/eth.svg",
    testnet: true,
    nativeCurrency: {
      name: arcTestnetChain.nativeCurrency.name,
      symbol: arcTestnetChain.nativeCurrency.symbol,
      decimals: arcTestnetChain.nativeCurrency.decimals,
    },
    rpcUrls: { http: [...arcTestnetChain.rpcUrls.default.http] },
    blockExplorerUrls: [arcTestnetChain.blockExplorers.default.url],
  },
  {
    chain: "EVM",
    networkId: String(arcMainnetChain.id),
    name: `evm-${arcMainnetChain.id}`,
    displayName: arcMainnetChain.name,
    iconUrl: "https://app.dynamic.xyz/assets/networks/eth.svg",
    testnet: false,
    nativeCurrency: {
      name: arcMainnetChain.nativeCurrency.name,
      symbol: arcMainnetChain.nativeCurrency.symbol,
      decimals: arcMainnetChain.nativeCurrency.decimals,
    },
    rpcUrls: { http: [...arcMainnetChain.rpcUrls.default.http] },
    blockExplorerUrls: [arcMainnetChain.blockExplorers.default.url],
  },
  ...[mainnet, base].map(
    (chain): NetworkData => ({
      chain: "EVM",
      networkId: String(chain.id),
      name: `evm-${chain.id}`,
      displayName: chain.name,
      iconUrl: "https://app.dynamic.xyz/assets/networks/eth.svg",
      testnet: false,
      nativeCurrency: {
        name: chain.nativeCurrency.name,
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
      },
      rpcUrls: { http: [...chain.rpcUrls.default.http] },
      blockExplorerUrls: [chain.blockExplorers.default.url],
    }),
  ),
];

export const dynamicClient = createDynamicClient({
  environmentId,
  metadata: {
    name: "NBX",
    universalLink:
      typeof window === "undefined" ? "https://localhost" : window.location.origin,
  },
  transformers: {
    networksData: (configuredNetworks) => {
      const knownNetworkIds = new Set(
        configuredNetworks
          .filter((network) => network.chain === "EVM")
          .map((network) => network.networkId),
      );
      return [
        ...configuredNetworks,
        ...supportedEvmNetworks.filter(
          (network) => !knownNetworkIds.has(network.networkId),
        ),
      ];
    },
  },
});

addEvmExtension();
