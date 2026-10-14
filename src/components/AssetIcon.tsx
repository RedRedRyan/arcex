/**
 * AssetIcon — renders an asset or chain icon, falling back to a neutral
 * lettered circle when the image is missing or fails to load.
 *
 * Use everywhere an icon is shown (asset cards, USDC rows, dropdown) so a
 * missing file never renders a broken-image glyph.
 */

import { useState } from "react";
import { ASSET_ICONS } from "../config/assets";

export interface AssetIconProps {
  /** Ticker ("ETH") or icon key ("ethereum", "arc", "tech"). */
  symbol: string;
  /** Pixel size for both width and height. */
  size?: number;
  /** Extra classes. */
  className?: string;
}

export function AssetIcon({ symbol, size = 32, className = "" }: AssetIconProps) {
  const src = ASSET_ICONS[symbol] ?? ASSET_ICONS[symbol.toLowerCase()];

  // Derived during render, not in an effect: when the symbol changes the
  // fallback resets, so a new icon always gets a fresh load attempt.
  const [lastFailed, setFailed] = useState<string | null>(null);
  const failed = lastFailed === symbol;

  const dimension = { width: size, height: size };

  if (!src || failed) {
    const letter = symbol.trim().charAt(0).toUpperCase() || "?";
    return (
      <span
        className={`inline-grid shrink-0 place-items-center rounded-full font-semibold ${className}`}
        style={{
          ...dimension,
          background: "rgba(255,255,255,0.08)",
          color: "var(--ink-2)",
          fontSize: Math.max(10, Math.round(size * 0.42)),
        }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(symbol)}
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={dimension}
    />
  );
}

export default AssetIcon;
