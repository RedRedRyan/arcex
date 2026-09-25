import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import PriceChart from "./PriceChart";
import { Pair } from "../types";

interface MarketCardProps {
  pair: Pair;
  onSpot: () => void;
  onFutures: () => void;
}

const SEED_META: Record<number, { change: string; positive: boolean; vol: string }> = {
  0: { change: "+2.34%", positive: true,  vol: "$4.2M" },
  1: { change: "-0.87%", positive: false, vol: "$1.8M" },
  2: { change: "+5.12%", positive: true,  vol: "$920K" },
};

export default function MarketCard({ pair, onSpot, onFutures }: MarketCardProps) {
  const meta = SEED_META[pair.id] ?? { change: "—", positive: true, vol: "—" };

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold display"
            style={{
              background: `${pair.color}1a`,
              color: pair.color,
              border: `1px solid ${pair.color}33`,
            }}
          >
            {pair.ticker.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold display text-sm" style={{ color: "var(--ink)" }}>
              {pair.ticker}<span style={{ color: "var(--subtle)" }}>/USDC</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>{pair.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular mono font-bold text-xl" style={{ color: "var(--ink)" }}>
            ${pair.seedPrice.toFixed(2)}
          </div>
          <div
            className="text-xs font-semibold flex items-center justify-end gap-1 mt-0.5"
            style={{ color: meta.positive ? "var(--success)" : "var(--danger)" }}
          >
            {meta.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {meta.change}
          </div>
        </div>
      </div>

      {/* Sparkline — lightweight-charts area, pair's own synthetic price data */}
      <div style={{ height: 90, overflow: "hidden" }}>
        <PriceChart
          seedPrice={pair.seedPrice}
          pairId={pair.id}
          variant="area"
          height={90}
          accentColor={pair.color}
        />
      </div>

      {/* Stats row */}
      <div
        className="mx-4 mb-3 px-3 py-2 rounded-xl grid grid-cols-2 gap-2 text-xs"
        style={{ background: "var(--surface-muted)" }}
      >
        <div>
          <span style={{ color: "var(--subtle)" }}>24h Vol</span>
          <div className="tabular mono font-medium mt-0.5" style={{ color: "var(--ink-2)" }}>{meta.vol}</div>
        </div>
        <div className="text-right">
          <span style={{ color: "var(--subtle)" }}>Oracle</span>
          <div className="tabular mono font-medium mt-0.5" style={{ color: "var(--ink-2)" }}>${pair.seedPrice}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <button
          onClick={onSpot}
          className="py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
          style={{
            background: "rgba(251,79,31,0.12)",
            color: "var(--accent)",
            border: "1px solid rgba(251,79,31,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,79,31,0.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(251,79,31,0.12)")}
        >
          Spot <ArrowRight size={13} />
        </button>
        <button
          onClick={onFutures}
          className="py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
          style={{
            background: "rgba(255,160,77,0.10)",
            color: "var(--sunset)",
            border: "1px solid rgba(255,160,77,0.22)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,160,77,0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,160,77,0.10)")}
        >
          Futures <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
