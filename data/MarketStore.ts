import { useCallback, useSyncExternalStore } from "react";
import {
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  parseAbi,
  parseAbiItem,
  type Address,
} from "viem";
import { NETWORKS, type NetworkName } from "../src/config/networks";
import { supabase } from "../src/utils/supabase";

const REFRESH_MS = 3_000;
const CANDLE_SECONDS = 300;
const MAX_CANDLES = 288;
const POOL_ABI = parseAbi([
  "function pools(uint8 pairId) view returns (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active)",
  "function pairCount() view returns (uint256)",
  "function pairIds(uint256 index) view returns (uint8)",
  "event LiquidityAdded(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpMinted)",
  "event LiquidityRemoved(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpBurned)",
  "event Swap(uint8 indexed pairId, address indexed sender, bool usdcIn, uint256 amountIn, uint256 amountOut, address indexed to)",
  "event PairCreated(uint8 indexed pairId, address indexed baseToken, address indexed creator)",
]);
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const PAIR_IDS = [0, 1, 2] as const;

/** The SpotPoolFactoryV2 address for the active network. */
function spotPoolAddress(network: NetworkName): Address {
  return NETWORKS[network].contracts.spotPool;
}

/** Base token addresses (USDC first, then pairs 0/1/2) for the active network. */
function tokenAddresses(network: NetworkName): Address[] {
  const cfg = NETWORKS[network];
  return [cfg.usdcAddress, ...cfg.pairs.map((p) => p.baseToken)] as Address[];
}
const CACHE_PREFIX = "arcex-market-v3";
const BALANCE_CACHE_PREFIX = "arcex-wallet-balances-v2";

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketPairSnapshot {
  status: "connecting" | "live" | "error";
  active: boolean;
  price: number | null;
  reserveBase: bigint | null;
  reserveQuote: bigint | null;
  changePct24h: number | null;
  volume24h: number;
  lastUpdatedBlock: bigint | null;
  updatedAt: number | null;
  candles: MarketCandle[];
  last: MarketCandle | null;
  epoch: number;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
}

export interface WalletBalanceSnapshot {
  usdc: number;
  tokens: [number, number, number];
  updatedAt: number;
  updating: boolean;
}

interface CachedPair {
  reserveBase: string | null;
  reserveQuote: string | null;
  lastUpdatedBlock: string | null;
  lastProcessedBlock: string | null;
  updatedAt: number | null;
  candles: MarketCandle[];
  trades: { time: number; volume: number }[];
}

interface PoolEvent {
  pairId: number;
  kind: "swap" | "add" | "remove";
  usdcIn?: boolean;
  amountIn?: bigint;
  amountOut?: bigint;
  amountUSDC?: bigint;
  amountBase?: bigint;
  blockNumber: bigint;
  logIndex: number;
}

interface IndexedCandleRow {
  pair_id: number;
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

function isIndexedCandleRow(value: unknown): value is IndexedCandleRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  const isNumeric = (entry: unknown) =>
    typeof entry === "number" || typeof entry === "string";
  return (
    typeof row.pair_id === "number" &&
    typeof row.open_time === "string" &&
    isNumeric(row.open) &&
    isNumeric(row.high) &&
    isNumeric(row.low) &&
    isNumeric(row.close) &&
    isNumeric(row.volume)
  );
}

/**
 * Per-network public clients, built from config/networks.ts.
 *
 * Keyed by NetworkName so a switch gets a fresh client bound to that network's
 * chain and RPCs — no stale testnet client can serve mainnet data.
 */
const clients: Partial<Record<NetworkName, ReturnType<typeof createPublicClient>>> = {};

export function publicClientFor(network: NetworkName) {
  const cached = clients[network];
  if (cached) return cached;

  const cfg = NETWORKS[network];
  const transports = cfg.rpcUrls.map((url) =>
    http(url, { batch: { wait: 20, batchSize: 100 } }),
  );

  const client = createPublicClient({
    chain: cfg.chain,
    transport: transports.length > 1 ? fallback(transports) : transports[0],
  });
  clients[network] = client;
  return client;
}

/** The network currently selected by NetworkProvider. */
let activeNetwork: NetworkName = "mainnet";

export function setActiveNetwork(network: NetworkName): void {
  if (activeNetwork === network) return;
  activeNetwork = network;
  networkChangeHandler?.(network);
}

let networkChangeHandler: ((network: NetworkName) => void) | null = null;

export function getActiveNetwork(): NetworkName {
  return activeNetwork;
}

const priceFromReserves = (reserveQuote: bigint, reserveBase: bigint) =>
  reserveBase > 0n
    ? (Number(reserveQuote) * 1e12) / Number(reserveBase)
    : null;

const initialPair = (): MarketPairSnapshot => ({
  status: "connecting",
  active: false,
  price: null,
  reserveBase: null,
  reserveQuote: null,
  changePct24h: null,
  volume24h: 0,
  lastUpdatedBlock: null,
  updatedAt: null,
  candles: [],
  last: null,
  epoch: 0,
  open24h: null,
  high24h: null,
  low24h: null,
});

function readCachedPair(
  pairId: number,
  network: NetworkName = activeNetwork,
): CachedPair | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}:${network}:${pairId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPair;
    if (!Array.isArray(parsed.candles) || !Array.isArray(parsed.trades))
      return null;
    return parsed;
  } catch (error) {
    console.warn("Could not read cached market candles.", error);
    return null;
  }
}

function cachedSnapshot(
  pairId: number,
  network: NetworkName = activeNetwork,
): MarketPairSnapshot {
  const cached = readCachedPair(pairId, network);
  if (!cached) return initialPair();
  return {
    ...initialPair(),
    status: "connecting",
    reserveBase: cached.reserveBase ? BigInt(cached.reserveBase) : null,
    reserveQuote: cached.reserveQuote ? BigInt(cached.reserveQuote) : null,
    lastUpdatedBlock: cached.lastUpdatedBlock
      ? BigInt(cached.lastUpdatedBlock)
      : null,
    updatedAt: cached.updatedAt,
    candles: cached.candles,
    last: cached.candles[cached.candles.length - 1] ?? null,
    price: cached.candles[cached.candles.length - 1]?.close ?? null,
    volume24h: cached.trades.reduce(
      (total, trade) =>
        trade.time >= Date.now() / 1000 - 86_400 ? total + trade.volume : total,
      0,
    ),
    epoch: 1,
    ...summarizeCandles(cached.candles),
  };
}

function summarizeCandles(candles: MarketCandle[]) {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  const visible = candles.filter((candle) => candle.time >= cutoff);
  const first = visible[0];
  const last = visible[visible.length - 1];
  if (!first || !last)
    return { open24h: null, high24h: null, low24h: null, changePct24h: null };
  return {
    open24h: first.open,
    high24h: Math.max(...visible.map((candle) => candle.high)),
    low24h: Math.min(...visible.map((candle) => candle.low)),
    changePct24h:
      first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null,
  };
}

class MarketStore {
  private pairSnapshots = PAIR_IDS.map((pairId) =>
    cachedSnapshot(pairId, activeNetwork),
  );
  private trades = PAIR_IDS.map(
    (pairId) => readCachedPair(pairId, activeNetwork)?.trades ?? [],
  );
  private historyBlocks = PAIR_IDS.map((pairId) => {
    const value = readCachedPair(pairId, activeNetwork)?.lastProcessedBlock;
    return value ? BigInt(value) : null;
  });
  private readonly pairListeners = PAIR_IDS.map(() => new Set<() => void>());
  private readonly walletListeners = new Map<string, Set<() => void>>();
  private readonly walletSnapshots = new Map<string, WalletBalanceSnapshot>();
  private readonly walletWatchers = new Map<string, () => void>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private walletRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private refreshAgain = false;
  private networkEpoch = 0;
  private refreshingAddress: string | null = null;
  private queuedWalletAddress: Address | null = null;
  private indexedHistoryLoaded = false;
  private indexedHistoryAttemptAt = 0;
  private indexedHistoryRequest: Promise<void> | null = null;

  handleNetworkChange(network: NetworkName) {
    const epoch = ++this.networkEpoch;
    this.pairSnapshots = PAIR_IDS.map((pairId) => cachedSnapshot(pairId, network));
    this.trades = PAIR_IDS.map(
      (pairId) => readCachedPair(pairId, network)?.trades ?? [],
    );
    this.historyBlocks = PAIR_IDS.map((pairId) => {
      const value = readCachedPair(pairId, network)?.lastProcessedBlock;
      return value ? BigInt(value) : null;
    });
    this.indexedHistoryLoaded = false;
    this.indexedHistoryAttemptAt = 0;
    this.indexedHistoryRequest = null;

    queueMicrotask(() => {
      if (epoch !== this.networkEpoch) return;
      this.walletWatchers.forEach((stop) => stop());
      this.walletWatchers.clear();
      for (const [key, listeners] of this.walletListeners) {
        if (listeners.size > 0) this.ensureWalletWatcher(key as Address);
        this.emitWallet(key);
      }
      PAIR_IDS.forEach((pairId) => this.emitPair(pairId));
      void this.loadIndexedHistory();
      void this.refresh();
    });
  }

  subscribePair = (pairId: number, listener: () => void) => {
    this.pairListeners[pairId]?.add(listener);
    this.start();
    return () => {
      this.pairListeners[pairId]?.delete(listener);
      this.stopIfIdle();
    };
  };

  getPairSnapshot = (pairId: number) =>
    this.pairSnapshots[pairId] ?? initialPair();

  subscribeWallet = (address: Address, listener: () => void) => {
    const key = address.toLowerCase();
    const listeners = this.walletListeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.walletListeners.set(key, listeners);
    this.ensureWalletWatcher(address);
    const cached = this.getWalletSnapshot(address);
    const needsRefresh = !cached || Date.now() - cached.updatedAt >= REFRESH_MS;
    const alreadyRunning = this.refreshTimer !== null;
    this.start(!alreadyRunning || needsRefresh ? address : undefined);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.walletListeners.delete(key);
        this.walletWatchers.get(key)?.();
        this.walletWatchers.delete(key);
      }
      this.stopIfIdle();
    };
  };

  getWalletSnapshot = (address: Address): WalletBalanceSnapshot | null => {
    const key = `${activeNetwork}:${address.toLowerCase()}`;
    const cached = this.walletSnapshots.get(key);
    if (cached) return cached;
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(`${BALANCE_CACHE_PREFIX}:${key}`);
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as WalletBalanceSnapshot;
      this.walletSnapshots.set(key, { ...snapshot, updating: true });
      return this.walletSnapshots.get(key) ?? null;
    } catch (error) {
      console.warn("Could not read cached wallet balances.", error);
      return null;
    }
  };

  private start(address?: Address) {
    if (this.refreshTimer) {
      if (address) void this.refresh(address);
      return;
    }
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    if (typeof window !== "undefined")
      window.addEventListener("focus", this.onWindowFocus);
    void this.loadIndexedHistory();
    void this.refresh(address);
    this.refreshTimer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden)
        void this.refresh();
    }, REFRESH_MS);
  }

  private loadIndexedHistory(network: NetworkName = activeNetwork): Promise<void> {
    if (!supabase || this.indexedHistoryLoaded) return Promise.resolve();
    if (this.indexedHistoryRequest) return this.indexedHistoryRequest;
    if (Date.now() - this.indexedHistoryAttemptAt < 60_000)
      return Promise.resolve();
    this.indexedHistoryAttemptAt = Date.now();
    const epoch = this.networkEpoch;

    const request = (async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("market_candles")
        .select(
          "pair_id,open_time,open,high,low,close,volume",
        )
        .eq("chain_id", NETWORKS[network].chainId)
        .eq("timeframe_seconds", CANDLE_SECONDS)
        .in("pair_id", [...PAIR_IDS])
        .gte("open_time", since)
        .order("open_time", { ascending: true })
        .limit(900);
      if (error) throw new Error(`Could not load indexed candles: ${error.message}`);
      if (epoch !== this.networkEpoch || network !== activeNetwork) return;

      const byPair = PAIR_IDS.map(() => [] as (MarketCandle & { volume: number })[]);
      const rows: unknown[] = data;
      for (const candidate of rows) {
        if (!isIndexedCandleRow(candidate)) {
          console.warn("Skipping malformed indexed candle row.");
          continue;
        }
        const row = candidate;
        const pairId = Number(row.pair_id);
        const time = Math.floor(Date.parse(row.open_time) / 1_000);
        const values = [row.open, row.high, row.low, row.close, row.volume].map(
          Number,
        );
        if (
          (pairId !== 0 && pairId !== 1 && pairId !== 2) ||
          !Number.isFinite(time) ||
          values.some((value) => !Number.isFinite(value))
        )
          continue;
        const [open, high, low, close, volume] = values;
        byPair[pairId].push({ time, open, high, low, close, volume });
      }

      for (const pairId of PAIR_IDS) {
        const snapshot = this.pairSnapshots[pairId];
        const candlesByTime = new Map(
          byPair[pairId].map((candle) => [candle.time, candle]),
        );
        for (const cached of snapshot.candles) {
          const indexed = candlesByTime.get(cached.time);
          candlesByTime.set(
            cached.time,
            indexed
              ? {
                  ...indexed,
                  high: Math.max(indexed.high, cached.high),
                  low: Math.min(indexed.low, cached.low),
                  close: cached.close,
                }
              : { ...cached, volume: 0 },
          );
        }
        const merged = [...candlesByTime.values()].sort(
          (a, b) => a.time - b.time,
        );
        if (merged.length === 0) continue;
        const candles = merged.slice(-MAX_CANDLES);
        const volume24h = byPair[pairId].reduce(
          (sum, candle) => sum + candle.volume,
          0,
        );
        this.pairSnapshots[pairId] = {
          ...snapshot,
          candles,
          last: candles[candles.length - 1],
          price: snapshot.price ?? candles[candles.length - 1].close,
          volume24h,
          epoch: snapshot.epoch + 1,
          ...summarizeCandles(candles),
        };
        if (snapshot.price !== null)
          this.pushPrice(pairId, snapshot.price, Math.floor(Date.now() / 1_000));
        this.persistPair(pairId, network);
        this.emitPair(pairId);
      }
      this.indexedHistoryLoaded = data.length > 0;
    })().catch((error: unknown) => {
      console.warn("Indexed candles are unavailable; keeping cached/live data.", error);
    }).finally(() => {
      if (this.indexedHistoryRequest === request)
        this.indexedHistoryRequest = null;
    });
    this.indexedHistoryRequest = request;
    return request;
  }

  private stopIfIdle() {
    if (this.pairListeners.some((listeners) => listeners.size > 0)) return;
    if (this.walletListeners.size > 0) return;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (typeof window !== "undefined")
      window.removeEventListener("focus", this.onWindowFocus);
  }

  private onVisibilityChange = () => {
    if (!document.hidden) void this.refresh();
  };

  private onWindowFocus = () => {
    const activeWallet = this.walletListeners.keys().next().value as
      | Address
      | undefined;
    void this.refresh(activeWallet);
  };

  private ensureWalletWatcher(address: Address) {
    const key = address.toLowerCase();
    if (this.walletWatchers.has(key)) return;
    const network = activeNetwork;
    const stop = publicClientFor(network).watchEvent({
      address: tokenAddresses(network),
      event: TRANSFER_EVENT,
      pollingInterval: REFRESH_MS,
      onLogs: (logs) => {
        const touched = logs.some(({ args }) => {
          const from = args.from?.toLowerCase();
          const to = args.to?.toLowerCase();
          return from === key || to === key;
        });
        if (!touched) return;
        if (this.walletRefreshTimer) clearTimeout(this.walletRefreshTimer);
        this.walletRefreshTimer = setTimeout(
          () => void this.refresh(address),
          100,
        );
      },
      onError: (error) => {
        console.warn("Wallet transfer subscription failed; reconnecting.", error);
        this.setWalletUpdating(address, true);
      },
    });
    this.walletWatchers.set(key, stop);
  }

  private setWalletUpdating(address: Address, updating: boolean) {
    const key = `${activeNetwork}:${address.toLowerCase()}`;
    const current = this.getWalletSnapshot(address);
    if (!current) return;
    const next = { ...current, updating };
    this.walletSnapshots.set(key, next);
    this.emitWallet(key);
  }

  private async refresh(address?: Address): Promise<void> {
    if (this.refreshInFlight) {
      if (address && this.refreshingAddress !== address.toLowerCase())
        this.queuedWalletAddress = address;
      this.refreshAgain = true;
      return;
    }
    const network = activeNetwork;
    const epoch = this.networkEpoch;
    this.refreshingAddress = address?.toLowerCase() ?? null;
    this.refreshInFlight = (async () => {
      let nextAddress = address;
      do {
        await this.refreshAll(nextAddress, network, epoch);
        nextAddress = this.queuedWalletAddress ?? undefined;
        this.queuedWalletAddress = null;
        this.refreshingAddress = nextAddress?.toLowerCase() ?? null;
      } while (nextAddress);
    })();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
      this.refreshingAddress = null;
      this.queuedWalletAddress = null;
      const shouldRefresh = this.refreshAgain || epoch !== this.networkEpoch;
      this.refreshAgain = false;
      if (shouldRefresh) void this.refresh();
    }
  }

  private async refreshAll(
    address: Address | undefined,
    network: NetworkName,
    epoch: number,
  ) {
    void this.loadIndexedHistory(network);
    try {
      const client = publicClientFor(network);
      const poolAddress = spotPoolAddress(network);
      const [blockNumber, pools, balances] = await Promise.all([
        client.getBlockNumber(),
        Promise.all(
          PAIR_IDS.map((pairId) =>
            client.readContract({
              address: poolAddress,
              abi: POOL_ABI,
              functionName: "pools",
              args: [pairId],
            }),
          ),
        ),
        address
          ? Promise.all(
              tokenAddresses(network).map((token) =>
                client.readContract({
                  address: token,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [address],
                }),
              ),
            )
          : Promise.resolve([] as bigint[]),
      ]);
      if (epoch !== this.networkEpoch || network !== activeNetwork) return;

      await this.mergeDeltaLogs(blockNumber, pools, network, client, epoch);
      if (epoch !== this.networkEpoch || network !== activeNetwork) return;

      for (const pairId of PAIR_IDS) {
        const pool = pools[pairId];
        const reserveQuote = pool[1];
        const reserveBase = pool[2];
        const price = priceFromReserves(reserveQuote, reserveBase);
        if (price !== null) this.pushPrice(pairId, price, Math.floor(Date.now() / 1000));
        this.pairSnapshots[pairId] = {
          ...this.pairSnapshots[pairId],
          status: "live",
          active: pool[3],
          price,
          reserveQuote,
          reserveBase,
          lastUpdatedBlock: blockNumber,
          updatedAt: Math.floor(Date.now() / 1000),
        };
        const cached = readCachedPair(pairId, network);
        const checkpoint = cached?.lastProcessedBlock
          ? BigInt(cached.lastProcessedBlock)
          : null;
        const shouldPersist =
          !cached ||
          cached.reserveQuote !== reserveQuote.toString() ||
          cached.reserveBase !== reserveBase.toString() ||
          checkpoint === null ||
          blockNumber - checkpoint >= 20n;
        if (shouldPersist) this.persistPair(pairId);
        this.emitPair(pairId);
      }

      if (address) {
        if (balances.length === tokenAddresses(network).length) {
          const snapshot: WalletBalanceSnapshot = {
            usdc: Number(balances[0] ?? 0n) / 1e6,
            tokens: [
              Number(balances[1] ?? 0n) / 1e18,
              Number(balances[2] ?? 0n) / 1e18,
              Number(balances[3] ?? 0n) / 1e18,
            ],
            updatedAt: Date.now(),
            updating: false,
          };
          const walletKey = `${network}:${address.toLowerCase()}`;
          this.walletSnapshots.set(walletKey, snapshot);
          if (typeof localStorage !== "undefined")
            localStorage.setItem(
              `${BALANCE_CACHE_PREFIX}:${walletKey}`,
              JSON.stringify(snapshot),
            );
          this.emitWallet(address.toLowerCase());
        }
      }
    } catch (error) {
      if (epoch !== this.networkEpoch || network !== activeNetwork) return;
      console.warn("Market data refresh failed; retaining last known values.", error);
      for (const pairId of PAIR_IDS) {
        this.pairSnapshots[pairId] = {
          ...this.pairSnapshots[pairId],
          status: "error",
        };
        this.emitPair(pairId);
      }
      if (address) this.setWalletUpdating(address, true);
    }
  }

  private async mergeDeltaLogs(
    blockNumber: bigint,
    pools: readonly (readonly [Address, bigint, bigint, boolean])[],
    network: NetworkName,
    client: ReturnType<typeof createPublicClient>,
    epoch: number,
  ) {
    const checkpoints = this.historyBlocks.filter(
      (checkpoint): checkpoint is bigint => checkpoint !== null,
    );
    if (checkpoints.length === 0) {
      this.historyBlocks.fill(blockNumber);
      return;
    }
    const fromBlock = checkpoints.reduce(
      (minimum, checkpoint) => (checkpoint < minimum ? checkpoint : minimum),
      checkpoints[0],
    ) + 1n;
    if (fromBlock > blockNumber) return;

    try {
      const logs = await client.getLogs({
        address: spotPoolAddress(network),
        events: [POOL_ABI[3], POOL_ABI[4], POOL_ABI[5]],
        fromBlock,
        toBlock: blockNumber,
      });
      if (epoch !== this.networkEpoch || network !== activeNetwork) return;
      const events: PoolEvent[] = [];
      for (const log of logs) {
        if (log.blockNumber === null || log.logIndex === null) continue;
        const args = log.args as Record<string, unknown>;
        const pairId = Number(args.pairId);
        const processedBlock =
          Number.isInteger(pairId) && pairId >= 0 && pairId < PAIR_IDS.length
            ? this.historyBlocks[pairId]
            : null;
        if (
          !Number.isInteger(pairId) ||
          pairId < 0 ||
          pairId >= PAIR_IDS.length ||
          (processedBlock !== null && log.blockNumber <= processedBlock)
        )
          continue;
        events.push({
          pairId,
          kind:
            log.eventName === "Swap"
              ? "swap"
              : log.eventName === "LiquidityAdded"
                ? "add"
                : log.eventName === "LiquidityRemoved"
                  ? "remove"
                  : "swap",
          usdcIn: args.usdcIn as boolean | undefined,
          amountIn: args.amountIn as bigint | undefined,
          amountOut: args.amountOut as bigint | undefined,
          amountUSDC: args.amountUSDC as bigint | undefined,
          amountBase: args.amountBase as bigint | undefined,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
        });
      }
      events.sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? b.logIndex - a.logIndex
          : a.blockNumber > b.blockNumber
            ? -1
            : 1,
      );

      const reserveStates = pools.map((pool) => ({
        reserveQuote: pool[1],
        reserveBase: pool[2],
      }));
      const timestamps = new Map<bigint, number>();
      const blocks = [...new Set(events.map((event) => event.blockNumber))]
        .sort((a, b) => (a > b ? -1 : 1))
        .slice(0, 300);
      for (let index = 0; index < blocks.length; index += 8) {
        await Promise.all(
          blocks.slice(index, index + 8).map(async (block) => {
            const data = await client.getBlock({ blockNumber: block });
            timestamps.set(block, Number(data.timestamp));
          }),
        );
        if (epoch !== this.networkEpoch || network !== activeNetwork) return;
      }

      for (const pairId of PAIR_IDS) {
        const state = reserveStates[pairId];
        const points: { time: number; price: number; volume?: number }[] = [];
        for (const event of events) {
          if (event.pairId !== pairId) continue;
          const time = timestamps.get(event.blockNumber);
          const price = priceFromReserves(state.reserveQuote, state.reserveBase);
          if (time !== undefined && price !== null) {
            const volume =
              event.kind === "swap"
                ? Number(
                    event.usdcIn ? event.amountIn : event.amountOut,
                  ) / 1e6
                : undefined;
            points.push({ time, price, volume });
          }
          if (event.kind === "swap") {
            if (event.usdcIn) {
              state.reserveQuote -= event.amountIn ?? 0n;
              state.reserveBase += event.amountOut ?? 0n;
            } else {
              state.reserveBase -= event.amountIn ?? 0n;
              state.reserveQuote += event.amountOut ?? 0n;
            }
          } else if (event.kind === "add") {
            state.reserveQuote -= event.amountUSDC ?? 0n;
            state.reserveBase -= event.amountBase ?? 0n;
          } else {
            state.reserveQuote += event.amountUSDC ?? 0n;
            state.reserveBase += event.amountBase ?? 0n;
          }
        }
        for (const point of points.reverse()) {
          this.pushPrice(pairId, point.price, point.time);
          if (point.volume !== undefined)
            this.addTrade(pairId, point.time, point.volume);
        }
        if (points.length > 0) {
          this.pairSnapshots[pairId] = {
            ...this.pairSnapshots[pairId],
            epoch: this.pairSnapshots[pairId].epoch + 1,
          };
        }
        this.historyBlocks[pairId] = blockNumber;
      }
    } catch (error) {
      console.warn("Pool candle delta fetch failed; live reserves remain available.", error);
    }
  }

  private addTrade(pairId: number, time: number, volume: number) {
    const trades = this.trades[pairId];
    trades.push({ time, volume });
    const cutoff = time - 86_400;
    while (trades.length > 0 && trades[0].time < cutoff) trades.shift();
    const snapshot = this.pairSnapshots[pairId];
    this.pairSnapshots[pairId] = {
      ...snapshot,
      volume24h: trades.reduce((sum, trade) => sum + trade.volume, 0),
    };
  }

  private pushPrice(pairId: number, price: number, timestamp: number) {
    const snapshot = this.pairSnapshots[pairId];
    const candles = [...snapshot.candles];
    const time = Math.floor(timestamp / CANDLE_SECONDS) * CANDLE_SECONDS;
    const last = candles[candles.length - 1];
    if (!last) {
      candles.push({ time, open: price, high: price, low: price, close: price });
    } else if (time === last.time) {
      candles[candles.length - 1] = {
        ...last,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
      };
    } else if (time > last.time) {
      const gap = Math.min((time - last.time) / CANDLE_SECONDS, MAX_CANDLES);
      let close = last.close;
      for (let index = 1; index < gap; index++) {
        const carryTime = last.time + index * CANDLE_SECONDS;
        candles.push({
          time: carryTime,
          open: close,
          high: close,
          low: close,
          close,
        });
      }
      candles.push({
        time,
        open: close,
        high: Math.max(close, price),
        low: Math.min(close, price),
        close: price,
      });
    }
    if (candles.length > MAX_CANDLES)
      candles.splice(0, candles.length - MAX_CANDLES);
    this.pairSnapshots[pairId] = {
      ...snapshot,
      candles,
      last: candles[candles.length - 1] ?? null,
      ...summarizeCandles(candles),
    };
  }

  private persistPair(pairId: number, network: NetworkName = activeNetwork) {
    if (typeof localStorage === "undefined") return;
    const snapshot = this.pairSnapshots[pairId];
    try {
      localStorage.setItem(
        `${CACHE_PREFIX}:${network}:${pairId}`,
        JSON.stringify({
          reserveBase: snapshot.reserveBase?.toString() ?? null,
          reserveQuote: snapshot.reserveQuote?.toString() ?? null,
          lastUpdatedBlock: snapshot.lastUpdatedBlock?.toString() ?? null,
          lastProcessedBlock: this.historyBlocks[pairId]?.toString() ?? null,
          updatedAt: snapshot.updatedAt,
          candles: snapshot.candles,
          trades: this.trades[pairId],
        } satisfies CachedPair),
      );
    } catch (error) {
      console.warn("Could not persist market candle cache.", error);
    }
  }

  private emitPair(pairId: number) {
    this.pairListeners[pairId]?.forEach((listener) => listener());
  }

  private emitWallet(key: string) {
    this.walletListeners.get(key)?.forEach((listener) => listener());
  }
}

export const marketStore = new MarketStore();
networkChangeHandler = (network) => marketStore.handleNetworkChange(network);

export function useMarketPair(pairId: number): MarketPairSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => marketStore.subscribePair(pairId, listener),
    [pairId],
  );
  const getSnapshot = useCallback(
    () => marketStore.getPairSnapshot(pairId),
    [pairId],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
}

export function useWalletBalances(
  address?: Address,
): WalletBalanceSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      address ? marketStore.subscribeWallet(address, listener) : () => {},
    [address],
  );
  const getSnapshot = useCallback(
    () => (address ? marketStore.getWalletSnapshot(address) : null),
    [address],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}
