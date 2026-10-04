import PriceChart from "../components/PriceChart";
import FuturesTicket from "../components/FuturesTicket";
import OrderBook from "../components/OrderBook";
import PairHeader from "../components/PairHeader";
import PositionsTable from "../components/PositionsTable";
import { PAIRS } from "../constants";
import { PairId } from "../types";

interface FuturesPageProps {
  activePair: PairId;
  setActivePair: (id: PairId) => void;
}

export default function FuturesPage({
  activePair,
  setActivePair,
}: FuturesPageProps) {
  const pair = PAIRS[activePair];

  return (
    // <div className="flex flex-col min-h-[calc(100dvh-60px)]">
    //   <PairHeader activePair={activePair} setActivePair={setActivePair} mode="Futures" />

    //   <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
    //     {/* Chart + positions */}
    //     <div
    //       className="lg:col-span-3 flex flex-col"
    //       style={{ borderRight: "1px solid var(--border)" }}
    //     >
    //       <div style={{ flex: "0 0 480px", borderBottom: "1px solid var(--border)" }}>
    //         <PriceChart
    //           seedPrice={pair.seedPrice}
    //           pairId={pair.id}
    //           variant="candle"
    //           height={480}
    //           accentColor={pair.color}
    //         />
    //       </div>

    //       <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-auto">
    //         <div className="p-4" style={{ borderRight: "1px solid var(--border)" }}>
    //           <OrderBook pair={{ ...pair }} />
    //         </div>
    //         <div className="p-4">
    //           <PositionsTable />
    //         </div>
    //       </div>
    //     </div>

    //     {/* Futures ticket */}
    //     <div className="lg:col-span-1 p-4 overflow-y-auto">
    //       <FuturesTicket pairId={activePair} />
    //     </div>
    //   </div>
    // </div>

    <div className="flex flex-col min-h-[calc(100dvh-60px)]">
      <h1>Coming Soon</h1>
    </div>
  );
}
