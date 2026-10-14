/**
 * config/earn.ts — Earn Kit integration (vault deposits on Arc).
 *
 * VERIFIED against the installed SDK (@circle-fin/app-kit 1.16.0), not the
 * docs — the doc snippet uses `kit.earn.exploreVaults`, which is correct, but
 * several details differ from the published page:
 *
 *  - `EarnChain` has exactly two members: "Arc" and "Arc_Testnet". Vaults are
 *    ONLY on Arc, so mainnet and testnet never share a vault list.
 *  - `exploreVaults` needs NO api key. Verified live: 30 USDC vaults returned
 *    on Arc mainnet from a bare `new AppKit()` with no credentials. So the
 *    vault list is fully client-side and no server proxy is required.
 *  - Vault field is `currentApy` (a decimal, e.g. 0.0425 = 4.25%), plus a
 *    richer `apyProfile` for history. `totalDeposits`/`liquidity` arrive as
 *    already-formatted NUMBERS, not Amount objects.
 *  - `status` is "active" or "low_liquidity".
 *
 * Deposits/withdrawals are signed by the user's wallet via a viem adapter —
 * this stays non-custodial. Deposited USDC sits in the vault contract.
 */

import { AppKit, EarnChain, type EarnVaultInfo } from "@circle-fin/app-kit";

/** One kit instance for the app. */
export const earnKit = new AppKit();

/**
 * Earn is mainnet-only here: vaults exist on Arc mainnet and the Arc testnet
 * vault is a sandbox fixture. Driven by the network config, not hardcoded.
 */
export function earnChainFor(
  network: "testnet" | "mainnet",
): EarnChain.Arc | EarnChain.Arc_Testnet {
  return network === "mainnet" ? EarnChain.Arc : EarnChain.Arc_Testnet;
}

/** True when this network may show Earn. */
export function earnEnabledFor(network: "testnet" | "mainnet"): boolean {
  return network === "mainnet";
}

// ── Normalised view model ────────────────────────────────────────────────────
/** What the UI renders. Decoupled from the SDK's raw shape. */
export interface EarnVault {
  vaultAddress: string;
  name: string;
  protocol: string;
  asset: string;
  /** APY as a decimal fraction (0.0425 = 4.25%). */
  apy: number;
  /** Total deposited, in whole token units. */
  totalDeposits: number;
  /** Withdrawable liquidity, in whole token units. */
  liquidity: number;
  status: string;
  manager: string;
  asOf: string;
  /** True when Circle's own monitoring covers this vault. */
  circleGuarded: boolean;
  /** Non-empty when the vault carries a risk warning. */
  warnings: string[];
  /** Annual management fee, decimal fraction. */
  managementFee: number;
  /** Annual performance fee, decimal fraction. */
  performanceFee: number;
}

export interface EarnVaultsResult {
  vaults: EarnVault[];
  /** Set when the fetch failed; the UI shows this instead of an empty list. */
  error: string | null;
}

/** Loosens the SDK's readonly tuple so we can iterate it in TS. */
function toWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((w): w is string => typeof w === "string");
}

/** Maps an SDK vault to the UI model, tolerating missing fields. */
function toVault(v: EarnVaultInfo): EarnVault {
  const num = (x: unknown): number => {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : 0;
  };

  const risk = v.riskSignals as
    | { warnings?: unknown; earnKitWarnings?: unknown }
    | undefined;
  const warnings = [
    ...toWarnings(risk?.warnings),
    ...toWarnings(risk?.earnKitWarnings),
  ];

  const fee = (v.fee ?? {}) as { management?: number; performance?: number };

  // Some live vaults have `manager: null` and one has an empty name, so both
  // fall back rather than rendering "null" or a blank card.
  const rawName = typeof v.name === "string" ? v.name.trim() : "";
  const rawManager = v.manager?.name?.trim() ?? "";

  return {
    vaultAddress: v.vaultAddress,
    name: rawName.length > 0 ? rawName : `Vault ${v.vaultAddress.slice(0, 8)}`,
    protocol: v.protocol ?? "—",
    asset: v.asset ?? "USDC",
    apy: num(v.currentApy),
    totalDeposits: num(v.totalDeposits),
    liquidity: num(v.liquidity),
    status: v.status ?? "active",
    manager: rawManager.length > 0 ? rawManager : "Unattributed",
    asOf: v.asOf ?? "",
    circleGuarded: Boolean(v.circleGuarded),
    warnings,
    managementFee: num(fee.management),
    performanceFee: num(fee.performance),
  };
}

/**
 * Fetches vaults for a chain, highest APY first.
 *
 * Never throws: a failure returns an empty list plus an error string so the
 * page can show a retry affordance.
 */
export async function fetchEarnVaults(
  network: "testnet" | "mainnet",
  signal?: AbortSignal,
): Promise<EarnVaultsResult> {
  try {
    const result = await earnKit.earn.exploreVaults({
      chain: earnChainFor(network),
      sortBy: "apy",
    });

    const vaults = (result?.vaults ?? []).map(toVault);

    // The SDK result carries `pagination`, not `errors`. An empty list simply
    // means no vaults matched, so surface that plainly.
    if (vaults.length === 0) {
      return { vaults: [], error: "No vaults are available on this chain yet." };
    }
    return { vaults, error: null };
  } catch (err) {
    if (signal?.aborted) return { vaults: [], error: null };
    return {
      vaults: [],
      error: err instanceof Error ? err.message : "Could not load vaults.",
    };
  }
}

// ── Formatting helpers (UI-facing, unit-tested shapes) ───────────────────────
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

/** Compact large numbers for TVL: 149604 -> "149.6K". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

export function formatUsdc(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatFee(fee: number): string {
  const pct = fee * 100;
  return pct === 0 ? "None" : `${pct.toFixed(2)}%`;
}
