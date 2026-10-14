// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {TokenFactory} from "../TokenFactory.sol";
import {FactoryToken} from "../TokenFactory.sol";

/// @notice Tests for the permissionless token factory: deployment of a new
///         ERC-20, initial supply minted to the creator, cooldown enforcement,
///         metadata storage, and owner-only cooldown tuning.
contract TokenFactoryTest is Test {
    TokenFactory public factory;
    address public owner = address(0x1);
    address public creator1 = address(0x11);
    address public creator2 = address(0x22);

    function setUp() public {
        factory = new TokenFactory(owner);
    }

    // ── construction ────────────────────────────────────────────────────────

    function test_constructor_setsOwnerAndCooldown() public {
        assertEq(factory.owner(), owner);
        assertEq(factory.creationCooldown(), 1 hours);
        assertEq(factory.tokenCount(), 0);
    }

    // ── createToken ─────────────────────────────────────────────────────────

    function test_createToken_mintsToCreator() public {
        uint256 supply = 1_000_000e18;
        vm.prank(creator1);
        address token = factory.createToken(
            "My Token", "MYTOK", 18, supply, "https://example.com/logo.png", "A test token"
        );

        assertEq(factory.tokenCount(), 1);
        assertEq(factory.tokens(0), token);
        assertEq(FactoryToken(token).balanceOf(creator1), supply);
        assertEq(FactoryToken(token).totalSupply(), supply);
        assertEq(FactoryToken(token).decimals(), 18);
    }

    function test_createToken_storesMetadata() public {
        string memory imageURI = "https://cdn.example.com/token.png";
        string memory description = "Community token for the arcex testnet";

        vm.prank(creator1);
        address token = factory.createToken("Cool Coin", "COOL", 6, 1000000000, imageURI, description);

        (
            address infoToken,
            address infoCreator,
            string memory infoName,
            string memory infoSymbol,
            uint8 infoDecimals,
            uint256 infoSupply,
            string memory infoImageURI,
            string memory infoDescription,
            uint256 infoCreatedAt
        ) = factory.tokenInfo(token);

        assertEq(infoToken, token);
        assertEq(infoCreator, creator1);
        assertEq(infoName, "Cool Coin");
        assertEq(infoSymbol, "COOL");
        assertEq(infoDecimals, 6);
        assertEq(infoSupply, 1000000000);
        assertEq(infoImageURI, imageURI);
        assertEq(infoDescription, description);
        assertEq(infoCreatedAt, block.timestamp);
    }

    function test_createToken_emitsEvent() public {
        // TokenCreated has two indexed topics (token, creator). The token
        // address is only known post-deployment, so match the creator topic
        // and verify the token address from stored state.
        vm.expectEmit(false, true, false, true);
        emit TokenFactory.TokenCreated(
            address(0),
            creator1,
            "Event Token",
            "EVT",
            8,
            100000000,
            "img",
            "desc"
        );

        vm.prank(creator1);
        address token = factory.createToken("Event Token", "EVT", 8, 100000000, "img", "desc");

        (address infoToken,,,,,,,,) = factory.tokenInfo(token);
        assertEq(infoToken, token);
        assertEq(factory.tokens(0), token);
    }

    // ── cooldown ────────────────────────────────────────────────────────────

    function test_cooldown_blocksImmediateSecondCreation() public {
        vm.startPrank(creator1);
        factory.createToken("First", "FST", 18, 100e18, "", "");

        vm.expectRevert(
            abi.encodeWithSelector(TokenFactory.CooldownActive.selector, block.timestamp + 1 hours)
        );
        factory.createToken("Second", "SND", 18, 100e18, "", "");
        vm.stopPrank();
    }

    function test_cooldown_allowsAfterElapsed() public {
        vm.startPrank(creator1);
        factory.createToken("First", "FST", 18, 100e18, "", "");
        vm.warp(block.timestamp + 1 hours + 1);
        factory.createToken("Second", "SND", 18, 100e18, "", "");
        vm.stopPrank();

        assertEq(factory.tokenCount(), 2);
    }

    function test_cooldown_isPerCreator() public {
        vm.prank(creator1);
        factory.createToken("First", "FST", 18, 100e18, "", "");

        // creator2 is unaffected by creator1's cooldown
        vm.prank(creator2);
        factory.createToken("Second", "SND", 18, 100e18, "", "");
        assertEq(factory.tokenCount(), 2);
    }

    function test_cooldown_zeroDisablesLimit() public {
        vm.prank(owner);
        factory.setCreationCooldown(0);

        vm.startPrank(creator1);
        factory.createToken("A", "A", 18, 1e18, "", "");
        factory.createToken("B", "B", 18, 1e18, "", "");
        vm.stopPrank();

        assertEq(factory.tokenCount(), 2);
    }

    function test_nextCreationAllowedAt_tracksLastCreation() public {
        assertEq(factory.nextCreationAllowedAt(creator1), 0);
        assertFalse(factory.hasCreated(creator1));

        vm.prank(creator1);
        factory.createToken("First", "FST", 18, 100e18, "", "");

        uint256 next = factory.nextCreationAllowedAt(creator1);
        assertEq(next, block.timestamp + 1 hours);
        assertTrue(factory.hasCreated(creator1));

        vm.warp(block.timestamp + 1 hours + 5);
        assertLe(next, block.timestamp);
    }

    // ── validation ──────────────────────────────────────────────────────────

    function test_createToken_rejectsEmptyName() public {
        vm.prank(creator1);
        vm.expectRevert(TokenFactory.InvalidName.selector);
        factory.createToken("", "SYM", 18, 100e18, "", "");
    }

    function test_createToken_rejectsEmptySymbol() public {
        vm.prank(creator1);
        vm.expectRevert(TokenFactory.InvalidSymbol.selector);
        factory.createToken("Name", "", 18, 100e18, "", "");
    }

    function test_createToken_rejectsDecimalsAbove18() public {
        vm.prank(creator1);
        vm.expectRevert(abi.encodeWithSelector(TokenFactory.InvalidDecimals.selector, 19));
        factory.createToken("Name", "SYM", 19, 100e18, "", "");
    }

    function test_createToken_rejectsZeroSupply() public {
        vm.prank(creator1);
        vm.expectRevert(TokenFactory.ZeroSupply.selector);
        factory.createToken("Name", "SYM", 18, 0, "", "");
    }

    // ── owner ───────────────────────────────────────────────────────────────

    function test_setCreationCooldown_onlyOwner() public {
        vm.prank(creator1);
        vm.expectRevert();
        factory.setCreationCooldown(60);

        vm.prank(owner);
        factory.setCreationCooldown(120);
        assertEq(factory.creationCooldown(), 120);
    }
}
