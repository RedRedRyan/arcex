// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SpotPoolFactoryV2} from "../SpotPoolFactoryV2.sol";
import {MockERC20} from "../MockERC20.sol";

/// @notice Tests for the dynamic-pair AMM: pool creation (seed registration
///         plus open `createPair`), append-only pair ids, and parity with
///         the V1 swap math (0.3% fee, constant-product invariant).
contract SpotPoolFactoryV2Test is Test {
    SpotPoolFactoryV2 public factory;
    MockERC20 public usdc;
    MockERC20 public baseA;
    MockERC20 public baseB;
    address public owner = address(0x1);
    address public trader1 = address(0x11);
    address public creator = address(0x33);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6, owner);
        baseA = new MockERC20("Token A", "TA", 18, owner);
        baseB = new MockERC20("Token B", "TB", 18, owner);

        factory = new SpotPoolFactoryV2(address(usdc), owner);

        vm.startPrank(owner);
        usdc.mint(trader1, 1_000_000e6);
        baseA.mint(trader1, 1_000_000e18);
        baseB.mint(trader1, 1_000_000e18);
        vm.stopPrank();

        vm.startPrank(trader1);
        usdc.approve(address(factory), type(uint256).max);
        baseA.approve(address(factory), type(uint256).max);
        baseB.approve(address(factory), type(uint256).max);
        vm.stopPrank();
    }

    // ── construction / pair creation ────────────────────────────────────────

    function test_constructor_setsUsdc() public {
        assertEq(address(factory.usdc()), address(usdc));
        assertEq(factory.FEE_BPS(), 30);
        assertEq(factory.pairCount(), 0);
    }

    function test_createPair_returnsSequentialIds() public {
        vm.prank(creator);
        uint8 id0 = factory.createPair(address(baseA));
        assertEq(id0, 0);

        vm.prank(creator);
        uint8 id1 = factory.createPair(address(baseB));
        assertEq(id1, 1);

        assertEq(factory.pairCount(), 2);

        (address bt0,,, bool active0) = factory.pools(0);
        assertEq(bt0, address(baseA));
        assertTrue(active0);

        (address bt1,,, bool active1) = factory.pools(1);
        assertEq(bt1, address(baseB));
        assertTrue(active1);
    }

    function test_createPair_emitsEvent() public {
        vm.expectEmit(true, true, true, false);
        emit SpotPoolFactoryV2.PairCreated(0, address(baseA), creator);
        vm.prank(creator);
        factory.createPair(address(baseA));
    }

    function test_createPair_isPermissionless() public {
        // No onlyOwner restriction: any address may register a pool.
        vm.prank(address(0xBEEF));
        uint8 id = factory.createPair(address(baseA));
        assertEq(id, 0);
        assertEq(factory.pairCount(), 1);
    }

    function test_createPair_rejectsZeroToken() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.createPair(address(0));
    }

    function test_createPair_rejectsUsdcAsBase() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.createPair(address(usdc));
    }

    function test_registerSeedPairs_preparesThreePools() public {
        MockERC20 techx = new MockERC20("TechX", "TECHx", 18, owner);
        MockERC20 energyx = new MockERC20("EnergyX", "ENERGYx", 18, owner);
        MockERC20 arcx = new MockERC20("ArcX", "ARCx", 18, owner);

        vm.prank(owner);
        factory.registerSeedPairs(address(techx), address(energyx), address(arcx));

        assertEq(factory.pairCount(), 3);
        (address bt0,,,) = factory.pools(0);
        (address bt1,,,) = factory.pools(1);
        (address bt2,,,) = factory.pools(2);
        assertEq(bt0, address(techx));
        assertEq(bt1, address(energyx));
        assertEq(bt2, address(arcx));
    }

    function test_unknownPairId_reverts() public {
        // Pair id 5 was never created, so it fails validation.
        vm.expectRevert(SpotPoolFactoryV2.InvalidPair.selector);
        factory.getSpotPrice(5);
    }

    function test_inactivePairId_reverts() public {
        // Only pair 0 is created below; pair 1 exists in no form.
        vm.prank(creator);
        factory.createPair(address(baseA));

        vm.prank(trader1);
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactoryV2.InvalidPair.selector));
        factory.swapUSDCForBase(1, 1e6, 0, address(trader1));
    }

    // ── liquidity ───────────────────────────────────────────────────────────

    function _createPairWithLiquidity(uint8 pairId, uint256 usdcAmt, uint256 baseAmt) internal {
        vm.prank(creator);
        factory.createPair(address(baseA));

        vm.prank(trader1);
        factory.addLiquidity(pairId, usdcAmt, baseAmt, 0);
    }

    function test_addLiquidity_mintsLp() public {
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);

        uint256 lp = factory.totalLpSupply(0);
        assertTrue(lp > 0);

        (address bt, uint128 rUSDC, uint128 rBase, bool active) = factory.pools(0);
        assertEq(bt, address(baseA));
        assertEq(uint256(rUSDC), 100_000e6);
        assertEq(uint256(rBase), 100_000e18);
        assertEq(factory.lpBalances(trader1, 0), lp);
    }

    function test_removeLiquidity_distributesReserves() public {
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);
        uint256 lp = factory.totalLpSupply(0);

        vm.prank(trader1);
        factory.removeLiquidity(0, lp / 2, 0, 0);

        (, uint128 rUSDC, uint128 rBase,) = factory.pools(0);
        assertEq(uint256(rUSDC), 100_000e6 / 2);
        assertEq(uint256(rBase), 100_000e18 / 2);
        assertEq(factory.totalLpSupply(0), lp / 2);
    }

    // ── swaps ───────────────────────────────────────────────────────────────

    function test_swapUSDCForBase_priceDerivation() public {
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);

        vm.prank(trader1);
        factory.swapUSDCForBase(0, 10_000e6, 0, address(trader1));

        (, uint128 rUSDC, uint128 rBase,) = factory.pools(0);
        assertEq(uint256(rUSDC), 100_000e6 + 10_000e6);
        assertLt(uint256(rBase), 100_000e18);
    }

    function test_swapBaseForUSDC() public {
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);

        vm.prank(trader1);
        factory.swapBaseForUSDC(0, 10_000e18, 0, address(trader1));

        (, uint128 rUSDC, uint128 rBase,) = factory.pools(0);
        assertEq(uint256(rBase), 100_000e18 + 10_000e18);
        assertLt(uint256(rUSDC), 100_000e6);
    }

    function test_getSpotPrice_returns8dec() public {
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);

        // reserveUSDC(1e11, 6-dec) * 1e20 / reserveBase(1e23, 18-dec) = 1e8
        // => $1.00 per token, expressed in 8 decimals.
        uint256 price = factory.getSpotPrice(0);
        assertEq(price, 100000000);
    }

    function test_swap_inactivePool_reverts() public {
        // Pool 1 was never created (only pair 0 exists after _createPairWithLiquidity).
        _createPairWithLiquidity(0, 100_000e6, 100_000e18);

        vm.prank(trader1);
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactoryV2.InvalidPair.selector));
        factory.swapUSDCForBase(1, 1e6, 0, address(trader1));
    }

    // ── invariant ───────────────────────────────────────────────────────────

    function test_constantProductInvariant() public {
        _createPairWithLiquidity(0, 100_000e6, 200_000e18);

        (, uint128 rUSDCBefore, uint128 rBaseBefore,) = factory.pools(0);
        uint256 productBefore = uint256(rUSDCBefore) * uint256(rBaseBefore);

        vm.prank(trader1);
        factory.swapUSDCForBase(0, 20_000e6, 0, address(trader1));

        (, uint128 rUSDC, uint128 rBase,) = factory.pools(0);
        uint256 productAfter = uint256(rUSDC) * uint256(rBase);

        assertEq(uint256(rUSDC), 120_000e6);
        assertLe(productAfter, (productBefore * 10020) / 10000);
        assertGt(productAfter, productBefore);
    }
}
