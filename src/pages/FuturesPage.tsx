import { useSearchParams } from "react-router-dom";
import PriceChart from "../components/PriceChart";
import FuturesTicket from "../components/FuturesTicket";
import OrderBook from "../components/OrderBook";
import PairHeader from "../components/PairHeader";
import PositionsTable from "../components/PositionsTable";
import { PAIRS } from "../constants";
import { Pair, PairId } from "../types";

// Flip to false to enable the full futures trading page.
const COMING_SOON = true;

const FuturesPage = () => {
  // Active pair lives in the URL: /futures?pair=1
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("pair"));
  const activePair = (raw === 1 || raw === 2 ? raw : 0) as PairId;
  const setActivePair = (id: PairId) =>
    setParams({ pair: String(id) }, { replace: true });

  const pair = PAIRS[activePair];

  if (COMING_SOON) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[calc(100dvh-60px)]">
        <h1
          className="display text-3xl font-bold"
          style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
        >
          Futures
        </h1>
        <p className="text-sm" style={{ color: "var(--subtle)" }}>
          Coming soon
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-60px)]">
      <PairHeader
        activePair={activePair}
        setActivePair={setActivePair}
        mode="Futures"
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
        {/* Chart + order book + positions */}
        <div
          className="lg:col-span-3 flex flex-col"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div
            style={{
              flex: "0 0 480px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <PriceChart
              pairId={pair.id}
              variant="candle"
              source="oracle"
              height={480}
              accentColor={pair.color}
            />
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-auto">
            <div
              className="p-4"
              style={{ borderRight: "1px solid var(--border)" }}
            >
              <OrderBook pair={{ ...pair }} />
            </div>
            <div className="p-4">
              <PositionsTable />
            </div>
          </div>
        </div>

        {/* Futures ticket */}
        <div className="lg:col-span-1 p-4 overflow-y-auto">
          <FuturesTicket pairId={activePair} />
        </div>
      </div>
    </div>
  );
};

export default FuturesPage;
