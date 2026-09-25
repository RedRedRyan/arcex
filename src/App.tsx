import { useState } from "react";
import Header from "./components/Header";
import MarketPage from "./pages/MarketPage";
import SpotPage from "./pages/SpotPage";
import FuturesPage from "./pages/FuturesPage";
import PortfolioPage from "./pages/PortfolioPage";
import FaucetPage from "./pages/FaucetPage";
import { Page, PairId } from "./types";

export default function App() {
  const [page, setPage] = useState<Page>("market");
  const [activePair, setActivePair] = useState<PairId>(0);

  const goToSpot = (pairId: PairId) => {
    setActivePair(pairId);
    setPage("spot");
  };

  const goToFutures = (pairId: PairId) => {
    setActivePair(pairId);
    setPage("futures");
  };

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <Header
        page={page}
        setPage={setPage}
        activePair={activePair}
        setActivePair={setActivePair}
      />
      <main>
        {page === "market"    && <MarketPage onSpot={goToSpot} onFutures={goToFutures} />}
        {page === "spot"      && <SpotPage activePair={activePair} setActivePair={setActivePair} />}
        {page === "futures"   && <FuturesPage activePair={activePair} setActivePair={setActivePair} />}
        {page === "portfolio" && <PortfolioPage />}
        {page === "faucet"    && <FaucetPage />}
      </main>
    </div>
  );
}
