import { useReadContract } from "wagmi";
import { PAIRS } from "../constants";
import MarketCard from "../components/MarketCard";
import { PairId } from "../types";
import { CONTRACT_ADDRESSES, ARC_TESTNET_CHAIN_ID } from "../constants";
import PRICE_ORACLE_ABI from "../../contracts/out/PriceOracle.sol/PriceOracle.json";

interface MarketPageProps {
  onSpot: (pairId: PairId) => void;
  onFutures: (pairId: PairId) => void;
}

// Read live oracle price for a single pair
function useOraclePrice(pairId: number) {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESSES.priceOracle,
    abi: PRICE_ORACLE_ABI.abi,
    functionName: "getMarkPrice",
    args: [pairId],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });
  if (typeof data === "bigint") {
    // Oracle stores price with 8 decimals
    return Number(data) / 1e8;
  }
  return null;
}

function LivePriceBadge({ pairId, seedPrice }: { pairId: number; seedPrice: number }) {
  const live = useOraclePrice(pairId);
  const price = live ?? seedPrice;
  return (
    <span className="tabular mono font-semibold text-sm" style={{ color: "var(--ink)" }}>
      ${price.toFixed(2)}
    </span>
  );
}

export default function MarketPage({ onSpot, onFutures }: MarketPageProps) {
  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-8 max-w-screen-2xl">
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
            Trade synthetic assets on Arc Testnet · settled in USDC · oracle-priced
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

      {/* Live oracle price strip */}
      <div
        className="rounded-2xl px-6 py-4 grid grid-cols-3 divide-x"
        style={{
          background: "var(--surface)",
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
              <span className="text-xs font-semibold display" style={{ color: "var(--subtle)" }}>
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
                ORACLE
              </span>
            </div>
            <LivePriceBadge pairId={pair.id} seedPrice={pair.seedPrice} />
          </div>
        ))}
      </div>

      {/* Pair cards with lightweight-charts sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PAIRS.map((pair) => (
          <MarketCard
            key={pair.id}
            pair={{ ...pair }}
            onSpot={() => onSpot(pair.id)}
            onFutures={() => onFutures(pair.id)}
          />
        ))}
      </div>

      {/* Info strip */}
      <div
        className="rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <InfoCard
          title="Spot AMM"
          body="Constant-product pools (x·y=k) with 0.3% fee. Add liquidity to earn fees proportional to your LP share."
          accent="#fb4f1f"
        />
        <InfoCard
          title="Perpetuals"
          body="Up to 20× leverage. Isolated margin per position. Funding rates keep perp price anchored to oracle."
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
}

function InfoCard({ title, body, accent }: { title: string; body: string; accent: string }) {
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
}
