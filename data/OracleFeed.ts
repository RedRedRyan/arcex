import { useCallback, useSyncExternalStore } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { arcTestnet } from "viem/chains";
import { CONTRACT_ADDRESSES } from "../src/constants";
import {
  marketStore,
  type MarketPairSnapshot,
} from "./MarketStore";

// ── Config ───────────────────────────────────────────────────────────────────
export const CANDLE_SECONDS = 60; // 1-minute candles
const POLL_MS = 4_000; // live poll interval
const WINDOW_SECONDS = 24 * 60 * 60; // rolling 24h window
const MAX_CANDLES = WINDOW_SECONDS / CANDLE_SECONDS;
const PRICE_SCALE = 1e8; // both contracts expose prices with 8 decimals

const ORACLE_ABI = parseAbi([
  "event PriceUpdated(uint8 indexed pairId, uint256 price, uint256 timestamp)",
  "function getPrice(uint8 pairId) view returns (uint256 price, uint256 timestamp)",
]);

const client = createPublicClient({ chain: arcTestnet, transport: http() });

// ── Types ────────────────────────────────────────────────────────────────────
export interface Candle {
  time: number; // UTCTimestamp, seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type FeedStatus = "connecting" | "live" | "error";
export type FeedSource = "oracle" | "pool";

export interface FeedSnapshot {
  status: FeedStatus;
  /** Latest price in USDC, or null until the first read succeeds. */
  price: number | null;
  /** Unix seconds of the oracle's last on-chain update (oracle source only). */
  oracleUpdatedAt: number | null;
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

interface Point {
  t: number; // seconds
  p: number;
}

interface LiveRead {
  price: number;
  updatedAt: number | null;
}

interface PriceSource {
  loadHistory(): Promise<Map<number, Point[]>>;
  readLive(pairId: number): Promise<LiveRead>;
}

// ── Shared helpers ───────────────────────────────────────────────────────────
// ── Oracle source ────────────────────────────────────────────────────────────
let oracleHistory: Promise<Map<number, Point[]>> | null = null;

const oracleSource: PriceSource = {
  loadHistory() {
    if (oracleHistory) return oracleHistory;
    oracleHistory = (async () => {
      const out = new Map<number, Point[]>();
      try {
        const latest = await client.getBlockNumber();
        const fromBlock = latest > 10_000n ? latest - 10_000n : 0n;
        const logs = await client.getLogs({
          address: CONTRACT_ADDRESSES.priceOracle,
          event: ORACLE_ABI[0],
          fromBlock,
          toBlock: latest,
        });
        for (const log of logs) {
          const { pairId, price, timestamp } = log.args;
          if (
            pairId === undefined ||
            price === undefined ||
            timestamp === undefined
          )
            continue;
          const arr = out.get(Number(pairId)) ?? [];
          arr.push({ t: Number(timestamp), p: Number(price) / PRICE_SCALE });
          out.set(Number(pairId), arr);
        }
      } catch {
        // History is best-effort; live polling still works without it.
      }
      for (const arr of out.values()) arr.sort((a, b) => a.t - b.t);
      return out;
    })();
    return oracleHistory;
  },

  async readLive(pairId) {
    const [price, ts] = await client.readContract({
      address: CONTRACT_ADDRESSES.priceOracle,
      abi: ORACLE_ABI,
      functionName: "getPrice",
      args: [pairId],
    });
    return { price: Number(price) / PRICE_SCALE, updatedAt: Number(ts) };
  },
};

// ── Candle aggregation ───────────────────────────────────────────────────────
function addPoint(candles: Candle[], t: number, p: number) {
  const bucket = Math.floor(t / CANDLE_SECONDS) * CANDLE_SECONDS;
  const last = candles[candles.length - 1];

  if (!last) {
    candles.push({ time: bucket, open: p, high: p, low: p, close: p });
    return;
  }
  if (bucket < last.time) return; // out-of-order; rebuild path sorts these

  if (bucket === last.time) {
    last.high = Math.max(last.high, p);
    last.low = Math.min(last.low, p);
    last.close = p;
    return;
  }

  // Carry the last close forward across quiet minutes (price only moves on updates/trades)
  const gap = (bucket - last.time) / CANDLE_SECONDS - 1;
  if (gap > 0 && gap <= MAX_CANDLES) {
    for (let i = 1; i <= gap; i++) {
      const c = last.close;
      candles.push({
        time: last.time + i * CANDLE_SECONDS,
        open: c,
        high: c,
        low: c,
        close: c,
      });
    }
  }
  const prev = candles[candles.length - 1].close;
  candles.push({
    time: bucket,
    open: prev,
    high: Math.max(prev, p),
    low: Math.min(prev, p),
    close: p,
  });

  if (candles.length > MAX_CANDLES)
    candles.splice(0, candles.length - MAX_CANDLES);
}

// ── Per-pair feed store ──────────────────────────────────────────────────────
class PairFeed {
  private listeners = new Set<() => void>();
  private candles: Candle[] = [];
  private pending: Point[] = []; // live ticks received before history landed
  private historyReady = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: FeedStatus = "connecting";
  private oracleUpdatedAt: number | null = null;
  private epoch = 0;
  private snapshot: FeedSnapshot;

  constructor(
    private readonly pairId: number,
    private readonly source: PriceSource,
  ) {
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  getSnapshot = () => this.snapshot;

  private start() {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    void this.source.loadHistory().then((history) => {
      if (this.listeners.size === 0) return;
      const points = [
        ...(history.get(this.pairId) ?? []),
        ...this.pending,
      ].sort((a, b) => a.t - b.t);
      this.pending = [];
      this.candles = [];
      for (const pt of points) addPoint(this.candles, pt.t, pt.p);
      this.historyReady = true;
      this.epoch++;
      this.emit();
    });
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Fresh start on next subscribe so the chart never replays stale candles
    this.historyReady = false;
    this.pending = [];
  }

  private async poll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const { price, updatedAt } = await this.source.readLive(this.pairId);
      const t = Math.floor(Date.now() / 1000);
      this.oracleUpdatedAt = updatedAt;
      this.status = "live";

      if (this.historyReady) addPoint(this.candles, t, price);
      else {
        this.pending.push({ t, p: price });
        addPoint(this.candles, t, price); // show something immediately
      }
    } catch {
      this.status = "error";
    }
    this.emit();
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private buildSnapshot(): FeedSnapshot {
    const c = this.candles;
    const last = c.length ? c[c.length - 1] : null;
    const first = c.length ? c[0] : null;
    let high: number | null = null;
    let low: number | null = null;
    for (const k of c) {
      high = high === null ? k.high : Math.max(high, k.high);
      low = low === null ? k.low : Math.min(low, k.low);
    }
    const open24h = first ? first.open : null;
    return {
      status: this.status,
      price: last ? last.close : null,
      oracleUpdatedAt: this.oracleUpdatedAt,
      candles: c,
      last: last ? { ...last } : null,
      epoch: this.epoch,
      open24h,
      high24h: high,
      low24h: low,
      changePct24h:
        last && open24h ? ((last.close - open24h) / open24h) * 100 : null,
      volume24h: 0,
    };
  }
}

const oracleFeeds = new Map<number, PairFeed>();

function getFeed(pairId: number): PairFeed {
  let feed = oracleFeeds.get(pairId);
  if (!feed) {
    feed = new PairFeed(pairId, oracleSource);
    oracleFeeds.set(pairId, feed);
  }
  return feed;
}

/** Live feed for one pair, shared by all consumers. */
export function usePriceFeed(
  pairId: number,
  source: FeedSource = "oracle",
): FeedSnapshot {
  const oracleFeed = getFeed(pairId);
  const subscribe = useCallback(
    (listener: () => void) =>
      source === "pool"
        ? marketStore.subscribePair(pairId, listener)
        : oracleFeed.subscribe(listener),
    [pairId, source, oracleFeed],
  );
  const getSnapshot = useCallback(
    () =>
      source === "pool"
        ? marketStore.getPairSnapshot(pairId)
        : oracleFeed.getSnapshot(),
    [pairId, source, oracleFeed],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return source === "pool"
    ? poolFeedSnapshot(snapshot as MarketPairSnapshot)
    : (snapshot as FeedSnapshot);
}

/** Admin-set oracle price (perp mark price). */
export const useOracleFeed = (pairId: number) => usePriceFeed(pairId, "oracle");

/** Spot AMM price = reserveUSDC / reserveBase. Moves on every swap. */
export const usePoolFeed = (pairId: number) => usePriceFeed(pairId, "pool");

function poolFeedSnapshot(snapshot: MarketPairSnapshot): FeedSnapshot {
  return {
    status: snapshot.status,
    price: snapshot.price,
    oracleUpdatedAt: null,
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
