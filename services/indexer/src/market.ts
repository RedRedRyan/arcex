export interface PoolReserves {
  reserveQuote: bigint;
  reserveBase: bigint;
}

export type PoolMutation =
  | { kind: "swap"; usdcIn: boolean; amountIn: bigint; amountOut: bigint }
  | { kind: "add"; amountUSDC: bigint; amountBase: bigint }
  | { kind: "remove"; amountUSDC: bigint; amountBase: bigint };

export function applyPoolMutation(
  reserves: PoolReserves,
  mutation: PoolMutation,
): PoolReserves {
  if (mutation.kind === "swap") {
    return mutation.usdcIn
      ? {
          reserveQuote: reserves.reserveQuote + mutation.amountIn,
          reserveBase: reserves.reserveBase - mutation.amountOut,
        }
      : {
          reserveQuote: reserves.reserveQuote - mutation.amountOut,
          reserveBase: reserves.reserveBase + mutation.amountIn,
        };
  }
  if (mutation.kind === "add") {
    return {
      reserveQuote: reserves.reserveQuote + mutation.amountUSDC,
      reserveBase: reserves.reserveBase + mutation.amountBase,
    };
  }
  return {
    reserveQuote: reserves.reserveQuote - mutation.amountUSDC,
    reserveBase: reserves.reserveBase - mutation.amountBase,
  };
}

export function poolPrice(reserves: PoolReserves): string | null {
  if (reserves.reserveBase <= 0n) return null;
  const scaledPrice = (reserves.reserveQuote * 10n ** 30n) / reserves.reserveBase;
  const whole = scaledPrice / 10n ** 18n;
  const fraction = (scaledPrice % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function usdcAmount(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
