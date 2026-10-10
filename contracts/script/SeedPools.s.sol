// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SpotPoolFactory} from "../SpotPoolFactory.sol";
import {MockERC20} from "../MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SeedPools — seed AMM liquidity for already-deployed contracts
/// @notice Use this when you want to seed pools without re-deploying.
///
/// Required env vars:
///   ARC_PRIVATE_KEY        — owner private key
///   SPOT_POOL_ADDRESS      — deployed SpotPoolFactory address
///   TECHX_ADDRESS          — deployed TECHx MockERC20
///   ENERGYX_ADDRESS        — deployed ENERGYx MockERC20
///   ARCX_ADDRESS           — deployed ARCx MockERC20
///   USDC_ADDRESS           — USDC ERC-20 on Arc Testnet
///
/// Optional (with defaults):
///   SEED_USDC_TECHX        — USDC to seed TECHx pool  (default 150e6)
///   SEED_USDC_ENERGYX      — USDC to seed ENERGYx pool (default 75e6)
///   SEED_USDC_ARCX         — USDC to seed ARCx pool    (default 25e6)
///
/// Run:
///   forge script contracts/script/SeedPools.s.sol \
///     --rpc-url arc_testnet --broadcast --slow -vvvv
contract SeedPools is Script {
    uint256 constant TECHX_PRICE = 150_00000000;
    uint256 constant ENERGYX_PRICE = 75_00000000;
    uint256 constant ARCX_PRICE = 25_00000000;

    function run() external {
        uint256 deployerKey = vm.envUint("ARC_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        SpotPoolFactory spotPool = SpotPoolFactory(vm.envAddress("SPOT_POOL_ADDRESS"));
        MockERC20 techx = MockERC20(vm.envAddress("TECHX_ADDRESS"));
        MockERC20 energyx = MockERC20(vm.envAddress("ENERGYX_ADDRESS"));
        MockERC20 arcx = MockERC20(vm.envAddress("ARCX_ADDRESS"));
        address usdc = vm.envAddress("USDC_ADDRESS");

        uint256 usdcTechx = vm.envOr("SEED_USDC_TECHX", uint256(150_000_000));
        uint256 usdcEnergyx = vm.envOr("SEED_USDC_ENERGYX", uint256(75_000_000));
        uint256 usdcArcx = vm.envOr("SEED_USDC_ARCX", uint256(25_000_000));

        uint256 baseTechx = (usdcTechx * 1e20) / TECHX_PRICE;
        uint256 baseEnergyx = (usdcEnergyx * 1e20) / ENERGYX_PRICE;
        uint256 baseArcx = (usdcArcx * 1e20) / ARCX_PRICE;

        console2.log("Seeding pools from:", deployer);
        console2.log("SpotPoolFactory    :", address(spotPool));

        vm.startBroadcast(deployerKey);

        techx.mint(deployer, baseTechx);
        energyx.mint(deployer, baseEnergyx);
        arcx.mint(deployer, baseArcx);

        IERC20(usdc).approve(address(spotPool), usdcTechx + usdcEnergyx + usdcArcx);
        techx.approve(address(spotPool), baseTechx);
        energyx.approve(address(spotPool), baseEnergyx);
        arcx.approve(address(spotPool), baseArcx);

        spotPool.addLiquidity(0, usdcTechx, baseTechx, 0);
        spotPool.addLiquidity(1, usdcEnergyx, baseEnergyx, 0);
        spotPool.addLiquidity(2, usdcArcx, baseArcx, 0);

        vm.stopBroadcast();

        console2.log("Done. Pools seeded:");
        console2.log("  TECHx  : %s USDC, %s TECHx", usdcTechx, baseTechx);
        console2.log("  ENERGYx: %s USDC, %s ENERGYx", usdcEnergyx, baseEnergyx);
        console2.log("  ARCx   : %s USDC, %s ARCx", usdcArcx, baseArcx);
    }
}
