export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// Deployed contracts — Arc Testnet (owned by 0x3B2f..., deployed 2026-10-03)
export const CONTRACT_ADDRESSES = {
  priceOracle: "0xcE0062be693EefF4e021bb7a8014A0d30C47dF0a" as `0x${string}`,
  spotPool:    "0x0ff9a151D9BE48d9222f9C680Ce4052E7c1f7b98" as `0x${string}`,
  perpEngine:  "0xbF6Ea775808485A19282C662A00Dbbbcae756D2B" as `0x${string}`,
};

// Mock ERC-20 base tokens
export const BASE_TOKENS: Record<number, `0x${string}`> = {
  0: "0xCA70737705C71094827555a9b0015E05308F1326", // TECHx
  1: "0xd463C6424c2776495A6EA88F575693D1fadcC5E6", // ENERGYx
  2: "0x5642aC5570d6ee46D1ff86D499D0009370Fd0CAF", // ARCx
};

// Use well-known TradingView symbols as price proxies for the synthetic pairs
export const PAIRS = [
  {
    id: 0,
    ticker: "TECHx",
    name: "TechX Index",
    // TradingView symbol for the chart — AAPL as tech-sector proxy
    tvSymbol: "NASDAQ:AAPL",
    quote: "USDC",
    color: "#fb4f1f",
    seedPrice: 150,
  },
  {
    id: 1,
    ticker: "ENERGYx",
    name: "Energy Index",
    // XOM as energy-sector proxy
    tvSymbol: "NYSE:XOM",
    quote: "USDC",
    color: "#ffa04d",
    seedPrice: 75,
  },
  {
    id: 2,
    ticker: "ARCx",
    name: "Arc Token",
    // BTC as crypto proxy
    tvSymbol: "CRYPTO:BTCUSD",
    quote: "USDC",
    color: "#ffb347",
    seedPrice: 25,
  },
] as const;

export type PairId = 0 | 1 | 2;

export const MAX_LEVERAGE = 20;
export const USDC_DECIMALS = 6;

// TradingView widget script base URL
export const TV_BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";

// Advanced chart config for the main trade view
export const tvAdvancedChart = (tvSymbol: string) => ({
  autosize: true,
  symbol: tvSymbol,
  interval: "60",
  timezone: "Etc/UTC",
  theme: "dark",
  style: "1",
  locale: "en",
  backgroundColor: "#0a0f1a",
  gridColor: "rgba(255,255,255,0.04)",
  hide_top_toolbar: false,
  hide_legend: false,
  save_image: false,
  allow_symbol_change: false,
  calendar: false,
  withdateranges: true,
  colorTheme: "dark",
  toolbar_bg: "#0a0f1a",
  studies: [],
  container_id: `tv_chart_${tvSymbol.replace(/[^a-z0-9]/gi, "_")}`,
});

// Mini sparkline for market cards
export const tvMiniChart = (tvSymbol: string) => ({
  symbol: tvSymbol,
  width: "100%",
  height: 100,
  locale: "en",
  dateRange: "1D",
  colorTheme: "dark",
  trendLineColor: "#fb4f1f",
  underLineColor: "rgba(251,79,31,0.10)",
  underLineBottomColor: "transparent",
  isTransparent: true,
  autosize: false,
});