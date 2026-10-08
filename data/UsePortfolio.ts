import { useEffect, useMemo, useRef } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  BASE_TOKENS,
  CONTRACT_ADDRESSES,
  PAIRS,
} from "../src/constants";
import PerpEngineArtifact from "../contracts/contract-metadata/PerpEngine.json";
import { usePoolFeed, type Candle } from "../data/OracleFeed";
import { useWalletBalances } from "./MarketStore";

// ── Config ───────────────────────────────────────────────────────────────────
const DAY = 86_400;
const WINDOW_DAYS = 7;
const LIVE_POLL_MS = 10_000;
const LOG_CHUNK = 9_999n; // getLogs span (halves on RPC range errors)
const LOG_MIN_CHUNK = 500n;
const MAX_CHUNKS = 48; // hard cap on the first backfill (≈ 480k blocks)
const CONCURRENCY = 3; // chunks scanned in parallel
const MAX_BLOCK_LOOKUPS = 400; // cap on getBlock calls when stamping events
const HISTORY_POINTS = 56; // points on the 7-day chart
const PRICE_DECIMALS = 1e6; // USDC
const TOKEN_DECIMALS = 1e18; // synthetic base tokens

const client = createPublicClient({ chain: arcTestnet, transport: http() });
const perpAbi = PerpEngineArtifact.abi as Abi;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const SWAP_EVENT = parseAbiItem(
  "event Swap(uint8 indexed pairId, address indexed sender, bool usdcIn, uint256 amountIn, uint256 amountOut, address indexed to)",
);
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const PERP_EVENTS = parseAbi([
  "event PositionOpened(address indexed user, uint8 indexed pairId, bool isLong, uint256 sizeUsdc, uint256 entryPrice, uint256 margin, uint8 leverage)",
  "event PositionClosed(address indexed user, uint8 indexed pairId, int256 pnl, uint256 exitPrice, uint256 feeCharged)",
  "event MarginDeposited(address indexed user, uint256 amount)",
  "event MarginWithdrawn(address indexed user, uint256 amount)",
]);

const ALL_TOKENS: Address[] = [
  ARC_USDC_ADDRESS,
  BASE_TOKENS[0],
  BASE_TOKENS[1],
  BASE_TOKENS[2],
];

// ── Types ────────────────────────────────────────────────────────────────────
export type TxType =
  | "buy"
  | "sell"
  | "long"
  | "short"
  | "close"
  | "sent"
  | "received";

export interface ActivityItem {
  id: string;
  hash: Hex;
  type: TxType;
  /** Signed, display-ready amount, e.g. "+12.5 TECHx" or "$250.00" */
  amount: string;
  /** Secondary line, e.g. "for $31.20" or "5× TECHx" */
  detail: string;
  /** Unix seconds */
  time: number;
  /** true = green, false = red, null = neutral */
  positive: boolean | null;
}

export interface HistoryPoint {
  /** Unix milliseconds */
  t: number;
  value: number;
}

function isHistoryPoint(value: unknown): value is HistoryPoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.t === "number" &&
    Number.isFinite(point.t) &&
    typeof point.value === "number" &&
    Number.isFinite(point.value)
  );
}

function readCachedSeries(address?: Address): HistoryPoint[] {
  if (!address || typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`arcex-portfolio-history-v1:${address.toLowerCase()}`) ??
        "[]",
    );
    return Array.isArray(value) && value.every(isHistoryPoint) ? value : [];
  } catch (error) {
    console.warn("Could not read cached portfolio history.", error);
    return [];
  }
}

function readCachedPositions(
  address?: Address,
): { freeMargin: number; locked: number; pnl: number } | null {
  if (!address || typeof localStorage === "undefined") return null;
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(
        `arcex-portfolio-positions-v1:${address.toLowerCase()}`,
      ) ?? "null",
    );
    if (typeof value !== "object" || value === null) return null;
    const snapshot = value as Record<string, unknown>;
    if (
      typeof snapshot.freeMargin !== "number" ||
      typeof snapshot.locked !== "number" ||
      typeof snapshot.pnl !== "number" ||
      !Number.isFinite(snapshot.freeMargin) ||
      !Number.isFinite(snapshot.locked) ||
      !Number.isFinite(snapshot.pnl)
    )
      return null;
    return {
      freeMargin: snapshot.freeMargin,
      locked: snapshot.locked,
      pnl: snapshot.pnl,
    };
  } catch (error) {
    console.warn("Could not read cached portfolio margin.", error);
    return null;
  }
}

export interface AssetHolding {
  pairId: number;
  ticker: string;
  name: string;
  color: string;
  balance: number;
  price: number;
  value: number;
  changePct24h: number | null;
  candles: Candle[];
  sparkKey: string;
}

interface Meta {
  hash: Hex;
  block: bigint;
  idx: number;
}

type Raw = Meta &
  (
    | {
        k: "swap";
        pairId: number;
        usdcIn: boolean;
        amountIn: bigint;
        amountOut: bigint;
      }
    | {
        k: "open";
        pairId: number;
        isLong: boolean;
        size: bigint;
        leverage: number;
      }
    | { k: "close"; pairId: number; pnl: bigint; fee: bigint }
    | { k: "deposit"; amount: bigint }
    | { k: "withdraw"; amount: bigint }
    | { k: "transfer"; token: Address; incoming: boolean; value: bigint }
  );

type TimedRaw = Raw & { time: number };

interface ActivityData {
  events: TimedRaw[]; // newest first
  coverageStart: number; // unix seconds — how far back the scan reached
}

interface Store {
  events: Map<string, Raw>;
  times: Map<bigint, number>;
  scannedTo: bigint;
  coverageStart: number;
}

// ── On-chain activity scan ───────────────────────────────────────────────────
const metaOf = (l: {
  transactionHash: Hex | null;
  blockNumber: bigint | null;
  logIndex: number | null;
}): Meta | null =>
  l.transactionHash && l.blockNumber !== null && l.logIndex !== null
    ? { hash: l.transactionHash, block: l.blockNumber, idx: l.logIndex }
    : null;

async function fetchLogs(
  user: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Raw[]> {
  const me = user.toLowerCase();
  const [swaps, perp, out, inc] = await Promise.all([
    client.getLogs({
      address: CONTRACT_ADDRESSES.spotPool,
      event: SWAP_EVENT,
      args: { sender: user },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: CONTRACT_ADDRESSES.perpEngine,
      events: PERP_EVENTS,
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: ALL_TOKENS,
      event: TRANSFER_EVENT,
      args: { from: user },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: ALL_TOKENS,
      event: TRANSFER_EVENT,
      args: { to: user },
      fromBlock,
      toBlock,
    }),
  ]);

  const result: Raw[] = [];

  for (const l of swaps) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as {
      pairId: number;
      usdcIn: boolean;
      amountIn: bigint;
      amountOut: bigint;
    };
    result.push({
      ...m,
      k: "swap",
      pairId: Number(a.pairId),
      usdcIn: a.usdcIn,
      amountIn: a.amountIn,
      amountOut: a.amountOut,
    });
  }

  for (const l of perp) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as Record<string, unknown>;
    if (String(a.user).toLowerCase() !== me) continue;
    switch (l.eventName) {
      case "PositionOpened":
        result.push({
          ...m,
          k: "open",
          pairId: Number(a.pairId),
          isLong: a.isLong as boolean,
          size: a.sizeUsdc as bigint,
          leverage: Number(a.leverage),
        });
        break;
      case "PositionClosed":
        result.push({
          ...m,
          k: "close",
          pairId: Number(a.pairId),
          pnl: a.pnl as bigint,
          fee: a.feeCharged as bigint,
        });
        break;
      case "MarginDeposited":
        result.push({ ...m, k: "deposit", amount: a.amount as bigint });
        break;
      case "MarginWithdrawn":
        result.push({ ...m, k: "withdraw", amount: a.amount as bigint });
        break;
    }
  }

  for (const l of out) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as { from: Address; to: Address; value: bigint };
    if (a.to.toLowerCase() === me) continue; // self-transfer — counted once below
    result.push({
      ...m,
      k: "transfer",
      token: l.address,
      incoming: false,
      value: a.value,
    });
  }
  for (const l of inc) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as { from: Address; to: Address; value: bigint };
    result.push({
      ...m,
      k: "transfer",
      token: l.address,
      incoming: true,
      value: a.value,
    });
  }

  return result;
}

/** Fetches one block range, halving the span if the RPC rejects it. */
async function fetchRange(
  user: Address,
  from: bigint,
  to: bigint,
): Promise<Raw[]> {
  try {
    return await fetchLogs(user, from, to);
  } catch (err) {
    if (to - from + 1n <= LOG_MIN_CHUNK) throw err;
    const mid = from + (to - from) / 2n;
    const left = await fetchRange(user, from, mid);
    const right = await fetchRange(user, mid + 1n, to);
    return [...left, ...right];
  }
}

const eventKey = (e: Meta) => `${e.hash}-${e.idx}`;
const stores = new Map<string, Store>();
const activityStorageKey = (user: Address) =>
  `arcex-portfolio-activity-v1:${user.toLowerCase()}`;

function readActivityStore(user: Address): Store | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(activityStorageKey(user));
    if (!raw) return null;
    const value = JSON.parse(raw, (_key, entry: unknown) => {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "__bigint" in entry &&
        typeof entry.__bigint === "string"
      )
        return BigInt(entry.__bigint);
      return entry;
    }) as {
      events?: [string, Raw][];
      times?: [string, number][];
      scannedTo?: string;
      coverageStart?: number;
    };
    if (
      !Array.isArray(value.events) ||
      !Array.isArray(value.times) ||
      typeof value.scannedTo !== "string" ||
      typeof value.coverageStart !== "number"
    )
      return null;
    return {
      events: new Map(value.events),
      times: new Map(value.times.map(([block, time]) => [BigInt(block), time])),
      scannedTo: BigInt(value.scannedTo),
      coverageStart: value.coverageStart,
    };
  } catch (error) {
    console.warn("Could not read cached portfolio activity.", error);
    return null;
  }
}

function persistActivityStore(user: Address, store: Store) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      activityStorageKey(user),
      JSON.stringify(
        {
          events: [...store.events.entries()],
          times: [...store.times.entries()].map(([block, time]) => [
            block.toString(),
            time,
          ]),
          scannedTo: store.scannedTo.toString(),
          coverageStart: store.coverageStart,
        },
        (_key, value: unknown) =>
          typeof value === "bigint" ? { __bigint: value.toString() } : value,
      ),
    );
  } catch (error) {
    console.warn("Could not cache portfolio activity.", error);
  }
}

async function blockTimestamp(blockNumber: bigint): Promise<number> {
  const b = await client.getBlock({ blockNumber });
  return Number(b.timestamp);
}

async function stampBlocks(store: Store) {
  const missing = [...new Set([...store.events.values()].map((e) => e.block))]
    .filter((b) => !store.times.has(b))
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    .slice(0, MAX_BLOCK_LOOKUPS);
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(
      missing.slice(i, i + 8).map(async (bn) => {
        try {
          store.times.set(bn, await blockTimestamp(bn));
        } catch {
          // leave unstamped; the event is skipped this round
        }
      }),
    );
  }
}

/**
 * First call backfills ~7 days backwards; later calls only scan the blocks
 * produced since the previous run, so polling stays cheap.
 */
async function syncActivity(user: Address): Promise<ActivityData> {
  const key = user.toLowerCase();
  const latest = await client.getBlockNumber();
  const cutoff = Math.floor(Date.now() / 1000) - WINDOW_DAYS * DAY;

  let store = stores.get(key) ?? readActivityStore(user) ?? undefined;

  if (!store) {
    const events = new Map<string, Raw>();
    const ranges: Array<[bigint, bigint]> = [];
    let to = latest;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const from = to >= LOG_CHUNK ? to - LOG_CHUNK + 1n : 0n;
      ranges.push([from, to]);
      if (from === 0n) break;
      to = from - 1n;
    }

    let coverageStart = Math.floor(Date.now() / 1000);
    for (let i = 0; i < ranges.length; i += CONCURRENCY) {
      const batch = ranges.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(([f, t]) => fetchRange(user, f, t)),
      );
      for (const list of results)
        for (const ev of list) events.set(eventKey(ev), ev);

      const oldest = batch[batch.length - 1][0];
      coverageStart = await blockTimestamp(oldest);
      if (coverageStart <= cutoff || oldest === 0n) break;
    }

    store = { events, times: new Map(), scannedTo: latest, coverageStart };
    stores.set(key, store);
  } else if (latest > store.scannedTo) {
    let from = store.scannedTo + 1n;
    while (from <= latest) {
      const end =
        from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
      for (const ev of await fetchRange(user, from, end))
        store.events.set(eventKey(ev), ev);
      from = end + 1n;
    }
    store.scannedTo = latest;
  }

  await stampBlocks(store);
  stores.set(key, store);
  persistActivityStore(user, store);

  const events: TimedRaw[] = [];
  for (const ev of store.events.values()) {
    const time = store.times.get(ev.block);
    if (time !== undefined) events.push({ ...ev, time });
  }
  events.sort((a, b) =>
    a.block === b.block ? b.idx - a.idx : a.block > b.block ? -1 : 1,
  );

  return { events, coverageStart: store.coverageStart };
}

// ── Formatting ───────────────────────────────────────────────────────────────
const fmtNum = (n: number, max = 4) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function tokenLabel(token: Address): { symbol: string; decimals: number } {
  const t = token.toLowerCase();
  if (t === ARC_USDC_ADDRESS.toLowerCase())
    return { symbol: "USDC", decimals: PRICE_DECIMALS };
  for (const id of [0, 1, 2]) {
    if (BASE_TOKENS[id].toLowerCase() === t)
      return { symbol: PAIRS[id].ticker, decimals: TOKEN_DECIMALS };
  }
  return { symbol: "TOKEN", decimals: TOKEN_DECIMALS };
}

function toActivity(events: TimedRaw[]): ActivityItem[] {
  // A transfer that belongs to a swap / margin / position tx is already described by that event.
  const protocolTx = new Set(
    events.filter((e) => e.k !== "transfer").map((e) => e.hash),
  );
  const items: ActivityItem[] = [];

  for (const ev of events) {
    const base = { id: eventKey(ev), hash: ev.hash, time: ev.time };
    switch (ev.k) {
      case "swap": {
        const ticker = PAIRS[ev.pairId as 0 | 1 | 2]?.ticker ?? "TOKEN";
        if (ev.usdcIn) {
          const qty = Number(ev.amountOut) / TOKEN_DECIMALS;
          const usd = Number(ev.amountIn) / PRICE_DECIMALS;
          items.push({
            ...base,
            type: "buy",
            amount: `+${fmtNum(qty)} ${ticker}`,
            detail: `for $${fmtUsd(usd)}`,
            positive: true,
          });
        } else {
          const qty = Number(ev.amountIn) / TOKEN_DECIMALS;
          const usd = Number(ev.amountOut) / PRICE_DECIMALS;
          items.push({
            ...base,
            type: "sell",
            amount: `−${fmtNum(qty)} ${ticker}`,
            detail: `for $${fmtUsd(usd)}`,
            positive: false,
          });
        }
        break;
      }
      case "open": {
        const ticker = PAIRS[ev.pairId as 0 | 1 | 2]?.ticker ?? "TOKEN";
        items.push({
          ...base,
          type: ev.isLong ? "long" : "short",
          amount: `$${fmtUsd(Number(ev.size) / PRICE_DECIMALS)}`,
          detail: `${ev.leverage}× ${ticker}`,
          positive: ev.isLong,
        });
        break;
      }
      case "close": {
        const ticker = PAIRS[ev.pairId as 0 | 1 | 2]?.ticker ?? "TOKEN";
        const pnl = Number(ev.pnl) / PRICE_DECIMALS;
        items.push({
          ...base,
          type: "close",
          amount: `${pnl >= 0 ? "+" : "−"}$${fmtUsd(Math.abs(pnl))}`,
          detail: `Closed ${ticker}`,
          positive: pnl >= 0,
        });
        break;
      }
      case "deposit":
        items.push({
          ...base,
          type: "sent",
          amount: `−$${fmtUsd(Number(ev.amount) / PRICE_DECIMALS)}`,
          detail: "USDC → margin",
          positive: false,
        });
        break;
      case "withdraw":
        items.push({
          ...base,
          type: "received",
          amount: `+$${fmtUsd(Number(ev.amount) / PRICE_DECIMALS)}`,
          detail: "USDC ← margin",
          positive: true,
        });
        break;
      case "transfer": {
        if (protocolTx.has(ev.hash)) break;
        const { symbol, decimals } = tokenLabel(ev.token);
        const qty = Number(ev.value) / decimals;
        items.push({
          ...base,
          type: ev.incoming ? "received" : "sent",
          amount: `${ev.incoming ? "+" : "−"}${fmtNum(qty)} ${symbol}`,
          detail: "Wallet transfer",
          positive: ev.incoming,
        });
        break;
      }
    }
  }
  return items;
}

// ── 7-day balance reconstruction ─────────────────────────────────────────────
interface Snapshot {
  usdc: number;
  tokens: [number, number, number];
  /** Free margin + margin locked in open positions (excludes unrealized PnL) */
  margin: number;
}

/** Index of a token in `tokens`, -1 for USDC, -2 for anything else. */
function tokenIndex(token: Address): number {
  const t = token.toLowerCase();
  if (t === ARC_USDC_ADDRESS.toLowerCase()) return -1;
  for (const id of [0, 1, 2])
    if (BASE_TOKENS[id].toLowerCase() === t) return id;
  return -2;
}

function undoEvent(s: Snapshot, ev: TimedRaw) {
  switch (ev.k) {
    case "transfer": {
      const idx = tokenIndex(ev.token);
      if (idx === -2) return;
      const amount =
        Number(ev.value) / (idx === -1 ? PRICE_DECIMALS : TOKEN_DECIMALS);
      const delta = ev.incoming ? -amount : amount;
      if (idx === -1) s.usdc += delta;
      else s.tokens[idx] += delta;
      return;
    }
    case "deposit":
      s.margin -= Number(ev.amount) / PRICE_DECIMALS;
      return;
    case "withdraw":
      s.margin += Number(ev.amount) / PRICE_DECIMALS;
      return;
    case "close":
      // Close credits margin + pnl − fee back to the account
      s.margin -= (Number(ev.pnl) - Number(ev.fee)) / PRICE_DECIMALS;
      return;
    default:
      return; // swaps are covered by their token transfers; opens only move free → locked margin
  }
}

/** Step-function price lookup: candles for the last 24h, the user's own swaps before that. */
function makePriceAt(
  candlesByPair: Candle[][],
  fallback: number[],
  events: TimedRaw[],
): (pairId: number, t: number) => number {
  const obs: Array<Array<[number, number]>> = [[], [], []];

  for (const ev of events) {
    if (ev.k !== "swap" || obs[ev.pairId] === undefined) continue;
    const usdc = ev.usdcIn ? Number(ev.amountIn) : Number(ev.amountOut);
    const base = ev.usdcIn ? Number(ev.amountOut) : Number(ev.amountIn);
    if (base > 0)
      obs[ev.pairId].push([
        ev.time,
        usdc / PRICE_DECIMALS / (base / TOKEN_DECIMALS),
      ]);
  }
  candlesByPair.forEach((candles, i) => {
    for (const c of candles) obs[i].push([c.time, c.close]);
    obs[i].sort((a, b) => a[0] - b[0]);
  });

  return (pairId, t) => {
    const arr = obs[pairId];
    if (!arr || arr.length === 0) return fallback[pairId] ?? 0;
    let lo = 0;
    let hi = arr.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found === -1 ? arr[0][1] : arr[found][1];
  };
}

function buildSeries(
  events: TimedRaw[],
  coverageStart: number,
  live: Snapshot & { netWorth: number },
  priceAt: (pairId: number, t: number) => number,
): HistoryPoint[] {
  const now = Math.floor(Date.now() / 1000);
  const start = Math.max(now - WINDOW_DAYS * DAY, coverageStart);
  const step = Math.max(60, Math.floor((now - start) / (HISTORY_POINTS - 1)));

  const state: Snapshot = {
    usdc: live.usdc,
    tokens: [...live.tokens],
    margin: live.margin,
  };
  const points: HistoryPoint[] = [];
  let cursor = 0;

  for (let ts = now - step; ts >= start; ts -= step) {
    while (cursor < events.length && events[cursor].time > ts) {
      undoEvent(state, events[cursor]);
      cursor++;
    }
    const spot = state.tokens.reduce(
      (sum, qty, i) => sum + qty * priceAt(i, ts),
      0,
    );
    points.push({
      t: ts * 1000,
      value: Math.max(0, state.usdc + state.margin + spot),
    });
  }

  points.reverse();
  points.push({ t: now * 1000, value: live.netWorth });
  return points;
}

/** Keeps the last non-null value; resets when the wallet address changes.
 *  Intentional render-phase ref mutation: this helper IS the cache. */
function useLastGood<T>(key: string | undefined, next: T | null): T | null {
  const ref = useRef<{ key: string | undefined; value: T | null }>({
    key,
    value: null,
  });
  // oxlint-disable-next-line react/refs -- intentional render-phase ref cache
  if (ref.current.key !== key) ref.current = { key, value: null };
  // oxlint-disable-next-line react/refs -- intentional render-phase ref cache
  if (next !== null) ref.current.value = next;
  // oxlint-disable-next-line react/refs -- intentional render-phase ref cache
  return ref.current.value;
}

// ── Public hook ──────────────────────────────────────────────────────────────
export function usePortfolio() {
  const { address, isConnected } = useAccount();
  const enabled = isConnected && !!address;
  const user = address ?? ZERO_ADDRESS;
  const walletBalances = useWalletBalances(enabled ? address : undefined);

  const positions = useReadContracts({
    contracts: [
      {
        address: CONTRACT_ADDRESSES.perpEngine,
        abi: perpAbi,
        functionName: "marginAccounts",
        args: [user],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
      ...[0, 1, 2].flatMap((id) => [
        {
          address: CONTRACT_ADDRESSES.perpEngine,
          abi: perpAbi,
          functionName: "positions",
          args: [user, id],
          chainId: ARC_TESTNET_CHAIN_ID,
        },
        {
          address: CONTRACT_ADDRESSES.perpEngine,
          abi: perpAbi,
          functionName: "getUnrealizedPnl",
          args: [user, id],
          chainId: ARC_TESTNET_CHAIN_ID,
        },
      ]),
    ] as never,
    query: {
      enabled,
      refetchInterval: LIVE_POLL_MS,
      refetchOnWindowFocus: false,
    },
  });

  type BalanceSnap = {
    usdc: number;
    balances: [number, number, number];
  };
  type PosSnap = { freeMargin: number; locked: number; pnl: number };
  type Res = { status: string; result?: unknown };

  const balanceNext = useMemo<BalanceSnap | null>(
    () =>
      walletBalances
        ? { usdc: walletBalances.usdc, balances: walletBalances.tokens }
        : null,
    [walletBalances],
  );

  const posNext = useMemo<PosSnap | null>(() => {
    const r = positions.data as Res[] | undefined;
    if (!r || r.length !== 7 || r[0].status !== "success") return null;
    let locked = 0;
    let pnl = 0;
    const freeMargin = Number(r[0].result) / PRICE_DECIMALS;
    for (const id of [0, 1, 2]) {
      const pos = r[1 + id * 2];
      if (pos.status !== "success") return null;
      const row = pos.result as readonly unknown[];
      if (!Array.isArray(row) || !row[8]) continue; // index 8 = isOpen
      const pnlRes = r[2 + id * 2];
      if (pnlRes.status !== "success") return null; // open position, PnL unknown → keep last good
      locked += Number(row[4] as bigint) / PRICE_DECIMALS;
      pnl += Number(pnlRes.result) / PRICE_DECIMALS;
    }
    return { freeMargin, locked, pnl };
  }, [positions.data]);

  // Last-known-good snapshots (reset when the wallet changes)
  const balanceSnap = useLastGood(address, balanceNext);
  const latestPosSnap = useLastGood(address, posNext);
  const cachedPosSnap = useMemo(() => readCachedPositions(address), [address]);
  const posSnap = latestPosSnap ?? cachedPosSnap;
  useEffect(() => {
    if (!address || !latestPosSnap) return;
    try {
      localStorage.setItem(
        `arcex-portfolio-positions-v1:${address.toLowerCase()}`,
        JSON.stringify(latestPosSnap),
      );
    } catch (error) {
      console.warn("Could not cache portfolio margin.", error);
    }
  }, [address, latestPosSnap]);
  const ready = enabled && balanceSnap !== null;

  const usdc = balanceSnap?.usdc ?? 0;
  const balances =
    balanceSnap?.balances ?? ([0, 0, 0] as [number, number, number]);
  const freeMargin = posSnap?.freeMargin ?? 0;
  const lockedMargin = posSnap?.locked ?? 0;
  const unrealizedPnl = posSnap?.pnl ?? 0;

  // Candles / 24h change / sparkline come from the shared pool feeds (display only)
  const feed0 = usePoolFeed(0);
  const feed1 = usePoolFeed(1);
  const feed2 = usePoolFeed(2);
  const feeds = [feed0, feed1, feed2];

  const assets: AssetHolding[] = PAIRS.map((pair, i) => {
    const price = feeds[i].price ?? 0;
    return {
      pairId: pair.id,
      ticker: pair.ticker,
      name: pair.name,
      color: pair.color,
      balance: balances[i],
      price,
      value: balances[i] * price, // holdings × live pool price
      changePct24h: feeds[i].changePct24h,
      candles: feeds[i].candles,
      sparkKey: `${feeds[i].epoch}:${feeds[i].last?.time}:${feeds[i].last?.close}`,
    };
  });

  const spotValue = assets.reduce((sum, a) => sum + a.value, 0);
  const marginValue = freeMargin + lockedMargin + unrealizedPnl;
  const netWorth = usdc + spotValue + marginValue;

  // On-chain activity (swaps, perps, margin, transfers) — also drives the history
  const activity = useQuery({
    queryKey: ["portfolio-activity", address],
    queryFn: () => syncActivity(address as Address),
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const balanceKey = balances.join(",");

  const cachedSeries = useMemo(() => readCachedSeries(address), [address]);
  const rebuiltSeries = useMemo<HistoryPoint[]>(() => {
    if (!ready || !activity.data) return [];
    const priceAt = makePriceAt(
      feeds.map((f) => f.candles),
      feeds.map((f) => f.price ?? 0),
      activity.data.events,
    );
    return buildSeries(
      activity.data.events,
      activity.data.coverageStart,
      { usdc, tokens: balances, margin: freeMargin + lockedMargin, netWorth },
      priceAt,
    );
    // feeds/balances are tracked through their keys; candles are mutated in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    activity.data,
    usdc,
    balanceKey,
    freeMargin,
    lockedMargin,
  ]);
  const series = useMemo<HistoryPoint[]>(() => {
    if (rebuiltSeries.length > 0)
      return [
        ...rebuiltSeries.slice(0, -1),
        { t: Date.now(), value: netWorth },
      ];
    if (!ready || cachedSeries.length === 0) return cachedSeries;
    return [
      ...cachedSeries.slice(0, -1),
      { t: Date.now(), value: netWorth },
    ];
  }, [rebuiltSeries, cachedSeries, ready, netWorth]);

  useEffect(() => {
    if (!address || series.length === 0) return;
    try {
      localStorage.setItem(
        `arcex-portfolio-history-v1:${address.toLowerCase()}`,
        JSON.stringify(series),
      );
    } catch (error) {
      console.warn("Could not cache portfolio history.", error);
    }
  }, [address, series]);

  const recent = useMemo(
    () => (activity.data ? toActivity(activity.data.events).slice(0, 5) : []),
    [activity.data],
  );

  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? netWorth;
  const changeAbs = last - first;
  const changePct = first > 0 ? (changeAbs / first) * 100 : null;

  return {
    address,
    isConnected,
    ready,
    netWorth,
    usdc,
    spotValue,
    freeMargin,
    lockedMargin,
    unrealizedPnl,
    marginValue,
    assets,
    series,
    changeAbs,
    changePct,
    coverageStart: activity.data?.coverageStart ?? null,
    historyLoading:
      enabled && series.length === 0 && (activity.isPending || !ready),
    historyError: activity.isError,
    balancesUpdating: enabled && (walletBalances?.updating ?? true),
    recent,
    activityLoading: enabled && activity.isPending,
  };
}
