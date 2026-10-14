import { useEffect, useMemo, useRef } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  fallback,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { usePoolFeed, type Candle } from "../data/OracleFeed";
import { useWalletBalances } from "./MarketStore";
import { useNetwork } from "../src/config/NetworkProvider";
import {
  NETWORKS,
  type NetworkName,
  type PairConfig,
} from "../src/config/networks";
import { useUsdcBalances } from "../src/hooks/useUsdcBalances";
import {
  useAssetBalances,
  type AssetBalance,
} from "../src/hooks/useAssetBalances";

const PRICE_DECIMALS = 1_000_000; // USDC, 6dp
const TOKEN_DECIMALS = 1e18; // base tokens, 18dp
const LOG_MIN_CHUNK = 50n;
const LOG_CHUNK = 5_000n;
const MAX_CHUNKS = 60;
const MAX_BLOCK_LOOKUPS = 120;
const CONCURRENCY = 4;
const WINDOW_DAYS = 7;
const HISTORY_POINTS = 60;
const DAY = 86_400;

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

export interface ActivityItem {
  id: string;
  hash: Hex;
  time: number | null;
  type: "buy" | "sell" | "received" | "sent";
  amount: string;
  detail: string;
  positive: boolean;
}

export interface HistoryPoint {
  t: number;
  value: number;
}

/** A real mainnet asset, valued with the price feed. */
export interface MainnetAssetRow {
  key: string;
  symbol: string;
  name: string;
  chainId: number;
  balance: number;
  decimals: number;
  /** USD price, or null when prices are unavailable (balance still shows). */
  priceUsd: number | null;
  changePct24h: number | null;
  /** USD value, or null when the price is unknown. */
  valueUsd: number | null;
  status: "success" | "error";
}

/** A USDC balance for one chain. */
export interface UsdcChainRow {
  chainId: number;
  label: string;
  balance: number;
  status: "idle" | "loading" | "success" | "error";
}

// ── Per-network on-chain context ─────────────────────────────────────────────
// No hardcoded chain, RPC, address, or pair list: everything is read from
// config/networks.ts for the ACTIVE network, so testnet and mainnet data can
// never be mixed.

interface ChainCtx {
  network: NetworkName;
  /** Public client bound to the active network. */
  client: ReturnType<typeof createPublicClient>;
  /** USDC ERC-20 address on the active network. */
  usdcAddress: Address;
  /** Tracked spot-pair tokens, by pair id. */
  baseTokens: Address[];
  /** Spot pool contract. ZERO on networks where it is not deployed. */
  spotPool: Address;
  /** Synthetic pairs on the active network. */
  pairs: PairConfig[];
  /** True when this network has configured spot pairs. */
  hasSynthetics: boolean;
  /** viem chain id of the active network. */
  chainId: number;
  /** Native USDC decimals on this network (Arc = 18). */
  nativeDecimals: number;
  /** ERC-20 USDC decimals on this network (Arc = 6). */
  erc20UsdcDecimals: number;
}

/** Clients cached per network so a switch reuses rather than rebuilds. */
const clientCache = new Map<NetworkName, ReturnType<typeof createPublicClient>>();

function clientForNetwork(network: NetworkName) {
  const cached = clientCache.get(network);
  if (cached) return cached;

  const cfg = NETWORKS[network];
  const transports = cfg.rpcUrls.map((url) =>
    http(url, { batch: { wait: 20, batchSize: 100 } }),
  );
  const client = createPublicClient({
    chain: cfg.chain,
    transport: transports.length > 1 ? fallback(transports) : transports[0],
  });
  clientCache.set(network, client);
  return client;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";

/** Resolves every chain-specific value for the active network. */
function useChainCtx(networkOverride?: NetworkName): ChainCtx {
  const active = useNetwork();
  const network = networkOverride ?? active.network;
  const config = network === active.network ? active.config : NETWORKS[network];

  return useMemo<ChainCtx>(() => {
    const pairs = config.pairs;
    return {
      network,
      client: clientForNetwork(network),
      usdcAddress: config.usdcAddress,
      baseTokens: pairs.map((p) => p.baseToken),
      spotPool: config.contracts.spotPool,
      pairs,
      hasSynthetics: pairs.length > 0,
      chainId: config.chain.id,
      nativeDecimals: config.nativeDecimals,
      erc20UsdcDecimals: config.usdcDecimals,
    };
  }, [network, config]);
}

const SWAP_EVENT = parseAbiItem(
  "event Swap(uint8 indexed pairId, address indexed sender, bool usdcIn, uint256 amountIn, uint256 amountOut, address indexed to)",
);
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

// ── Tiny helpers ─────────────────────────────────────────────────────────────
const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtNum = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 });

type TimestampedLog = {
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
  args?: unknown;
};

function metaOf(
  log: TimestampedLog,
): { hash: Hex; idx: number; block: bigint } | null {
  if (typeof log.logIndex !== "number") return null;
  return {
    hash: log.transactionHash,
    idx: log.logIndex,
    block: log.blockNumber,
  };
}

type Raw =
  | {
      k: "swap";
      hash: Hex;
      idx: number;
      block: bigint;
      pairId: number;
      usdcIn: boolean;
      amountIn: bigint;
      amountOut: bigint;
    }
  | {
      k: "transfer";
      hash: Hex;
      idx: number;
      block: bigint;
      token: Address;
      value: bigint;
      incoming: boolean;
    };

type TimedRaw = Raw & { time: number | null };

interface Store {
  events: Map<string, Raw>;
  times: Map<string, number>;
  scannedTo: bigint;
  coverageStart: number;
}

interface ActivityData {
  events: TimedRaw[];
  coverageStart: number;
}

// ── Event scanning ───────────────────────────────────────────────────────────
async function fetchLogs(
  ctx: ChainCtx,
  user: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Raw[]> {
  // No spot pool on this network -> no swaps to scan.
  const swapTargets =
    ctx.spotPool === ZERO || !ctx.hasSynthetics
      ? []
      : [
          ctx.client.getLogs({
            address: ctx.spotPool,
            event: SWAP_EVENT,
            args: { sender: user },
            fromBlock,
            toBlock,
          }),
        ];

  // Track USDC and configured spot-token transfers alongside spot swaps.
  const transferTargets: Address[] = [ctx.usdcAddress, ...ctx.baseTokens];

  const [swapLists, out, inc] = await Promise.all([
    Promise.all(swapTargets),
    ctx.client.getLogs({
      address: transferTargets,
      event: TRANSFER_EVENT,
      args: { from: user },
      fromBlock,
      toBlock,
    }),
    ctx.client.getLogs({
      address: transferTargets,
      event: TRANSFER_EVENT,
      args: { to: user },
      fromBlock,
      toBlock,
    }),
  ]);

  const result: Raw[] = [];

  for (const swaps of swapLists) {
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
  }

  for (const l of out) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as { value: bigint };
    result.push({
      ...m,
      k: "transfer",
      token: l.address,
      value: a.value,
      incoming: false,
    });
  }
  for (const l of inc) {
    const m = metaOf(l);
    if (!m) continue;
    const a = l.args as { value: bigint };
    result.push({
      ...m,
      k: "transfer",
      token: l.address,
      value: a.value,
      incoming: true,
    });
  }

  return result;
}

/** Fetches one block range, halving the span if the RPC rejects it. */
async function fetchRange(
  ctx: ChainCtx,
  user: Address,
  from: bigint,
  to: bigint,
): Promise<Raw[]> {
  try {
    return await fetchLogs(ctx, user, from, to);
  } catch (err) {
    if (to - from + 1n <= LOG_MIN_CHUNK) throw err;
    const mid = from + (to - from) / 2n;
    const left = await fetchRange(ctx, user, from, mid);
    const right = await fetchRange(ctx, user, mid + 1n, to);
    return [...left, ...right];
  }
}

// ── Cache (namespaced by network) ────────────────────────────────────────────
function readCachedSeries(
  network: NetworkName,
  address?: Address,
): HistoryPoint[] {
  if (!address || typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(
        `arcex-portfolio-history-v1:${network}:${address.toLowerCase()}`,
      ) ?? "[]",
    );
    return Array.isArray(value) && value.every(isHistoryPoint) ? value : [];
  } catch (error) {
    console.warn("Could not read cached portfolio history.", error);
    return [];
  }
}

const eventKey = (e: { hash: Hex; idx: number }) => `${e.hash}-${e.idx}`;
const stores = new Map<string, Store>();
const activityStorageKey = (network: NetworkName, user: Address) =>
  `arcex-portfolio-activity-v1:${network}:${user.toLowerCase()}`;

/** Shape of the persisted activity store. */
interface PersistedActivity {
  events: Array<[string, Raw]>;
  times: Array<[string, number]>;
  scannedTo: string;
  coverageStart: number;
}

function readActivityStore(
  network: NetworkName,
  user: Address,
): Store | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(activityStorageKey(network, user));
    if (!raw) return null;
    const value = JSON.parse(raw, (_key, entry: unknown) => {
      if (entry && typeof entry === "object" && "_tag" in entry) {
        const tagged = entry as Record<string, unknown>;
        if (String(tagged._tag).endsWith("(bigint)")) {
          return BigInt(String(tagged.hex));
        }
      }
      return entry;
    });

    // Validate the revived shape before trusting it.
    const parsed = value as Partial<PersistedActivity> | null;
    if (
      !parsed ||
      !Array.isArray(parsed.events) ||
      !Array.isArray(parsed.times) ||
      typeof parsed.scannedTo !== "string" ||
      typeof parsed.coverageStart !== "number"
    ) {
      return null;
    }

    return {
      events: new Map<string, Raw>(parsed.events),
      times: new Map<string, number>(parsed.times),
      scannedTo: BigInt(parsed.scannedTo),
      coverageStart: parsed.coverageStart,
    };
  } catch (error) {
    console.warn("Could not read cached portfolio activity.", error);
    return null;
  }
}

function persistActivityStore(
  network: NetworkName,
  user: Address,
  store: Store,
) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      activityStorageKey(network, user),
      JSON.stringify(
        {
          events: [...store.events.entries()],
          times: [...store.times.entries()],
          scannedTo: store.scannedTo,
          coverageStart: store.coverageStart,
        },
        (_key, value: unknown) => {
          if (typeof value === "bigint")
            return { _tag: "BigInt(bigint)", hex: value.toString(16) };
          return value;
        },
      ),
    );
  } catch (error) {
    console.warn("Could not persist portfolio activity.", error);
  }
}

// ── Block timestamps ─────────────────────────────────────────────────────────
async function blockTimestamp(
  ctx: ChainCtx,
  blockNumber: bigint,
): Promise<number> {
  const b = await ctx.client.getBlock({ blockNumber });
  return Number(b.timestamp);
}

async function stampBlocks(ctx: ChainCtx, store: Store) {
  const missing = [...new Set([...store.events.values()].map((e) => e.block))]
    .filter((b) => !store.times.has(b.toString()))
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    .slice(0, MAX_BLOCK_LOOKUPS);
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(
      missing.slice(i, i + 8).map(async (bn) => {
        try {
          store.times.set(bn.toString(), await blockTimestamp(ctx, bn));
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
async function syncActivity(
  ctx: ChainCtx,
  user: Address,
): Promise<ActivityData> {
  // Store keys are network-scoped so testnet and mainnet never share a scan.
  const key = `${ctx.network}:${user.toLowerCase()}`;
  const latest = await ctx.client.getBlockNumber();
  const cutoff = Math.floor(Date.now() / 1000) - WINDOW_DAYS * DAY;

  let store =
    stores.get(key) ?? readActivityStore(ctx.network, user) ?? undefined;

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
        batch.map(([f, t]) => fetchRange(ctx, user, f, t)),
      );
      for (const list of results)
        for (const ev of list) events.set(eventKey(ev), ev);

      const oldest = batch[batch.length - 1][0];
      coverageStart = await blockTimestamp(ctx, oldest);
      if (coverageStart <= cutoff || oldest === 0n) break;
    }

    store = { events, times: new Map(), scannedTo: latest, coverageStart };
    stores.set(key, store);
  } else if (latest > store.scannedTo) {
    let from = store.scannedTo + 1n;
    while (from <= latest) {
      const end = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
      for (const ev of await fetchRange(ctx, user, from, end))
        store.events.set(eventKey(ev), ev);
      from = end + 1n;
    }
    store.scannedTo = latest;
  }

  await stampBlocks(ctx, store);
  stores.set(key, store);
  persistActivityStore(ctx.network, user, store);

  const events: TimedRaw[] = [];
  for (const ev of store.events.values()) {
    const t = store.times.get(ev.block.toString());
    if (t === undefined) continue;
    events.push({ ...ev, time: t });
  }
  events.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

  return { events, coverageStart: store.coverageStart };
}

// ── Formatting ───────────────────────────────────────────────────────────────
function tokenLabel(
  ctx: ChainCtx,
  token: Address,
): { symbol: string; decimals: number } {
  const t = token.toLowerCase();
  if (t === ctx.usdcAddress.toLowerCase())
    return { symbol: "USDC", decimals: ctx.erc20UsdcDecimals };
  for (const [id, addr] of ctx.baseTokens.entries()) {
    if (addr.toLowerCase() === t)
      return { symbol: ctx.pairs[id]?.ticker ?? "TOKEN", decimals: 18 };
  }
  return { symbol: "TOKEN", decimals: 18 };
}

function toActivity(ctx: ChainCtx, events: TimedRaw[]): ActivityItem[] {
  // A transfer that belongs to a swap tx is already described by that event.
  const protocolTx = new Set(
    events.filter((e) => e.k !== "transfer").map((e) => e.hash),
  );
  const items: ActivityItem[] = [];

  for (const ev of events) {
    const base = { id: eventKey(ev), hash: ev.hash, time: ev.time };
    switch (ev.k) {
      case "swap": {
        const ticker = ctx.pairs[ev.pairId]?.ticker ?? "TOKEN";
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
      case "transfer": {
        if (protocolTx.has(ev.hash)) break;
        const { symbol, decimals } = tokenLabel(ctx, ev.token);
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

// ── 7-day balance reconstruction (testnet only) ──────────────────────────────
interface Snapshot {
  usdc: number;
  tokens: [number, number, number];
}

/** Index of a token in `tokens`, -1 for USDC, -2 for anything else. */
function tokenIndex(ctx: ChainCtx, token: Address): number {
  const t = token.toLowerCase();
  if (t === ctx.usdcAddress.toLowerCase()) return -1;
  for (const [id, addr] of ctx.baseTokens.entries())
    if (addr.toLowerCase() === t) return id;
  return -2;
}

function undoEvent(ctx: ChainCtx, s: Snapshot, ev: TimedRaw) {
  switch (ev.k) {
    case "transfer": {
      const idx = tokenIndex(ctx, ev.token);
      if (idx === -2) return;
      const amount =
        Number(ev.value) / (idx === -1 ? PRICE_DECIMALS : TOKEN_DECIMALS);
      const delta = ev.incoming ? -amount : amount;
      if (idx === -1) s.usdc += delta;
      else s.tokens[idx] += delta;
      return;
    }
    default:
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
        ev.time ?? 0,
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
      } else {
        hi = mid - 1;
      }
    }
    if (found === -1) return fallback[pairId] ?? 0;
    return arr[found][1];
  };
}

function buildSeries(
  ctx: ChainCtx,
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
    tokens: [...live.tokens] as [number, number, number],
  };
  const points: HistoryPoint[] = [];
  let cursor = 0;

  for (let ts = now - step; ts >= start; ts -= step) {
    while (cursor < events.length && (events[cursor].time ?? 0) > ts) {
      undoEvent(ctx, state, events[cursor]);
      cursor++;
    }
    const spot = state.tokens.reduce(
      (sum, qty, i) => sum + qty * priceAt(i, ts),
      0,
    );
    points.push({ t: ts * 1000, value: Math.max(0, state.usdc + spot) });
  }

  points.reverse();
  points.push({ t: now * 1000, value: live.netWorth });
  return points;
}

/** Keeps the last non-null value; resets when the key changes.
 *  The key includes the network, so switching networks drops the cache. */
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
export interface PortfolioResult {
  network: NetworkName;
  isMainnet: boolean;
  address: Address | undefined;
  isConnected: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;

  /** Total portfolio value in USD, per the active network's rules. */
  netWorth: number;

  /** Testnet: USDC on the connected chain. Mainnet: total across 3 chains. */
  usdcTotal: number;
  /** Mainnet only: per-chain USDC rows. Empty on testnet. */
  usdcByChain: UsdcChainRow[];

  /** Testnet synthetic holdings. Empty on Mainnet. */
  assets: AssetHolding[];
  /** Mainnet only: real asset rows with USD values. Empty on testnet. */
  mainnetAssets: MainnetAssetRow[];
  /** True when the price source is unavailable (balances still show). */
  pricesUnavailable: boolean;

  /** Testnet only: 7-day history. Empty on mainnet. */
  series: HistoryPoint[];
  changeAbs: number;
  changePct: number | null;

  /** Recent activity for the active network. */
  recent: ActivityItem[];
  activityLoading: boolean;
}

export function usePortfolio(): PortfolioResult {
  const { address, isConnected } = useAccount();
  const enabled = isConnected && !!address;
  const { network, config, isMainnet } = useNetwork();
  const ctx = useChainCtx();
  const activityCtx = useChainCtx("mainnet");

  // ── Testnet path ──────────────────────────────────────────────────────────
  const walletBalances = useWalletBalances(
    enabled && !isMainnet ? address : undefined,
  );

  type BalanceSnap = { usdc: number; balances: [number, number, number] };

  const balanceNext = useMemo<BalanceSnap | null>(
    () =>
      walletBalances && !isMainnet
        ? { usdc: walletBalances.usdc, balances: walletBalances.tokens }
        : null,
    [walletBalances, isMainnet],
  );

  // Cache key is network-scoped, so a switch resets instead of leaking.
  const cacheKey = enabled ? `${network}:${address?.toLowerCase()}` : undefined;
  const balanceSnap = useLastGood(cacheKey, balanceNext);

  const testnetReady = enabled && !isMainnet && balanceSnap !== null;
  const usdc = balanceSnap?.usdc ?? 0;
  const balances =
    balanceSnap?.balances ?? ([0, 0, 0] as [number, number, number]);

  /** Pool feeds are testnet-only (they read the testnet spot pools). */
  const feed0 = usePoolFeed(0);
  const feed1 = usePoolFeed(1);
  const feed2 = usePoolFeed(2);
  const feeds = [feed0, feed1, feed2];

  const assets: AssetHolding[] = isMainnet
    ? []
    : config.pairs.map((pair, i) => {
        const price = feeds[i]?.price ?? 0;
        return {
          pairId: pair.id,
          ticker: pair.ticker,
          name: pair.name,
          color: pair.color,
          balance: balances[i] ?? 0,
          price,
          value: (balances[i] ?? 0) * price,
          changePct24h: feeds[i]?.changePct24h ?? null,
          candles: feeds[i]?.candles ?? [],
          sparkKey: `${feeds[i]?.epoch}:${feeds[i]?.last?.time}:${feeds[i]?.last?.close}`,
        };
      });

  const spotValue = assets.reduce((sum, a) => sum + a.value, 0);
  const testnetNetWorth = usdc + spotValue;

  // ── Mainnet path ──────────────────────────────────────────────────────────
  const usdcBalances = useUsdcBalances(
    enabled && isMainnet ? address : undefined,
  );
  const assetBalances = useAssetBalances(
    enabled && isMainnet ? address : undefined,
  );
  const usdcRows: UsdcChainRow[] = isMainnet
    ? usdcBalances.balances.map((c) => ({
        chainId: c.chainId,
        label: c.label,
        balance: Number(c.raw ?? 0n) / 10 ** config.usdcDecimals,
        status: c.status,
      }))
    : [];

  const usdcMainnetTotal = usdcRows
    .filter((r) => r.status === "success")
    .reduce((sum, r) => sum + r.balance, 0);

  const mainnetAssets: MainnetAssetRow[] = isMainnet
    ? assetBalances.balances.map((b: AssetBalance) => {
        const pool = feeds[b.pairId];
        const balance = Number(b.raw) / 10 ** b.decimals;
        const priceUsd = pool?.price ?? null;
        return {
          key: b.key,
          symbol: b.symbol,
          name: b.name,
          chainId: b.chainId,
          balance,
          decimals: b.decimals,
          priceUsd,
          changePct24h: pool?.changePct24h ?? null,
          valueUsd: priceUsd === null ? null : balance * priceUsd,
          status: b.status,
        };
      })
    : [];

  const mainnetAssetValue = mainnetAssets.reduce(
    (sum, a) => sum + (a.valueUsd ?? 0),
    0,
  );
  const mainnetNetWorth = usdcMainnetTotal + mainnetAssetValue;

  // ── Activity (network-scoped) ─────────────────────────────────────────────
  const activity = useQuery({
    queryKey: ["portfolio-activity", "mainnet", address ?? ""],
    queryFn: () => syncActivity(activityCtx, address as Address),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // ── History (testnet only) ────────────────────────────────────────────────
  const balanceKey = balances.join(",");

  const cachedSeries = useMemo(
    () => readCachedSeries(network, address),
    [network, address],
  );

  const rebuiltSeries = useMemo<HistoryPoint[]>(() => {
    if (isMainnet || !testnetReady || !activity.data) return [];
    const priceAt = makePriceAt(
      feeds.map((f) => f.candles),
      feeds.map((f) => f.price ?? 0),
      activity.data.events,
    );
    return buildSeries(
      ctx,
      activity.data.events,
      activity.data.coverageStart,
      { usdc, tokens: balances, netWorth: testnetNetWorth },
      priceAt,
    );
    // feeds/balances are tracked through their keys; candles mutate in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainnet, testnetReady, activity.data, usdc, balanceKey, ctx]);

  const series = useMemo<HistoryPoint[]>(() => {
    if (isMainnet) return [];
    if (rebuiltSeries.length > 0)
      return [
        ...rebuiltSeries.slice(0, -1),
        { t: Date.now(), value: testnetNetWorth },
      ];
    if (!testnetReady || cachedSeries.length === 0) return cachedSeries;
    return [
      ...cachedSeries.slice(0, -1),
      { t: Date.now(), value: testnetNetWorth },
    ];
  }, [isMainnet, rebuiltSeries, cachedSeries, testnetReady, testnetNetWorth]);

  useEffect(() => {
    if (isMainnet || !address || series.length === 0) return;
    try {
      localStorage.setItem(
        `arcex-portfolio-history-v1:${network}:${address.toLowerCase()}`,
        JSON.stringify(series),
      );
    } catch (error) {
      console.warn("Could not cache portfolio history.", error);
    }
  }, [network, address, series, isMainnet]);

  const recent = useMemo(
    () => {
      if (!activity.data) return [];
      const seenTransactions = new Set<string>();
      return toActivity(activityCtx, activity.data.events)
        .filter((item) => {
          const hash = item.hash.toLowerCase();
          if (seenTransactions.has(hash)) return false;
          seenTransactions.add(hash);
          return true;
        })
        .slice(0, 5);
    },
    [activity.data, activityCtx],
  );

  const netWorth = isMainnet ? mainnetNetWorth : testnetNetWorth;
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? netWorth;
  const changeAbs = last - first;
  const changePct = first > 0 ? (changeAbs / first) * 100 : null;

  const loading =
    enabled &&
    (isMainnet
      ? usdcBalances.loading || assetBalances.loading
      : (walletBalances?.updating ?? true));

  const error = activity.isError
    ? "Could not load activity."
    : !isMainnet && enabled && !balanceSnap
      ? "Could not load balances."
      : null;

  return {
    network,
    isMainnet,
    address,
    isConnected,
    ready: isMainnet
      ? enabled && !usdcBalances.loading && !assetBalances.loading
      : testnetReady,
    loading,
    error,
    netWorth,
    usdcTotal: isMainnet ? usdcMainnetTotal : usdc,
    usdcByChain: usdcRows,
    assets,
    mainnetAssets,
    pricesUnavailable:
      isMainnet && mainnetAssets.some((asset) => asset.priceUsd === null),
    series,
    changeAbs,
    changePct,
    recent,
    activityLoading: enabled && activity.isPending,
  };
}

function isHistoryPoint(value: unknown): value is HistoryPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HistoryPoint).t === "number" &&
    typeof (value as HistoryPoint).value === "number"
  );
}
