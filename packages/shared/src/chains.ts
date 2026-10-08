/**
 * @file chains.ts
 * @description Canonical chain definitions for arcex.
 *
 * Arc Mainnet  — chainId 5042,    RPC https://rpc.mainnet.arc.io
 * Arc Testnet  — chainId 5042002, RPC https://rpc.testnet.arc.io
 *
 * Arc rule: USDC is the native gas token. Native decimals = 18 (gas),
 * ERC-20 USDC decimals = 6 (transfers/approvals). NEVER mix them.
 * Use the `units` module for conversions.
 */

import { arc as viemArc, arcTestnet as viemArcTestnet } from "viem/chains";

// ── Re-export viem chain objects with local aliases ──────────────────────────

/** Arc Mainnet (chainId 5042). USDC = native gas (18 dec) + ERC-20 (6 dec). */
export const arcMainnet = viemArc;

/** Arc Testnet (chainId 5042002). USDC = native gas (18 dec) + ERC-20 (6 dec). */
export const arcTestnet = viemArcTestnet;

// ── Convenience constants ────────────────────────────────────────────────────

export const ARC_MAINNET_CHAIN_ID = 5042 as const;
export const ARC_TESTNET_CHAIN_ID = 5042002 as const;

export type SupportedChainId =
  | typeof ARC_MAINNET_CHAIN_ID
  | typeof ARC_TESTNET_CHAIN_ID;

/** Returns `true` when the chain is a production network (real funds). */
export function isMainnet(chainId: number): chainId is typeof ARC_MAINNET_CHAIN_ID {
  return chainId === ARC_MAINNET_CHAIN_ID;
}

/** Returns `true` when the chain is a testnet (test funds only). */
export function isTestnet(chainId: number): chainId is typeof ARC_TESTNET_CHAIN_ID {
  return chainId === ARC_TESTNET_CHAIN_ID;
}

/** Throws if the chain ID is not a supported arcex chain. */
export function assertSupportedChain(chainId: number): asserts chainId is SupportedChainId {
  if (!isMainnet(chainId) && !isTestnet(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}. Must be ${ARC_MAINNET_CHAIN_ID} or ${ARC_TESTNET_CHAIN_ID}.`);
  }
}

/** Returns the viem chain object for a supported chain ID. */
export function getChain(chainId: SupportedChainId) {
  return chainId === ARC_MAINNET_CHAIN_ID ? arcMainnet : arcTestnet;
}

/** Returns the canonical block explorer base URL for a supported chain. */
export function explorerUrl(chainId: SupportedChainId): string {
  return chainId === ARC_MAINNET_CHAIN_ID
    ? "https://explorer.arc.io"
    : "https://explorer.testnet.arc.io";
}

/** Returns a block explorer link for a transaction hash. */
export function txExplorerLink(chainId: SupportedChainId, txHash: `0x${string}`): string {
  return `${explorerUrl(chainId)}/tx/${txHash}`;
}

/** Returns a block explorer link for an address. */
export function addressExplorerLink(chainId: SupportedChainId, address: `0x${string}`): string {
  return `${explorerUrl(chainId)}/address/${address}`;
}
