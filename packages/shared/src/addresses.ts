/**
 * @file addresses.ts
 * @description Per-chain contract address registry for arcex.
 *
 * Address data is the source of truth for both on-chain and off-chain code.
 * Update this file after every deploy and commit the change together with
 * the broadcast artefact so addresses and bytecode stay in sync.
 *
 * Admin address on all chains: 0x3B2f9f644312cdB69be095FCC3b353C69a0088B2
 * (multisig — never an EOA default in production).
 */

import type { SupportedChainId } from "./chains.js";
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from "./chains.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContractAddresses {
  /** USDC ERC-20 (6 decimals). On Arc, also the native gas token (18 dec). */
  usdc: `0x${string}`;
  /** Admin / multisig address that owns protocol contracts. */
  admin: `0x${string}`;
  /** Timelock controller (governs MarketRegistry, FeeCollector changes). */
  timelock: `0x${string}` | null;
  /** MarketRegistry — per-market config, pause flags, role-based access. */
  marketRegistry: `0x${string}` | null;
  /** OracleRouter — per-market price routing (TWAP + external adapters). */
  oracleRouter: `0x${string}` | null;
  /** SpotPoolFactory (AMM) — constant-product pools, 3 pairs. */
  spotPool: `0x${string}` | null;
  /** PerpEngine — margin positions, funding, liquidations. */
  perpEngine: `0x${string}` | null;
  /** FeeCollector — entry/exit fee split to treasury. */
  feeCollector: `0x${string}` | null;
  /** MarginVault — per-account USDC margin custody. */
  marginVault: `0x${string}` | null;
  /** LPVault — USDC counterparty vault for perps. */
  lpVault: `0x${string}` | null;
  /** InsuranceFund — bad-debt backstop. */
  insuranceFund: `0x${string}` | null;
  /** OrderSettlement — EIP-712 order matching and settlement. */
  orderSettlement: `0x${string}` | null;
  /** Legacy PriceOracle (testnet only, admin-controlled). */
  priceOracle: `0x${string}` | null;
  /** Mock ERC-20 base tokens (testnet only). */
  mockTokens: {
    techx: `0x${string}` | null;
    energyx: `0x${string}` | null;
    arcx: `0x${string}` | null;
  };
}

// ── Address registry ─────────────────────────────────────────────────────────

const REGISTRY: Record<SupportedChainId, ContractAddresses> = {
  // ── Arc Testnet (5042002) ─────────────────────────────────────────────────
  [ARC_TESTNET_CHAIN_ID]: {
    usdc:            "0x3600000000000000000000000000000000000000",
    admin:           "0x3B2f9f644312cdB69be095FCC3b353C69a0088B2",
    timelock:        null, // Phase 0 — deploy pending
    marketRegistry:  null, // Phase 0 — deploy pending
    oracleRouter:    null, // Phase 4
    spotPool:        "0x0ff9a151D9BE48d9222f9C680Ce4052E7c1f7b98",
    perpEngine:      "0xbF6Ea775808485A19282C662A00Dbbbcae756D2B",
    feeCollector:    null, // Phase 2
    marginVault:     null, // Phase 4
    lpVault:         null, // Phase 4
    insuranceFund:   null, // Phase 4
    orderSettlement: null, // Phase 3
    priceOracle:     "0xcE0062be693EefF4e021bb7a8014A0d30C47dF0a",
    mockTokens: {
      techx:   "0xCA70737705C71094827555a9b0015E05308F1326",
      energyx: "0xd463C6424c2776495A6EA88F575693D1fadcC5E6",
      arcx:    "0x5642aC5570d6ee46D1ff86D499D0009370Fd0CAF",
    },
  },

  // ── Arc Mainnet (5042) ────────────────────────────────────────────────────
  [ARC_MAINNET_CHAIN_ID]: {
    usdc:            "0x3600000000000000000000000000000000000000",
    admin:           "0x3B2f9f644312cdB69be095FCC3b353C69a0088B2",
    timelock:        null, // Phase 0 — deploy pending
    marketRegistry:  null, // Phase 0 — deploy pending
    oracleRouter:    null, // Phase 4
    spotPool:        null, // Phase 2
    perpEngine:      null, // Phase 4
    feeCollector:    null, // Phase 2
    marginVault:     null, // Phase 4
    lpVault:         null, // Phase 4
    insuranceFund:   null, // Phase 4
    orderSettlement: null, // Phase 3
    priceOracle:     null, // replaced by OracleRouter on mainnet
    mockTokens: {
      techx:   null, // no mock tokens on mainnet
      energyx: null,
      arcx:    null,
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the full address registry for a supported chain.
 * Throws for unsupported chain IDs.
 */
export function getAddresses(chainId: SupportedChainId): ContractAddresses {
  const entry = REGISTRY[chainId];
  if (!entry) throw new Error(`No address registry for chain ${chainId}`);
  return entry;
}

/**
 * Returns a single address, or throws if it is `null`
 * (meaning the contract has not been deployed yet on that chain).
 */
export function requireAddress(
  chainId: SupportedChainId,
  contract: keyof Omit<ContractAddresses, "mockTokens">
): `0x${string}` {
  const addr = getAddresses(chainId)[contract];
  if (addr === null) {
    throw new Error(
      `Contract "${contract}" is not deployed on chain ${chainId} yet.`
    );
  }
  return addr;
}

/**
 * Returns a mock token address, or throws if not deployed (mainnet).
 */
export function requireMockToken(
  chainId: SupportedChainId,
  token: keyof ContractAddresses["mockTokens"]
): `0x${string}` {
  const addr = getAddresses(chainId).mockTokens[token];
  if (addr === null) {
    throw new Error(
      `Mock token "${token}" is not available on chain ${chainId}.`
    );
  }
  return addr;
}
