// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only mintable ERC-20 deployed by TokenFactory.
contract FactoryToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Permissionless token factory. Anyone can deploy an ERC-20 (the
///         full initial supply is minted to the creator) and attach optional
///         metadata used by the frontend's create-token and share pages.
///         A per-creator cooldown rate-limits creation without capping it.
/// @dev    Not audited for production.
contract TokenFactory is Ownable {
    /// @notice Seconds a creator must wait between creations. The owner can
    ///         raise or lower it (e.g. 0 to disable).
    uint256 public creationCooldown = 1 hours;

    struct TokenInfo {
        address token;
        address creator;
        string name;
        string symbol;
        uint8 decimals;
        uint256 initialSupply;
        string imageURI;
        string description;
        uint256 createdAt;
    }

    address[] public tokens;
    mapping(address => TokenInfo) public tokenInfo;
    mapping(address => uint256) public lastCreatedAt;
    mapping(address => bool) public hasCreated;

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint8 decimals,
        uint256 initialSupply,
        string imageURI,
        string description
    );
    event CreationCooldownUpdated(uint256 previousSeconds, uint256 newSeconds);

    error CooldownActive(uint256 nextAllowedAt);
    error ZeroAddressCreator();
    error InvalidName();
    error InvalidSymbol();
    error InvalidDecimals(uint8 decimals);
    error ZeroSupply();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deploy a new ERC-20. `initialSupply` is denominated in the
    ///         token's own smallest unit (i.e. already scaled by `decimals`)
    ///         and is minted in full to `msg.sender`.
    /// @param name_         Human-readable token name (non-empty).
    /// @param symbol_       Ticker (non-empty).
    /// @param decimals_     0-18; 18 recommended to match the seed tokens.
    /// @param initialSupply Supply in base units, minted to the creator.
    /// @param imageURI      Optional logo URL (may be empty).
    /// @param description   Optional free-text description (may be empty).
    function createToken(
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        string calldata imageURI,
        string calldata description
    ) external returns (address token) {
        _checkCooldown(msg.sender);

        if (bytes(name_).length == 0) revert InvalidName();
        if (bytes(symbol_).length == 0) revert InvalidSymbol();
        if (decimals_ > 18) revert InvalidDecimals(decimals_);
        if (initialSupply == 0) revert ZeroSupply();

        FactoryToken newToken = new FactoryToken(name_, symbol_, decimals_);
        newToken.mint(msg.sender, initialSupply);
        token = address(newToken);

        lastCreatedAt[msg.sender] = block.timestamp;
        hasCreated[msg.sender] = true;
        tokens.push(token);
        tokenInfo[token] = TokenInfo({
            token: token,
            creator: msg.sender,
            name: name_,
            symbol: symbol_,
            decimals: decimals_,
            initialSupply: initialSupply,
            imageURI: imageURI,
            description: description,
            createdAt: block.timestamp
        });

        emit TokenCreated(
            token,
            msg.sender,
            name_,
            symbol_,
            decimals_,
            initialSupply,
            imageURI,
            description
        );
    }

    /// @notice Number of tokens ever created by this factory.
    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Timestamp after which `creator` may create again; 0 if they
    ///         have never created anything.
    function nextCreationAllowedAt(address creator) external view returns (uint256) {
        if (!hasCreated[creator]) return 0;
        return lastCreatedAt[creator] + creationCooldown;
    }

    function setCreationCooldown(uint256 seconds_) external onlyOwner {
        emit CreationCooldownUpdated(creationCooldown, seconds_);
        creationCooldown = seconds_;
    }

    function _checkCooldown(address creator) internal view {
        if (creator == address(0)) revert ZeroAddressCreator();
        if (!hasCreated[creator]) return;
        uint256 nextAllowed = lastCreatedAt[creator] + creationCooldown;
        if (block.timestamp < nextAllowed) revert CooldownActive(nextAllowed);
    }
}
