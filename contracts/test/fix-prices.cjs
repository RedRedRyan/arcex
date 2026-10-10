const fs = require("fs");

let c = fs.readFileSync("contracts/test/PerpEngine.t.sol", "utf-8");

// Fix oracle.setPrice calls - they must be called by owner (not trader1)
c = c.replace(
  "        vm.startPrank(trader1);\n        oracle.setPrice(0, 10000000);\n        engine.openPosition(0, true, longSize, 10);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, longSize, 10);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        oracle.setPrice(0, 10000000);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidPair.selector));\n        engine.openPosition(3, true, 100000000, 10);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidPair.selector));\n        engine.openPosition(3, true, 100000000, 10);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        oracle.setPrice(0, 10000000);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidLeverage.selector));\n        engine.openPosition(0, true, 100000000, 0);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.InvalidLeverage.selector));\n        engine.openPosition(0, true, 100000000, 0);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        oracle.setPrice(0, 10000000);\n        engine.openPosition(0, true, sizeUsdc, 10);\n\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionAlreadyOpen.selector));",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, 10);\n\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionAlreadyOpen.selector));"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, leverage);\n        uint256 marginBefore = marginOf(trader1);\n\n        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 12000000);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, leverage);\n        uint256 marginBefore = marginOf(trader1);\n\n        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 12000000);"
);

c = c.replace(
  "        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 10000000);\n\n        vm.startPrank(trader1);\n        engine.increasePosition(0, secondSize);",
  "        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 10000000);\n\n        vm.startPrank(trader1);\n        engine.increasePosition(0, secondSize);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, 10);\n        vm.stopPrank();\n\n        vm.startPrank(trader2);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionHealthy.selector));",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, 10);\n        vm.stopPrank();\n\n        vm.startPrank(trader2);\n        vm.expectRevert(abi.encodeWithSelector(PerpEngine.PositionHealthy.selector));"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, leverage);\n        vm.stopPrank();\n\n        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, leverage);\n        vm.stopPrank();\n\n        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        engine.openPosition(0, false, sizeUsdc, leverage);\n        vm.stopPrank();\n\n        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, false, sizeUsdc, leverage);\n        vm.stopPrank();\n\n        uint256 liq = engine.getLiquidationPrice(address(trader1), 0);"
);

c = c.replace(
  "        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, 10);\n        vm.stopPrank();\n\n        assertEq(engine.getMarginRatio(address(trader1), 0), 1000);",
  "        vm.startPrank(owner);\n        oracle.setPrice(0, 10000000);\n        vm.stopPrank();\n        vm.startPrank(trader1);\n        engine.openPosition(0, true, sizeUsdc, 10);\n        vm.stopPrank();\n\n        assertEq(engine.getMarginRatio(address(trader1), 0), 1000);"
);

// Also fix the closePosition where oracle.setPrice is inside trader1 block
c = c.replace(
  "        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 12000000);",
  "        vm.warp(block.timestamp + 1);\n        oracle.setPrice(0, 12000000);"
);

fs.writeFileSync("contracts/test/PerpEngine.t.sol", c);
console.log("Patched PerpEngine.t.sol");
