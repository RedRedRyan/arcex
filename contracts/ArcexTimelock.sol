// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title  ArcexTimelock
 * @notice Thin wrapper around OpenZeppelin TimelockController that enforces
 *         a minimum delay before admin operations (market config changes,
 *         role grants, fee updates) can execute.
 *
 * Roles (inherited from TimelockController)
 * ──────────────────────────────────────────
 *   PROPOSER_ROLE  — can queue operations.
 *   CANCELLER_ROLE — can cancel queued operations.
 *   EXECUTOR_ROLE  — can execute ready operations (address(0) = open execution).
 *   DEFAULT_ADMIN_ROLE — can manage roles; should be renounced after setup.
 *
 * Launch parameters
 * ─────────────────
 *   minDelay = 24 hours  (governance can extend; hard floor enforced here)
 *
 * In production:
 *   proposers  = [multisig]
 *   executors  = [address(0)] (anyone can execute after delay — saves a tx)
 *   admin      = address(0)  (renounce DEFAULT_ADMIN_ROLE in constructor so
 *                              the multisig itself cannot bypass the delay)
 */
contract ArcexTimelock is TimelockController {
    /// @dev Minimum allowable delay — prevents governance from setting delay to 0.
    uint256 public constant MINIMUM_DELAY = 1 hours;

    error DelayTooShort(uint256 provided, uint256 minimum);

    /**
     * @param minDelay_   Delay in seconds before queued operations can execute.
     *                    Must be >= MINIMUM_DELAY (1 hour). Launch default: 24 hours.
     * @param proposers_  Accounts authorised to queue operations (should be multisig).
     * @param executors_  Accounts authorised to execute (pass address(0) for open execution).
     * @param admin_      Account that gets DEFAULT_ADMIN_ROLE. Pass address(0) to renounce
     *                    immediately (recommended for production so no EOA can bypass delay).
     */
    constructor(
        uint256 minDelay_,
        address[] memory proposers_,
        address[] memory executors_,
        address admin_
    ) TimelockController(minDelay_, proposers_, executors_, admin_) {
        if (minDelay_ < MINIMUM_DELAY) revert DelayTooShort(minDelay_, MINIMUM_DELAY);
    }
}
