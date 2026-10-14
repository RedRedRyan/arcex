/**
 * NetworkProvider — tracks which Arc network the app is pointed at.
 *
 * This provider follows the wallet's selected chain; it does not initiate
 * switches itself. Network-specific pages may request a wallet switch through
 * wagmi and this provider updates after the wallet confirms it.
 *
 * What it still owns:
 *  - Deriving `network` / `config` / `chain` from the wallet's current chain.
 *  - Redirecting the on-chain store (`setActiveNetwork`) so data reads hit the
 *    right network.
 *  - Switching the market store to network-scoped cache and RPC data.
 *
 * Falls back to the persisted network (default Mainnet) until a wallet is
 * connected, so public data reads have a network to use.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_NETWORK,
  NETWORKS,
  networkByChainId,
  readStoredNetwork,
  type NetworkConfig,
  type NetworkName,
} from "./networks";
import { setActiveNetwork } from "../../data/MarketStore";

interface NetworkContextValue {
  network: NetworkName;
  /** Config for the active network. */
  config: NetworkConfig;
  isMainnet: boolean;
  isTestnet: boolean;
  /** viem chain object for the active network. */
  chain: NetworkConfig["chain"];
  /**
   * True when a wallet is connected and sitting on a chain this app does not
   * recognize. The UI should prompt the user to switch in their wallet.
   */
  unsupportedChain: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { chainId: walletChainId, isConnected } = useAccount();

  /**
   * The network to show. Derived, not stored: the wallet is the source of
   * truth, and before a wallet connects we fall back to the persisted choice.
   * Deriving keeps the render pure (no setState-in-effect) and means the UI can
   * never claim a network the wallet is not on.
   */
  const walletNetwork = networkByChainId(walletChainId);
  const network: NetworkName = walletNetwork ?? readStoredNetwork();

  // The store swaps to network-scoped snapshots synchronously, then defers
  // notifications and RPC work so React subscribers are not notified mid-render.
  setActiveNetwork(network);

  // Clear cached reads when the chain changes, so no balance, pool, price,
  // position, or chart from the previous network survives. Keyed on the chain
  // id rather than the network name so an unknown chain also resets.
  const cacheKey = walletChainId ?? "disconnected";
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void queryClient.resetQueries();
  }, [cacheKey, queryClient]);

  const value = useMemo<NetworkContextValue>(
    () => ({
      network,
      config: NETWORKS[network],
      isMainnet: network === "mainnet",
      isTestnet: network === "testnet",
      chain: NETWORKS[network].chain,
      // Only meaningful once connected: a connected wallet on an unknown chain
      // is a state the user needs to act on.
      unsupportedChain: isConnected && walletNetwork === undefined,
    }),
    [network, isConnected, walletNetwork],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork must be used inside <NetworkProvider>");
  }
  return ctx;
}

/**
 * Feature gate. Every per-network capability check goes through here rather
 * than scattering `isMainnet` across the tree.
 */
export function useNetworkFeature(feature: keyof NetworkConfig["features"]): boolean {
  const { config } = useNetwork();
  return config.features[feature];
}

export { DEFAULT_NETWORK };
