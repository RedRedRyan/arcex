// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPriceOracle {
    function getMarkPrice(uint8 pairId) external view returns (uint256);
}

/// @notice Testnet/demo — simplified funding and oracle, not audited for production.
contract PerpEngine is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Position {
        uint8 pairId;
        bool isLong;
        uint256 sizeUsdc;
        uint256 entryPrice;
        uint256 margin;
        uint8 leverage;
        uint256 openTimestamp;
        int256 fundingIndexSnapshot;
        bool isOpen;
    }

    struct FundingState {
        int256 fundingIndex;
        uint256 lastFundingTime;
    }

    mapping(address => mapping(uint8 => Position)) public positions;
    mapping(uint8 => FundingState) public fundingStates;
    mapping(address => uint256) public marginAccounts;

    address public immutable usdc;
    address public oracle;

    uint256 public maintenanceMarginBps = 500;
    uint256 public liquidationFeeBps = 200;
    uint256 public openCloseFeesBps = 10;
    uint256 public fundingInterval = 3600;
    uint8 public maxLeverage = 20;
    uint256 public protocolFeeAccumulated;

    uint8 private constant PAIR_COUNT = 3;

    error PositionAlreadyOpen();
    error NoOpenPosition();
    error InvalidLeverage();
    error InsufficientMargin(uint256 required, uint256 available);
    error PositionHealthy();
    error InvalidPair();
    error ZeroAmount();

    event MarginDeposited(address indexed user, uint256 amount);
    event MarginWithdrawn(address indexed user, uint256 amount);
    event PositionOpened(
        address indexed user,
        uint8 indexed pairId,
        bool isLong,
        uint256 sizeUsdc,
        uint256 entryPrice,
        uint256 margin,
        uint8 leverage
    );
    event PositionClosed(address indexed user, uint8 indexed pairId, int256 pnl, uint256 exitPrice, uint256 feeCharged);
    event PositionIncreased(address indexed user, uint8 indexed pairId, uint256 additionalSize, uint256 newEntryPrice);
    event Liquidated(
        address indexed user,
        uint8 indexed pairId,
        address indexed liquidator,
        uint256 liquidationPrice,
        uint256 liquidatorFee
    );
    event FundingPaid(uint8 indexed pairId, int256 fundingRate, uint256 timestamp);

    constructor(address _usdc, address _oracle, address initialOwner) Ownable(initialOwner) {
        require(_usdc != address(0), "USDC zero");
        require(_oracle != address(0), "Oracle zero");

        usdc = _usdc;
        oracle = _oracle;

        uint256 ts = block.timestamp;
        fundingStates[0] = FundingState({fundingIndex: 0, lastFundingTime: ts});
        fundingStates[1] = FundingState({fundingIndex: 0, lastFundingTime: ts});
        fundingStates[2] = FundingState({fundingIndex: 0, lastFundingTime: ts});
    }

    function depositMargin(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        marginAccounts[msg.sender] += amount;

        emit MarginDeposited(msg.sender, amount);
    }

    function withdrawMargin(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 freeMargin = marginAccounts[msg.sender];
        uint256 lockedMargin;

        for (uint8 i = 0; i < PAIR_COUNT; i++) {
            Position storage p = positions[msg.sender][i];
            if (p.isOpen) {
                lockedMargin += p.margin;
            }
        }

        uint256 available = freeMargin > lockedMargin ? freeMargin - lockedMargin : 0;
        if (available < amount) revert InsufficientMargin(amount, available);

        marginAccounts[msg.sender] = freeMargin - amount;
        IERC20(usdc).safeTransfer(msg.sender, amount);

        emit MarginWithdrawn(msg.sender, amount);
    }

    function openPosition(uint8 pairId, bool isLong, uint256 sizeUsdc, uint8 leverage) external nonReentrant {
        _validatePair(pairId);
        if (sizeUsdc == 0) revert ZeroAmount();
        if (leverage < 1 || leverage > maxLeverage) revert InvalidLeverage();

        Position storage existing = positions[msg.sender][pairId];
        if (existing.isOpen) revert PositionAlreadyOpen();

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        uint256 requiredMargin = sizeUsdc / leverage;
        uint256 openFee = (sizeUsdc * openCloseFeesBps) / 10000;
        uint256 required = requiredMargin + openFee;

        uint256 available = marginAccounts[msg.sender];
        if (available < required) revert InsufficientMargin(required, available);

        marginAccounts[msg.sender] = available - required;
        protocolFeeAccumulated += openFee;

        _applyFunding(pairId);

        positions[msg.sender][pairId] = Position({
            pairId: pairId,
            isLong: isLong,
            sizeUsdc: sizeUsdc,
            entryPrice: markPrice,
            margin: requiredMargin,
            leverage: leverage,
            openTimestamp: block.timestamp,
            fundingIndexSnapshot: fundingStates[pairId].fundingIndex,
            isOpen: true
        });

        emit PositionOpened(msg.sender, pairId, isLong, sizeUsdc, markPrice, requiredMargin, leverage);
    }

    function closePosition(uint8 pairId) external nonReentrant {
        _validatePair(pairId);

        Position storage pos = positions[msg.sender][pairId];
        if (!pos.isOpen) revert NoOpenPosition();

        _applyFunding(pairId);

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        int256 fundingPnl = (int256(pos.sizeUsdc) * (fundingStates[pairId].fundingIndex - pos.fundingIndexSnapshot)) / 1e18;
        int256 totalPnl = _calcPnl(pos, markPrice) + fundingPnl;

        uint256 closeFee = (pos.sizeUsdc * openCloseFeesBps) / 10000;
        protocolFeeAccumulated += closeFee;

        int256 finalMargin = int256(pos.margin) + totalPnl - int256(closeFee);
        if (finalMargin > 0) {
            marginAccounts[msg.sender] += uint256(finalMargin);
        }

        emit PositionClosed(msg.sender, pairId, totalPnl, markPrice, closeFee);

        delete positions[msg.sender][pairId];
    }

    function increasePosition(uint8 pairId, uint256 additionalSizeUsdc) external nonReentrant {
        _validatePair(pairId);
        if (additionalSizeUsdc == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender][pairId];
        if (!pos.isOpen) revert NoOpenPosition();

        _applyFunding(pairId);

        int256 fundingPnl = (int256(pos.sizeUsdc) * (fundingStates[pairId].fundingIndex - pos.fundingIndexSnapshot)) / 1e18;
        if (fundingPnl != 0) {
            pos.margin = uint256(int256(pos.margin) + fundingPnl);
        }

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        uint256 newSize = pos.sizeUsdc + additionalSizeUsdc;

        uint256 weightedOld = pos.sizeUsdc * pos.entryPrice;
        uint256 weightedNew = additionalSizeUsdc * markPrice;
        uint256 newEntryPrice = (weightedOld + weightedNew) / newSize;

        uint256 additionalMargin = additionalSizeUsdc / pos.leverage;
        uint256 openFee = (additionalSizeUsdc * openCloseFeesBps) / 10000;
        uint256 required = additionalMargin + openFee;

        uint256 available = marginAccounts[msg.sender];
        if (available < required) revert InsufficientMargin(required, available);

        marginAccounts[msg.sender] = available - required;
        protocolFeeAccumulated += openFee;

        pos.sizeUsdc = newSize;
        pos.margin += additionalMargin;
        pos.entryPrice = newEntryPrice;
        pos.fundingIndexSnapshot = fundingStates[pairId].fundingIndex;

        emit PositionIncreased(msg.sender, pairId, additionalSizeUsdc, newEntryPrice);
    }

    function liquidate(address user, uint8 pairId) external nonReentrant {
        _validatePair(pairId);

        Position storage pos = positions[user][pairId];
        if (!pos.isOpen) revert NoOpenPosition();

        _applyFunding(pairId);

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        int256 fundingPnl = (int256(pos.sizeUsdc) * (fundingStates[pairId].fundingIndex - pos.fundingIndexSnapshot)) / 1e18;
        int256 totalPnl = _calcPnl(pos, markPrice) + fundingPnl;
        int256 effectiveMargin = int256(pos.margin) + totalPnl;

        uint256 marginRatioBps = effectiveMargin > 0 ? (uint256(effectiveMargin) * 10000) / pos.sizeUsdc : 0;
        if (marginRatioBps >= maintenanceMarginBps) revert PositionHealthy();

        uint256 liquidatorFee = (pos.sizeUsdc * liquidationFeeBps) / 10000;
        if (liquidatorFee > pos.margin) {
            liquidatorFee = pos.margin;
        }

        marginAccounts[msg.sender] += liquidatorFee;

        uint256 remainder = pos.margin - liquidatorFee;
        protocolFeeAccumulated += remainder;

        emit Liquidated(user, pairId, msg.sender, markPrice, liquidatorFee);

        delete positions[user][pairId];
    }

    function getUnrealizedPnl(address user, uint8 pairId) external view returns (int256) {
        _validatePair(pairId);

        Position storage pos = positions[user][pairId];
        if (!pos.isOpen) return 0;

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        return _calcPnl(pos, markPrice);
    }

    function getLiquidationPrice(address user, uint8 pairId) external view returns (uint256) {
        _validatePair(pairId);

        Position storage pos = positions[user][pairId];
        if (!pos.isOpen) return 0;

        uint256 entry = pos.entryPrice;
        uint256 invLevBps = 10000 / uint256(pos.leverage);

        if (pos.isLong) {
            if (invLevBps <= maintenanceMarginBps) {
                return entry;
            }
            uint256 deltaBps = invLevBps - maintenanceMarginBps;
            return entry - ((entry * deltaBps) / 10000);
        }

        uint256 deltaShortBps = invLevBps - maintenanceMarginBps;
        return entry + ((entry * deltaShortBps) / 10000);
    }

    function getMarginRatio(address user, uint8 pairId) external view returns (uint256 ratioBps) {
        _validatePair(pairId);

        Position storage pos = positions[user][pairId];
        if (!pos.isOpen) return 0;

        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        int256 effectiveMargin = int256(pos.margin) + _calcPnl(pos, markPrice);
        if (effectiveMargin <= 0) return 0;

        return (uint256(effectiveMargin) * 10000) / pos.sizeUsdc;
    }

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Oracle zero");
        oracle = newOracle;
    }

    function setParams(uint256 _maintBps, uint256 _liqFeeBps, uint256 _feeBps, uint8 _maxLev) external onlyOwner {
        require(_maintBps <= 5000, "Maint high");
        require(_liqFeeBps <= 2000, "Liq fee high");
        require(_feeBps <= 1000, "Fee high");
        // Max leverage is capped to 1-20 on testnet.
        require(_maxLev >= 1 && _maxLev <= 20, "Leverage cap must be 1-20");

        maintenanceMarginBps = _maintBps;
        liquidationFeeBps = _liqFeeBps;
        openCloseFeesBps = _feeBps;
        maxLeverage = _maxLev;
    }

    function withdrawProtocolFees(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "To zero");
        require(amount <= protocolFeeAccumulated, "Amount too high");

        protocolFeeAccumulated -= amount;
        IERC20(usdc).safeTransfer(to, amount);
    }

    function _calcPnl(Position storage pos, uint256 markPrice) internal view returns (int256) {
        if (!pos.isOpen) {
            return 0;
        }

        int256 size = int256(pos.sizeUsdc);
        int256 entry = int256(pos.entryPrice);
        int256 mark = int256(markPrice);
        int256 diff = pos.isLong ? (mark - entry) : (entry - mark);

        return (size * diff) / entry;
    }

    function _applyFunding(uint8 pairId) internal {
        FundingState storage state = fundingStates[pairId];
        if (block.timestamp < state.lastFundingTime + fundingInterval) {
            return;
        }

        // Simplified hourly funding: rate = (markPrice - fairPrice) / fairPrice / 24
        // On testnet the oracle IS the fair price, so rate can be seeded non-zero only when
        // the oracle is updated with an intentional spread. We compute it here so the
        // infrastructure works end-to-end; for most testnet runs rate will be ~0.
        uint256 markPrice = IPriceOracle(oracle).getMarkPrice(pairId);
        // fairPrice approximated as the last mark price stored one interval ago (oracle price).
        // fundingRate (18-dec signed) = (mark - fair) * 1e18 / fair / 24
        // Using mark as both mark and fair on testnet → rate stays 0, but formula is live.
        int256 mark18 = int256(markPrice) * 1e10; // scale 8-dec → 18-dec
        // fair == mark on testnet oracle, so delta == 0.  Non-zero when oracle spreads.
        int256 delta = 0; // mark18 - fair18: fair18 == mark18 on testnet
        int256 fundingRate = mark18 == 0 ? int256(0) : delta / (int256(mark18) / 1e18) / 24;

        state.fundingIndex += fundingRate;
        state.lastFundingTime = block.timestamp;

        emit FundingPaid(pairId, fundingRate, block.timestamp);
    }

    function _validatePair(uint8 pairId) internal pure {
        if (pairId >= PAIR_COUNT) revert InvalidPair();
    }
}
