# (arcex)

NBX
**Tokenized equities and bonds, traded onchain on [Arc](https://www.arc.io) with USDC.**

NBX is an onchain exchange for tokenized real-world assets, built for African capital markets. Issuers mint asset tokens through an admin-gated token factory, and investors trade them against USDC in constant-product liquidity pools, with no broker, no custodian and no T+2 settlement.

- **Live app (Studio):** https://nbx-arc.vercel.app
- **Repo:** https://github.com/RedRedRyan/arcex
- **Network:** Arc (USDC is the base and quote currency for every market)

---

## Why NBX

Public equity and bond markets across Africa are fragmented, slow to settle, and hard for retail and diaspora investors to reach. NBX tokenizes these instruments and puts them on a settlement layer where:

- **USDC is the unit of account**, so there is no FX exposure on the quote side.
- **Settlement is final in a single transaction**, instead of days.
- **Issuance is permissioned, trading is permissionless.** Only an admin can create a token, but anyone with a wallet can trade it.
- **USDC is the native gas token on Arc**, so there is no ETH to buy for gas.

NBX is a continuation of an earlier hackathon build, rebuilt and extended as a standalone exchange on Arc.

---

## Architecture

Bun workspace monorepo:

| Package | Role | Phase |
|---|---|---|
| `apps/web` | Vite + React + TypeScript SPA (sources still at root `src/` during Phase 0) | 0 |
| `packages/shared` | Chain config, address registry, units, ABIs, zod schemas, types. Imported as `@arcex/shared` | 0 |
| `services/indexer` | Supabase + viem + polling indexer: pool events -> Postgres, 1m/5m/1h/1d OHLCV candles, WS publish | 1 |
| `services/api` | REST + WS gateway, Hono on Bun | 1 |
| `services/matcher` | Off-chain order book + settlement submitter | 3 |
| `services/keeper` | Liquidation / funding / TWAP bots | 4 |

Mainnet is the default trading network. The frontend reads each contract address from an env var, and falls back to the hardcoded value in `src/config/addresses.ts` only when the var is unset.

---

## What it does

| Feature | Description |
|---|---|
| **Token issuance** | An admin-controlled `TokenFactory` creates new asset tokens (equities, bonds). |
| **Spot trading** | A `SpotPoolFactoryV2` provides constant-product AMM liquidity for each asset/USDC pair, with a 0.3% swap fee. |
| **Live charts** | Prices are read straight from pool reserves and rendered with TradingView `lightweight-charts`. |
| **Portfolio** | Wallet balances and holdings valued at live pool prices, with per-chain USDC rows. |
| **Wallets** | Wallet connection via wagmi + ConnectKit; Circle wallet SDKs are included for embedded-wallet flows. |
| **Faucet / testnet** | Testnet instructions and contract addresses for evaluators. |
| **Earn** | Deposit USDC into audited vaults for yield (mainnet only). |
| **Swap** | Cross-chain token swap via Dynamic (Arc, Ethereum, Base). |

### Launch markets

Three synthetic assets simulate listed securities against USDC:

| Symbol | Pair |
|---|---|
| `TECHx` | TECHx / USDC |
| `ENERGYx` | ENERGYx / USDC |
| `ARCx` | ARCx / USDC |

Prices are discovered entirely by pool reserves. There are no external price proxies.

---

## Arc conventions (enforced across the codebase)

- USDC is the native gas token on Arc. The native balance uses **18 decimals** (gas); the ERC-20 interface uses **6 decimals** (transfers). They are the **same pool** - never show two USDC balance rows and never sum them.
- Never mix 6-dec and 18-dec math directly. Use `packages/shared/src/units.ts` only (`nativeToErc20` / `erc20ToNative`). Never hand-rescale.
- Arc gas floor: `maxFeePerGas >= 20 gwei` (`ARC_MIN_MAX_FEE_PER_GAS_WEI` in `packages/shared/src/units.ts`).

---

## Deployed contracts

### Arc Mainnet (chain 5042, deployed 2026-10-14)

| Contract | Address |
|---|---|
| TokenFactory | `0x29f342baf8b5cce612e4f040d8e1f062a33c175f` |
| SpotPoolFactoryV2 | `0x155b7e616cbe9d5972388ec0cd018834ed0f0cdf` |
| TECHx | `0x7ca6362c602ce7c2547da50d27ca809c95d69c2b` |
| ENERGYx | `0x7b2c092771cd62cc43728f506b860db35d861192` |
| ARCx | `0x6affa44ea4dfa689becdcc23e8d8179a967ac352` |

The frontend reads each `VITE_*` address from the environment and falls back to the defaults in `src/config/addresses.ts` when the var is unset.

### Contract surface (mainnet defaults)

The trading stack is wired through `src/config/networks.ts` (`NETWORKS.mainnet`) and `src/config/addresses.ts`. `config/networks.ts` is the single source of truth for chain id, RPC, explorer URL, USDC decimals, gas floor, and feature flags. `config/networks.ts` overrides the hardcoded fallback only for `mainnet` / `testnet`; every other chain (Ethereum, Base) is defined in `viem/chains` and referenced from there.

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Vite 6, React 18, TypeScript, Tailwind CSS, Framer Motion |
| Web3 | wagmi, viem, ConnectKit, TanStack Query, Dynamic |
| Charts | lightweight-charts |
| Wallets / payments | Circle App Kit, Circle wallet SDKs, Dynamic |
| Contracts | Solidity, Foundry, OpenZeppelin 5.1 |
| Data / indexing | Supabase, polling indexer, Vercel cron |
| Tooling | Bun, tsx, oxlint |
| Hosting | Vercel |

---

## Repository layout

```
contracts/      Solidity contracts (factory, pool, tokens)
  scripts/      Deploy, ABI fetch and pool-seeding scripts
  test/         Forge unit + fuzz + invariant tests
  script/       Deployment scripts (Deploy.s.sol, SeedPools.s.sol)
  contract-metadata/  ABI + metadata for the frontend
apps/web/       Vite + React frontend workspace
packages/shared/  Chain config, address registry, units, ABIs, types
services/
  api/          REST + WS gateway (Hono on Bun)
  indexer/      Pool-event -> Postgres, candle aggregation, WS pub
  matcher/      Off-chain order book + settlement submitter
  keeper/       Liquidation / funding / TWAP bots
src/            Vite + React frontend (Phase 0, sources live here)
  config/       networks.ts (single source of truth for addresses), assets, FeatureGuards, NetworkProvider
  data/         MarketStore, OracleFeed, TokenRegistry, UsePortfolio
  pages/        Market, Spot, Swap, Trade, Create, Portfolio, Faucet, Earn, Connect
  components/   SpotTicket, FuturesTicket, ui/, charts, widgets
  bridge/       CCTP bridge UI (pending cleanup)
docs/           Additional documentation
supabase/       Migrations for the indexer
.env.example    Root environment template
env.example     Root environment template
```

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (see `.bun-version`) or Node 20+
- [Foundry](https://book.getfoundry.sh) (see `.foundry-version`)
- A wallet with Arc testnet USDC

### Install and run

```bash
git clone https://github.com/RedRedRyan/arcex.git
cd arcex
bun install          # or: npm install
cp env.example .env  # then fill in your values
bun run dev          # or: npm run dev
```

The app runs on Vite's default dev server.

### Environment

Copy `env.example` to `.env`. **Never commit .env.**

| Variable | Purpose |
|---|---|
| `ARC_MAINNET_RPC` / `ARC_TESTNET_RPC` | Arc RPC endpoints |
| `USDC_ADDRESS` | Canonical Arc USDC (`0x3600...0000`) |
| `VITE_TOKEN_FACTORY_ADDRESS`, `VITE_SPOT_POOL_ADDRESS`, `VITE_TECHX_ADDRESS`, `VITE_ENERGYX_ADDRESS`, `VITE_ARCX_ADDRESS` | Contract addresses exposed to the frontend (mainnet). Set a `VITE_` var only to repoint the app after a redeploy; otherwise the app falls back to `src/config/addresses.ts`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase (frontend, publishable key only) |
| `SUPABASE_SECRET_KEY` | Server-side only (indexer and cron). Never prefix with `VITE_` |
| `MAINNET_CONFIRM` | Must be exactly `yes` to run a mainnet deploy |
| `SEED_USDC_TECHX` / `SEED_USDC_ENERGYX` / `SEED_USDC_ARCX`, `SKIP_SEED` | Pool seeding amounts (USDC, 6 decimals) |
| `CIRCLE_DEVELOPER_CONTROLLED_API_KEY`, `CIRCLE_ENTITY_SECRET` | Optional, Circle SDK flows only |
| `VITE_NETWORK` | `testnet` or `mainnet` (default: `mainnet`) |

Testnet is the default for local dev; the hardcoded mainnet addresses in `src/config/addresses.ts` are the fallback until a testnet deploy fills the `NETWORKS.testnet` contracts fields.

---

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the Vite dev server |
| `bun run build` | Production build |
| `bun run indexer` | Start the indexer service |
| `bun run indexer:dev` | Indexer in watch mode |
| `bun run typecheck` | TypeScript check (web + shared) |
| `bun run lint` | oxlint with autofix |
| `bun run check` | Full check script |
| `bun run contracts:build` | `forge build` |
| `bun run contracts:test` | `forge test` |
| `bun run test` | Run `packages/shared` Vitest |
| `bun run fetch:abi` | Fetch contract ABIs |
| `bun run seed:pools` | Seed the spot pools with USDC liquidity |
| `bun run deploy:self` | Self-deploy contracts via script |
| `bun run deploy:mainnet` | `forge script contracts/script/DeployMainnet.s.sol --rpc-url arc_mainnet --broadcast --slow -vvvv` |
| `bun run deploy:testnet` | `forge script contracts/script/DeployV2.s.sol --rpc-url arc_testnet --broadcast --slow -vvvv` |

---

## Foundry

Run from the repo root:

```bash
forge build      # compile
forge test       # unit + fuzz + invariants
forge script contracts/script/Deploy.s.sol --rpc-url arc_testnet --broadcast --slow -vvvv
```

The `foundry.toml` targets Arc (`arc_mainnet`, `arc_testnet`), uses `solc_version = "0.8.28"` and `evm_version = "paris"`.

---

## Environment variables (per service)

### Root (frontend + scripts)

See `env.example` at the repo root.

### `services/indexer`

See `services/indexer/env.example`. Required: `SUPABASE_SECRET_KEY` (service-role key, server-side only), `ARC_RPC_HTTP`, `SPOT_POOL_ADDRESS`, `SUPABASE_URL`. The indexer only supports Arc Testnet (`5042002`).

### `services/api`

See `services/api/env.example`. PostgreSQL (`DATABASE_URL`), Arc RPC (`ARC_RPC_HTTP`), WS gateway (`WS_PORT`, `WS_HEARTBEAT_INTERVAL_MS`, `WS_GATEWAY_TOKEN`), rate limiting, and CORS.

### `services/matcher`

See `services/matcher/env.example`. Matcher hot-wallet key (`MATCHER_PRIVATE_KEY`, funded with USDC for gas), settlement contract (`ORDER_SETTLEMENT_ADDRESS`), batch submission (`BATCH_MAX_MATCHES`, `BATCH_INTERVAL_MS`), WS gateway for depth/trades publishing, self-trade prevention.

### `services/keeper`

See `services/keeper/env.example`. Keeper hot-wallet key (`KEEPER_PRIVATE_KEY`, funded with USDC for gas), perp engine / oracle router / insurance fund addresses, liquidation scanner, funding poke, TWAP update intervals, health alert webhook, max gas price.

---

## Trying it as a judge

1. Open https://nbx-arc.vercel.app and connect a wallet on Arc.
2. Get USDC on Arc (Arc Studio "Get test USDC" or the Circle faucet).
3. Open a market (TECHx, ENERGYx or ARCx), enter an amount, and trade against USDC.
4. Watch the price and chart update from the pool reserves.
5. Open the Portfolio page to see holdings valued at live pool prices.

---

## Roadmap

- Order book view on top of pool liquidity
- Perpetuals (contracts scoped, not enabled in the current spot-only stack)
- Real-asset markets (BTC, ETH, ARC / USDC) alongside tokenized equities and bonds
- Primary issuance flow for listed companies and bond issuers
- Fee on market entry for protocol revenue
- Compliance hooks (KYC allowlists) for regulated securities
- Persistent price-history indexing so every visitor sees full charts

---

## Security notes

- Contracts are unaudited. Use testnet funds unless you accept the risk.
- Token creation is admin-gated by design.
- Keep service-role and Circle credentials server-side and out of git.

---

## License

MIT (no `LICENSE` file present yet).

---

Built in Nairobi.
