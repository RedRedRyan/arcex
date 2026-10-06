import { href } from "react-router-dom";

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

// Deployed contracts — Arc Testnet (owned by 0x3B2f..., deployed 2026-10-03)
export const CONTRACT_ADDRESSES = {
  priceOracle: "0xcE0062be693EefF4e021bb7a8014A0d30C47dF0a" as `0x${string}`,
  spotPool: "0x0ff9a151D9BE48d9222f9C680Ce4052E7c1f7b98" as `0x${string}`,
  perpEngine: "0xbF6Ea775808485A19282C662A00Dbbbcae756D2B" as `0x${string}`,
};

// Mock ERC-20 base tokens
export const BASE_TOKENS: Record<number, `0x${string}`> = {
  0: "0xCA70737705C71094827555a9b0015E05308F1326", // TECHx
  1: "0xd463C6424c2776495A6EA88F575693D1fadcC5E6", // ENERGYx
  2: "0x5642aC5570d6ee46D1ff86D499D0009370Fd0CAF", // ARCx
};

// Simulated assets — not tied to any real-world price. Prices come from the contracts:
// the pool (SpotPoolFactory reserves) for spot and the PriceOracle for perps.
export const PAIRS = [
  { id: 0, ticker: "TECHx", name: "TechX", quote: "USDC", color: "#fb4f1f" },
  {
    id: 1,
    ticker: "ENERGYx",
    name: "EnergyX",
    quote: "USDC",
    color: "#ffa04d",
  },
  { id: 2, ticker: "ARCx", name: "ArcX", quote: "USDC", color: "#ffb347" },
] as const;

export type PairId = 0 | 1 | 2;

export const MAX_LEVERAGE = 20;
export const USDC_DECIMALS = 6;

export const navLinks = [
  { path: "/", title: "Markets" },
  { path: "/spot", title: "Spot" },
  { path: "/futures", title: "Futures" },
  { path: "/portfolio", title: "Portfolio" },
  { path: "/faucet", title: "Faucet" },
] as const;

export const NAV_ITEMS = [
  { href: "/", label: "Markets" },
  { href: "/spot", label: "Spot" },
  { href: "/futures", label: "Futures" },
  { href: "/portfolio", label: "Portfolio" },
  // { href: "/faucet", label: "Faucet" },
  // { href: '/watchlist', label: 'Watchlist' },
];
export const socials = [
  {
    name: "Youtube",
    icon: "/images/youtube.png",
    url: "https://www.youtube.com/@NBX_Exchange",
  },
  {
    name: "X (Twitter)",
    icon: "/images/x.png",
    url: "https://x.com/NBX_Exchange",
  },
  {
    name: "LinkedIn",
    icon: "/images/linkedin.png",
    url: "https://www.linkedin.com/company/nairobi-block-exchange/",
  },
];
