import { lazy, Suspense } from "react";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Pair } from "../types";
import { usePoolFeed, formatPrice } from "../../data/OracleFeed";

const PriceChart = lazy(() => import("./PriceChart"));

interface MarketCardProps {
  pair: Pair;
  onSpot: () => void;
  onFutures: () => void;
}

export default function MarketCard({
  pair,
  onSpot,
  onFutures,
}: MarketCardProps) {
  const pool = usePoolFeed(pair.id);

  const price = pool.price;
  const change = pool.changePct24h;
  const positive = (change ?? 0) >= 0;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
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
            <div
              className="font-semibold display text-sm"
              style={{ color: "var(--ink)" }}
            >
              {pair.ticker}
              <span style={{ color: "var(--subtle)" }}>/USDC</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
              {pair.name}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="tabular mono font-bold text-xl"
            style={{ color: "var(--ink)" }}
          >
            ${formatPrice(price)}
          </div>
          <div
            className="text-xs font-semibold flex items-center justify-end gap-1 mt-0.5"
            style={{
              color:
                change === null
                  ? "var(--subtle)"
                  : positive
                    ? "var(--success)"
                    : "var(--danger)",
            }}
          >
            {change !== null &&
              (positive ? (
                <TrendingUp size={11} />
              ) : (
                <TrendingDown size={11} />
              ))}
            {change === null
              ? "—"
              : `${positive ? "+" : ""}${change.toFixed(2)}%`}
            <span style={{ color: "var(--subtle)", fontWeight: 400 }}>24h</span>
          </div>
        </div>
      </div>

      {/* Live sparkline — lightweight-charts area series on the same source as the price above */}
      <div style={{ height: 90, overflow: "hidden" }}>
        <Suspense fallback={<div className="h-[90px] animate-pulse bg-white/5" />}>
          <PriceChart
            pairId={pair.id}
            variant="area"
            source="pool"
            height={90}
            accentColor={pair.color}
          />
        </Suspense>
      </div>

      {/* Stats row */}
      <div
        className="mx-4 mb-3 px-3 py-2 rounded-xl grid grid-cols-3 gap-2 text-xs"
        style={{ background: "var(--surface-muted)" }}
      >
        <div>
          <span style={{ color: "var(--subtle)" }}>24h Low</span>
          <div
            className="tabular mono font-medium mt-0.5"
            style={{ color: "var(--ink-2)" }}
          >
            ${formatPrice(pool.low24h)}
          </div>
        </div>

        <div className="text-right">
          <span style={{ color: "var(--subtle)" }}>24h High</span>
          <div
            className="tabular mono font-medium mt-0.5"
            style={{ color: "var(--ink-2)" }}
          >
            ${formatPrice(pool.high24h)}
          </div>
        </div>
        <div className="text-right">
          <span style={{ color: "var(--subtle)" }}>24h Volume</span>
          <div
            className="tabular mono font-medium mt-0.5"
            style={{ color: "var(--ink-2)" }}
          >
            $
            {pool.volume24h.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </div>
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
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(251,79,31,0.2)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(251,79,31,0.12)")
          }
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
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,160,77,0.18)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(255,160,77,0.10)")
          }
        >
          Futures <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
