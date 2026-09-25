# stockX Pro — Agent Memory

## Deployed Contracts — Arc Testnet (chainId 5042002)

| Contract | Address | Notes |
|---|---|---|
| PriceOracle | `0xf8149268c4cf3710ec8753191ead9bc46322ee77` | Mock oracle, admin price feed |
| SpotPoolFactory | `0x34d8dceb7d9638cc5be504f8540c25a143b51ac5` | Constant-product AMM, 3 pools, 0.3% fee |
| PerpEngine | `0x2b0bd350e8854779f3b72a526897be8847ba6b7b` | Perp engine, margin accounts, max 20× |
| MockERC20 — TECHx | `0xcf4fd3c37325756d71e85ab88f5e0394e134365c` | pairId=0, 18 dec, mintable by owner |
| MockERC20 — ENERGYx | `0x485cb7c7ea822366e35d119def803e5074bbfd5d` | pairId=1, 18 dec, mintable by owner |
| MockERC20 — ARCx | `0xe70d621729b3c306b8f97e75711c142bc3824ded` | pairId=2, 18 dec, mintable by owner |

## Key Addresses
- USDC (ERC-20, 6 dec): `0x3600000000000000000000000000000000000000`
- Platform deployer/owner: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`

## Pool Seeding Status
- Seed script at `scripts/seed-pools.ts`
- Requires CIRCLE_DEVELOPER_CONTROLLED_API_KEY + CIRCLE_ENTITY_SECRET in .env
- Run: `bun run scripts/seed-pools.ts`
- Mock tokens deployed. `setBaseToken` + `addLiquidity` still need to be called on-chain.

## Frontend Structure
- `/src/App.tsx` — thin router: market / spot / futures / portfolio / faucet
- `/src/pages/MarketPage.tsx` — overview with real TV market-overview widget
- `/src/pages/SpotPage.tsx` — Spot trading with advanced chart (AAPL/XOM/BTC proxies)
- `/src/pages/FuturesPage.tsx` — Futures trading with advanced chart + positions table
- `/src/pages/PortfolioPage.tsx` — balances, spot holdings, open positions
- `/src/pages/FaucetPage.tsx` — faucet instructions + contract addresses
- `/src/components/SpotTicket.tsx` — spot trade ticket (pool-active aware)
- `/src/components/FuturesTicket.tsx` — futures ticket (approve → deposit → open flow)
- `/src/components/PairHeader.tsx` — pair selector bar shared by Spot/Futures pages
- `/src/constants.ts` — PAIRS with tvSymbol proxy (AAPL/XOM/BTCUSD), BASE_TOKENS map
- Orange accent: `--accent: #fb4f1f`, `--sunset: #ffa04d`, `--flame: #ff6a3d`, `--tangerine: #ffb347`

## TradingView Symbol Proxies
| Our Pair | TV Symbol | Rationale |
|---|---|---|
| TECHx | NASDAQ:AAPL | Tech sector proxy |
| ENERGYx | NYSE:XOM | Energy sector proxy |
| ARCx | CRYPTO:BTCUSD | Crypto proxy |
