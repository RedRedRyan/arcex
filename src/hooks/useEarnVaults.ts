/**
 * hooks/useEarnVaults.ts — TanStack Query wrapper around the Earn Kit vault
 * list, plus deposit/withdraw actions signed by the user's wallet.
 *
 * NON-CUSTODIAL: every action goes through a viem adapter built from the
 * connected wallet, so the user signs and Circle never holds keys. Deposited
 * USDC lives in the vault contract.
 *
 * No API key is needed to read vaults (verified against the live Arc
 * endpoint), so this is fully client-side.
 */

import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, fallback, http, type EIP1193Provider } from "viem";
import {
  earnChainFor,
  earnEnabledFor,
  earnKit,
  fetchEarnVaults,
  type EarnVault,
} from "../config/earn";
import { useNetwork } from "../config/NetworkProvider";

/** Vault list is stable enough to cache, but we refetch often for APY drift. */
const STALE_MS = 60_000;

export interface EarnActionOutcome {
  ok: boolean;
  message: string;
}

export type EarnActionResult = EarnActionOutcome & { txHash?: string };

type ActionKind = "deposit" | "withdraw";

export function useEarnVaults() {
  const { network, config } = useNetwork();
  const enabled = earnEnabledFor(network);

  const query = useQuery({
    queryKey: ["earn-vaults", network],
    queryFn: ({ signal }) => fetchEarnVaults(network, signal),
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const { connector, chainId } = useAccount();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  /** Build a viem adapter from the connected wallet's provider. */
  const getAdapter = useCallback(async () => {
    const provider = (await connector?.getProvider()) as
      | EIP1193Provider
      | undefined;
    if (!provider) return null;

    return createViemAdapterFromProvider({
      provider,
      getPublicClient: ({ chain }) =>
        createPublicClient({
          chain,
          transport: fallback(config.rpcUrls.map((url) => http(url))),
        }),
    });
  }, [connector, config.rpcUrls]);

  /** Shared guard + submit flow for deposit and withdraw. */
  const runAction = useCallback(
    async (
      kind: ActionKind,
      vaultAddress: string,
      amount: string,
    ): Promise<EarnActionResult> => {
      const noun = kind === "deposit" ? "Deposit" : "Withdrawal";

      if (!earnEnabledFor(network)) {
        return { ok: false, message: "Earn is available on mainnet only." };
      }
      if (!connector) {
        return { ok: false, message: `Connect a wallet to ${kind}.` };
      }
      if (chainId !== config.chain.id) {
        return {
          ok: false,
          message: `Switch your wallet to ${config.label} before ${
            kind === "deposit" ? "depositing" : "withdrawing"
          }.`,
        };
      }

      setPending(true);
      try {
        const adapter = await getAdapter();
        if (!adapter) {
          return {
            ok: false,
            message: "Could not access the connected wallet.",
          };
        }

        const params = {
          from: { adapter, chain: earnChainFor(network) },
          vaultAddress,
          amount,
        };
        // NOTE: `earn.withdraw` is assumed to mirror `earn.deposit`'s params.
        // Check its signature in Circle's types if TypeScript complains.
        const result =
          kind === "deposit"
            ? await earnKit.earn.deposit(params)
            : await earnKit.earn.withdraw(params);

        // Refresh vault data after the transaction is submitted.
        void queryClient.invalidateQueries({
          queryKey: ["earn-vaults", network],
        });
        return {
          ok: true,
          message: `${noun} transaction submitted.`,
          txHash: result.txHash,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : `${noun} failed.`,
        };
      } finally {
        setPending(false);
      }
    },
    [
      network,
      config.chain.id,
      config.label,
      connector,
      chainId,
      getAdapter,
      queryClient,
    ],
  );

  const deposit = useCallback(
    (vaultAddress: string, amount: string) =>
      runAction("deposit", vaultAddress, amount),
    [runAction],
  );

  const withdraw = useCallback(
    (vaultAddress: string, amount: string) =>
      runAction("withdraw", vaultAddress, amount),
    [runAction],
  );

  return {
    enabled,
    /** Testnet shows a note; mainnet lists real vaults. */
    vaults: useMemo<EarnVault[]>(
      () => (enabled ? (query.data?.vaults ?? []) : []),
      [enabled, query.data],
    ),
    error: enabled ? (query.data?.error ?? null) : null,
    loading: enabled && query.isPending,
    /** True when the network can't show Earn at all. */
    unavailable: !enabled,
    /** Chain the wallet must be on to deposit or withdraw. */
    requiredChainId: config.chain.id,
    refetch: query.refetch,
    deposit,
    withdraw,
    pending,
  };
}
