import { useAccount, useSwitchChain } from "wagmi";
import { useSearchParams } from "react-router-dom";
import { useNetwork } from "../config/NetworkProvider";
import { NETWORKS } from "../config/networks";
import PriceChart from "../components/PriceChart";
import SpotTicket from "../components/SpotTicket";
import PairSelect from "@/components/PairSelect";
import { PAIRS } from "../constants";
import { PairId } from "../types";
import { usePoolFeed, formatPrice } from "../../data/OracleFeed";

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
  const { network } = useNetwork();
  const { isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (network !== "mainnet") {
    return (
      <div className="container mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="display text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Spot trading is on Arc Mainnet
        </h1>
        <p className="text-sm" style={{ color: "var(--subtle)" }}>
          TECHx, ENERGYx, ARCx, and their USDC pools are deployed on Arc Mainnet.
          Switch networks to use your Mainnet balances.
        </p>
        {isConnected && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: NETWORKS.mainnet.chainId })}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {isPending ? "Switching..." : "Switch to Arc Mainnet"}
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
            Could not switch networks: {error.message}
          </p>
        )}
      </div>
    );
  }

  return <SpotMarketContent />;
};

const SpotMarketContent = () => {
  // Active pair lives in the URL: /spot?pair=1
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("pair"));
  const activePair = (raw === 1 || raw === 2 ? raw : 0);
  const setActivePair = (id: PairId) =>
    setParams({ pair: String(id) }, { replace: true });

  const pair = PAIRS[activePair];
  const pool = usePoolFeed(pair.id);
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
                height="100%"
                accentColor={pair.color}
                seedPrice={pair.seedPrice}
              />
            </div>
          </div>
        </div>

        {/* ── Trading options ── */}
        <div
          className="col-span-1 lg:col-span-1 min-h-0 overflow-y-auto rounded-2xl p-4 bg-gradient-to-br from-white/15 via-transparent to-transparent"
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
