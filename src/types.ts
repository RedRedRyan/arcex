export type PairId = 0 | 1 | 2;
export type TradingMode = "spot" | "futures";
export type OrderSide = "buy" | "sell";
export type Page = "market" | "spot" | "futures" | "portfolio" | "faucet";

export interface Pair {
  readonly id: number;
  readonly ticker: string;
  readonly name: string;
  /** TradingView symbol proxy — only set for real-asset markets, not synthetics. */
  readonly tvSymbol?: string;
  readonly quote: string;
  readonly color: string;
  /** Fallback seed price displayed before on-chain price loads; optional for synthetics. */
  readonly seedPrice?: number;
}

export interface OpenPosition {
  pairId: number;
  ticker: string;
  isLong: boolean;
  sizeUsdc: bigint;
  entryPrice: bigint;
  margin: bigint;
  leverage: number;
  openTimestamp: bigint;
  isOpen: boolean;
}
