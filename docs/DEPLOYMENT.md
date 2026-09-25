# stockX Pro — Deployment Guide

This guide walks you through deploying all stockX Pro contracts to **Arc Testnet** using Foundry and a private-key wallet.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project setup](#2-project-setup)
3. [Environment variables](#3-environment-variables)
4. [Build the contracts](#4-build-the-contracts)
5. [Fresh deployment (Deploy.s.sol)](#5-fresh-deployment-deploys.sol)
6. [Verify source on the explorer](#6-verify-source-on-the-explorer)
7. [Wire addresses into the frontend](#7-wire-addresses-into-the-frontend)
8. [Seed the spot pools](#8-seed-the-spot-pools)
9. [Update oracle prices](#9-update-oracle-prices)
10. [Re-seed or add more liquidity](#10-re-seed-or-add-more-liquidity)
11. [Deployed contract addresses](#11-deployed-contract-addresses)
12. [Script reference](#12-script-reference)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Foundry (`forge`, `cast`, `anvil`) | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Bun | 1.x | `curl -fsSL https://bun.sh/install \| bash` |
| A wallet with Arc Testnet USDC | — | See section 3 |

> On Arc Testnet, **USDC is the native gas token** — you need USDC to pay gas, not ETH. No ETH is ever required.

---

## 2. Project setup

```bash
git clone <your-repo>
cd <your-repo>

# Install JS dependencies
bun install

# Install Foundry library dependencies
forge install
```

The Foundry config (`foundry.toml`) already references `lib/forge-std` and `@openzeppelin/contracts` via the node_modules remapping in `remappings.txt`.

---

## 3. Environment variables

Copy `env.example` to `.env` at the project root and fill in the required fields:

```bash
cp env.example .env
```

**Minimum required before deploying:**

```dotenv
PRIVATE_KEY=0x<your_deployer_private_key>
ARC_TESTNET_RPC=https://rpc.testnet.arc.io
USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

### Getting testnet USDC

- In Arc Studio: click the **"Get test USDC"** button in the sidebar. It drips USDC directly to your connected wallet.
- Alternatively: use the [Circle faucet](https://faucet.circle.com) and select Arc Testnet.

Your deployer wallet needs **at least 30 000 USDC** to cover gas and the default pool seed amounts (15 000 + 7 500 + 2 500 = 25 000 USDC).

### Private key security

- Use a dedicated testnet-only wallet. Never use a wallet that holds real funds.
- The private key is read from `.env` at script time and never leaves your machine.
- `.env` is listed in `.gitignore` — confirm it stays untracked before pushing.

---

## 4. Build the contracts

```bash
forge build
```

Expected output: five contracts compiled with zero warnings under `contracts/out/`.

If you see `PUSH0 opcode` errors, confirm `evm_version = "paris"` is set in `foundry.toml` (Arc Testnet does not yet support Shanghai+).

---

## 5. Fresh deployment (Deploy.s.sol)

`Deploy.s.sol` deploys all five contracts and seeds the AMM pools in a single broadcast:

```bash
# Dry-run first (no --broadcast) — prints addresses and gas estimates
forge script contracts/script/Deploy.s.sol \
  --rpc-url arc_testnet \
  -vvvv

# Full deployment
forge script contracts/script/Deploy.s.sol \
  --rpc-url arc_testnet \
  --broadcast \
  --slow \
  -vvvv
```

`--slow` sends one transaction at a time and waits for each receipt before the next. Recommended on testnet to avoid nonce collisions.

### What the script does

1. Deploys `PriceOracle` with the deployer as owner and initial prices seeded.
2. Deploys `SpotPoolFactory` pointing at USDC.
3. Deploys `PerpEngine` pointing at the oracle.
4. Deploys three `MockERC20` tokens: TECHx, ENERGYx, ARCx.
5. Calls `setBaseToken` on `SpotPoolFactory` for each pair (activates pools).
6. Mints base tokens, approves, and calls `addLiquidity` for all three pools.

### Reading the output

At the end of a successful broadcast, `forge script` prints a summary block:

```
=== Deployment complete ===
Copy these into src/constants.ts:
  priceOracle: 0x...
  spotPool   : 0x...
  perpEngine : 0x...
  TECHx      : 0x...
  ENERGYx    : 0x...
  ARCx       : 0x...
```

Also check `broadcast/Deploy.s.sol/<chainId>/run-latest.json` for machine-readable receipts.

---

## 6. Verify source on the explorer

Arc Testnet uses a Blockscout-compatible explorer. Blockscout does not require an API key.

```bash
# Verify PriceOracle (replace 0x... with actual address)
forge verify-contract \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api \
  --constructor-args $(cast abi-encode "constructor(address)" 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42) \
  0x<PRICE_ORACLE_ADDRESS> \
  contracts/PriceOracle.sol:PriceOracle

# Verify SpotPoolFactory
forge verify-contract \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api \
  --constructor-args $(cast abi-encode "constructor(address,address)" 0x3600000000000000000000000000000000000000 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42) \
  0x<SPOT_POOL_ADDRESS> \
  contracts/SpotPoolFactory.sol:SpotPoolFactory

# Verify PerpEngine
forge verify-contract \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api \
  --constructor-args $(cast abi-encode "constructor(address,address)" 0x<PRICE_ORACLE_ADDRESS> 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42) \
  0x<PERP_ENGINE_ADDRESS> \
  contracts/PerpEngine.sol:PerpEngine

# Verify each MockERC20 (TECHx shown; repeat for ENERGYx and ARCx)
forge verify-contract \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api \
  --constructor-args $(cast abi-encode "constructor(string,string,uint8,address)" "TechX Index" "TECHx" 18 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42) \
  0x<TECHX_ADDRESS> \
  contracts/MockERC20.sol:MockERC20
```

---

## 7. Wire addresses into the frontend

Open `src/constants.ts` and update `CONTRACT_ADDRESSES` and `BASE_TOKENS` with the addresses from step 5:

```typescript
export const CONTRACT_ADDRESSES = {
  priceOracle: "0x<PRICE_ORACLE_ADDRESS>" as `0x${string}`,
  spotPool:    "0x<SPOT_POOL_ADDRESS>"    as `0x${string}`,
  perpEngine:  "0x<PERP_ENGINE_ADDRESS>`  as `0x${string}`,
};

export const BASE_TOKENS: Record<number, `0x${string}`> = {
  0: "0x<TECHX_ADDRESS>",
  1: "0x<ENERGYX_ADDRESS>",
  2: "0x<ARCX_ADDRESS>",
};
```

Then rebuild:

```bash
bun run build   # production bundle
# or
bun run dev     # dev server with HMR
```

---

## 8. Seed the spot pools

If you ran `Deploy.s.sol` with `SKIP_SEED=false` (the default), pools are already seeded and this step is complete.

To seed an already-deployed set of contracts, use `SeedPools.s.sol`. Add the deployed addresses to `.env` first:

```dotenv
SPOT_POOL_ADDRESS=0x...
TECHX_ADDRESS=0x...
ENERGYX_ADDRESS=0x...
ARCX_ADDRESS=0x...
```

Then run:

```bash
forge script contracts/script/SeedPools.s.sol \
  --rpc-url arc_testnet \
  --broadcast \
  --slow \
  -vvvv
```

### Pool activation check

A pool is active once `setBaseToken` has been called AND `addLiquidity` has been called at least once. You can confirm on-chain:

```bash
# Check pool state for pairId 0 (TECHx)
cast call 0x<SPOT_POOL_ADDRESS> \
  "pools(uint8)(address,uint128,uint128,bool)" 0 \
  --rpc-url https://rpc.testnet.arc.io
```

Output format: `(baseToken, reserveUSDC, reserveBase, active)`. The last field must be `true`.

### Deactivation note

Once `setBaseToken` is called it cannot be changed (one-time guard). Pools remain active permanently unless you deploy a new `SpotPoolFactory`.

---

## 9. Update oracle prices

The `PriceOracle` is admin-controlled on testnet. Use `UpdatePrices.s.sol` to simulate price moves:

```bash
# Set new prices (.env must have PRICE_ORACLE_ADDRESS set)
PRICE_TECHX=15500000000 \
PRICE_ENERGYX=7200000000 \
PRICE_ARCX=2800000000 \
forge script contracts/script/UpdatePrices.s.sol \
  --rpc-url arc_testnet \
  --broadcast \
  -vvvv
```

Prices use **8 decimal places**: `$155.00 = 15500000000`.

You can also call `setPrice` directly via `cast`:

```bash
cast send 0x<PRICE_ORACLE_ADDRESS> \
  "setPrice(uint8,uint256)" 0 15500000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet.arc.io
```

---

## 10. Re-seed or add more liquidity

Any address can call `addLiquidity` — it is not owner-restricted. The caller needs USDC and base tokens approved to `SpotPoolFactory` first:

```bash
# Approve USDC (example: 1000 USDC = 1_000_000_000 with 6 decimals)
cast send 0x3600000000000000000000000000000000000000 \
  "approve(address,uint256)" 0x<SPOT_POOL_ADDRESS> 1000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet.arc.io

# Approve TECHx (1000 * 1e18)
cast send 0x<TECHX_ADDRESS> \
  "approve(address,uint256)" 0x<SPOT_POOL_ADDRESS> 1000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet.arc.io

# Add liquidity — pairId=0, 1000 USDC, ~6.67 TECHx (at $150 oracle price)
cast send 0x<SPOT_POOL_ADDRESS> \
  "addLiquidity(uint8,uint256,uint256,uint256)" 0 1000000000 6666666666666666666 0 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet.arc.io
```

---

## 11. Deployed contract addresses

The currently deployed addresses on Arc Testnet (chain ID 5042002) from the Arc Studio Mode 1 deploy:

| Contract | Address |
|---|---|
| PriceOracle | `0xf8149268c4cf3710ec8753191ead9bc46322ee77` |
| SpotPoolFactory | `0x34d8dceb7d9638cc5be504f8540c25a143b51ac5` |
| PerpEngine | `0x2b0bd350e8854779f3b72a526897be8847ba6b7b` |
| TECHx (MockERC20) | `0xcf4fd3c37325756d71e85ab88f5e0394e134365c` |
| ENERGYx (MockERC20) | `0x485cb7c7ea822366e35d119def803e5074bbfd5d` |
| ARCx (MockERC20) | `0xe70d621729b3c306b8f97e75711c142bc3824ded` |
| USDC (canonical) | `0x3600000000000000000000000000000000000000` |

> These are the platform-wallet deploys. Running `Deploy.s.sol` from your own wallet will produce different addresses.

---

## 12. Script reference

| Script | Purpose | Key env vars |
|---|---|---|
| `contracts/script/Deploy.s.sol` | Full deploy: all contracts + pool seeding | `PRIVATE_KEY`, `USDC_ADDRESS`, `ARC_TESTNET_RPC` |
| `contracts/script/SeedPools.s.sol` | Seed already-deployed pools | `PRIVATE_KEY`, `SPOT_POOL_ADDRESS`, `TECHX_ADDRESS`, `ENERGYX_ADDRESS`, `ARCX_ADDRESS` |
| `contracts/script/UpdatePrices.s.sol` | Push new oracle prices | `PRIVATE_KEY`, `PRICE_ORACLE_ADDRESS`, `PRICE_TECHX`, `PRICE_ENERGYX`, `PRICE_ARCX` |
| `contracts/script/DeployCreate2.s.sol` | Deterministic address deploy via CREATE2 | `FACTORY_ADDRESS`, `CREATE2_SALT`, `CREATION_CODE` |

---

## 13. Troubleshooting

**`EvmError: Revert` on `addLiquidity`**
The pool's `active` flag is `false`. `setBaseToken` must be called first. Check with `cast call ... "pools(uint8)(...)" <pairId>`.

**`insufficient funds` on broadcast**
Your deployer wallet does not have enough USDC for gas + seed amounts. Get test USDC from the Arc Studio faucet or reduce `SEED_USDC_*` values in `.env`.

**`PUSH0 opcode not supported`**
Foundry defaulted to a Solidity version that emits PUSH0 (Shanghai EVM). Confirm `evm_version = "paris"` in `foundry.toml` and `solc_version = "0.8.28"` (0.8.20+ with paris target is fine).

**`nonce too low` on consecutive transactions**
Remove `--slow` and add `--retries 3 --delay 2` instead, or rerun with `--resume` to continue a partially-broadcast run from its saved receipts.

**Forge script hangs on broadcast**
Arc Testnet has sub-second block times. If a broadcast stalls for more than 30 seconds, cancel it and add `--legacy` to force a legacy (non-EIP-1559) transaction type.

**`Base token already set` revert on `setBaseToken`**
The pool's base token has already been configured — this is a one-time operation. This is not an error; the pool is already active.
