import { describe, expect, it } from "vitest";
import { applyPoolMutation, poolPrice, usdcAmount } from "./market";

describe("reserve-derived spot market values", () => {
  it("applies a USDC-in swap to reserves and calculates the decimal-adjusted price", () => {
    const reserves = applyPoolMutation(
      { reserveQuote: 10_000_000n, reserveBase: 2n * 10n ** 18n },
      {
        kind: "swap",
        usdcIn: true,
        amountIn: 1_000_000n,
        amountOut: 1n * 10n ** 17n,
      },
    );

    expect(reserves).toEqual({
      reserveQuote: 11_000_000n,
      reserveBase: 1_900_000_000_000_000_000n,
    });
    expect(poolPrice(reserves)).toBe("5.789473684210526315");
  });

  it("applies base-in swaps and liquidity updates", () => {
    const reserves = { reserveQuote: 20_000_000n, reserveBase: 4n * 10n ** 18n };
    const sold = applyPoolMutation(reserves, {
      kind: "swap",
      usdcIn: false,
      amountIn: 5n * 10n ** 17n,
      amountOut: 2_000_000n,
    });
    expect(sold).toEqual({
      reserveQuote: 18_000_000n,
      reserveBase: 4_500_000_000_000_000_000n,
    });
    expect(
      applyPoolMutation(sold, {
        kind: "add",
        amountUSDC: 1_000_000n,
        amountBase: 2n * 10n ** 17n,
      }),
    ).toEqual({
      reserveQuote: 19_000_000n,
      reserveBase: 4_700_000_000_000_000_000n,
    });
  });

  it("formats USDC volume from six-decimal units", () => {
    expect(usdcAmount(1_234_567n)).toBe("1.234567");
    expect(usdcAmount(2_000_000n)).toBe("2");
    expect(poolPrice({ reserveQuote: 1n, reserveBase: 0n })).toBeNull();
  });
});
