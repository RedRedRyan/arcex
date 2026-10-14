// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TokenFactory} from "../TokenFactory.sol";
import {SpotPoolFactoryV2} from "../SpotPoolFactoryV2.sol";
import {MockERC20} from "../MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Deploy — arcex spot deployment
/// @notice Deploys TokenFactory, SpotPoolFactoryV2, and three MockERC20 base
///         tokens, registers them as seed pairs, and seeds each AMM pool with
///         initial liquidity so spot trading is live immediately.
///
/// Required env vars (see .env.example):
///   PRIVATE_KEY        — deployer/owner private key (0x-prefixed)
///   ARC_TESTNET_RPC    — https://rpc.testnet.arc.io  (or any Arc Testnet RPC)
///   USDC_ADDRESS       — USDC ERC-20 on Arc Testnet
///   SEED_USDC_TECHX    — USDC amount (6 dec) to seed TECHx pool, e.g. 15000000000 (15 000 USDC)
///   SEED_USDC_ENERGYX  — USDC amount to seed ENERGYx pool, e.g. 7500000000 (7 500 USDC)
///   SEED_USDC_ARCX     — USDC amount to seed ARCx pool, e.g. 2500000000 (2 500 USDC)
///
/// Optional — skip pool seeding when set to "true":
///   SKIP_SEED          — set to "true" to deploy contracts only, seed later
///
/// Run (Arc Testnet):
///   forge script contracts/script/Deploy.s.sol \
///     --rpc-url arc_testnet \
///     --broadcast \
///     --slow \
///     -vvvv
contract Deploy is Script {
    // ── Seed prices (8 decimals) — used only to size the seed liquidity ──
    uint256 constant TECHX_PRICE = 150_00000000; // $150.00
    uint256 constant ENERGYX_PRICE = 75_00000000; // $75.00
    uint256 constant ARCX_PRICE = 25_00000000; // $25.00

    uint8 constant TOKEN_DECIMALS = 18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address usdc = vm.envAddress("USDC_ADDRESS");
        bool skipSeed = vm.envOr("SKIP_SEED", false);

        console2.log("=== arcex spot deployment ===");
        console2.log("Deployer :", deployer);
        console2.log("USDC     :", usdc);
        console2.log("Skip seed:", skipSeed);
        console2.log("");

        vm.startBroadcast(deployerKey);

        // ── 1. TokenFactory ────────────────────────────────────────────────
        TokenFactory tokenFactory = new TokenFactory(deployer);
        console2.log("TokenFactory         :", address(tokenFactory));

        // ── 2. SpotPoolFactoryV2 ───────────────────────────────────────────
        SpotPoolFactoryV2 spotPool = new SpotPoolFactoryV2(usdc, deployer);
        console2.log("SpotPoolFactoryV2    :", address(spotPool));

        // ── 3. MockERC20 base tokens ───────────────────────────────────────
        MockERC20 techx = new MockERC20("TechX Index", "TECHx", TOKEN_DECIMALS, deployer);
        MockERC20 energyx = new MockERC20("Energy Index", "ENERGYx", TOKEN_DECIMALS, deployer);
        MockERC20 arcx = new MockERC20("Arc Token", "ARCx", TOKEN_DECIMALS, deployer);

        console2.log("TECHx  (MockERC20)   :", address(techx));
        console2.log("ENERGYx (MockERC20)  :", address(energyx));
        console2.log("ARCx   (MockERC20)   :", address(arcx));

        // ── 4. Register seed pairs (ids 0,1,2) ─────────────────────────────
        spotPool.registerSeedPairs(address(techx), address(energyx), address(arcx));
        console2.log("Seed pairs registered (0=TECHx, 1=ENERGYx, 2=ARCx).");

        // ── 5. Seed AMM pools with initial liquidity ───────────────────────
        if (!skipSeed) {
            _seedPools(deployer, usdc, spotPool, techx, energyx, arcx);
        } else {
            console2.log("Skipping pool seed (SKIP_SEED=true).");
        }

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────
        console2.log("");
        console2.log("=== Deployment complete ===");
        console2.log("Copy these into src/constants.ts:");
        console2.log("  tokenFactory:", address(tokenFactory));
        console2.log("  spotPool   :", address(spotPool));
        console2.log("  TECHx      :", address(techx));
        console2.log("  ENERGYx    :", address(energyx));
        console2.log("  ARCx       :", address(arcx));
    }

    /// @dev Mints base tokens, approves SpotPoolFactoryV2, and calls
    ///      addLiquidity for all three seed pairs.
    function _seedPools(
        address deployer,
        address usdc,
        SpotPoolFactoryV2 spotPool,
        MockERC20 techx,
        MockERC20 energyx,
        MockERC20 arcx
    ) internal {
        uint256 usdcTechx = vm.envOr("SEED_USDC_TECHX", uint256(15_000_000_000)); // 15 000 USDC
        uint256 usdcEnergyx = vm.envOr("SEED_USDC_ENERGYX", uint256(7_500_000_000)); //  7 500 USDC
        uint256 usdcArcx = vm.envOr("SEED_USDC_ARCX", uint256(2_500_000_000)); //  2 500 USDC

        // Base amounts derived from price ratios (price 8-dec, tokens 18-dec):
        //   baseLot = usdcAmt * 1e20 / price
        uint256 baseTechx = (usdcTechx * 1e20) / TECHX_PRICE;
        uint256 baseEnergyx = (usdcEnergyx * 1e20) / ENERGYX_PRICE;
        uint256 baseArcx = (usdcArcx * 1e20) / ARCX_PRICE;

        techx.mint(deployer, baseTechx);
        energyx.mint(deployer, baseEnergyx);
        arcx.mint(deployer, baseArcx);

        uint256 totalUsdc = usdcTechx + usdcEnergyx + usdcArcx;
        IERC20(usdc).approve(address(spotPool), totalUsdc);
        techx.approve(address(spotPool), baseTechx);
        energyx.approve(address(spotPool), baseEnergyx);
        arcx.approve(address(spotPool), baseArcx);

        spotPool.addLiquidity(0, usdcTechx, baseTechx, 0);
        spotPool.addLiquidity(1, usdcEnergyx, baseEnergyx, 0);
        spotPool.addLiquidity(2, usdcArcx, baseArcx, 0);

        console2.log("Pools seeded:");
        console2.log("  TECHx pool  : USDC=%s, TECHx=%s", usdcTechx, baseTechx);
        console2.log("  ENERGYx pool: USDC=%s, ENERGYx=%s", usdcEnergyx, baseEnergyx);
        console2.log("  ARCx pool   : USDC=%s, ARCx=%s", usdcArcx, baseArcx);
    }
}
