/**
 * @file types.ts
 * @description Shared domain types used across web, services, and contracts.
 */

import type { SupportedChainId } from "./chains.js";

// ── Market / pair types ───────────────────────────────────────────────────────

export type PairId = 0 | 1 | 2;
export type TradingMode = "spot" | "futures";
export type OrderSide = "buy" | "sell";

export interface Market {
  readonly id: PairId;
  /** Short ticker shown in the UI, e.g. "TECHx". */
  readonly ticker: string;
  /** Full name, e.g. "TechX Index". */
  readonly name: string;
  /** Quote currency — always "USDC" for arcex markets. */
  readonly quote: "USDC";
  /** Brand colour (CSS hex) for charts/badges. */
  readonly color: string;
  /** Whether this is a synthetic (AMM-priced) or real-asset market. */
  readonly synthetic: boolean;
  /** TradingView symbol proxy (real-asset markets only). */
  readonly tvSymbol?: string;
}

// ── Order types ───────────────────────────────────────────────────────────────

export type OrderType = "market" | "limit" | "postOnly" | "ioc";
export type OrderStatus = "open" | "filled" | "partiallyFilled" | "cancelled" | "expired";

export interface Order {
  readonly id: `0x${string}`;   // keccak256 order hash
  readonly market: PairId;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly price: bigint;       // ERC-20 USDC per base unit (6 dec), 0 for market orders
  readonly size: bigint;        // base token units (18 dec)
  readonly filled: bigint;      // base token units filled so far
  readonly expiry: bigint;      // unix timestamp (seconds)
  readonly nonce: bigint;
  readonly maker: `0x${string}`;
  readonly status: OrderStatus;
  readonly createdAt: number;   // unix ms (local service time)
  readonly chainId: SupportedChainId;
}

// ── Position types ────────────────────────────────────────────────────────────

export interface Position {
  readonly pairId: PairId;
  readonly ticker: string;
  readonly isLong: boolean;
  /** Notional size in ERC-20 USDC (6 dec). */
  readonly sizeUsdc: bigint;
  /** Entry price in oracle 8-dec units. */
  readonly entryPrice: bigint;
  /** Margin deposited in ERC-20 USDC (6 dec). */
  readonly margin: bigint;
  readonly leverage: number;
  readonly openTimestamp: bigint;
  readonly isOpen: boolean;
}

// ── Candle types ──────────────────────────────────────────────────────────────

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  /** Unix timestamp (seconds) — bar open time. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

// ── Trade types ───────────────────────────────────────────────────────────────

export interface Trade {
  readonly id: string;
  readonly market: PairId;
  readonly side: OrderSide;
  readonly price: number;
  readonly size: number;
  /** Unix ms. */
  readonly timestamp: number;
  readonly txHash: `0x${string}`;
  readonly blockNumber: bigint;
}

// ── Depth / order book ────────────────────────────────────────────────────────

export interface DepthLevel {
  readonly price: number;
  readonly size: number;
}

export interface Depth {
  readonly market: PairId;
  readonly bids: DepthLevel[];
  readonly asks: DepthLevel[];
  /** Server-side unix ms when this snapshot was built. */
  readonly timestamp: number;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface SpotHolding {
  readonly pairId: PairId;
  readonly ticker: string;
  /** LP shares held. */
  readonly lpBalance: bigint;
  /** Estimated USDC value (ERC-20 6 dec). */
  readonly usdcValue: bigint;
}

export interface Portfolio {
  readonly address: `0x${string}`;
  readonly chainId: SupportedChainId;
  /** ERC-20 USDC balance (6 dec). ONE balance row shown in UI. */
  readonly usdcBalance: bigint;
  readonly spotHoldings: SpotHolding[];
  readonly openPositions: Position[];
  /** Unrealised PnL in ERC-20 USDC (6 dec), can be negative. */
  readonly unrealisedPnl: bigint;
}

// ── Market config (from MarketRegistry) ──────────────────────────────────────

export interface MarketConfig {
  readonly pairId: PairId;
  /** Entry fee in basis points (e.g. 10 = 0.10%). */
  readonly entryFeeBps: number;
  /** Max allowed leverage (e.g. 5). */
  readonly maxLeverage: number;
  /** Max open interest cap in ERC-20 USDC (6 dec). */
  readonly oiCap: bigint;
  /** Minimum tick size in price units. */
  readonly tickSize: bigint;
  /** Minimum lot size in base units (18 dec). */
  readonly lotSize: bigint;
  readonly paused: boolean;
}

// ── WS message types ──────────────────────────────────────────────────────────

export type WsChannel =
  | `ticker:${PairId}`
  | `trades:${PairId}`
  | `depth:${PairId}`;

export interface WsSubscribeMessage {
  type: "subscribe";
  channels: WsChannel[];
}

export interface WsUnsubscribeMessage {
  type: "unsubscribe";
  channels: WsChannel[];
}

export interface WsTickerMessage {
  type: "ticker";
  channel: `ticker:${PairId}`;
  data: {
    price: number;
    change24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    timestamp: number;
  };
}

export interface WsTradesMessage {
  type: "trades";
  channel: `trades:${PairId}`;
  data: Trade[];
}

export interface WsDepthMessage {
  type: "depth";
  channel: `depth:${PairId}`;
  data: Depth;
}

export interface WsPingMessage { type: "ping"; }
export interface WsPongMessage { type: "pong"; }
export interface WsErrorMessage { type: "error"; code: string; message: string; }

export type WsServerMessage =
  | WsTickerMessage
  | WsTradesMessage
  | WsDepthMessage
  | WsPongMessage
  | WsErrorMessage;

export type WsClientMessage =
  | WsSubscribeMessage
  | WsUnsubscribeMessage
  | WsPingMessage;
