import React from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import SpotChartHeader from "@/components/spot/SpotChartHeader";
import LiquidityTable from "@/components/spot/LiquidityTable";
import SwapPanel from "@/components/spot/SwapPanel";
import {
  ADVANCED_CHART_WIDGET_CONFIG,
  MINI_CHART_WIDGET_CONFIG,
  SPOT_TRADING_PAIRS,
} from "@/lib/constants";

const scriptUrl = "https://s3.tradingview.com/external-embedding/embed-widget-";

const SpotTradingPage = () => {
  const asset = SPOT_TRADING_PAIRS[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: chart + liquidity sources */}
      <section className="flex flex-col gap-6 lg:col-span-2">
        <div className="rounded-2xl border border-white/5 bg-[#111111] p-5">
          <SpotChartHeader asset={asset} />
          <div className="md:col-span-1 xl:col-span-1">
            <TradingViewWidget
              scriptUrl={`${scriptUrl}advanced-chart.js`}
              config={ADVANCED_CHART_WIDGET_CONFIG}
              className="custom-chart"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#111111] p-5">
          <LiquidityTable />
        </div>
      </section>

      {/* Right: buy/sell panel */}
      <section className="lg:col-span-1">
        <SwapPanel asset={asset} />
      </section>
    </div>
  );
};

export default SpotTradingPage;
