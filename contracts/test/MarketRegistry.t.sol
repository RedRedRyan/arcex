// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarketRegistry} from "../MarketRegistry.sol";

/**
 * @title  MarketRegistryTest
 * @notice Unit, fuzz, and invariant tests for MarketRegistry.
 */
contract MarketRegistryTest is Test {
    // ── Fixtures ──────────────────────────────────────────────────────────────

    MarketRegistry public registry;

    address internal admin = address(0x3B2f9f644312cdB69be095FCC3b353C69a0088B2);
    address internal pauser = address(0xBEEF);
    address internal rando = address(0xCAFE);

    bytes32 internal ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 internal PAUSER_ROLE = keccak256("PAUSER_ROLE");

    function setUp() public {
        registry = new MarketRegistry(admin, pauser);
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    function test_constructor_rolesAssigned() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(ADMIN_ROLE, admin));
        assertTrue(registry.hasRole(PAUSER_ROLE, pauser));
    }

    function test_constructor_defaultConfigs() public view {
        for (uint8 i = 0; i <= 2; i++) {
            MarketRegistry.MarketConfig memory cfg = registry.getMarketConfig(i);
            assertEq(cfg.entryFeeBps, 10);
            assertEq(cfg.maxLeverage, 5);
            assertEq(cfg.oiCap, 5_000_000_000_000);
            assertFalse(cfg.paused);
            assertGt(cfg.tickSize, 0);
            assertGt(cfg.lotSize, 0);
        }
    }

    function test_constructor_rejectsZeroAdmin() public {
        vm.expectRevert("MarketRegistry: admin is zero");
        new MarketRegistry(address(0), pauser);
    }

    function test_constructor_rejectsZeroPauser() public {
        vm.expectRevert("MarketRegistry: pauser is zero");
        new MarketRegistry(admin, address(0));
    }

    // ── setMarketConfig ───────────────────────────────────────────────────────

    function test_setMarketConfig_happyPath() public {
        vm.prank(admin);
        registry.setMarketConfig(0, 20, 10, 1_000_000_000_000, 2_000_000, 2e15);

        MarketRegistry.MarketConfig memory cfg = registry.getMarketConfig(0);
        assertEq(cfg.entryFeeBps, 20);
        assertEq(cfg.maxLeverage, 10);
        assertEq(cfg.oiCap, 1_000_000_000_000);
        assertEq(cfg.tickSize, 2_000_000);
        assertEq(cfg.lotSize, 2e15);
    }

    function test_setMarketConfig_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit MarketRegistry.MarketConfigUpdated(1, 30, 3, 500_000_000_000);
        registry.setMarketConfig(1, 30, 3, 500_000_000_000, 1_000_000, 1e15);
    }

    function test_setMarketConfig_revertsForNonAdmin() public {
        vm.prank(rando);
        vm.expectRevert();
        registry.setMarketConfig(0, 10, 5, 1_000_000_000_000, 1_000_000, 1e15);
    }

    function test_setMarketConfig_revertsOnFeeCapExceeded() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidFeeBps.selector, 1001));
        registry.setMarketConfig(0, 1001, 5, 1_000_000_000_000, 1_000_000, 1e15);
    }

    function test_setMarketConfig_revertsOnZeroLeverage() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidLeverage.selector, 0));
        registry.setMarketConfig(0, 10, 0, 1_000_000_000_000, 1_000_000, 1e15);
    }

    function test_setMarketConfig_revertsOnZeroOiCap() public {
        vm.prank(admin);
        vm.expectRevert(MarketRegistry.ZeroOiCap.selector);
        registry.setMarketConfig(0, 10, 5, 0, 1_000_000_000, 1e15);
    }

    function test_setMarketConfig_revertsOnInvalidPair() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidPairId.selector, 3));
        registry.setMarketConfig(3, 10, 5, 1_000_000_000_000, 1_000_000, 1e15);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    function test_setMarketPause_pausesMarket() public {
        vm.prank(pauser);
        registry.setMarketPause(0, true);
        assertTrue(registry.getMarketConfig(0).paused);
    }

    function test_setMarketPause_emitsEvent() public {
        vm.prank(pauser);
        vm.expectEmit(true, false, false, true);
        emit MarketRegistry.MarketPauseToggled(0, true);
        registry.setMarketPause(0, true);
    }

    function test_setMarketPause_revertsForNonPauser() public {
        vm.prank(rando);
        vm.expectRevert();
        registry.setMarketPause(0, true);
    }

    function test_setGlobalPause_pauses() public {
        vm.prank(pauser);
        registry.setGlobalPause(true);
        assertTrue(registry.globalPaused());
    }

    function test_setGlobalPause_emitsEvent() public {
        vm.prank(pauser);
        vm.expectEmit(false, false, false, true);
        emit MarketRegistry.GlobalPauseToggled(true);
        registry.setGlobalPause(true);
    }

    // ── assertNotPaused ───────────────────────────────────────────────────────

    function test_assertNotPaused_happyPath() public view {
        registry.assertNotPaused(0); // should not revert
    }

    function test_assertNotPaused_revertsOnMarketPause() public {
        vm.prank(pauser);
        registry.setMarketPause(0, true);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.MarketPaused.selector, 0));
        registry.assertNotPaused(0);
    }

    function test_assertNotPaused_revertsOnGlobalPause() public {
        vm.prank(pauser);
        registry.setGlobalPause(true);
        vm.expectRevert(MarketRegistry.GloballyPaused.selector);
        registry.assertNotPaused(0);
    }

    function test_assertNotPaused_globalOverridesMarket() public {
        // Even if per-market is NOT paused, global pause halts everything
        vm.prank(pauser);
        registry.setGlobalPause(true);
        vm.expectRevert(MarketRegistry.GloballyPaused.selector);
        registry.assertNotPaused(1);
    }

    // ── Fuzz: setMarketConfig ─────────────────────────────────────────────────

    function testFuzz_setMarketConfig_feeInRange(uint256 feeBps) public {
        feeBps = bound(feeBps, 0, registry.ENTRY_FEE_BPS_CAP());
        vm.prank(admin);
        registry.setMarketConfig(0, feeBps, 5, 1_000_000_000_000, 1_000_000, 1e15);
        assertEq(registry.getMarketConfig(0).entryFeeBps, feeBps);
    }

    function testFuzz_setMarketConfig_feeAboveCap_reverts(uint256 feeBps) public {
        feeBps = bound(feeBps, registry.ENTRY_FEE_BPS_CAP() + 1, type(uint256).max);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidFeeBps.selector, feeBps));
        registry.setMarketConfig(0, feeBps, 5, 1_000_000_000_000, 1_000_000, 1e15);
    }

    function testFuzz_setMarketConfig_leverageInRange(uint8 leverage) public {
        leverage = uint8(bound(uint256(leverage), 1, registry.MAX_LEVERAGE_CAP()));
        vm.prank(admin);
        registry.setMarketConfig(0, 10, leverage, 1_000_000_000_000, 1_000_000, 1e15);
        assertEq(registry.getMarketConfig(0).maxLeverage, leverage);
    }

    function testFuzz_assertNotPaused_invalidPair(uint8 pairId) public {
        pairId = uint8(bound(uint256(pairId), 3, 255));
        vm.expectRevert(abi.encodeWithSelector(MarketRegistry.InvalidPairId.selector, pairId));
        registry.assertNotPaused(pairId);
    }
}

// ── Invariant harness ─────────────────────────────────────────────────────────

contract MarketRegistryInvariantTest is Test {
    MarketRegistry public registry;
    address internal admin = address(0x3B2f9f644312cdB69be095FCC3b353C69a0088B2);
    address internal pauser = address(0xBEEF);

    function setUp() public {
        registry = new MarketRegistry(admin, pauser);
        targetContract(address(registry));
    }

    /// @notice Entry fee must never exceed the hard cap on any pair.
    function invariant_feeCapNeverExceeded() public view {
        for (uint8 i = 0; i <= 2; i++) {
            MarketRegistry.MarketConfig memory cfg = registry.getMarketConfig(i);
            assertLe(cfg.entryFeeBps, registry.ENTRY_FEE_BPS_CAP());
        }
    }

    /// @notice Max leverage must always be ≥ 1 on any pair.
    function invariant_leverageAlwaysPositive() public view {
        for (uint8 i = 0; i <= 2; i++) {
            MarketRegistry.MarketConfig memory cfg = registry.getMarketConfig(i);
            assertGe(cfg.maxLeverage, 1);
        }
    }
}
