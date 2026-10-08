import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePriceFeed, type Candle } from "../../data/OracleFeed";

const toArea = (candle: Candle) => ({
  time: candle.time as UTCTimestamp,
  value: candle.close,
});

interface SparklineChartProps {
  pairId: number;
  height: number;
  lineColor: string;
}

export default function SparklineChart({
  pairId,
  height,
  lineColor,
}: SparklineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const epochRef = useRef(-1);
  const feed = usePriceFeed(pairId, "pool");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
        attributionLogo: false,
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
    epochRef.current = -1;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [lineColor]);

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
  }, [feed]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{ width: "100%", height, pointerEvents: "none" }}
    />
  );
}
