import { Pair } from "../types";
import { usePoolFeed } from "../../data/OracleFeed";

interface OrderBookProps {
  pair: Pair;
}

function genOrders(mid: number, pairId: number, isBid: boolean) {
  return Array.from({ length: 8 }, (_, i) => {
    const spread = isBid ? -(i + 1) * mid * 0.0005 : (i + 1) * mid * 0.0005;
    const price = (mid + spread).toFixed(2);
    const size = (50 + ((i + 1) * (pairId + 3) * 37) % 500).toFixed(2);
    const total = (parseFloat(price) * parseFloat(size)).toFixed(0);
    return { price, size, total };
  });
}

export default function OrderBook({ pair }: OrderBookProps) {
  const feed = usePoolFeed(pair.id);
  const mid = feed.price;
  const asks = mid === null ? [] : genOrders(mid, pair.id, false).reverse();
  const bids = mid === null ? [] : genOrders(mid, pair.id, true);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold display" style={{ color: "var(--ink)" }}>Order Book</h3>
        <span className="text-xs" style={{ color: "var(--subtle)" }}>Synthetic (Testnet)</span>
      </div>

      <div className="grid grid-cols-3 text-xs mb-2 px-1" style={{ color: "var(--subtle)" }}>
        <span>Price (USDC)</span>
        <span className="text-right">Size ({pair.ticker})</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sells) */}
      <div className="space-y-0.5">
        {asks.map((o, i) => (
          <div key={i} className="grid grid-cols-3 text-xs px-1 py-0.5 rounded relative overflow-hidden">
            <div
              className="absolute right-0 top-0 bottom-0 opacity-10"
              style={{
                background: "var(--danger)",
                width: `${Math.min(100, (8 - i) * 11)}%`,
              }}
            />
            <span className="tabular mono relative z-10" style={{ color: "var(--danger)" }}>{o.price}</span>
            <span className="tabular mono text-right relative z-10" style={{ color: "var(--ink-2)" }}>{o.size}</span>
            <span className="tabular mono text-right relative z-10" style={{ color: "var(--subtle)" }}>{o.total}</span>
          </div>
        ))}
      </div>

      {/* Mid price */}
      <div
        className="my-2 py-2 text-center text-sm font-bold mono tabular rounded-lg"
        style={{ background: "var(--surface-muted)", color: "var(--accent)" }}
      >
        ${mid === null ? "—" : mid.toFixed(2)}
      </div>

      {/* Bids (buys) */}
      <div className="space-y-0.5">
        {bids.map((o, i) => (
          <div key={i} className="grid grid-cols-3 text-xs px-1 py-0.5 rounded relative overflow-hidden">
            <div
              className="absolute right-0 top-0 bottom-0 opacity-10"
              style={{
                background: "var(--success)",
                width: `${Math.min(100, (i + 1) * 11)}%`,
              }}
            />
            <span className="tabular mono relative z-10" style={{ color: "var(--success)" }}>{o.price}</span>
            <span className="tabular mono text-right relative z-10" style={{ color: "var(--ink-2)" }}>{o.size}</span>
            <span className="tabular mono text-right relative z-10" style={{ color: "var(--subtle)" }}>{o.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
