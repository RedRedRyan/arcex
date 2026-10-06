import { useNavigate } from "react-router-dom";
import { PAIRS } from "../constants";
import MarketCard from "../components/MarketCard";
import { PairId } from "../types";
import {
  useOracleFeed,
  usePoolFeed,
  formatPrice,
  formatAgo,
} from "../../data/OracleFeed";
import AssetCard from "@/components/AssetCard";

const LivePriceBadge = ({ pairId }: { pairId: number }) => {
  const pool = usePoolFeed(pairId);
  const oracle = useOracleFeed(pairId);
  const price = pool.price ?? oracle.price;
  const live = pool.status === "live" || oracle.status === "live";

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className="tabular mono font-semibold text-sm"
          style={{ color: "var(--ink)" }}
        >
          ${formatPrice(price)}
        </span>
        <span
          className="text-xs"
          style={{
            color: live ? "var(--success)" : "var(--subtle)",
            fontSize: "10px",
          }}
        >
          {pool.status === "connecting" && oracle.status === "connecting"
            ? "connecting…"
            : live
              ? "live"
              : "offline"}
        </span>
      </div>
      <div
        className="text-xs mt-0.5"
        style={{ color: "var(--subtle)", fontSize: "10px" }}
      >
        Oracle ${formatPrice(oracle.price)} · set{" "}
        {formatAgo(oracle.oracleUpdatedAt)}
      </div>
    </div>
  );
};

const InfoCard = ({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: string;
}) => {
  return (
    <div>
      <div
        className="text-sm font-semibold display mb-1.5"
        style={{ color: accent }}
      >
        {title}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
        {body}
      </p>
    </div>
  );
};

const MarketPage = () => {
  const navigate = useNavigate();

  const goSpot = (pairId: PairId) => navigate(`/spot?pair=${pairId}`);
  const goFutures = (pairId: PairId) => navigate(`/futures?pair=${pairId}`);

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-8 max-w-screen-2xl bg-transparent">
      {/* Hero */}
      <div className="flex items-end justify-between">
        <div>
          <h1
            className="display text-3xl font-bold mb-1"
            style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
          >
            Markets
          </h1>
          <p className="text-sm" style={{ color: "var(--subtle)" }}>
            Trade simulated assets on Arc Testnet · settled in USDC · spot
            priced by the AMM, perps by the oracle
          </p>
        </div>
        <div
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: "rgba(251,79,31,0.1)",
            color: "var(--accent)",
            border: "1px solid rgba(251,79,31,0.2)",
          }}
        >
          ⚡ Arc Testnet · Sub-second finality
        </div>
      </div>

      {/* Live price strip (spot pool price, oracle underneath) */}
      <div
        className="rounded-2xl px-6 py-4 grid grid-cols-3 divide-x bg-orange-500"
        style={{
          border: "1px solid var(--border)",
        }}
      >
        {PAIRS.map((pair) => (
          <div key={pair.id} className="px-4 first:pl-0 last:pr-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: pair.color }}
              />
              <span
                className="text-xs font-semibold display"
                style={{ color: "var(--subtle)" }}
              >
                {pair.ticker}/USDC
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(251,79,31,0.1)",
                  color: "var(--accent)",
                  fontSize: "9px",
                  letterSpacing: "0.05em",
                }}
              >
                SPOT
              </span>
            </div>
            <LivePriceBadge pairId={pair.id} />
          </div>
        ))}
      </div>

      <div className="relative isolate">
        {/* two blurred gradient blobs sit behind the cards (aria-hidden, -z-10) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PAIRS.map((pair) => (
            <AssetCard key={pair.id} pair={{ ...pair }} />
          ))}
        </div>
      </div>

      {/* Pair cards with lightweight-charts sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PAIRS.map((pair) => (
          <MarketCard
            key={pair.id}
            pair={{ ...pair }}
            onSpot={() => goSpot(pair.id)}
            onFutures={() => goFutures(pair.id)}
          />
        ))}
      </div>

      {/* Info strip */}
      <div
        className="rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <InfoCard
          title="Spot AMM"
          body="Constant-product pools (x·y=k) with 0.3% fee. Add liquidity to earn fees proportional to your LP share."
          accent="#fb4f1f"
        />
        <InfoCard
          title="Perpetuals"
          body="Up to 20× leverage. Isolated margin per position. Perp mark price comes from the on-chain oracle."
          accent="#ffa04d"
        />
        <InfoCard
          title="Settlement"
          body="All trades settle in USDC on Arc Testnet. USDC is the native gas token — no ETH needed."
          accent="#ffb347"
        />
      </div>
    </div>
  );
};

export default MarketPage;
