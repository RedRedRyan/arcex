/**
 * UI-only constants: pair display metadata, navigation, and social links.
 *
 * NOTHING chain-specific belongs here — no contract address, chain id, RPC,
 * or explorer URL. Those live in config/networks.ts (the single source of
 * truth) and are read through the active network's config via `useNetwork()`.
 * On-chain addresses were removed from this module.
 *
 * PAIRS below is display metadata only (ticker, name, color). The tradable
 * pair list — including each base token's on-chain address — comes from
 * `config.pairs` on the active network.
 */

// Simulated assets — not tied to any real-world price. Prices come from the contracts:
// the pool (SpotPoolFactory reserves) for spot and the PriceOracle for perps.
export const PAIRS = [
  {
    id: 0,
    ticker: "TECHx",
    name: "TechX",
    quote: "USDC",
    color: "#fb4f1f",
    seedPrice: 150,
    tvSymbol: undefined,
  },
  {
    id: 1,
    ticker: "ENERGYx",
    name: "EnergyX",
    quote: "USDC",
    color: "#ffa04d",
    seedPrice: 75,
    tvSymbol: undefined,
  },
  {
    id: 2,
    ticker: "ARCx",
    name: "ArcX",
    quote: "USDC",
    color: "#ffb347",
    seedPrice: 25,
    tvSymbol: undefined,
  },
] as const;

export type PairId = 0 | 1 | 2;

export const USDC_DECIMALS = 6;

export const navLinks = [
  { path: "/market", title: "Markets" },
  { path: "/spot", title: "Spot" },
  { path: "/create", title: "Create" },
  { path: "/portfolio", title: "Portfolio" },
] as const;

export const NAV_ITEMS = [
  { href: "/spot", label: "Spot" },
  { href: "/swap", label: "Swap" },
  { href: "/earn", label: "Earn" },
  { href: "/portfolio", label: "Portfolio" },
];
export const socials = [
  {
    name: "Youtube",
    icon: "/assets/images/youtube.png",
    url: "https://www.youtube.com/@NBX_Exchange",
  },
  {
    name: "X (Twitter)",
    icon: "/assets/images/x.png",
    url: "https://x.com/NBX_Exchange",
  },
  {
    name: "LinkedIn",
    icon: "/assets/images/linkedin.png",
    url: "https://www.linkedin.com/company/nairobi-block-exchange/",
  },
];
