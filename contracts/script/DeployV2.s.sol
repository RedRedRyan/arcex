// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry} from "../MarketRegistry.sol";
import {ArcexTimelock} from "../ArcexTimelock.sol";

/**
 * @title  DeployV2 — Phase 0 (Testnet)
 * @notice Deploys ArcexTimelock + MarketRegistry to Arc Testnet.
 *
 * Required env vars (see env.example):
 *   ARC_PRIVATE_KEY        — deployer key (0x-prefixed); must hold USDC for gas
 *   ARC_TESTNET_RPC        — https://rpc.testnet.arc.io
 *   ADMIN_ADDRESS          — multisig / Timelock admin (never an EOA default)
 *   TIMELOCK_DELAY_SECONDS — delay in seconds (min 3600; use 86400 for 24h)
 *
 * Run (testnet):
 *   forge script contracts/script/DeployV2.s.sol \
 *     --rpc-url arc_testnet \
 *     --broadcast \
 *     --slow \
 *     -vvvv
 */
contract DeployV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("ARC_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint256 timelockDelay = vm.envOr("TIMELOCK_DELAY_SECONDS", uint256(86400)); // 24h default

        require(admin != address(0), "DeployV2: ADMIN_ADDRESS must be set");
        require(timelockDelay >= 3600, "DeployV2: TIMELOCK_DELAY_SECONDS must be >= 3600");

        console2.log("=== arcex Phase 0 Testnet Deploy ===");
        console2.log("Deployer :", deployer);
        console2.log("Admin    :", admin);
        console2.log("Timelock delay (s):", timelockDelay);

        vm.startBroadcast(deployerKey);

        // ── 1. Timelock ───────────────────────────────────────────────────────
        address[] memory proposers = new address[](1);
        proposers[0] = admin;

        // address(0) executor = open execution (anyone can execute once delay passes)
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        // Pass address(0) as admin_ to immediately renounce DEFAULT_ADMIN_ROLE
        // — no EOA can bypass the delay after deployment.
        ArcexTimelock timelock = new ArcexTimelock(
            timelockDelay,
            proposers,
            executors,
            address(0) // renounce admin role immediately
        );
        console2.log("ArcexTimelock :", address(timelock));

        // ── 2. MarketRegistry ─────────────────────────────────────────────────
        // Admin role goes to the timelock so every config change has a delay.
        // Pauser role goes to the admin multisig directly for fast emergency stops.
        MarketRegistry registry = new MarketRegistry(address(timelock), admin);
        console2.log("MarketRegistry:", address(registry));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Phase 0 deploy complete ===");
        console2.log("Update packages/shared/src/addresses.ts:");
        console2.log("  timelock       :", address(timelock));
        console2.log("  marketRegistry :", address(registry));
    }
}
