/**
 * useAssetBalances — reads real mainnet asset balances for the connected
 * wallet, per the asset registry in config/assets.ts.
 *
 * ERC-20 assets use `balanceOf` at each token's configured decimals.
 *
 * Assets whose address is still a TODO_ADDRESS placeholder are skipped, so an
 * unverified token never renders a bogus balance.
 *
 * All reads fire in parallel via Promise.allSettled: one failing chain or
 * contract does not blank the others.
 */

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address, type PublicClient } from "viem";
import { enabledAssets, type AssetConfig } from "../config/assets";
import { useNetwork } from "../config/NetworkProvider";

export interface AssetBalance {
  /** Stable key: `${symbol}-${chainId}`. */
  key: string;
  symbol: string;
  name: string;
  chainId: number;
  decimals: number;
  pairId: number;
  /** Raw balance in the asset's own base units. */
  raw: bigint;
  status: "success" | "error";
  error?: string;
}

export interface AssetBalancesResult {
  balances: AssetBalance[];
  loading: boolean;
  /** Assets present on this network after placeholder filtering. */
  assets: readonly AssetConfig[];
}

/** Public client per chain, built once. */
import { createPublicClient, fallback, http } from "viem";

const clients = new Map<number, PublicClient>();

function clientFor(chainId: number, rpcUrls: string[]): PublicClient {
  const cached = clients.get(chainId);
  if (cached) return cached;

  const transports = rpcUrls.map((url) => http(url));
  const client = createPublicClient({
    transport: transports.length > 1 ? fallback(transports) : transports[0],
  });
  clients.set(chainId, client);
  return client;
}

/** RPCs per chain id. Kept here so the hook needs no chain config import. */
const RPC_BY_CHAIN: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
  8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  5042: ["https://rpc.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io"],
};

async function readOne(
  asset: AssetConfig,
  owner: Address,
): Promise<AssetBalance> {
  const rpcs = RPC_BY_CHAIN[asset.chainId];
  if (!rpcs) {
    return {
      key: `${asset.symbol}-${asset.chainId}`,
      symbol: asset.symbol,
      name: asset.name,
      chainId: asset.chainId,
      decimals: asset.decimals,
      pairId: asset.pairId,
      raw: 0n,
      status: "error",
      error: `No RPC configured for chain ${asset.chainId}`,
    };
  }

  const client = clientFor(asset.chainId, rpcs);

  try {
    const raw = await client.readContract({
      address: asset.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });

    return {
      key: `${asset.symbol}-${asset.chainId}`,
      symbol: asset.symbol,
      name: asset.name,
      chainId: asset.chainId,
      decimals: asset.decimals,
      pairId: asset.pairId,
      raw,
      status: "success",
    };
  } catch (err) {
    return {
      key: `${asset.symbol}-${asset.chainId}`,
      symbol: asset.symbol,
      name: asset.name,
      chainId: asset.chainId,
      decimals: asset.decimals,
      pairId: asset.pairId,
      raw: 0n,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function useAssetBalances(
  address: Address | undefined,
): AssetBalancesResult {
  const { config, network } = useNetwork();

  // Placeholder assets never reach the network.
  const assets = enabledAssets(config.assets);

  const query = useQuery({
    queryKey: [
      "asset-balances",
      network,
      address ?? "",
      assets.map((asset) => asset.address),
    ],
    queryFn: async () => {
      if (!address || assets.length === 0) return [] as AssetBalance[];
      const settled = await Promise.allSettled(
        assets.map((asset) => readOne(asset, address)),
      );
      return settled.map((outcome, i) =>
        outcome.status === "fulfilled"
          ? outcome.value
          : {
              key: `${assets[i].symbol}-${assets[i].chainId}`,
              symbol: assets[i].symbol,
              name: assets[i].name,
              chainId: assets[i].chainId,
              decimals: assets[i].decimals,
              pairId: assets[i].pairId,
              raw: 0n,
              status: "error" as const,
              error: "Read failed",
            },
      );
    },
    enabled: !!address && assets.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    balances: query.data ?? [],
    loading: query.isPending && !!address && assets.length > 0,
    assets,
  };
}

export default useAssetBalances;
