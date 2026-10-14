/**
 * Deployed contract addresses on Arc networks.
 *
 * SINGLE SOURCE OF TRUTH for every on-chain address in the app. Components
 * never hardcode an address; they read these through the active network's
 * config (see config/networks.ts), so a network switch repoints every read
 * and write at once.
 *
 * ARC MAINNET (chain 5042) — deployed and verified on-chain 2026-10-14:
 *   TokenFactory, SpotPoolFactoryV2, and the three seed MockERC20 base
 *   tokens. All three pools seeded (TECHx $150, ENERGYx $75, ARCx $25) and
 *   live.
 *
 * ARC TESTNET (chain 5042002) — no contracts deployed. Addresses stay ZERO so
 * trade / createToken features remain off until a testnet deploy fills them in.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** USDC ERC-20 — same address on every Arc chain (docs.arc.io). */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// ── Arc Mainnet (5042) — deployed ──────────────────────────────────────────
export const MAINNET_TOKEN_FACTORY =
  "0x29f342baf8b5cce612e4f040d8e1f062a33c175f" as const;
export const MAINNET_SPOT_POOL =
  "0x155b7e616cbe9d5972388ec0cd018834ed0f0cdf" as const;
export const MAINNET_TECHX =
  "0x7ca6362c602ce7c2547da50d27ca809c95d69c2b" as const;
export const MAINNET_ENERGYX =
  "0x7b2c092771cd62cc43728f506b860db35d861192" as const;
export const MAINNET_ARCX =
  "0x6affa44ea4dfa689becdcc23e8d8179a967ac352" as const;
