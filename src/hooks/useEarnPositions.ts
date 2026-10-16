/**
 * hooks/useEarnPositions.ts — reads the connected wallet's vault positions
 * directly on-chain (ERC-4626 `balanceOf` + `convertToAssets`).
 *
 * Deposits/withdrawals are signed through Circle's Earn Kit in useEarnVaults,
 * so positions are read the same way: no Dynamic yield SDK involved.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  parseAbi,
} from "viem";
import { useNetwork } from "../config/NetworkProvider";
import type { EarnVault } from "../config/earn";

export type ActionResult = { ok: boolean; message: string; txHash?: string };

export type EarnPosition = {
  /** Human-readable USDC amount, e.g. "12.345678" */
  assets: string;
  decimals: number;
  hasPosition: boolean;
};

const USDC_DECIMALS = 6;

const vaultAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

export function useEarnPositions(
  vaults: EarnVault[],
  owner: `0x${string}` | undefined,
) {
  const { config } = useNetwork();
  const [positions, setPositions] = useState<Record<string, EarnPosition>>({});
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    if (!owner || vaults.length === 0) {
      setPositions({});
      return;
    }

    const client = createPublicClient({
      chain: config.chain,
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const entries = await Promise.all(
      vaults.map(async (v) => {
        try {
          const address = v.vaultAddress as `0x${string}`;
          const shares = await client.readContract({
            address,
            abi: vaultAbi,
            functionName: "balanceOf",
            args: [owner],
          });
          const assets =
            shares > 0n
              ? await client.readContract({
                  address,
                  abi: vaultAbi,
                  functionName: "convertToAssets",
                  args: [shares],
                })
              : 0n;

          return [
            v.vaultAddress,
            {
              assets: formatUnits(assets, USDC_DECIMALS),
              decimals: USDC_DECIMALS,
              hasPosition: assets > 0n,
            } satisfies EarnPosition,
          ] as const;
        } catch (err) {
          console.warn("position read failed", v.vaultAddress, err);
          return null;
        }
      }),
    );

    // Ignore stale responses (wallet switched / vault list changed mid-flight).
    if (id !== requestId.current) return;
    setPositions(
      Object.fromEntries(
        entries.filter((e): e is NonNullable<typeof e> => e !== null),
      ),
    );
  }, [vaults, owner, config.chain, config.rpcUrls]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { positions, refresh };
}
