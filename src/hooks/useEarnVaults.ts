/**
 * hooks/useEarnVaults.ts — TanStack Query wrapper around the Earn Kit vault
 * list, plus deposit/withdraw actions signed by the user's wallet.
 *
 * NON-CUSTODIAL: every deposit goes through a viem adapter built from the
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
import type { EIP1193Provider } from "viem";
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

  /** Deposit into a vault using the connected wallet for signing. */
  const deposit = useCallback(
    async (
      vaultAddress: string,
      amount: string,
    ): Promise<EarnActionOutcome & { txHash?: string }> => {
      if (!earnEnabledFor(network)) {
        return { ok: false, message: "Earn is available on mainnet only." };
      }
      if (!connector) {
        return { ok: false, message: "Connect a wallet to deposit." };
      }
      if (chainId !== config.chain.id) {
        return {
          ok: false,
          message: `Switch your wallet to ${config.label} before depositing.`,
        };
      }

      setPending(true);
      try {
        const provider = (await connector.getProvider()) as
          | EIP1193Provider
          | undefined;
        if (!provider) {
          return { ok: false, message: "Could not access the connected wallet." };
        }

        const adapter = await createViemAdapterFromProvider({ provider });
        const result = await earnKit.earn.deposit({
          from: { adapter, chain: earnChainFor(network) },
          vaultAddress,
          amount,
        });

        // Refresh vault data after the deposit transaction is submitted.
        void queryClient.invalidateQueries({ queryKey: ["earn-vaults", network] });
        return {
          ok: true,
          message: "Deposit transaction submitted.",
          txHash: result.txHash,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Deposit failed.",
        };
      } finally {
        setPending(false);
      }
    },
    [network, config.chain.id, config.label, connector, chainId, queryClient],
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
    /** Chain the wallet must be on to deposit. */
    requiredChainId: config.chain.id,
    refetch: query.refetch,
    deposit,
    pending,
  };
}
