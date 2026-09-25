export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// Deployed contracts — Arc Testnet
export const CONTRACT_ADDRESSES = {
  priceOracle: "0xf8149268c4cf3710ec8753191ead9bc46322ee77" as `0x${string}`,
  spotPool:    "0x34d8dceb7d9638cc5be504f8540c25a143b51ac5" as `0x${string}`,
  perpEngine:  "0x2b0bd350e8854779f3b72a526897be8847ba6b7b" as `0x${string}`,
};

// Mock ERC-20 base tokens
export const BASE_TOKENS: Record<number, `0x${string}`> = {
  0: "0xcf4fd3c37325756d71e85ab88f5e0394e134365c", // TECHx
  1: "0x485cb7c7ea822366e35d119def803e5074bbfd5d", // ENERGYx
  2: "0xe70d621729b3c306b8f97e75711c142bc3824ded", // ARCx
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
