// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Testnet/demo AMM for three USDC-quoted pairs. Not audited for production.
contract SpotPoolFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Pool {
        address baseToken;
        uint128 reserveUSDC;
        uint128 reserveBase;
        bool active;
    }

    mapping(uint8 => Pool) public pools;
    mapping(address => mapping(uint8 => uint256)) public lpBalances;
    mapping(uint8 => uint256) public totalLpSupply;

    address public immutable usdc;

    uint256 public constant FEE_BPS = 30;
    uint256 private constant PAIR_COUNT = 3;

    error PoolNotActive(uint8 pairId);
    error InsufficientOutput(uint256 expected, uint256 actual);
    error InsufficientLiquidity();
    error InvalidPair();
    error ZeroAmount();

    event LiquidityAdded(
        uint8 indexed pairId,
        address indexed provider,
        uint256 amountUSDC,
        uint256 amountBase,
        uint256 lpMinted
    );
    event LiquidityRemoved(
        uint8 indexed pairId,
        address indexed provider,
        uint256 amountUSDC,
        uint256 amountBase,
        uint256 lpBurned
    );
    event Swap(
        uint8 indexed pairId,
        address indexed sender,
        bool usdcIn,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );
    event PoolActivated(uint8 indexed pairId, address baseToken);

    constructor(address _usdc, address initialOwner) Ownable(initialOwner) {
        require(_usdc != address(0), "USDC zero");
        usdc = _usdc;

        pools[0] = Pool({baseToken: address(0), reserveUSDC: 0, reserveBase: 0, active: false});
        pools[1] = Pool({baseToken: address(0), reserveUSDC: 0, reserveBase: 0, active: false});
        pools[2] = Pool({baseToken: address(0), reserveUSDC: 0, reserveBase: 0, active: false});
    }

    function setBaseToken(uint8 pairId, address baseToken) external onlyOwner {
        _validatePair(pairId);
        require(baseToken != address(0), "Base token zero");

        Pool storage pool = pools[pairId];
        require(pool.baseToken == address(0), "Base token already set");
        pool.baseToken = baseToken;
        pool.active = true;

        emit PoolActivated(pairId, baseToken);
    }

    function addLiquidity(uint8 pairId, uint256 amountUSDC, uint256 amountBase, uint256 minLpOut) external nonReentrant {
        if (amountUSDC == 0 || amountBase == 0) revert ZeroAmount();

        Pool storage pool = _activePool(pairId);

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amountUSDC);
        IERC20(pool.baseToken).safeTransferFrom(msg.sender, address(this), amountBase);

        uint256 reserveUSDC = uint256(pool.reserveUSDC);
        uint256 reserveBase = uint256(pool.reserveBase);
        uint256 total = totalLpSupply[pairId];

        uint256 lpMinted;
        if (total == 0) {
            lpMinted = _sqrt(amountUSDC * amountBase);
            if (lpMinted == 0) revert InsufficientLiquidity();
        } else {
            uint256 lpFromUSDC = (amountUSDC * total) / reserveUSDC;
            uint256 lpFromBase = (amountBase * total) / reserveBase;
            lpMinted = lpFromUSDC < lpFromBase ? lpFromUSDC : lpFromBase;
            if (lpMinted == 0) revert InsufficientLiquidity();
        }

        if (lpMinted < minLpOut) revert InsufficientOutput(minLpOut, lpMinted);

        totalLpSupply[pairId] = total + lpMinted;
        lpBalances[msg.sender][pairId] += lpMinted;

        pool.reserveUSDC = _toUint128(reserveUSDC + amountUSDC);
        pool.reserveBase = _toUint128(reserveBase + amountBase);

        emit LiquidityAdded(pairId, msg.sender, amountUSDC, amountBase, lpMinted);
    }

    function removeLiquidity(
        uint8 pairId,
        uint256 lpAmount,
        uint256 minUSDC,
        uint256 minBase
    ) external nonReentrant {
        if (lpAmount == 0) revert ZeroAmount();

        Pool storage pool = _activePool(pairId);

        uint256 userLp = lpBalances[msg.sender][pairId];
        if (userLp < lpAmount) revert InsufficientLiquidity();

        uint256 total = totalLpSupply[pairId];
        if (total == 0) revert InsufficientLiquidity();

        uint256 amountUSDC = (uint256(pool.reserveUSDC) * lpAmount) / total;
        uint256 amountBase = (uint256(pool.reserveBase) * lpAmount) / total;

        if (amountUSDC < minUSDC) revert InsufficientOutput(minUSDC, amountUSDC);
        if (amountBase < minBase) revert InsufficientOutput(minBase, amountBase);

        lpBalances[msg.sender][pairId] = userLp - lpAmount;
        totalLpSupply[pairId] = total - lpAmount;

        pool.reserveUSDC = _toUint128(uint256(pool.reserveUSDC) - amountUSDC);
        pool.reserveBase = _toUint128(uint256(pool.reserveBase) - amountBase);

        IERC20(usdc).safeTransfer(msg.sender, amountUSDC);
        IERC20(pool.baseToken).safeTransfer(msg.sender, amountBase);

        emit LiquidityRemoved(pairId, msg.sender, amountUSDC, amountBase, lpAmount);
    }

    function swapUSDCForBase(uint8 pairId, uint256 amountUSDCIn, uint256 minBaseOut, address to) external nonReentrant {
        if (amountUSDCIn == 0) revert ZeroAmount();
        require(to != address(0), "To zero");

        Pool storage pool = _activePool(pairId);

        uint256 reserveUSDC = uint256(pool.reserveUSDC);
        uint256 reserveBase = uint256(pool.reserveBase);
        if (reserveUSDC == 0 || reserveBase == 0) revert InsufficientLiquidity();

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amountUSDCIn);

        uint256 amountOut = _getAmountOut(amountUSDCIn, reserveUSDC, reserveBase);
        if (amountOut < minBaseOut) revert InsufficientOutput(minBaseOut, amountOut);
        if (amountOut >= reserveBase) revert InsufficientLiquidity();

        pool.reserveUSDC = _toUint128(reserveUSDC + amountUSDCIn);
        pool.reserveBase = _toUint128(reserveBase - amountOut);

        IERC20(pool.baseToken).safeTransfer(to, amountOut);

        emit Swap(pairId, msg.sender, true, amountUSDCIn, amountOut, to);
    }

    function swapBaseForUSDC(uint8 pairId, uint256 amountBaseIn, uint256 minUSDCOut, address to) external nonReentrant {
        if (amountBaseIn == 0) revert ZeroAmount();
        require(to != address(0), "To zero");

        Pool storage pool = _activePool(pairId);

        uint256 reserveUSDC = uint256(pool.reserveUSDC);
        uint256 reserveBase = uint256(pool.reserveBase);
        if (reserveUSDC == 0 || reserveBase == 0) revert InsufficientLiquidity();

        IERC20(pool.baseToken).safeTransferFrom(msg.sender, address(this), amountBaseIn);

        uint256 amountOut = _getAmountOut(amountBaseIn, reserveBase, reserveUSDC);
        if (amountOut < minUSDCOut) revert InsufficientOutput(minUSDCOut, amountOut);
        if (amountOut >= reserveUSDC) revert InsufficientLiquidity();

        pool.reserveBase = _toUint128(reserveBase + amountBaseIn);
        pool.reserveUSDC = _toUint128(reserveUSDC - amountOut);

        IERC20(usdc).safeTransfer(to, amountOut);

        emit Swap(pairId, msg.sender, false, amountBaseIn, amountOut, to);
    }

    function getAmountOut(uint8 pairId, bool usdcIn, uint256 amountIn) external view returns (uint256) {
        if (amountIn == 0) revert ZeroAmount();
        Pool storage pool = pools[pairId];
        if (!pool.active) revert PoolNotActive(pairId);

        uint256 reserveIn = usdcIn ? uint256(pool.reserveUSDC) : uint256(pool.reserveBase);
        uint256 reserveOut = usdcIn ? uint256(pool.reserveBase) : uint256(pool.reserveUSDC);
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        return _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getSpotPrice(uint8 pairId) external view returns (uint256 price8dec) {
        Pool storage pool = _activePoolView(pairId);
        uint256 reserveBase = uint256(pool.reserveBase);
        if (reserveBase == 0) revert InsufficientLiquidity();

        return (uint256(pool.reserveUSDC) * 1e20) / reserveBase;
    }

    function _getAmountOut(uint256 amIn, uint256 resIn, uint256 resOut) internal pure returns (uint256) {
        if (amIn == 0) revert ZeroAmount();
        if (resIn == 0 || resOut == 0) revert InsufficientLiquidity();

        uint256 amInWithFee = amIn * (10000 - FEE_BPS);
        uint256 numerator = amInWithFee * resOut;
        uint256 denominator = (resIn * 10000) + amInWithFee;
        return numerator / denominator;
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y == 0) return 0;
        if (y <= 3) return 1;

        z = y;
        uint256 x = (y / 2) + 1;
        while (x < z) {
            z = x;
            x = ((y / x) + x) / 2;
        }
    }

    function _validatePair(uint8 pairId) internal pure {
        if (pairId >= PAIR_COUNT) revert InvalidPair();
    }

    function _activePool(uint8 pairId) internal view returns (Pool storage pool) {
        _validatePair(pairId);
        pool = pools[pairId];
        if (!pool.active) revert PoolNotActive(pairId);
    }

    function _activePoolView(uint8 pairId) internal view returns (Pool storage pool) {
        _validatePair(pairId);
        pool = pools[pairId];
        if (!pool.active) revert PoolNotActive(pairId);
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        require(value <= type(uint128).max, "Overflow");
        return uint128(value);
    }
}
