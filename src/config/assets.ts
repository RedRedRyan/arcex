/**
 * Asset metadata and shared icons.
 *
 * Chain-specific token addresses live in config/networks.ts alongside their
 * pair configuration so portfolio balances always match the active contracts.
 */

export interface AssetConfig {
  symbol: string;
  name: string;
  chainId: number;
  address: `0x${string}`;
  decimals: number;
  pairId: number;
}

/** Filters out any asset whose address has not been verified. */
export function enabledAssets(
  assets: readonly AssetConfig[],
): readonly AssetConfig[] {
  return assets.filter(
    (asset) => asset.address !== "0x0000000000000000000000000000000000000000",
  );
}

/** Central icon map; AssetIcon falls back to a lettered circle on load errors. */
export const ASSET_ICONS: Record<string, string> = {
  USDC: "/assets/icons/usdc.png",
  ETH: "/assets/icons/eth.png",
  WETH: "/assets/icons/eth.png",
  BTC: "/assets/icons/btc.png",
  SOL: "/assets/icons/sol.png",
  TECHx: "/assets/icons/tech.png",
  ENERGYx: "/assets/icons/energy.png",
  ARCx: "/assets/icons/arc.svg",
  ethereum: "/assets/icons/ethereum.png",
  base: "/assets/icons/base.png",
  arc: "/assets/icons/arc.svg",
  "arc-testnet": "/assets/icons/arc.svg",
  tech: "/assets/icons/tech.png",
  energy: "/assets/icons/energy.png",
  arcx: "/assets/icons/arc.svg",
};

/** Resolves an icon path for a chain id, for use in USDC rows. */
export function chainIcon(chainId: number): string | undefined {
  switch (chainId) {
    case 1:
      return ASSET_ICONS.ethereum;
    case 8453:
      return ASSET_ICONS.base;
    case 5042:
    case 5042002:
      return ASSET_ICONS.arc;
    default:
      return undefined;
  }
}
