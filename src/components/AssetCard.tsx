import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { Pair } from "../types";
import { usePoolFeed, formatPrice } from "../../data/OracleFeed";

const Sparkline = lazy(() => import("./SparklineChart"));

/* ────────────────────────────────────────────────────────────────────────────
   AssetCard
   ──────────────────────────────────────────────────────────────────────────── */

interface AssetCardProps {
  pair: Pair;
  /** Where the arrow button goes. Defaults to spot trading for this pair. */
  to?: string;
  /** Sparkline height in px. */
  chartHeight?: number;
  /** Sparkline line color (any CSS color). */
  lineColor?: string;
  className?: string;
}

const AssetCard = ({
  pair,
  to,
  chartHeight = 96,
  lineColor = "#ffffff",
  className = "",
}: AssetCardProps) => {
  const pool = usePoolFeed(pair.id);
  const feed = pool;
  const chartContainer = useRef<HTMLDivElement>(null);
  const [chartVisible, setChartVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const change = feed.changePct24h;
  const positive = (change ?? 0) >= 0;

  useEffect(() => {
    const element = chartContainer.current;
    if (!element || chartVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setChartVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [chartVisible]);

  return (
    <div
      className={`relative flex min-h-[200px] w-full flex-col justify-between gap-2 overflow-hidden rounded-[28px] border border-white/20 bg-white/[0.07] p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}
    >
      {/* Glass sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/15 via-transparent to-transparent"
      />

      {/* Top row: token pair + arrow to spot trading */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-md xl:text-lg font-medium leading-snug text-white/90">
            {pair.ticker}
            <span className="text-white/50">/USDC</span>
          </p>
          <p className="text-sm text-white/60">{pair.name}</p>
        </div>

        <Link
          to={to ?? `/spot?pair=${pair.id}`}
          aria-label={`Trade ${pair.ticker}/USDC on spot`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>

      {/* Middle: small, non-interactive chart */}
      <div ref={chartContainer} className="relative">
        {chartVisible ? (
          <Suspense
            fallback={
              <div
                aria-hidden
                className="animate-pulse rounded-md bg-white/5"
                style={{ width: "100%", height: chartHeight }}
              />
            }
          >
            <Sparkline
              pairId={pair.id}
              height={chartHeight}
              lineColor={lineColor}
            />
          </Suspense>
        ) : (
          <div
            aria-hidden
            className="animate-pulse rounded-md bg-white/5"
            style={{ width: "100%", height: chartHeight }}
          />
        )}
      </div>

      {/* Bottom row: live price · token badge · 24h change */}
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            Live price
            {feed.status === "error" && (
              <span className="text-orange-300">Reconnecting…</span>
            )}
          </div>
          <div className="tabular mono text-lg font-semibold">
            ${formatPrice(feed.price)}
          </div>
        </div>

        <div
          className="flex items-center gap-1 text-base font-semibold"
          style={{
            color:
              change === null
                ? "rgba(255,255,255,0.6)"
                : positive
                  ? "var(--success)"
                  : "var(--danger)",
          }}
        >
          {change !== null &&
            (positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
          {change === null
            ? "—"
            : `${positive ? "+" : ""}${change.toFixed(2)}%`}
        </div>
      </div>
    </div>
  );
};

export default AssetCard;
