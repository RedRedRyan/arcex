// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPriceOracle} from "../PerpEngine.sol";

/// @notice Deterministic oracle stub for testing.
///
/// `PerpEngine` keeps `address oracle` and calls `IPriceOracle(oracle).getMarkPrice(pairId)`.
/// The test sets `engine.setOracle(address(this))` (owner-only in PerpEngine,
/// and the test harness is the deployer = owner) so every pricing, funding,
/// PnL, liquidation and margin-ratio read routes through `setPrice`.
///
/// This mirrors the production setup: `PerpEngine` -> `PriceOracle.getMarkPrice()`,
/// except here we control the price inside the test instead of reading the
/// ONCHAIN `PriceOracle` (which the frontend's `useOracleFeed` reads).
contract MockOracle is IPriceOracle {
    uint256 public price0;
    uint256 public price1;
    uint256 public price2;

    function setPrice(uint8 pairId, uint256 price) external {
        require(pairId <= 2, "InvalidPair");
        require(price > 0, "InvalidPrice");
        if (pairId == 0) price0 = price;
        else if (pairId == 1) price1 = price;
        else price2 = price;
    }

    function getMarkPrice(uint8 pairId) external view override returns (uint256) {
        if (pairId == 0) return price0;
        if (pairId == 1) return price1;
        return price2;
    }
}
