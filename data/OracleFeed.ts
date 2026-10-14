import { useCallback, useSyncExternalStore } from "react";
import {
  marketStore,
  type MarketPairSnapshot,
} from "./MarketStore";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Candle {
  time: number; // UTCTimestamp, seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type FeedStatus = "connecting" | "live" | "error";

export interface FeedSnapshot {
  status: FeedStatus;
  /** Latest price in USDC, or null until the first read succeeds. */
  price: number | null;
  /** Shared candle history; use `epoch` only when a history rebuild is needed. */
  candles: Candle[];
  /** Copy of the newest candle — feed this to series.update(). */
  last: Candle | null;
  /** Increments whenever the full candle set was rebuilt (use series.setData). */
  epoch: number;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  changePct24h: number | null;
  volume24h: number;
}

/** Live spot feed for one pair, shared by all consumers. */
export function usePriceFeed(pairId: number): FeedSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => marketStore.subscribePair(pairId, listener),
    [pairId],
  );
  const getSnapshot = useCallback(
    () => marketStore.getPairSnapshot(pairId),
    [pairId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return poolFeedSnapshot(snapshot as MarketPairSnapshot);
}

/** Spot AMM price = reserveUSDC / reserveBase. Moves on every swap. */
export const usePoolFeed = usePriceFeed;

function poolFeedSnapshot(snapshot: MarketPairSnapshot): FeedSnapshot {
  return {
    status: snapshot.status,
    price: snapshot.price,
    candles: snapshot.candles,
    last: snapshot.last,
    epoch: snapshot.epoch,
    open24h: snapshot.open24h,
    high24h: snapshot.high24h,
    low24h: snapshot.low24h,
    changePct24h: snapshot.changePct24h,
    volume24h: snapshot.volume24h,
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────
export function pricePrecision(price: number | null | undefined): number {
  if (!price || price >= 1) return 2;
  if (price >= 0.01) return 4;
  return 6;
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: pricePrecision(price),
    maximumFractionDigits: pricePrecision(price),
  });
}

export function formatAgo(unixSeconds: number | null): string {
  if (!unixSeconds) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
