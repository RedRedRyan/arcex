// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SpotPoolFactory} from "../SpotPoolFactory.sol";
import {MockERC20} from "../MockERC20.sol";

/// @notice Tests for the constant-product liquidity pools that back the
///         `/spot` page. The test harness owns a pair of MockERC20s (USDC and
///         an 8-dec base), seeds the pool with liquidity, and verifies the
///         invariant (reserveIn * reserveOut stays constant under swaps) plus
///         the 0.3% fee and price-derivation views.
contract SpotPoolFactoryTest is Test {
    SpotPoolFactory public factory;
    MockERC20 public usdc;
    MockERC20 public base;
    address public owner = address(0x1);
    address public trader1 = address(0x11);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6, owner);
        base = new MockERC20("TECHx", "TECHx", 8, owner);

        // Approve factory to pull liquidity. Mint is owner-only.
        vm.startPrank(owner);
        usdc.mint(trader1, 1000000000); // 1 000 000 USDC
        usdc.approve(address(factory), type(uint256).max);
        base.mint(trader1, 1000000000000); // 1 000 000 TECHx (8 dec)
        base.approve(address(factory), type(uint256).max);
        vm.stopPrank();

        factory = new SpotPoolFactory(address(usdc), owner);
        vm.prank(owner);
        factory.setBaseToken(0, address(base));
        vm.stopPrank();
    }

    // ── construction / base token wiring ────────────────────────────────────

    function test_constructor_setsUsdc() public {
        assertEq(address(factory.usdc()), address(usdc));
        assertEq(factory.FEE_BPS(), 30);
    }

    function test_setBaseToken_activatesPool() public {
        // pool[0] default: baseToken = address(0), active = false
        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);
        assertEq(baseToken, address(0));
        assertFalse(active);

        factory.setBaseToken(0, address(base));

        (baseToken, reserveUSDC, reserveBase, active) = factory.pools(0);
        assertEq(baseToken, address(base));
        assertTrue(active);
        assertEq(uint256(reserveUSDC), 0);
        assertEq(uint256(reserveBase), 0);
    }

    function test_setBaseToken_rejectsZero() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactory.InvalidPair.selector));
        factory.setBaseToken(0, address(0));
        vm.stopPrank();
    }

    function test_setBaseToken_rejectsDoubleSet() public {
        vm.startPrank(owner);
        factory.setBaseToken(0, address(base));
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactory.InvalidPair.selector));
        factory.setBaseToken(0, address(base));
        vm.stopPrank();
    }

    // ── add liquidity ───────────────────────────────────────────────────────

    function test_addLiquidity_mintsLp() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 100000000, 0); // 100 USDC + 100 TECHx
        vm.stopPrank();

        uint256 lp = factory.totalLpSupply(0);
        assertTrue(lp > 0);

        // pool[0] now holds the liquidity; 0.3% fee is taken on swaps, not
        // on liquidity adds, so both reserves equal the input.
        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);
        assertEq(baseToken, address(base));
        assertEq(uint256(reserveUSDC), 100000000);
        assertEq(uint256(reserveBase), 100000000);
        assertEq(factory.lpBalances(trader1, 0), lp);
    }

    function test_addLiquidity_rejectsZeroAmount() public {
        vm.startPrank(trader1);
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactory.ZeroAmount.selector));
        factory.addLiquidity(0, 0, 100000000, 0);
        vm.stopPrank();
    }

    function test_addLiquidity_rejectsInsufficientLiquidity() public {
        vm.startPrank(trader1);
        vm.expectRevert(abi.encodeWithSelector(SpotPoolFactory.InsufficientLiquidity.selector));
        factory.addLiquidity(0, 100000000, 0, 0);
        vm.stopPrank();
    }

    // ── remove liquidity ────────────────────────────────────────────────────

    function test_removeLiquidity_distributesReserves() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 100000000, 0);
        uint256 lp = factory.totalLpSupply(0);
        vm.stopPrank();

        // Burn half the LP back.
        vm.startPrank(trader1);
        factory.removeLiquidity(0, lp / 2, 0, 0);
        vm.stopPrank();

        // ~half of each reserve returned.
        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);
        assertEq(uint256(reserveUSDC), 100000000 / 2);
        assertEq(uint256(reserveBase), 100000000 / 2);
        assertEq(factory.totalLpSupply(0), lp / 2);
    }

    // ── swap ────────────────────────────────────────────────────────────────

    function test_swapUSDCForBase_priceDerivation() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 100000000, 0);
        vm.stopPrank();

        vm.startPrank(trader1);
        factory.swapUSDCForBase(0, 10000000, 0, address(trader1));
        vm.stopPrank();

        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);
        assertEq(uint256(reserveUSDC), 100000000 - 10000000);
        assertGt(uint256(reserveBase), 100000000);
    }

    function test_swapBaseForUSDC() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 100000000, 0);
        vm.stopPrank();

        vm.startPrank(trader1);
        factory.swapBaseForUSDC(0, 10000000, 0, address(trader1));
        vm.stopPrank();

        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);
        assertEq(uint256(reserveBase), 100000000 - 10000000);
        assertGt(uint256(reserveUSDC), 100000000);
    }

    function test_getSpotPrice_returns8dec() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 100000000, 0);
        vm.stopPrank();

        // reserveUSDC * 1e20 / reserveBase = 100M * 1e20 / 100M = 1e20
        // => 1.00000000 USDC = 1.00000000 TECHx (8-dec price)
        uint256 price = factory.getSpotPrice(0);
        assertEq(price, 100000000000000000000);
    }

    // ── AMM invariant ───────────────────────────────────────────────────────

    function test_constantProductInvariant() public {
        vm.startPrank(trader1);
        factory.addLiquidity(0, 100000000, 200000000, 0); // 100 USDC + 200 BASE
        vm.stopPrank();

        // Starting constant: reserveUSDC * reserveBase = 100M * 200M
        vm.startPrank(trader1);

        // 200 USDC in -> some base out
        factory.swapUSDCForBase(0, 20000000, 0, address(trader1));

        (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active) =
            factory.pools(0);

        // With a 0.3% fee, the product drifts by <= fee rate; check the reserves
        // both moved consistently and the product is within ~fee of the start.
        assertEq(uint256(reserveUSDC), 120000000);
        // product after = (120M) * rBase, product before = 100M * 200M = 20000000000000
        assertLe(uint256(reserveBase) * uint256(reserveUSDC), (20000000000000 * 10020) / 10000);
        assertGt(uint256(reserveBase) * uint256(reserveUSDC), 20000000000000);
        vm.stopPrank();
    }
}
