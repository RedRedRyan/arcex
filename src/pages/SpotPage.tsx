import { useSearchParams } from "react-router-dom";
import PriceChart from "../components/PriceChart";
import SpotTicket from "../components/SpotTicket";
import OrderBook from "../components/OrderBook";
import PairSelect from "@/components/PairSelect";
import { PAIRS } from "../constants";
import { PairId } from "../types";
import { useOracleFeed, usePoolFeed, formatPrice } from "../../data/OracleFeed";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs" style={{ color: "var(--subtle)" }}>
      {label}
    </div>
    <div
      className="tabular mono text-sm font-semibold"
      style={{ color: "var(--ink-2)" }}
    >
      {value}
    </div>
  </div>
);

const SpotPage = () => {
  // Active pair lives in the URL: /spot?pair=1
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("pair"));
  const activePair = (raw === 1 || raw === 2 ? raw : 0) as PairId;
  const setActivePair = (id: PairId) =>
    setParams({ pair: String(id) }, { replace: true });

  const pair = PAIRS[activePair];
  const pool = usePoolFeed(pair.id);
  const oracle = useOracleFeed(pair.id);
  const change = pool.changePct24h;
  const positive = (change ?? 0) >= 0;

  return (
    <div className="px-3 pt-3 pb-3 md:px-6 ">
      {/*
        Mobile: chart takes 2/3 of the screen, trading panel 1/3 below it.
        Desktop (lg): 3-column grid — chart spans 2, trading panel spans 1.
      */}
      <section className="spot-section h-[calc(100dvh-70px-1.5rem)] grid-rows-[2fr_1fr] lg:h-auto lg:grid-rows-none">
        {/* ── Chart ── */}
        <div
          className="col-span-1 lg:col-span-2 flex min-h-0 flex-col overflow-hidden rounded-2xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Header: pair dropdown, live price, 24h change */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4 pb-2 bg-black">
            <div className="flex flex-col gap-2">
              <PairSelect activePair={activePair} onChange={setActivePair} />
            </div>

            <div className="hidden lg:flex items-center gap-6">
              <Stat label="24h High" value={`$${formatPrice(pool.high24h)}`} />
              <Stat label="24h Low" value={`$${formatPrice(pool.low24h)}`} />

              <div className="flex items-center gap-3 px-1">
                <span className="tabular mono text-2xl md:text-3xl font-bold text-[#fb4f1f]">
                  ${formatPrice(pool.price)}
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.06)",
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
                    : `${positive ? "+" : ""}${change.toFixed(2)}% 24h`}
                </span>
              </div>
            </div>
          </div>

          {/* Chart fills the remaining height on mobile, fixed 480px on desktop */}
          <div className="relative min-h-0 flex-1 lg:flex-none lg:h-[400px] xl:h-[480px]">
            <div className="absolute inset-0">
              <PriceChart
                key={`spot-${pair.id}`}
                pairId={pair.id}
                variant="candle"
                source="pool"
                height="100%"
                accentColor={pair.color}
              />
            </div>
          </div>
        </div>

        {/* ── Trading options ── */}
        <div
          className="col-span-1 lg:col-span-1 min-h-0 overflow-y-auto rounded-2xl p-4 bg-[#fb4f1f]"
          style={{
            border: "1px solid var(--border)",
          }}
        >
          <SpotTicket pairId={activePair} />
        </div>
      </section>
    </div>
  );
};

export default SpotPage;
