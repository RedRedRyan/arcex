import { ChevronDown } from "lucide-react";
import { PAIRS } from "../constants";
import { PairId } from "../types";

interface PairHeaderProps {
  activePair: PairId;
  setActivePair: (id: PairId) => void;
  mode: "Spot" | "Futures";
}

export default function PairHeader({ activePair, setActivePair, mode }: PairHeaderProps) {
  const pair = PAIRS[activePair];
  const SEED = [150, 75, 25];
  const price = SEED[activePair] ?? 100;

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-3"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Mode badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
        style={{
          background: mode === "Spot" ? "rgba(251,79,31,0.12)" : "rgba(255,160,77,0.12)",
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
              background: activePair === p.id ? "rgba(251,79,31,0.12)" : "transparent",
              color: activePair === p.id ? "var(--ink)" : "var(--subtle)",
              border: activePair === p.id ? "1px solid rgba(251,79,31,0.25)" : "1px solid transparent",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
            {p.ticker}/USDC
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Price stats */}
      <div className="flex items-center gap-5">
        <div>
          <div className="tabular mono font-bold text-lg display" style={{ color: "var(--ink)" }}>
            ${price.toFixed(2)}
          </div>
          <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "var(--success)" }}>
            +2.34% <span style={{ color: "var(--subtle)" }}>24h</span>
          </div>
        </div>
        <StatPill label="24h High" value={`$${(price * 1.035).toFixed(2)}`} />
        <StatPill label="24h Low" value={`$${(price * 0.968).toFixed(2)}`} />
        <StatPill label="Volume" value="$4.2M" />
        <StatPill label="Oracle" value={`$${price.toFixed(2)}`} accent />
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hidden lg:block">
      <div className="text-xs" style={{ color: "var(--subtle)" }}>{label}</div>
      <div
        className="tabular mono text-sm font-semibold mt-0.5"
        style={{ color: accent ? "var(--accent)" : "var(--ink-2)" }}
      >
        {value}
      </div>
    </div>
  );
}
