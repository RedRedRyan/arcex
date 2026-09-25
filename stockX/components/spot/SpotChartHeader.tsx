"use client";
import React from "react";
import { ChevronDown, RefreshCcw, Camera, Settings2 } from "lucide-react";

interface SpotChartHeaderProps {
  asset: { ticker: string; name: string; quote: string; type: string };
}

const SpotChartHeader = ({ asset }: SpotChartHeaderProps) => {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 hover:bg-white/10">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A1A1A] text-xs font-semibold">
          {asset.ticker.slice(0, 2)}
        </span>
        <span className="font-semibold text-lg">
          {asset.ticker}/{asset.quote}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
          {asset.type}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      <div className="flex items-center gap-2 text-gray-400">
        <button className="rounded-md p-1.5 hover:bg-white/5">
          <RefreshCcw className="h-4 w-4" />
        </button>
        <button className="rounded-md p-1.5 hover:bg-white/5">
          <Camera className="h-4 w-4" />
        </button>
        <button className="rounded-md p-1.5 hover:bg-white/5">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default SpotChartHeader;
