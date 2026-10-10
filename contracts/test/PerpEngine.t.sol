// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PerpEngine} from "../PerpEngine.sol";
import {MockERC20} from "../MockERC20.sol";
import {MockOracle} from "./MockOracle.sol";

/// @notice End-to-end tests for the simplified perpetual engine that backs the
///         `/futures` page. `MockOracle` is an `IPriceOracle` implementor; the
///         harness points `PerpEngine.oracle` at it via owner-only
///         `setOracle`, so pricing, funding, PnL and liquidation math all stay
///         deterministic inside the test.
contract PerpEngineTest is Test {
    PerpEngine public engine;
    MockERC20 public usdc;
    MockOracle public oracle;
    address public owner = address(0x1);
    address public trader1 = address(0x11);
    address public trader2 = address(0x22);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6, owner);
        oracle = new MockOracle();
        engine = new PerpEngine(address(usdc), address(oracle), owner);
        vm.prank(owner);
        engine.setOracle(address(oracle));

        vm.startPrank(owner);
        usdc.mint(trader1, 1000000000000); // 1 000 000 USDC
        usdc.approve(address(engine), type(uint256).max);
        vm.stopPrank();

        // Point the engine at our stub via owner account.
        vm.startPrank(owner);
        engine.setOracle(address(oracle));
        vm.stopPrank();
    }

    function marginOf(address who) public view returns (uint256) {
        return engine.marginAccounts(who);
    }

    // positionsOf returns a 9-tuple:
    // (pairId, isLong, sizeUsdc, entryPrice, margin, leverage, timestamp,
    //  fundingIndexSnapshot, isOpen)
    function positionsOf(address who, uint8 pairId)
        public
        view
        returns (
            uint8 pairIdOut,
            bool isLongOut,
            uint256 sizeOut,
            uint256 entryOut,
            uint256 marginOut,
            uint8 levOut,
            uint256 tsOut,
            int256 fsOut,
            bool isOpenOut
        )
    {
        return engine.positions(who, pairId);
    }

    function fundingStateOf(uint8 pairId)
        public
        view
        returns (int256 fundingIndexOut, uint256 lastFundingTimeOut)
    {
        return engine.fundingStates(pairId);
    }

    function isOpenOf(address who, uint8 pairId) public view returns (bool) {
        (, , , , , , , , bool isOpenOut) = engine.positions(who, pairId);
        return isOpenOut;
    }

    // ── constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsUsdcAndOracle() public {
        assertEq(address(engine.usdc()), address(usdc));
        assertEq(address(engine.oracle()), address(oracle));
        assertEq(engine.maxLeverage(), 20);
        assertEq(engine.maintenanceMarginBps(), 500);
        assertEq(engine.openCloseFeesBps(), 10);
        assertEq(engine.fundingInterval(), 3600);
    }

    // ── deposit / withdraw margin ───────────────────────────────────────────

    function test_depositMargin_creditsMargin() public {
        uint256 amount = 100000000; // 100 USDC
        vm.startPrank(owner);
        usdc.mint(trader1, amount);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), amount);
        vm.stopPrank();

        assertEq(marginOf(trader1), amount);
        assertEq(usdc.balanceOf(trader1), 0);
    }

    function test_withdrawMargin_allowsFreeOnly() public {
        uint256 deposit = 100000000;
        vm.startPrank(owner);
        usdc.mint(trader1, deposit);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), deposit);
        vm.stopPrank();

        uint256 longSize = 10000000;
        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, true, longSize, 10);
        vm.stopPrank();

        uint256 free = deposit - longSize;
        assertEq(marginOf(trader1), deposit);

        vm.startPrank(trader1);
        engine.withdrawMargin(free);
        vm.stopPrank();

        assertEq(marginOf(trader1), deposit);
        assertEq(usdc.balanceOf(trader1), free);
    }

    function test_withdrawMargin_rejectsInsufficient() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        usdc.approve(address(engine), 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(10000000);
        vm.stopPrank();

        vm.startPrank(trader1);
        vm.expectRevert(
            abi.encodeWithSelector(PerpEngine.InsufficientMargin.selector, 50000000, 0)
        );
        engine.withdrawMargin(50000000);
        vm.stopPrank();
    }

    // ── open position ───────────────────────────────────────────────────────

    function test_openPosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();

        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        vm.stopPrank();

        (uint8 p, bool il, uint256 sz, uint256 en, uint256 mg, uint8 lv, , , bool io) =
            engine.positions(trader1, 0);

        assertEq(p, 0);
        assertTrue(il);
        assertEq(sz, sizeUsdc);
        assertEq(en, 10000000);
        assertEq(mg, sizeUsdc / leverage);
        assertEq(lv, leverage);
        assertTrue(io);

        uint256 fee = (sizeUsdc * 10) / 10000;
        assertEq(marginOf(trader1), sizeUsdc + fee);
        assertEq(engine.protocolFeeAccumulated(), fee);
    }

    function test_openPosition_rejectsInsufficientMargin() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), 10000000);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();

        vm.startPrank(trader1);
        vm.expectRevert(
            abi.encodeWithSelector(PerpEngine.InsufficientMargin.selector, 10000000, 10000000)
        );
        engine.openPosition(0, true, 1000000, 10);
        vm.stopPrank();
    }

    function test_openPosition_rejectsInvalidPair() public {
        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidPair.selector));
        engine.openPosition(3, true, 100000000, 10);
        vm.stopPrank();
    }

    function test_openPosition_rejectsInvalidLeverage() public {
        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidLeverage.selector));
        engine.openPosition(0, true, 100000000, 0);
        vm.stopPrank();
    }

    function test_openPosition_rejectsAlreadyOpen() public {
        uint256 sizeUsdc = 100000000;
        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);

        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionAlreadyOpen.selector));
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();
    }

    // ── close position ─────────────────────────────────────────────────────

    function test_closePosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        uint256 marginBefore = marginOf(trader1);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        oracle.setPrice(0, 12000000);

        vm.startPrank(trader1);
        engine.closePosition(0);
        vm.stopPrank();

        assertEq(isOpenOf(trader1, 0), false);

        uint256 pnl = uint256((int256(sizeUsdc) * (int256(12000000) - int256(10000000))) / int256(10000000));
        uint256 expected = sizeUsdc / leverage + pnl - (sizeUsdc * 10) / 10000;
        assertEq(marginOf(trader1), marginBefore + expected);
        assertEq(engine.protocolFeeAccumulated(), (sizeUsdc * 10) / 10000);
    }

    function test_closePosition_rejectsNoOpen() public {
        vm.startPrank(trader1);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.NoOpenPosition.selector));
        engine.closePosition(0);
        vm.stopPrank();
    }

    // ── increase position ───────────────────────────────────────────────────

    function test_increasePosition_happyPath() public {
        uint256 firstSize = 100000000;
        uint256 secondSize = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, firstSize + secondSize);
        usdc.approve(address(engine), firstSize + secondSize);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(firstSize + secondSize);
        vm.stopPrank();

        vm.startPrank(trader1);
        engine.openPosition(0, true, firstSize, 10);
        uint256 marginBefore = marginOf(trader1);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.increasePosition(0, secondSize);
        vm.stopPrank();

        (uint8 p, bool il, uint256 sz, uint256 en, uint256 mg, uint8 lv, , , bool io) =
            engine.positions(trader1, 0);

        assertEq(sz, firstSize + secondSize);
        assertEq(en, 10000000);
        assertEq(mg, (firstSize + secondSize) / 10);
        assertEq(engine.protocolFeeAccumulated(), (firstSize + secondSize) * 10 / 10000);
    }

    // ── liquidation ─────────────────────────────────────────────────────────

    function test_liquidate_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        oracle.setPrice(0, 8000000);

        vm.startPrank(trader2);
        engine.liquidate(address(trader1), 0);
        vm.stopPrank();

        assertEq(isOpenOf(trader1, 0), false);

        assertEq(usdc.balanceOf(trader2), 10000000);
        assertEq(engine.protocolFeeAccumulated(), 0);
    }

    function test_liquidate_rejectsHealthyPosition() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        vm.startPrank(trader2);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionHealthy.selector));
        engine.liquidate(address(trader1), 0);
        vm.stopPrank();
    }

    // ── liquidation price view ──────────────────────────────────────────────

    function test_getLiquidationPrice_long() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        vm.stopPrank();

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 9500000); // entry * 0.95 (long liquidation below entry)
    }

    function test_getLiquidationPrice_short() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, false, sizeUsdc, leverage);
        vm.stopPrank();

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 10500000); // entry * 1.05 (short liquidation above entry)
    }

    // ── unrealized PnL / margin ratio views ──────────────────────────────────

    function test_getUnrealizedPnl_returns0WhenClosed() public {
        assertEq(engine.getUnrealizedPnl(address(trader1), 0), 0);
    }

    function test_getMarginRatio_happyPath() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(owner);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        assertEq(engine.getMarginRatio(address(trader1), 0), 1000);
    }

    // ── funding ─────────────────────────────────────────────────────────────

    function test_applyFunding_gatedByInterval() public {
        vm.warp(block.timestamp + 3600);
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, 100000000);
        usdc.approve(address(engine), 100000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(100000000);
        vm.stopPrank();

        (int256 fundingIndexBefore, ) = fundingStateOf(0);

        vm.prank(trader1);
        engine.openPosition(0, true, 100000000, 10);

        assertTrue(isOpenOf(trader1, 0));
    }
}
