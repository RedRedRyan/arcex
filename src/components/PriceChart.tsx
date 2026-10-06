import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  usePriceFeed,
  pricePrecision,
  type Candle,
  type FeedSource,
} from "../../data/OracleFeed";

interface PriceChartProps {
  pairId: number;
  /** "candle" = full candlestick chart (trade pages), "area" = mini sparkline */
  variant?: "candle" | "area";
  /** Pixels, or any CSS size such as "100%" to fill the parent. */
  height?: number | string;
  className?: string;
  accentColor?: string;
  /** Used only to size the price axis before the first read lands. */
  seedPrice?: number;
  /** "pool" = spot AMM price (moves on swaps); "oracle" = admin oracle (perp mark price). */
  source?: FeedSource;
}

const BG = "#0a0f1a";

const toCandle = (c: Candle) => ({
  time: c.time as UTCTimestamp,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
});
const toArea = (c: Candle) => ({
  time: c.time as UTCTimestamp,
  value: c.close,
});

export default function PriceChart({
  pairId,
  variant = "candle",
  height = 420,
  className = "",
  accentColor = "#fb4f1f",
  seedPrice,
  source = "oracle",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<
    ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null
  >(null);
  const epochRef = useRef(-1);
  const feed = usePriceFeed(pairId, source);
  const isCandle = variant === "candle";

  // Create the chart once per (variant, height, accent); destroy on cleanup.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const textColor = "#64748b";
    const borderColor = "rgba(255,255,255,0.07)";
    const precision = pricePrecision(seedPrice);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: isCandle ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: {
          color: "rgba(251,79,31,0.35)",
          labelBackgroundColor: "#fb4f1f",
        },
        horzLine: {
          color: "rgba(251,79,31,0.35)",
          labelBackgroundColor: "#fb4f1f",
        },
      },
      rightPriceScale: { borderColor, visible: isCandle },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        visible: isCandle,
      },
      handleScroll: isCandle,
      handleScale: isCandle,
    });

    if (isCandle) {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#e86d7a",
        borderUpColor: "#22c55e",
        borderDownColor: "#e86d7a",
        wickUpColor: "rgba(34,197,94,0.7)",
        wickDownColor: "rgba(232,109,122,0.7)",
        priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
      });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: accentColor,
        topColor: `${accentColor}30`,
        bottomColor: `${accentColor}00`,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }

    chartRef.current = chart;
    epochRef.current = -1; // force a setData on the next feed effect

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isCandle, height, accentColor, seedPrice, pairId, source]);

  // Push feed data: full setData when the set was rebuilt, update() per tick.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (feed.epoch !== epochRef.current) {
      if (isCandle) {
        const s = series as ISeriesApi<"Candlestick">;
        s.setData(feed.candles.map(toCandle));
        const p = pricePrecision(feed.price);
        s.applyOptions({
          priceFormat: { type: "price", precision: p, minMove: 1 / 10 ** p },
        });
      } else {
        (series as ISeriesApi<"Area">).setData(feed.candles.map(toArea));
      }
      chart.timeScale().fitContent();
      epochRef.current = feed.epoch;
      return;
    }

    if (feed.last) {
      if (isCandle)
        (series as ISeriesApi<"Candlestick">).update(toCandle(feed.last));
      else (series as ISeriesApi<"Area">).update(toArea(feed.last));
    }
  }, [feed, isCandle, height, accentColor, seedPrice]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height, background: BG }}
    />
  );
}
