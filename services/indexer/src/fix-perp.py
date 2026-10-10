import re

path = "contracts/test/PerpEngine.t.sol"
with open(path, encoding="utf-8") as f:
    content = f.read()

# Fix 1: test_openPosition_rejectsInsufficientMargin — need to fund trader1 first
content = content.replace(
    """    function test_openPosition_rejectsInsufficientMargin() public {
        vm.startPrank(trader1);
        usdc.mint(trader1, 10000000);
        usdc.approve(address(engine), 10000000);
        engine.depositMargin(10000000);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();

        vm.startPrank(trader1);
        vm.expectRevert(
            abi.encodeWithSelector(PerpEngine.InsufficientMargin.selector, 10000000, 10000000)
        );
        engine.openPosition(0, true, 1000000, 10);
        vm.stopPrank();
    }""",
    """    function test_openPosition_rejectsInsufficientMargin() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        usdc.approve(address(engine), 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(10000000);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();

        vm.startPrank(trader1);
        vm.expectRevert(
            abi.encodeWithSelector(PerpEngine.InsufficientMargin.selector, 10000000, 10000000)
        );
        engine.openPosition(0, true, 1000000, 10);
        vm.stopPrank();
    }"""
)

# Fix 2: test_closePosition_happyPath — fund first
content = content.replace(
    """    function test_closePosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        uint256 marginBefore = marginOf(trader1);
        vm.stopPrank();""",
    """    function test_closePosition_happyPath() public {
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
        vm.stopPrank();"""
)

# Fix 3: test_increasePosition_happyPath — fund first
content = content.replace(
    """    function test_increasePosition_happyPath() public {
        uint256 firstSize = 100000000;
        uint256 secondSize = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, firstSize, 10);
        uint256 marginBefore = marginOf(trader1);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.increasePosition(0, secondSize);
        vm.stopPrank();""",
    """    function test_increasePosition_happyPath() public {
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
        vm.stopPrank();"""
)

# Fix 4: test_liquidate_happyPath — fund first
content = content.replace(
    """    function test_liquidate_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

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
    }""",
    """    function test_liquidate_happyPath() public {
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
    }"""
)

# Fix 5: test_liquidate_rejectsHealthyPosition — fund first
content = content.replace(
    """    function test_liquidate_rejectsHealthyPosition() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        vm.startPrank(trader2);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionHealthy.selector));
        engine.liquidate(address(trader1), 0);
        vm.stopPrank();
    }""",
    """    function test_liquidate_rejectsHealthyPosition() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        vm.startPrank(trader2);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionHealthy.selector));
        engine.liquidate(address(trader1), 0);
        vm.stopPrank();
    }"""
)

# Fix 6: test_getLiquidationPrice_long — fund first
content = content.replace(
    """    function test_getLiquidationPrice_long() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, leverage);
        vm.stopPrank();

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 9500000); // entry * 0.95 (long liquidation below entry)
    }""",
    """    function test_getLiquidationPrice_long() public {
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

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 9500000); // entry * 0.95 (long liquidation below entry)
    }"""
)

# Fix 7: test_getLiquidationPrice_short — fund first
content = content.replace(
    """    function test_getLiquidationPrice_short() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, false, sizeUsdc, leverage);
        vm.stopPrank();

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 10500000); // entry * 1.05 (short liquidation above entry)
    }""",
    """    function test_getLiquidationPrice_short() public {
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
        engine.openPosition(0, false, sizeUsdc, leverage);
        vm.stopPrank();

        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);
        assertEq(liq, 10500000); // entry * 1.05 (short liquidation above entry)
    }"""
)

# Fix 8: test_getMarginRatio_happyPath — fund first
content = content.replace(
    """    function test_getMarginRatio_happyPath() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        assertEq(engine.getMarginRatio(address(trader1), 0), 1000);
    }""",
    """    function test_getMarginRatio_happyPath() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();

        vm.startPrank(trader1);
        engine.openPosition(0, true, sizeUsdc, 10);
        vm.stopPrank();

        assertEq(engine.getMarginRatio(address(trader1), 0), 1000);
    }"""
)

# Fix 9: test_applyFunding_gatedByInterval — fund first
content = content.replace(
    """    function test_applyFunding_gatedByInterval() public {
        vm.warp(block.timestamp + 3600);
        oracle.setPrice(0, 10000000);

        (int256 fundingIndexBefore, ) = fundingStateOf(0);

        vm.prank(trader1);
        engine.openPosition(0, true, 100000000, 10);

        assertTrue(isOpenOf(trader1, 0));
    }""",
    """    function test_applyFunding_gatedByInterval() public {
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
    }"""
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
