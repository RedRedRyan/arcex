// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PriceOracle} from "../PriceOracle.sol";

/// @title UpdatePrices — push new oracle prices for all three pairs
/// @notice Owner-only. Use to simulate price moves on testnet.
///
/// Required env vars:
///   ARC_PRIVATE_KEY        — owner private key
///   PRICE_ORACLE_ADDRESS   — deployed PriceOracle address
///   PRICE_TECHX            — new TECHx price  (8 decimals, e.g. 155_00000000 = $155)
///   PRICE_ENERGYX          — new ENERGYx price (8 decimals, e.g. 72_00000000 = $72)
///   PRICE_ARCX             — new ARCx price    (8 decimals, e.g. 28_00000000 = $28)
///
/// Run:
///   forge script contracts/script/UpdatePrices.s.sol \
///     --rpc-url arc_testnet --broadcast -vvvv
contract UpdatePrices is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("ARC_PRIVATE_KEY");
        PriceOracle oracle = PriceOracle(vm.envAddress("PRICE_ORACLE_ADDRESS"));

        uint256 priceTechx = vm.envUint("PRICE_TECHX");
        uint256 priceEnergyx = vm.envUint("PRICE_ENERGYX");
        uint256 priceArcx = vm.envUint("PRICE_ARCX");

        console2.log("Updating oracle prices:");
        console2.log("  TECHx  :", priceTechx);
        console2.log("  ENERGYx:", priceEnergyx);
        console2.log("  ARCx   :", priceArcx);

        uint8[] memory ids = new uint8[](3);
        ids[0] = 0;
        ids[1] = 1;
        ids[2] = 2;

        uint256[] memory prices = new uint256[](3);
        prices[0] = priceTechx;
        prices[1] = priceEnergyx;
        prices[2] = priceArcx;

        vm.startBroadcast(deployerKey);
        oracle.setPrices(ids, prices);
        vm.stopBroadcast();

        console2.log("Prices updated.");
    }
}
