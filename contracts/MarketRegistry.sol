// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  MarketRegistry
 * @notice Per-market configuration, pause flags, and role-based access control
 *         for the arcex protocol.
 *
 * Roles
 * ─────
 *   DEFAULT_ADMIN_ROLE  — can grant / revoke every role; held by Timelock.
 *   ADMIN_ROLE          — can update market config (requires Timelock delay).
 *   PAUSER_ROLE         — can toggle market/global pause instantly (e.g. a keeper).
 *
 * Market config changes go through `setMarketConfig` which enforces the
 * ADMIN_ROLE. The admin address is the multisig-controlled Timelock, so every
 * parameter change has a mandatory time delay before execution.
 *
 * Pause toggles are callable by PAUSER_ROLE directly so emergency stops can
 * happen in one transaction without a Timelock delay.
 */
contract MarketRegistry is AccessControl {
    // ── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ── Market parameters ─────────────────────────────────────────────────────

    uint8 public constant MAX_PAIR_ID = 2;

    /// @dev Hard cap on entry fee to prevent governance from setting > 10%
    uint256 public constant ENTRY_FEE_BPS_CAP = 1_000; // 10%

    /// @dev Hard cap on max leverage. Launch default must be ≤ 5; cap lets
    ///      governance raise it only up to this ceiling via Timelock.
    uint8 public constant MAX_LEVERAGE_CAP = 100;

    struct MarketConfig {
        /// @notice Entry fee in basis points (e.g. 10 = 0.10%). Hard-capped at 10%.
        uint256 entryFeeBps;
        /// @notice Maximum leverage allowed for new positions.
        uint8   maxLeverage;
        /// @notice Maximum aggregate open interest in ERC-20 USDC units (6 dec).
        uint256 oiCap;
        /// @notice Minimum price increment (oracle 8-dec units).
        uint256 tickSize;
        /// @notice Minimum order size in base token units (18 dec).
        uint256 lotSize;
        /// @notice Whether this specific market is paused.
        bool    paused;
    }

    mapping(uint8 => MarketConfig) private _configs;

    /// @notice Protocol-wide pause; when true every market is halted.
    bool public globalPaused;

    // ── Errors ────────────────────────────────────────────────────────────────

    error GloballyPaused();
    error MarketPaused(uint8 pairId);
    error InvalidPairId(uint8 pairId);
    error InvalidFeeBps(uint256 feeBps);
    error InvalidLeverage(uint8 maxLeverage);
    error ZeroOiCap();
    error ZeroTickSize();
    error ZeroLotSize();
    error CallerNotAdmin();

    // ── Events ────────────────────────────────────────────────────────────────

    /// @notice Emitted whenever a market's configuration is updated.
    event MarketConfigUpdated(
        uint8   indexed pairId,
        uint256 entryFeeBps,
        uint8   maxLeverage,
        uint256 oiCap
    );

    /// @notice Emitted whenever a per-market pause flag changes.
    event MarketPauseToggled(uint8 indexed pairId, bool paused);

    /// @notice Emitted whenever the protocol-wide pause flag changes.
    event GlobalPauseToggled(bool paused);

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param admin_    Multisig / Timelock address that becomes DEFAULT_ADMIN_ROLE
     *                  and ADMIN_ROLE. Never pass address(0).
     * @param pauser_   Address that becomes PAUSER_ROLE (can be a keeper or the
     *                  same multisig; never address(0)).
     *
     * Default market configs (conservative launch values — Timelock required to change):
     *   entryFeeBps  = 10  (0.10%)
     *   maxLeverage  = 5   (5×)
     *   oiCap        = 5_000_000_000_000  (5 000 000 USDC, 6 dec)
     *   tickSize     = 1_000_000          (0.01 USDC in 8-dec oracle units)
     *   lotSize      = 1e15               (0.001 base token)
     */
    constructor(address admin_, address pauser_) {
        require(admin_  != address(0), "MarketRegistry: admin is zero");
        require(pauser_ != address(0), "MarketRegistry: pauser is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE,  admin_);
        _grantRole(PAUSER_ROLE, pauser_);

        // Seed default config for pairs 0, 1, 2
        for (uint8 i = 0; i <= MAX_PAIR_ID; i++) {
            _configs[i] = MarketConfig({
                entryFeeBps: 10,
                maxLeverage: 5,
                oiCap:       5_000_000_000_000,
                tickSize:    1_000_000,
                lotSize:     1e15,
                paused:      false
            });
        }
    }

    // ── Admin — config (ADMIN_ROLE, routed through Timelock) ─────────────────

    /**
     * @notice Update the configuration for a specific market.
     * @dev    Only callable by ADMIN_ROLE. In production the admin is the Timelock,
     *         so every call carries the Timelock's mandatory delay.
     */
    function setMarketConfig(
        uint8   pairId,
        uint256 entryFeeBps,
        uint8   maxLeverage,
        uint256 oiCap,
        uint256 tickSize,
        uint256 lotSize
    ) external onlyRole(ADMIN_ROLE) {
        _assertValidPair(pairId);
        if (entryFeeBps > ENTRY_FEE_BPS_CAP) revert InvalidFeeBps(entryFeeBps);
        if (maxLeverage == 0 || maxLeverage > MAX_LEVERAGE_CAP) revert InvalidLeverage(maxLeverage);
        if (oiCap    == 0) revert ZeroOiCap();
        if (tickSize == 0) revert ZeroTickSize();
        if (lotSize  == 0) revert ZeroLotSize();

        MarketConfig storage cfg = _configs[pairId];
        cfg.entryFeeBps = entryFeeBps;
        cfg.maxLeverage = maxLeverage;
        cfg.oiCap       = oiCap;
        cfg.tickSize    = tickSize;
        cfg.lotSize     = lotSize;

        emit MarketConfigUpdated(pairId, entryFeeBps, maxLeverage, oiCap);
    }

    // ── Pauser — pause toggles (PAUSER_ROLE, no Timelock delay) ──────────────

    /**
     * @notice Toggle the protocol-wide pause flag.
     *         When `paused = true` every market is halted regardless of per-market flags.
     */
    function setGlobalPause(bool paused) external onlyRole(PAUSER_ROLE) {
        globalPaused = paused;
        emit GlobalPauseToggled(paused);
    }

    /**
     * @notice Toggle the pause flag for a specific market.
     */
    function setMarketPause(uint8 pairId, bool paused) external onlyRole(PAUSER_ROLE) {
        _assertValidPair(pairId);
        _configs[pairId].paused = paused;
        emit MarketPauseToggled(pairId, paused);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Returns the full config struct for a market.
     */
    function getMarketConfig(uint8 pairId) external view returns (MarketConfig memory) {
        _assertValidPair(pairId);
        return _configs[pairId];
    }

    /**
     * @notice Returns individual config fields for a market (gas-efficient for callers
     *         that only need specific fields via struct destructuring).
     */
    function getMarketParams(uint8 pairId)
        external
        view
        returns (
            uint256 entryFeeBps,
            uint8   maxLeverage,
            uint256 oiCap,
            uint256 tickSize,
            uint256 lotSize,
            bool    paused
        )
    {
        _assertValidPair(pairId);
        MarketConfig storage cfg = _configs[pairId];
        return (cfg.entryFeeBps, cfg.maxLeverage, cfg.oiCap, cfg.tickSize, cfg.lotSize, cfg.paused);
    }

    /**
     * @notice Reverts if trading on `pairId` is currently not permitted.
     *         Intended to be called at the start of every state-changing protocol function.
     */
    function assertNotPaused(uint8 pairId) external view {
        if (globalPaused) revert GloballyPaused();
        _assertValidPair(pairId);
        if (_configs[pairId].paused) revert MarketPaused(pairId);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _assertValidPair(uint8 pairId) internal pure {
        if (pairId > MAX_PAIR_ID) revert InvalidPairId(pairId);
    }
}
