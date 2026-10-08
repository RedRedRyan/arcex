/**
 * ABI for MarketRegistry.sol
 * Auto-updated by: bun run packages/shared/scripts/export-abis.ts
 */
export const MarketRegistryAbi = [
  // ── Errors ──────────────────────────────────────────────────────────────
  { type: "error", name: "GloballyPaused", inputs: [] },
  { type: "error", name: "MarketPaused", inputs: [{ name: "pairId", type: "uint8" }] },
  { type: "error", name: "InvalidPairId", inputs: [{ name: "pairId", type: "uint8" }] },
  { type: "error", name: "InvalidFeeBps", inputs: [{ name: "feeBps", type: "uint256" }] },
  { type: "error", name: "InvalidLeverage", inputs: [{ name: "maxLeverage", type: "uint8" }] },
  { type: "error", name: "ZeroOiCap", inputs: [] },
  { type: "error", name: "ZeroTickSize", inputs: [] },
  { type: "error", name: "ZeroLotSize", inputs: [] },
  { type: "error", name: "CallerNotAdmin", inputs: [] },
  { type: "error", name: "TimelockRequired", inputs: [] },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    type: "event", name: "MarketConfigUpdated",
    inputs: [
      { name: "pairId", type: "uint8", indexed: true },
      { name: "entryFeeBps", type: "uint256", indexed: false },
      { name: "maxLeverage", type: "uint8", indexed: false },
      { name: "oiCap", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "MarketPauseToggled",
    inputs: [
      { name: "pairId", type: "uint8", indexed: true },
      { name: "paused", type: "bool", indexed: false },
    ],
  },
  {
    type: "event", name: "GlobalPauseToggled",
    inputs: [{ name: "paused", type: "bool", indexed: false }],
  },
  {
    type: "event", name: "RoleGranted",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
  },
  {
    type: "event", name: "RoleRevoked",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
  },
  // ── Functions ────────────────────────────────────────────────────────────
  {
    type: "function", name: "ADMIN_ROLE",
    inputs: [], outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "PAUSER_ROLE",
    inputs: [], outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "globalPaused",
    inputs: [], outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "setGlobalPause",
    inputs: [{ name: "paused", type: "bool" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setMarketPause",
    inputs: [{ name: "pairId", type: "uint8" }, { name: "paused", type: "bool" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setMarketConfig",
    inputs: [
      { name: "pairId", type: "uint8" },
      { name: "entryFeeBps", type: "uint256" },
      { name: "maxLeverage", type: "uint8" },
      { name: "oiCap", type: "uint256" },
      { name: "tickSize", type: "uint256" },
      { name: "lotSize", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getMarketConfig",
    inputs: [{ name: "pairId", type: "uint8" }],
    outputs: [
      { name: "entryFeeBps", type: "uint256" },
      { name: "maxLeverage", type: "uint8" },
      { name: "oiCap", type: "uint256" },
      { name: "tickSize", type: "uint256" },
      { name: "lotSize", type: "uint256" },
      { name: "paused", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "assertNotPaused",
    inputs: [{ name: "pairId", type: "uint8" }],
    outputs: [],
    stateMutability: "view",
  },
  {
    type: "function", name: "hasRole",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "grantRole",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "revokeRole",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
