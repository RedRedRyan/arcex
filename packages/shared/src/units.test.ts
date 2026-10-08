/**
 * @file units.test.ts
 * @description Unit + property tests for the units module.
 */

import { describe, it, expect } from "vitest";
import {
  nativeToErc20,
  erc20ToNative,
  parseUsdcErc20,
  formatUsdcErc20,
  parseOraclePrice,
  formatOraclePrice,
  applyBps,
  deductBps,
  NATIVE_TO_ERC20_DIVISOR,
  USDC_ERC20_DECIMALS,
  USDC_NATIVE_DECIMALS,
  ARC_MIN_MAX_FEE_PER_GAS_WEI,
  BPS_DENOMINATOR,
} from "./units.js";

describe("constants", () => {
  it("USDC_ERC20_DECIMALS is 6", () => expect(USDC_ERC20_DECIMALS).toBe(6));
  it("USDC_NATIVE_DECIMALS is 18", () => expect(USDC_NATIVE_DECIMALS).toBe(18));
  it("NATIVE_TO_ERC20_DIVISOR is 10^12", () =>
    expect(NATIVE_TO_ERC20_DIVISOR).toBe(10n ** 12n));
  it("ARC_MIN_MAX_FEE_PER_GAS_WEI is 20 gwei", () =>
    expect(ARC_MIN_MAX_FEE_PER_GAS_WEI).toBe(20_000_000_000n));
});

describe("nativeToErc20", () => {
  it("1 USDC native (1e18) → 1 USDC erc20 (1e6)", () =>
    expect(nativeToErc20(10n ** 18n)).toBe(10n ** 6n));
  it("round-trips: nativeToErc20(erc20ToNative(x)) === x for whole units", () => {
    const erc20 = 123_456_789n; // 123.456789 USDC
    expect(nativeToErc20(erc20ToNative(erc20))).toBe(erc20);
  });
  it("truncates sub-micro remainder", () =>
    expect(nativeToErc20(999_999_999_999n)).toBe(0n)); // < 1 micro USDC
  it("handles zero", () => expect(nativeToErc20(0n)).toBe(0n));
});

describe("erc20ToNative", () => {
  it("1 USDC erc20 (1e6) → 1 USDC native (1e18)", () =>
    expect(erc20ToNative(10n ** 6n)).toBe(10n ** 18n));
  it("0 → 0", () => expect(erc20ToNative(0n)).toBe(0n));
});

describe("parseUsdcErc20", () => {
  it("parses integer string", () => expect(parseUsdcErc20("1")).toBe(1_000_000n));
  it("parses decimal string", () => expect(parseUsdcErc20("1.50")).toBe(1_500_000n));
  it("parses full 6-decimal string", () =>
    expect(parseUsdcErc20("1.123456")).toBe(1_123_456n));
  it("parses zero", () => expect(parseUsdcErc20("0")).toBe(0n));
  it("throws on >6 decimal places", () =>
    expect(() => parseUsdcErc20("1.1234567")).toThrow());
  it("throws on non-numeric", () =>
    expect(() => parseUsdcErc20("abc")).toThrow());
  it("throws on negative", () =>
    expect(() => parseUsdcErc20("-1")).toThrow());
});

describe("formatUsdcErc20", () => {
  it("formats with 2 decimals by default", () =>
    expect(formatUsdcErc20(1_500_000n)).toBe("1.50"));
  it("formats with 0 decimals", () =>
    expect(formatUsdcErc20(1_500_000n, 0)).toBe("1"));
  it("formats with 6 decimals", () =>
    expect(formatUsdcErc20(1_123_456n, 6)).toBe("1.123456"));
  it("zero stays zero", () =>
    expect(formatUsdcErc20(0n, 2)).toBe("0.00"));
  it("throws on decimalsToShow > 6", () =>
    expect(() => formatUsdcErc20(1n, 7)).toThrow());
  it("round-trips with parseUsdcErc20", () => {
    const input = "42.50";
    expect(formatUsdcErc20(parseUsdcErc20(input))).toBe(input);
  });
});

describe("parseOraclePrice / formatOraclePrice", () => {
  it("parses $150.00", () => expect(parseOraclePrice("150.00")).toBe(150_00000000n));
  it("formats 8-dec bigint", () =>
    expect(formatOraclePrice(150_00000000n)).toBe("150.00"));
  it("round-trips", () => {
    const raw = "75.12345678";
    expect(formatOraclePrice(parseOraclePrice(raw), 8)).toBe(raw);
  });
});

describe("applyBps / deductBps", () => {
  it("30 bps of 10_000_000 = 30_000", () =>
    expect(applyBps(10_000_000n, 30n)).toBe(30_000n));
  it("deductBps removes fee", () =>
    expect(deductBps(10_000_000n, 30n)).toBe(9_970_000n));
  it("BPS_DENOMINATOR is 10000", () => expect(BPS_DENOMINATOR).toBe(10_000n));
  it("0 bps = 0 fee", () => expect(applyBps(1_000_000n, 0n)).toBe(0n));
  it("10000 bps = full amount", () => expect(applyBps(1_000_000n, 10_000n)).toBe(1_000_000n));
});
