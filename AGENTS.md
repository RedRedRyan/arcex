# arcex — Agent Memory

## Architecture

Bun workspace monorepo:
- `apps/web`         — Vite + React SPA (sources still live at root `src/` during Phase 0)
- `packages/shared`  — chain config, address registry, units, ABIs, zod schemas, types
- `services/indexer` — event ingestion → Postgres, candle aggregation, WS pub (Phase 1)
- `services/api`     — REST + WS gateway (Hono on Bun) (Phase 1)
- `services/matcher` — off-chain order book + settlement submitter (Phase 3)
- `services/keeper`  — liquidation/funding/TWAP bots (Phase 4)

## Deployed Contracts — Arc Testnet (chainId 5042002)

| Contract | Address | Notes |
|---|---|---|
| PriceOracle | `0xcE0062be693EefF4e021bb7a8014A0d30C47dF0a` | Legacy admin oracle; replaced by OracleRouter in Phase 4 |
| SpotPoolFactory | `0x0ff9a151D9BE48d9222f9C680Ce4052E7c1f7b98` | Constant-product AMM, 3 pools, 0.3% fee |
| PerpEngine | `0xbF6Ea775808485A19282C662A00Dbbbcae756D2B` | Perp engine, margin accounts, max 20× |
| MockERC20 — TECHx | `0xCA70737705C71094827555a9b0015E05308F1326` | pairId=0, 18 dec |
| MockERC20 — ENERGYx | `0xd463C6424c2776495A6EA88F575693D1fadcC5E6` | pairId=1, 18 dec |
| MockERC20 — ARCx | `0x5642aC5570d6ee46D1ff86D499D0009370Fd0CAF` | pairId=2, 18 dec |
| ArcexTimelock | PENDING Phase 0 deploy | 24h delay, proposer = admin multisig |
| MarketRegistry | PENDING Phase 0 deploy | ADMIN_ROLE → Timelock, PAUSER_ROLE → admin multisig |

## Deployed Contracts — Arc Mainnet (chainId 5042)

| Contract | Address | Notes |
|---|---|---|
| ArcexTimelock | PENDING Phase 0 deploy | |
| MarketRegistry | PENDING Phase 0 deploy | |

## Key Addresses
- USDC (ERC-20, 6 dec, also native gas 18 dec on Arc): `0x3600000000000000000000000000000000000000`
- Admin / multisig: `0x3B2f9f644312cdB69be095FCC3b353C69a0088B2`
- Platform deployer: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`

## Arc Rules (CRITICAL — enforce in every contract + TS module)
- USDC is the native gas token on Arc. Native view = 18 dec (gas). ERC-20 view = 6 dec (transfers).
- They are the SAME pool. Never show two USDC balance rows. Never sum them.
- Never mix 6-dec and 18-dec math directly. Use `packages/shared/src/units.ts` only.
- Use `nativeToErc20` / `erc20ToNative` for conversions. Never hand-rescale.
- Arc gas floor: maxFeePerGas >= 20 gwei (`ARC_MIN_MAX_FEE_PER_GAS_WEI` in units.ts).

## Phase Progress

| Phase | Status | Notes |
|---|---|---|
| 0 — Hygiene & Foundation | IN PROGRESS | Workspace layout, shared package, MarketRegistry + Timelock contracts written; deploy pending |
| 1 — Data layer & fast charts | PENDING | |
| 2 — Protocol fee & real-asset swaps | PENDING | |
| 3 — Order book | PENDING | |
| 4 — Perps | PENDING | |
| 5 — App Kits & funding flows | PENDING | |
| 6 — Mainnet hardening | PENDING | |

## Frontend Structure
- `src/App.tsx` — thin router: market / spot / futures / portfolio / faucet
- `src/pages/MarketPage.tsx` — overview with real TV market-overview widget
- `src/pages/SpotPage.tsx` — Spot trading with advanced chart (synthetic pairs)
- `src/pages/FuturesPage.tsx` — Futures trading with advanced chart + positions table
- `src/pages/PortfolioPage.tsx` — balances, spot holdings, open positions
- `src/pages/FaucetPage.tsx` — faucet instructions + contract addresses (testnet only)
- `src/components/SpotTicket.tsx` — spot trade ticket (pool-active aware)
- `src/components/FuturesTicket.tsx` — futures ticket (approve → deposit → open flow)
- `src/constants.ts` — PAIRS with contract addresses and chain constants

## Color Palette
- Orange accent: `--accent: #fb4f1f`, `--sunset: #ffa04d`, `--flame: #ff6a3d`, `--tangerine: #ffb347`
