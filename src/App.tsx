import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import MarketPage from "./pages/MarketPage";
import SpotPage from "./pages/SpotPage";
import FuturesPage from "./pages/FuturesPage";
import PortfolioPage from "./pages/PortfolioPage";
import FaucetPage from "./pages/FaucetPage";

// Shared shell: navbar on every route, page content rendered in <Outlet />
const Layout = () => {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
      </main>
    </>
  );
};

// Paths match `navLinks` in constants.ts
const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<MarketPage />} />
        <Route path="spot" element={<SpotPage />} />
        <Route path="futures" element={<FuturesPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="faucet" element={<FaucetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
