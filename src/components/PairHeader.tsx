import { PAIRS } from "../constants";
import { PairId } from "../types";
import { useOracleFeed, usePoolFeed, formatPrice } from "../../data/OracleFeed";

interface PairHeaderProps {
  activePair: PairId;
  setActivePair: (id: PairId) => void;
  mode: "Spot" | "Futures";
}

export default function PairHeader({
  activePair,
  setActivePair,
  mode,
}: PairHeaderProps) {
  const pair = PAIRS[activePair];
  const oracle = useOracleFeed(pair.id);
  const pool = usePoolFeed(pair.id);

  // Spot trades against the pool; perps mark against the oracle.
  const primary = mode === "Spot" ? pool : oracle;
  const price = primary.price;
  const change = primary.changePct24h;
  const positive = (change ?? 0) >= 0;

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-3"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {/* Mode badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
        style={{
          background:
            mode === "Spot" ? "rgba(251,79,31,0.12)" : "rgba(255,160,77,0.12)",
          color: mode === "Spot" ? "var(--accent)" : "var(--sunset)",
          border: `1px solid ${mode === "Spot" ? "rgba(251,79,31,0.25)" : "rgba(255,160,77,0.22)"}`,
        }}
      >
        {mode}
      </span>

      {/* Pair tabs */}
      <div className="flex items-center gap-1">
        {PAIRS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePair(p.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
            style={{
              background:
                activePair === p.id ? "rgba(251,79,31,0.12)" : "transparent",
              color: activePair === p.id ? "var(--ink)" : "var(--subtle)",
              border:
                activePair === p.id
                  ? "1px solid rgba(251,79,31,0.25)"
                  : "1px solid transparent",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: p.color }}
            />
            {p.ticker}/USDC
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Price stats */}
      <div className="flex items-center gap-5">
        <div>
          <div
            className="tabular mono font-bold text-lg display"
            style={{ color: "var(--ink)" }}
          >
            ${formatPrice(price)}
          </div>
          <div
            className="text-xs flex items-center gap-1 mt-0.5"
            style={{
              color:
                change === null
                  ? "var(--subtle)"
                  : positive
                    ? "var(--success)"
                    : "var(--danger)",
            }}
          >
            {change === null
              ? "—"
              : `${positive ? "+" : ""}${change.toFixed(2)}%`}{" "}
            <span style={{ color: "var(--subtle)" }}>24h</span>
          </div>
        </div>
        <StatPill label="24h High" value={`$${formatPrice(primary.high24h)}`} />
        <StatPill label="24h Low" value={`$${formatPrice(primary.low24h)}`} />
        {mode === "Futures" && (
          <StatPill
            label="Spot (pool)"
            value={`$${formatPrice(pool.price)}`}
            accent
          />
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="hidden lg:block">
      <div className="text-xs" style={{ color: "var(--subtle)" }}>
        {label}
      </div>
      <div
        className="tabular mono text-sm font-semibold mt-0.5"
        style={{ color: accent ? "var(--accent)" : "var(--ink-2)" }}
      >
        {value}
      </div>
    </div>
  );
}
