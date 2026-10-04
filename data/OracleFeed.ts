import { useSyncExternalStore } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { arcTestnet } from "viem/chains";
import { CONTRACT_ADDRESSES } from "../src/constants";

// ── Config ───────────────────────────────────────────────────────────────────
export const CANDLE_SECONDS = 60; // 1-minute candles
const POLL_MS = 4_000; // live poll interval
const WINDOW_SECONDS = 24 * 60 * 60; // rolling 24h window
const MAX_CANDLES = WINDOW_SECONDS / CANDLE_SECONDS;
const PRICE_SCALE = 1e8; // both contracts expose prices with 8 decimals
const LOG_CHUNK_BLOCKS = 9_999n; // starting getLogs span (halves on RPC range errors)
const LOG_MIN_CHUNK_BLOCKS = 500n;
const LOG_MAX_CHUNKS = 10; // hard cap on backfill requests
const MAX_BLOCK_LOOKUPS = 300; // cap on getBlock calls when stamping pool events

const ORACLE_ABI = parseAbi([
  "event PriceUpdated(uint8 indexed pairId, uint256 price, uint256 timestamp)",
  "function getPrice(uint8 pairId) view returns (uint256 price, uint256 timestamp)",
]);

const POOL_ABI = parseAbi([
  "event LiquidityAdded(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpMinted)",
  "event LiquidityRemoved(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpBurned)",
  "event Swap(uint8 indexed pairId, address indexed sender, bool usdcIn, uint256 amountIn, uint256 amountOut, address indexed to)",
  "function getSpotPrice(uint8 pairId) view returns (uint256 price8dec)",
  "function pools(uint8 pairId) view returns (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active)",
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
  /** Shared, mutated in place. Re-read only when `epoch` changes. */
  candles: Candle[];
  /** Copy of the newest candle — feed this to series.update(). */
  last: Candle | null;
  /** Increments whenever the full candle set was rebuilt (use series.setData). */
  epoch: number;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  changePct24h: number | null;
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
/** Walks getLogs backwards in chunks; shrinks the span when the RPC rejects a range. */
async function sweepLogsBackwards<T>(
  fetchRange: (from: bigint, to: bigint) => Promise<T[]>,
  latest: bigint,
  getTime: (log: T) => number | null,
  windowStart: number,
): Promise<T[]> {
  const all: T[] = [];
  let span = LOG_CHUNK_BLOCKS;
  let to = latest;
  let chunks = 0;

  while (to >= 0n && chunks < LOG_MAX_CHUNKS) {
    const from = to - span + 1n > 0n ? to - span + 1n : 0n;
    try {
      const logs = await fetchRange(from, to);
      all.push(...logs);
      chunks++;
      if (from === 0n) break;
      // Stop once we've seen anything older than the window (oracle logs carry a timestamp)
      if (
        logs.some((l) => {
          const t = getTime(l);
          return t !== null && t < windowStart;
        })
      )
        break;
      to = from - 1n;
    } catch {
      if (span <= LOG_MIN_CHUNK_BLOCKS) break;
      span = span / 2n;
    }
  }
  return all;
}

// ── Oracle source ────────────────────────────────────────────────────────────
let oracleHistory: Promise<Map<number, Point[]>> | null = null;

const oracleSource: PriceSource = {
  loadHistory() {
    if (oracleHistory) return oracleHistory;
    oracleHistory = (async () => {
      const out = new Map<number, Point[]>();
      try {
        const latest = await client.getBlockNumber();
        const windowStart = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
        const logs = await sweepLogsBackwards(
          (fromBlock, toBlock) =>
            client.getLogs({
              address: CONTRACT_ADDRESSES.priceOracle,
              event: ORACLE_ABI[0],
              fromBlock,
              toBlock,
            }),
          latest,
          (l) =>
            l.args.timestamp !== undefined ? Number(l.args.timestamp) : null,
          windowStart,
        );
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

// ── Pool source (SpotPoolFactory reserves ratio) ─────────────────────────────
// Backfill works backwards from the current reserves: each Swap / LiquidityAdded /
// LiquidityRemoved is undone in reverse order, so the price after every event is exact.
let poolHistory: Promise<Map<number, Point[]>> | null = null;

interface PoolEvent {
  pairId: number;
  kind: "add" | "remove" | "swap";
  usdcIn: boolean;
  amountUSDC: bigint; // add/remove: usdc amount; swap: amountIn
  amountBase: bigint; // add/remove: base amount; swap: amountOut
  blockNumber: bigint;
  logIndex: number;
}

const priceFromReserves = (rU: bigint, rB: bigint): number | null =>
  rB > 0n ? (Number(rU) * 1e12) / Number(rB) : null; // 6-dec USDC / 18-dec base

const poolSource: PriceSource = {
  loadHistory() {
    if (poolHistory) return poolHistory;
    poolHistory = (async () => {
      const out = new Map<number, Point[]>();
      try {
        const latest = await client.getBlockNumber();

        // Reserves at `latest` (same block as the sweep's upper bound)
        const reserves = new Map<number, { rU: bigint; rB: bigint }>();
        for (const pairId of [0, 1, 2]) {
          const pool = await client.readContract({
            address: CONTRACT_ADDRESSES.spotPool,
            abi: POOL_ABI,
            functionName: "pools",
            args: [pairId],
            blockNumber: latest,
          });
          if (pool[3])
            reserves.set(pairId, { rU: BigInt(pool[1]), rB: BigInt(pool[2]) });
        }
        if (reserves.size === 0) return out;

        const rawLogs = await sweepLogsBackwards(
          (fromBlock, toBlock) =>
            client.getLogs({
              address: CONTRACT_ADDRESSES.spotPool,
              events: [POOL_ABI[0], POOL_ABI[1], POOL_ABI[2]],
              fromBlock,
              toBlock,
            }),
          latest,
          () => null, // swaps carry no timestamp; the chunk cap bounds the sweep instead
          0,
        );

        const events: PoolEvent[] = [];
        for (const log of rawLogs) {
          if (log.blockNumber === null || log.logIndex === null) continue;
          const a = log.args as Record<string, unknown>;
          if (a.pairId === undefined) continue;
          const base = {
            pairId: Number(a.pairId),
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          };
          if (log.eventName === "Swap") {
            events.push({
              ...base,
              kind: "swap",
              usdcIn: a.usdcIn as boolean,
              amountUSDC: a.amountIn as bigint,
              amountBase: a.amountOut as bigint,
            });
          } else {
            events.push({
              ...base,
              kind: log.eventName === "LiquidityAdded" ? "add" : "remove",
              usdcIn: false,
              amountUSDC: a.amountUSDC as bigint,
              amountBase: a.amountBase as bigint,
            });
          }
        }

        // Newest first, so we can undo them one by one
        events.sort((x, y) =>
          x.blockNumber === y.blockNumber
            ? y.logIndex - x.logIndex
            : x.blockNumber > y.blockNumber
              ? -1
              : 1,
        );

        // Stamp events with block timestamps (cap lookups; drop events older than the cap)
        const blockTimes = new Map<bigint, number>();
        const kept: PoolEvent[] = [];
        for (const ev of events) {
          if (!blockTimes.has(ev.blockNumber)) {
            if (blockTimes.size >= MAX_BLOCK_LOOKUPS) break;
            blockTimes.set(ev.blockNumber, -1);
          }
          kept.push(ev);
        }
        const blockList = [...blockTimes.keys()];
        for (let i = 0; i < blockList.length; i += 8) {
          await Promise.all(
            blockList.slice(i, i + 8).map(async (bn) => {
              const blk = await client.getBlock({ blockNumber: bn });
              blockTimes.set(bn, Number(blk.timestamp));
            }),
          );
        }

        const windowStart = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
        for (const ev of kept) {
          const r = reserves.get(ev.pairId);
          const t = blockTimes.get(ev.blockNumber) ?? -1;
          if (!r || t < 0) continue;
          if (t < windowStart) break;

          // Price AFTER this event = current state before undoing it
          const p = priceFromReserves(r.rU, r.rB);
          if (p !== null) {
            const arr = out.get(ev.pairId) ?? [];
            arr.push({ t, p });
            out.set(ev.pairId, arr);
          }

          // Undo the event
          if (ev.kind === "swap") {
            if (ev.usdcIn) {
              r.rU -= ev.amountUSDC;
              r.rB += ev.amountBase;
            } else {
              r.rB -= ev.amountUSDC;
              r.rU += ev.amountBase;
            }
          } else if (ev.kind === "add") {
            r.rU -= ev.amountUSDC;
            r.rB -= ev.amountBase;
          } else {
            r.rU += ev.amountUSDC;
            r.rB += ev.amountBase;
          }
        }
      } catch {
        // Best-effort: live polling still works without history.
      }
      for (const arr of out.values()) arr.sort((a, b) => a.t - b.t);
      return out;
    })();
    return poolHistory;
  },

  async readLive(pairId) {
    const price8 = await client.readContract({
      address: CONTRACT_ADDRESSES.spotPool,
      abi: POOL_ABI,
      functionName: "getSpotPrice",
      args: [pairId],
    });
    return { price: Number(price8) / PRICE_SCALE, updatedAt: null };
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
    };
  }
}

const feeds: Record<FeedSource, Map<number, PairFeed>> = {
  oracle: new Map(),
  pool: new Map(),
};
const sources: Record<FeedSource, PriceSource> = {
  oracle: oracleSource,
  pool: poolSource,
};

function getFeed(source: FeedSource, pairId: number): PairFeed {
  let feed = feeds[source].get(pairId);
  if (!feed) {
    feed = new PairFeed(pairId, sources[source]);
    feeds[source].set(pairId, feed);
  }
  return feed;
}

/** Live feed for one pair. All components share one poller per (source, pair). */
export function usePriceFeed(
  pairId: number,
  source: FeedSource = "oracle",
): FeedSnapshot {
  const feed = getFeed(source, pairId);
  return useSyncExternalStore(
    feed.subscribe,
    feed.getSnapshot,
    feed.getSnapshot,
  );
}

/** Admin-set oracle price (perp mark price). */
export const useOracleFeed = (pairId: number) => usePriceFeed(pairId, "oracle");

/** Spot AMM price = reserveUSDC / reserveBase. Moves on every swap. */
export const usePoolFeed = (pairId: number) => usePriceFeed(pairId, "pool");

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
