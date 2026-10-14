import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { useNetwork } from "../config/NetworkProvider";

export interface UsdcChainBalance {
  chainId: number;
  label: string;
  raw: bigint | null;
  status: "idle" | "loading" | "success" | "error";
  error?: string;
}

const RPC_BY_CHAIN: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
  8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  5042: ["https://rpc.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io"],
};

const clients = new Map<number, PublicClient>();

function clientFor(chainId: number): PublicClient | undefined {
  const cached = clients.get(chainId);
  if (cached) return cached;

  const rpcs = RPC_BY_CHAIN[chainId];
  if (!rpcs) return undefined;

  const client = createPublicClient({
    transport: fallback(rpcs.map((url) => http(url))),
  });
  clients.set(chainId, client);
  return client;
}

export function useUsdcBalances(address: Address | undefined) {
  const { config, network } = useNetwork();
  const chains = config.usdcChains;

  const query = useQuery({
    queryKey: [
      "usdc-balances",
      network,
      address ?? "",
      chains.map((chain) => chain.tokenAddress),
    ],
    queryFn: async () => {
      if (!address) return [];

      return Promise.all(
        chains.map(
          async ({ chainId, label, tokenAddress }): Promise<UsdcChainBalance> => {
            const client = clientFor(chainId);
            if (!client) {
              return {
                chainId,
                label,
                raw: null,
                status: "error",
                error: `No RPC configured for chain ${chainId}`,
              };
            }

            try {
              const raw = await client.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [address],
              });
              return { chainId, label, raw, status: "success" };
            } catch (error) {
              return {
                chainId,
                label,
                raw: null,
                status: "error",
                error: error instanceof Error ? error.message : String(error),
              };
            }
          },
        ),
      );
    },
    enabled: !!address && chains.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const balances: UsdcChainBalance[] = query.data
    ? query.data
    : chains.map(({ chainId, label }) => ({
        chainId,
        label,
        raw: null,
        status: address ? "loading" : "idle",
      }));

  return {
    balances,
    loading: query.isPending && !!address && chains.length > 0,
  };
}
