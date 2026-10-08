// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarketRegistry}  from "../MarketRegistry.sol";
import {ArcexTimelock}   from "../ArcexTimelock.sol";

/**
 * @title  DeployMainnet — Phase 0 (Arc Mainnet)
 * @notice Deploys ArcexTimelock + MarketRegistry to Arc Mainnet.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MAINNET SAFETY GATES — ALL MUST PASS OR SCRIPT REVERTS                ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  1. MAINNET_CONFIRM=yes must be set in env (explicit opt-in).           ║
 * ║  2. ADMIN_ADDRESS must be set and must NOT be the deployer key wallet   ║
 * ║     (admin must be a multisig, not the hot deployer key).               ║
 * ║  3. TIMELOCK_DELAY_SECONDS >= 86400 (24 hours minimum on mainnet).      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Required env vars (see env.example):
 *   ARC_PRIVATE_KEY          — deployer key; only mints gas / signs txns — NOT admin
 *   ARC_MAINNET_RPC          — https://rpc.mainnet.arc.io
 *   ADMIN_ADDRESS            — multisig address (e.g. Safe) that will own the Timelock
 *   TIMELOCK_DELAY_SECONDS   — >= 86400
 *   MAINNET_CONFIRM          — must be exactly "yes"
 *
 * Run:
 *   forge script contracts/script/DeployMainnet.s.sol \
 *     --rpc-url arc_mainnet \
 *     --broadcast \
 *     --slow \
 *     -vvvv
 */
contract DeployMainnet is Script {
    uint256 constant MAINNET_MINIMUM_DELAY = 86400; // 24 hours

    function run() external {
        // ── Safety gate 1: explicit mainnet confirmation ──────────────────────
        string memory confirm = vm.envOr("MAINNET_CONFIRM", string(""));
        require(
            keccak256(bytes(confirm)) == keccak256(bytes("yes")),
            "DeployMainnet: set MAINNET_CONFIRM=yes to proceed"
        );

        uint256 deployerKey = vm.envUint("ARC_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address admin       = vm.envAddress("ADMIN_ADDRESS");
        uint256 timelockDelay = vm.envUint("TIMELOCK_DELAY_SECONDS");

        // ── Safety gate 2: admin must not be the deployer EOA ─────────────────
        require(admin != address(0), "DeployMainnet: ADMIN_ADDRESS must be set");
        require(
            admin != deployer,
            "DeployMainnet: ADMIN_ADDRESS must differ from deployer (use multisig)"
        );

        // ── Safety gate 3: minimum 24h delay on mainnet ───────────────────────
        require(
            timelockDelay >= MAINNET_MINIMUM_DELAY,
            "DeployMainnet: TIMELOCK_DELAY_SECONDS must be >= 86400 (24h)"
        );

        console2.log("=== arcex Phase 0 MAINNET Deploy ===");
        console2.log("Deployer :", deployer);
        console2.log("Admin    :", admin);
        console2.log("Timelock delay (s):", timelockDelay);

        vm.startBroadcast(deployerKey);

        // ── 1. Timelock ───────────────────────────────────────────────────────
        address[] memory proposers = new address[](1);
        proposers[0] = admin;

        address[] memory executors = new address[](1);
        executors[0] = address(0); // open execution after delay

        ArcexTimelock timelock = new ArcexTimelock(
            timelockDelay,
            proposers,
            executors,
            address(0)  // renounce DEFAULT_ADMIN_ROLE immediately
        );
        console2.log("ArcexTimelock :", address(timelock));

        // ── 2. MarketRegistry ─────────────────────────────────────────────────
        MarketRegistry registry = new MarketRegistry(address(timelock), admin);
        console2.log("MarketRegistry:", address(registry));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== MAINNET Phase 0 deploy complete ===");
        console2.log("IMPORTANT: Update packages/shared/src/addresses.ts with:");
        console2.log("  [5042].timelock       :", address(timelock));
        console2.log("  [5042].marketRegistry :", address(registry));
        console2.log("IMPORTANT: Verify contracts on explorer.arc.io");
        console2.log("  forge verify-contract <addr> contracts/ArcexTimelock.sol:ArcexTimelock \\");
        console2.log("    --rpc-url arc_mainnet --verifier blockscout \\");
        console2.log("    --verifier-url https://explorer.arc.io/api");
    }
}
