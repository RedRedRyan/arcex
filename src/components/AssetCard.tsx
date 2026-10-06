import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Pair } from "../types";
import {
  useOracleFeed,
  usePoolFeed,
  usePriceFeed,
  formatPrice,
  type Candle,
  type FeedSource,
} from "../../data/OracleFeed";

/* ────────────────────────────────────────────────────────────────────────────
   Sparkline: tiny, transparent, non-interactive lightweight-charts area chart
   ──────────────────────────────────────────────────────────────────────────── */

const toArea = (c: Candle) => ({
  time: c.time as UTCTimestamp,
  value: c.close,
});

interface SparklineProps {
  pairId: number;
  source: FeedSource;
  height: number;
  lineColor: string;
}

const Sparkline = ({ pairId, source, height, lineColor }: SparklineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const epochRef = useRef(-1);
  const feed = usePriceFeed(pairId, source);

  // Create the chart once per (pair, source, color); destroy on cleanup.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        // Transparent so the card's glass background shows through
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
        attributionLogo: false, // keep a TradingView attribution link elsewhere on the page
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: { mode: CrosshairMode.Hidden },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        visible: false,
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      timeScale: {
        visible: false,
        rightOffset: 0,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      // Non-interactive: no panning, zooming or touch scrolling
      handleScroll: false,
      handleScale: false,
    });

    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: "rgba(255,255,255,0.25)",
      bottomColor: "rgba(255,255,255,0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    epochRef.current = -1; // force a setData on the next feed effect

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [pairId, source, lineColor]);

  // Full setData when the candle set was rebuilt, update() on each tick.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (feed.epoch !== epochRef.current) {
      series.setData(feed.candles.map(toArea));
      chart.timeScale().fitContent();
      epochRef.current = feed.epoch;
      return;
    }

    if (feed.last) series.update(toArea(feed.last));
  }, [feed, pairId, source, lineColor]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{ width: "100%", height, pointerEvents: "none" }}
    />
  );
};

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
  const oracle = useOracleFeed(pair.id);

  // Spot (pool) price is the market price; fall back to the oracle if the pool is unavailable.
  const fromPool = pool.price !== null;
  const feed = fromPool ? pool : oracle;
  const change = feed.changePct24h;
  const positive = (change ?? 0) >= 0;

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
      <div className="relative">
        <Sparkline
          pairId={pair.id}
          source={fromPool ? "pool" : "oracle"}
          height={chartHeight}
          lineColor={lineColor}
        />
      </div>

      {/* Bottom row: live price · token badge · 24h change */}
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">Live price</div>
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
