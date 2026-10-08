import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PAIRS } from "../constants";
import { PairId } from "../types";
import { usePoolFeed, formatPrice } from "../../data/OracleFeed";

const TOKEN_ICONS: Record<PairId, string> = {
  0: "/assets/icons/tech.png",
  1: "/assets/icons/energy.png",
  2: "/assets/icons/arc.svg",
};

/** Two overlapping round badges: the selected asset and USDC. */
const PairIcon = ({ pairId, size = 32 }: { pairId: PairId; size?: number }) => {
  return (
    <div className="flex items-center shrink-0" aria-hidden>
      <img
        src={TOKEN_ICONS[pairId]}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
      <img
        src="/assets/icons/usdc.png"
        alt=""
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          marginLeft: -size * 0.3,
          border: "2px solid var(--surface, #0a0f1a)",
        }}
      />
    </div>
  );
};

const PairOption = ({
  pairId,
  active,
  onSelect,
}: {
  pairId: PairId;
  active: boolean;
  onSelect: (id: PairId) => void;
}) => {
  const pair = PAIRS[pairId];
  const feed = usePoolFeed(pair.id);
  const change = feed.changePct24h;
  const positive = (change ?? 0) >= 0;

  return (
    <DropdownMenuItem
      onClick={() => onSelect(pairId)}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer  focus:bg-white/5"
    >
      <PairIcon pairId={pairId} size={28} />
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {pair.ticker}/USDC
        </div>
        <div className="text-xs" style={{ color: "var(--subtle)" }}>
          {pair.name}
        </div>
      </div>
      <div className="text-right">
        <div
          className="tabular mono text-sm font-semibold"
          style={{ color: "var(--ink)" }}
        >
          ${formatPrice(feed.price)}
        </div>
        <div
          className="text-xs"
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
            : `${positive ? "+" : ""}${change.toFixed(2)}%`}
        </div>
      </div>
      {active && <Check size={14} style={{ color: "var(--accent)" }} />}
    </DropdownMenuItem>
  );
};

interface PairSelectProps {
  activePair: PairId;
  onChange: (id: PairId) => void;
}

const PairSelect = ({ activePair, onChange }: PairSelectProps) => {
  const pair = PAIRS[activePair];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="group flex items-center gap-3 rounded-xl px-1 py-1 outline-none transition-colors  hover:bg-white/5"
            aria-label="Select trading pair"
          >
            <PairIcon pairId={activePair} />
            <span
              className="display text-xs md:text-lg font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {pair.ticker}/USDC
            </span>
            <ChevronDown
              size={18}
              className="transition-transform group-data-[open]:rotate-180"
              style={{ color: "var(--subtle)" }}
            />
          </button>
        }
      />

      <DropdownMenuContent
        align="start"
        className="z-[100] min-w-[280px] p-1.5"
        style={{
          background: "var(--surface-muted)",
          border: "1px solid var(--border)",
        }}
      >
        {PAIRS.map((p) => (
          <PairOption
            key={p.id}
            pairId={p.id}
            active={p.id === activePair}
            onSelect={onChange}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PairSelect;
