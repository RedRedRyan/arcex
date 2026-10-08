/**
 * @file units.ts
 * @description Safe USDC unit conversions for Arc.
 *
 * Arc has ONE pool of USDC exposed in two views:
 *
 *   Native (gas) view:  18 decimals — used by msg.value, eth_getBalance,
 *                        wagmi useBalance, and native gas pricing.
 *   ERC-20 view:         6 decimals — used by USDC.balanceOf, transfers,
 *                        allowances, and ALL contract accounting.
 *
 * The same money reads as two different integers. NEVER rescale by hand.
 * Always go through `nativeToErc20` / `erc20ToNative` below.
 *
 * Convention in this codebase:
 *   - Variables named `*Erc20` or `*Usdc` are always 6-decimal bigints.
 *   - Variables named `*Native` or `*Gas` are always 18-decimal bigints.
 *   - Human-readable (display) amounts are plain JS numbers / strings.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Decimals of the USDC ERC-20 token on Arc (canonical on all chains). */
export const USDC_ERC20_DECIMALS = 6 as const;

/** Decimals of USDC when read as the native gas token on Arc. */
export const USDC_NATIVE_DECIMALS = 18 as const;

/** Scale factor between ERC-20 (6 dec) and native (18 dec): 10^12 */
export const NATIVE_TO_ERC20_DIVISOR = 10n ** 12n;

/** Oracle price precision used throughout the protocol: 8 decimal places. */
export const ORACLE_PRICE_DECIMALS = 8 as const;

/** Basis points denominator (10 000 bps = 100%). */
export const BPS_DENOMINATOR = 10_000n;

// ── Native ↔ ERC-20 ──────────────────────────────────────────────────────────

/**
 * Convert a native-gas USDC amount (18 dec) to ERC-20 USDC (6 dec).
 * Rounds toward zero (truncates sub-micro remainder).
 *
 * @param native  Amount in native/gas units (18 decimals).
 * @returns       Amount in ERC-20 units (6 decimals).
 */
export function nativeToErc20(native: bigint): bigint {
  return native / NATIVE_TO_ERC20_DIVISOR;
}

/**
 * Convert an ERC-20 USDC amount (6 dec) to native-gas USDC (18 dec).
 *
 * @param erc20   Amount in ERC-20 units (6 decimals).
 * @returns       Amount in native/gas units (18 decimals).
 */
export function erc20ToNative(erc20: bigint): bigint {
  return erc20 * NATIVE_TO_ERC20_DIVISOR;
}

// ── Human-readable ↔ ERC-20 ──────────────────────────────────────────────────

/**
 * Parse a human-readable USDC string ("1.50") to ERC-20 units (bigint, 6 dec).
 * Throws on invalid input or more than 6 decimal places.
 */
export function parseUsdcErc20(humanAmount: string): bigint {
  const trimmed = humanAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`parseUsdcErc20: invalid amount string "${humanAmount}"`);
  }
  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  if (fracPart.length > USDC_ERC20_DECIMALS) {
    throw new Error(
      `parseUsdcErc20: "${humanAmount}" has more than ${USDC_ERC20_DECIMALS} decimal places`
    );
  }
  const padded = fracPart.padEnd(USDC_ERC20_DECIMALS, "0");
  return BigInt(intPart) * 10n ** BigInt(USDC_ERC20_DECIMALS) + BigInt(padded);
}

/**
 * Format an ERC-20 USDC bigint (6 dec) to a human-readable string with
 * exactly `decimalsToShow` decimal places (default 2).
 *
 * @param amount          ERC-20 amount (6 decimals).
 * @param decimalsToShow  Decimal places in the output (0–6).
 */
export function formatUsdcErc20(amount: bigint, decimalsToShow = 2): string {
  if (decimalsToShow < 0 || decimalsToShow > USDC_ERC20_DECIMALS) {
    throw new Error(`formatUsdcErc20: decimalsToShow must be 0–${USDC_ERC20_DECIMALS}`);
  }
  const divisor = 10n ** BigInt(USDC_ERC20_DECIMALS);
  const intPart = amount / divisor;
  const fracPart = amount % divisor;
  if (decimalsToShow === 0) return intPart.toString();
  const fracStr = fracPart.toString().padStart(USDC_ERC20_DECIMALS, "0");
  return `${intPart}.${fracStr.slice(0, decimalsToShow)}`;
}

// ── Oracle price helpers ─────────────────────────────────────────────────────

/**
 * Parse a human-readable price string ("150.00") to 8-decimal oracle units.
 */
export function parseOraclePrice(humanPrice: string): bigint {
  const trimmed = humanPrice.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`parseOraclePrice: invalid price string "${humanPrice}"`);
  }
  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  if (fracPart.length > ORACLE_PRICE_DECIMALS) {
    throw new Error(
      `parseOraclePrice: "${humanPrice}" has more than ${ORACLE_PRICE_DECIMALS} decimal places`
    );
  }
  const padded = fracPart.padEnd(ORACLE_PRICE_DECIMALS, "0");
  return BigInt(intPart) * 10n ** BigInt(ORACLE_PRICE_DECIMALS) + BigInt(padded);
}

/**
 * Format an 8-decimal oracle price bigint to a human-readable string.
 *
 * @param price            Oracle price (8 decimals).
 * @param decimalsToShow   Decimal places in the output (default 2).
 */
export function formatOraclePrice(price: bigint, decimalsToShow = 2): string {
  const divisor = 10n ** BigInt(ORACLE_PRICE_DECIMALS);
  const intPart = price / divisor;
  const fracPart = price % divisor;
  if (decimalsToShow === 0) return intPart.toString();
  const fracStr = fracPart.toString().padStart(ORACLE_PRICE_DECIMALS, "0");
  return `${intPart}.${fracStr.slice(0, decimalsToShow)}`;
}

// ── Basis-point math ─────────────────────────────────────────────────────────

/**
 * Apply a fee in basis points to an amount.
 * Result truncates toward zero.
 *
 * @param amount  Full amount (any unit, must be consistent).
 * @param feeBps  Fee in basis points (e.g. 30 = 0.3%).
 */
export function applyBps(amount: bigint, feeBps: bigint): bigint {
  return (amount * feeBps) / BPS_DENOMINATOR;
}

/**
 * Deduct a basis-point fee from an amount (returns net amount after fee).
 *
 * @param amount  Full input amount.
 * @param feeBps  Fee in basis points.
 */
export function deductBps(amount: bigint, feeBps: bigint): bigint {
  return amount - applyBps(amount, feeBps);
}

// ── Max gas price ─────────────────────────────────────────────────────────────

/**
 * The Arc protocol enforces a minimum maxFeePerGas of 20 gwei.
 * Any transaction below this floor is rejected by the sequencer.
 */
export const ARC_MIN_MAX_FEE_PER_GAS_GWEI = 20n;
export const ARC_MIN_MAX_FEE_PER_GAS_WEI = ARC_MIN_MAX_FEE_PER_GAS_GWEI * 10n ** 9n;
