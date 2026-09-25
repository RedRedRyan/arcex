import React from "react";
import {
  LIQUIDITY_TABLE_HEADER,
  MOCK_LIQUIDITY_SOURCES,
  STATUS_BADGE_STYLES,
} from "@/lib/constants";

const LiquidityTable = () => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400">
            {LIQUIDITY_TABLE_HEADER.map((h) => (
              <th key={h} className="pb-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_LIQUIDITY_SOURCES.map((row) => (
            <tr key={row.source} className="border-t border-white/5">
              <td className="flex items-center gap-2 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5">
                  {row.logo}
                </span>
                {row.source}
              </td>
              <td className="py-3">{row.price.toLocaleString()}</td>
              <td className="py-3">{row.amount}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[row.status]}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="py-3">{row.volume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LiquidityTable;
