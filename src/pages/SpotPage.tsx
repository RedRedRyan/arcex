import PriceChart from "../components/PriceChart";
import SpotTicket from "../components/SpotTicket";
import OrderBook from "../components/OrderBook";
import PairHeader from "../components/PairHeader";
import { PAIRS } from "../constants";
import { PairId } from "../types";

interface SpotPageProps {
  activePair: PairId;
  setActivePair: (id: PairId) => void;
}

export default function SpotPage({ activePair, setActivePair }: SpotPageProps) {
  const pair = PAIRS[activePair];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-60px)]">
      <PairHeader activePair={activePair} setActivePair={setActivePair} mode="Spot" />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0 overflow-hidden">
        {/* Chart + order book */}
        <div
          className="lg:col-span-3 flex flex-col"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div style={{ flex: "0 0 480px", borderBottom: "1px solid var(--border)" }}>
            <PriceChart
              seedPrice={pair.seedPrice}
              pairId={pair.id}
              variant="candle"
              height={480}
              accentColor={pair.color}
            />
          </div>

          <div className="flex-1 p-4">
            <OrderBook pair={{ ...pair }} />
          </div>
        </div>

        {/* Trade ticket */}
        <div className="lg:col-span-1 p-4 overflow-y-auto">
          <SpotTicket pairId={activePair} />
        </div>
      </div>
    </div>
  );
}
