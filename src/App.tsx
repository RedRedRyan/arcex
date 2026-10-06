import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import MarketPage from "./pages/MarketPage";
import SpotPage from "./pages/SpotPage";
import FuturesPage from "./pages/FuturesPage";
import PortfolioPage from "./pages/PortfolioPage";
import FaucetPage from "./pages/FaucetPage";
import Header from "./components/Header";
import Hero from "./pages/Hero";
import Grainient from "./components/Grainient";
import { Analytics } from "@vercel/analytics/next";
// Shared shell: navbar on every route, page content rendered in <Outlet />
const Layout = () => {
  return (
    <>
      <Analytics />

      <div className="absolute inset-0 -z-10">
        <Grainient
          color1="#FB4F1F"
          color2="#000000"
          color3="#FB4F1F"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>
      <Header />
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
        <Route path="/" element={<Hero />} />
        <Route path="market" element={<MarketPage />} />
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
