/**
 * useMainnetPrices — one cached read of real asset prices.
 *
 * Backed by TanStack Query with a long staleTime so the Portfolio page, the
 * dropdown, and any other consumer share a single fetch. On error it returns
 * null rather than a wrong number, so the UI can show balances without a USD
 * value.
 *
 * Synthetic testnet pairs never use this — they price from live pool reserves.
 */

import { useQuery } from "@tanstack/react-query";
import { PRICE_STALE_MS, fetchPrices, type PriceQuote } from "../config/prices";

export interface MainnetPrices {
  /** priceId -> quote. Empty when the fetch failed. */
  quotes: Record<string, PriceQuote>;
  /** True when prices are unavailable (balances still show, without USD). */
  unavailable: boolean;
}

export function useMainnetPrices(enabled = true): MainnetPrices {
  const query = useQuery({
    queryKey: ["mainnet-prices"],
    queryFn: ({ signal }) => fetchPrices(signal),
    enabled,
    staleTime: PRICE_STALE_MS,
    gcTime: PRICE_STALE_MS * 2,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (query.data) {
    return { quotes: query.data, unavailable: false };
  }
  // No data yet, or the fetch failed: report unavailable so callers omit USD.
  return { quotes: {}, unavailable: true };
}

export default useMainnetPrices;
