/**
 * config/prices.ts — single entry point for mainnet asset prices.
 *
 * One base URL + one id map. No API key is hardcoded: if a provider needs one,
 * read it from `import.meta.env` here and nowhere else.
 *
 * CoinGecko's free `/simple/price` endpoint needs no key for low-volume use.
 * If you switch providers, change `PRICE_BASE_URL` and `PRICE_IDS` only — the
 * hook and UI stay unchanged.
 *
 * IMPORTANT: this is used ONLY for real mainnet assets (ETH, BTC, SOL). The
 * synthetic testnet pairs never use it — they price from live pool reserves.
 */

/** CoinGecko simple-price endpoint. No key required at low volume. */
export const PRICE_BASE_URL = "https://api.coingecko.com/api/v3/simple/price";

/** Optional pro key, if you later switch to a paid tier. */
export const PRICE_API_KEY: string =
  import.meta.env.VITE_COINGECKO_API_KEY ?? "";

/** Maps our internal `priceId` to the provider's coin id. */
export const PRICE_IDS: Record<string, string> = {
  ethereum: "ethereum",
  bitcoin: "bitcoin",
  solana: "solana",
};

/** Cache window for prices (51 minutes). */
export const PRICE_STALE_MS = 60 * 51 * 1000;

export interface PriceQuote {
  /** USD price. */
  usd: number;
  /** 24h change in percent, when the provider supplies it. */
  changePct24h: number | null;
}

/**
 * Fetches prices for every id in `PRICE_IDS` in one request.
 *
 * Returns null on any failure so callers can show the balance without a USD
 * value rather than a wrong one.
 */
export async function fetchPrices(
  signal?: AbortSignal,
): Promise<Record<string, PriceQuote> | null> {
  const ids = Object.values(PRICE_IDS).join(",");
  const url =
    `${PRICE_BASE_URL}?ids=${encodeURIComponent(ids)}` +
    `&vs_currencies=usd&include_24hr_change=true`;

  try {
    const res = await fetch(url, {
      signal,
      headers: PRICE_API_KEY
        ? { "x-cg-pro-api-key": PRICE_API_KEY }
        : { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return null;

    const out: Record<string, PriceQuote> = {};
    for (const [priceId, coinId] of Object.entries(PRICE_IDS)) {
      const entry = (body as Record<string, unknown>)[coinId];
      if (typeof entry !== "object" || entry === null) continue;
      const usd = (entry as Record<string, unknown>).usd;
      const change = (entry as Record<string, unknown>).usd_24h_change;
      if (typeof usd === "number" && Number.isFinite(usd)) {
        out[priceId] = {
          usd,
          changePct24h:
            typeof change === "number" && Number.isFinite(change) ? change : null,
        };
      }
    }
    return out;
  } catch {
    // Aborted, offline, or rate-limited — caller shows balance without USD.
    return null;
  }
}
