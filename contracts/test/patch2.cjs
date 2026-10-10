import { readFileSync, writeFileSync } from "fs";
const fs = fs || require("fs");

const files = [
  "contracts/test/PerpEngine.t.sol",
  "contracts/test/SpotPoolFactory.t.sol",
];

for (const file of files) {
  let c = fs.readFileSync(file, "utf-8");

  // approve() must be called while msg.sender == trader1 (the spender),
  // but we need the token to be owned by owner so owner can mint.
  // Fix: mint inside owner block, then approve inside trader1 block.

  // PerpEngine.t.sol patterns
  c = c.replace(
    `    function test_depositMargin_creditsMargin() public {
        uint256 amount = 100000000; // 100 USDC
        vm.startPrank(owner);
        usdc.mint(trader1, amount);
        usdc.approve(address(engine), amount);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(amount);
        vm.stopPrank();`,
    `    function test_depositMargin_creditsMargin() public {
        uint256 amount = 100000000; // 100 USDC
        vm.startPrank(owner);
        usdc.mint(trader1, amount);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), amount);
        engine.depositMargin(amount);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_withdrawMargin_allowsFreeOnly() public {
        uint256 deposit = 100000000;
        vm.startPrank(owner);
        usdc.mint(trader1, deposit);
        usdc.approve(address(engine), deposit);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(deposit);
        vm.stopPrank();`,
    `    function test_withdrawMargin_allowsFreeOnly() public {
        uint256 deposit = 100000000;
        vm.startPrank(owner);
        usdc.mint(trader1, deposit);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), deposit);
        engine.depositMargin(deposit);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_withdrawMargin_rejectsInsufficient() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        usdc.approve(address(engine), 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(10000000);
        vm.stopPrank();`,
    `    function test_withdrawMargin_rejectsInsufficient() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), 10000000);
        engine.depositMargin(10000000);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_openPosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_openPosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_openPosition_rejectsInsufficientMargin() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        usdc.approve(address(engine), 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(10000000);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();`,
    `    function test_openPosition_rejectsInsufficientMargin() public {
        vm.startPrank(owner);
        usdc.mint(trader1, 10000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), 10000000);
        engine.depositMargin(10000000);
        oracle.setPrice(0, 10000000);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_closePosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_closePosition_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_increasePosition_happyPath() public {
        uint256 firstSize = 100000000;
        uint256 secondSize = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, firstSize + secondSize);
        usdc.approve(address(engine), firstSize + secondSize);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(firstSize + secondSize);
        vm.stopPrank();`,
    `    function test_increasePosition_happyPath() public {
        uint256 firstSize = 100000000;
        uint256 secondSize = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, firstSize + secondSize);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), firstSize + secondSize);
        engine.depositMargin(firstSize + secondSize);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_liquidate_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_liquidate_happyPath() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_liquidate_rejectsHealthyPosition() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_liquidate_rejectsHealthyPosition() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_getLiquidationPrice_long() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_getLiquidationPrice_long() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_getLiquidationPrice_short() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_getLiquidationPrice_short() public {
        uint256 sizeUsdc = 100000000;
        uint8 leverage = 10;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_getMarginRatio_happyPath() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        usdc.approve(address(engine), sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`,
    `    function test_getMarginRatio_happyPath() public {
        uint256 sizeUsdc = 100000000;
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, sizeUsdc);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), sizeUsdc);
        engine.depositMargin(sizeUsdc);
        vm.stopPrank();`
  );

  c = c.replace(
    `    function test_applyFunding_gatedByInterval() public {
        vm.warp(block.timestamp + 3600);
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, 100000000);
        usdc.approve(address(engine), 100000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        engine.depositMargin(100000000);
        vm.stopPrank();`,
    `    function test_applyFunding_gatedByInterval() public {
        vm.warp(block.timestamp + 3600);
        oracle.setPrice(0, 10000000);

        vm.startPrank(owner);
        usdc.mint(trader1, 100000000);
        vm.stopPrank();
        vm.startPrank(trader1);
        usdc.approve(address(engine), 100000000);
        engine.depositMargin(100000000);
        vm.stopPrank();`
  );

  fs.writeFileSync(file, c);
  console.log("Patched " + file);
}

console.log("Done");
