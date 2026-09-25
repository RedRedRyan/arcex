// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet only — prices are admin-controlled and not production-safe.
contract PriceOracle is Ownable {
    uint8 public constant PAIR_TECHX = 0;
    uint8 public constant PAIR_ENERGYx = 1;
    uint8 public constant PAIR_ARCx = 2;

    mapping(uint8 => uint256) public prices;
    mapping(uint8 => uint256) public updatedAt;

    error InvalidPairId(uint8 pairId);
    error PriceNotSet(uint8 pairId);
    error InvalidPrice();

    event PriceUpdated(uint8 indexed pairId, uint256 price, uint256 timestamp);

    constructor(address initialOwner) Ownable(initialOwner) {
        uint256 ts = block.timestamp;

        prices[PAIR_TECHX] = 150_00000000;
        prices[PAIR_ENERGYx] = 75_00000000;
        prices[PAIR_ARCx] = 25_00000000;

        updatedAt[PAIR_TECHX] = ts;
        updatedAt[PAIR_ENERGYx] = ts;
        updatedAt[PAIR_ARCx] = ts;
    }

    function setPrice(uint8 pairId, uint256 price) external onlyOwner {
        _validatePair(pairId);
        if (price == 0) revert InvalidPrice();

        prices[pairId] = price;
        updatedAt[pairId] = block.timestamp;

        emit PriceUpdated(pairId, price, block.timestamp);
    }

    function setPrices(uint8[] calldata pairIds, uint256[] calldata newPrices) external onlyOwner {
        uint256 length = pairIds.length;
        require(length == newPrices.length, "Length mismatch");

        for (uint256 i = 0; i < length; i++) {
            uint8 pairId = pairIds[i];
            uint256 price = newPrices[i];

            _validatePair(pairId);
            if (price == 0) revert InvalidPrice();

            prices[pairId] = price;
            updatedAt[pairId] = block.timestamp;

            emit PriceUpdated(pairId, price, block.timestamp);
        }
    }

    function getPrice(uint8 pairId) external view returns (uint256 price, uint256 timestamp) {
        _validatePair(pairId);
        price = prices[pairId];
        if (price == 0) revert PriceNotSet(pairId);

        return (price, updatedAt[pairId]);
    }

    function getMarkPrice(uint8 pairId) external view returns (uint256) {
        _validatePair(pairId);
        uint256 price = prices[pairId];
        if (price == 0) revert PriceNotSet(pairId);
        return price;
    }

    function _validatePair(uint8 pairId) internal pure {
        if (pairId > PAIR_ARCx) revert InvalidPairId(pairId);
    }
}
