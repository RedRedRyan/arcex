import { useEffect, useRef, useMemo } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type AreaData,
  type Time,
} from "lightweight-charts";

// ── Synthetic price data generator ───────────────────────────────────────────
// Generates realistic-looking OHLCV candles seeded from the oracle price.
// Each pair gets its own deterministic random walk so charts look different.
function generateCandles(
  seedPrice: number,
  pairId: number,
  count = 200,
  intervalMs = 15 * 60 * 1000 // 15-min candles
): CandlestickData<Time>[] {
  // Simple seeded pseudo-random (mulberry32)
  let state = (seedPrice * 1000 + pairId * 7919 + 42) >>> 0;
  const rand = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };

  const volatility = seedPrice * 0.012; // 1.2% per candle
  const now = Math.floor(Date.now() / intervalMs) * intervalMs;
  const candles: CandlestickData<Time>[] = [];

  let price = seedPrice;

  for (let i = count; i >= 0; i--) {
    const t = (now - i * intervalMs) / 1000;
    // Drift + noise
    const drift = (rand() - 0.495) * volatility;
    price = Math.max(price + drift, seedPrice * 0.5);

    const range = rand() * volatility * 0.8;
    const open = price;
    const close = price + (rand() - 0.5) * range;
    const high = Math.max(open, close) + rand() * range * 0.4;
    const low = Math.min(open, close) - rand() * range * 0.4;

    candles.push({
      time: t as Time,
      open: parseFloat(open.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(Math.max(low, 0.0001).toFixed(4)),
      close: parseFloat(close.toFixed(4)),
    });

    price = close;
  }

  return candles;
}

function candlesToArea(candles: CandlestickData<Time>[]): AreaData<Time>[] {
  return candles.map((c) => ({ time: c.time, value: c.close }));
}

// ── Chart component ───────────────────────────────────────────────────────────
interface PriceChartProps {
  seedPrice: number;
  pairId: number;
  /** "candle" = full candlestick chart (trade pages), "area" = mini sparkline */
  variant?: "candle" | "area";
  height?: number;
  className?: string;
  accentColor?: string;
}

export default function PriceChart({
  seedPrice,
  pairId,
  variant = "candle",
  height = 420,
  className = "",
  accentColor = "#fb4f1f",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);

  const candles = useMemo(
    () => generateCandles(seedPrice, pairId),
    [seedPrice, pairId]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const bg = "#0a0f1a";
    const gridColor = "rgba(255,255,255,0.04)";
    const textColor = "#64748b";
    const borderColor = "rgba(255,255,255,0.07)";

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        vertLine: { color: "rgba(251,79,31,0.35)", labelBackgroundColor: "#fb4f1f" },
        horzLine: { color: "rgba(251,79,31,0.35)", labelBackgroundColor: "#fb4f1f" },
      },
      rightPriceScale: {
        borderColor,
        textColor,
        visible: variant === "candle",
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        visible: variant === "candle",
      },
      handleScroll: variant === "candle",
      handleScale: variant === "candle",
      width: el.clientWidth,
      height,
    });

    chartRef.current = chart;

    if (variant === "candle") {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#e86d7a",
        borderUpColor: "#22c55e",
        borderDownColor: "#e86d7a",
        wickUpColor: "rgba(34,197,94,0.7)",
        wickDownColor: "rgba(232,109,122,0.7)",
      });
      s.setData(candles);
      seriesRef.current = s;
      chart.timeScale().fitContent();
    } else {
      // Area sparkline
      const s = chart.addSeries(AreaSeries, {
        lineColor: accentColor,
        topColor: `${accentColor}30`,
        bottomColor: `${accentColor}00`,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(candlesToArea(candles));
      seriesRef.current = s;
      chart.timeScale().fitContent();
    }

    // Live price tick — update last candle every 5 seconds
    let tickTimer: ReturnType<typeof setInterval>;
    if (variant === "candle") {
      tickTimer = setInterval(() => {
        const last = candles[candles.length - 1];
        const noise = (Math.random() - 0.5) * seedPrice * 0.002;
        const newClose = parseFloat((last.close + noise).toFixed(4));
        const updated: CandlestickData<Time> = {
          ...last,
          close: newClose,
          high: Math.max(last.high, newClose),
          low: Math.min(last.low, newClose),
        };
        (seriesRef.current as ISeriesApi<"Candlestick">)?.update(updated);
      }, 5000);
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (el) chart.resize(el.clientWidth, height);
    });
    ro.observe(el);

    return () => {
      clearInterval(tickTimer);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, seedPrice, variant, height, accentColor]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height, background: "#0a0f1a" }}
    />
  );
}
