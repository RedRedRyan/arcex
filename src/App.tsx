import { lazy, Suspense } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Hero from "./pages/Hero";
import Grainient from "./components/Grainient";
import { Analytics } from "@vercel/analytics/react";

const MarketPage = lazy(() => import("./pages/MarketPage"));
const SpotPage = lazy(() => import("./pages/SpotPage"));
const FuturesPage = lazy(() => import("./pages/FuturesPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const FaucetPage = lazy(() => import("./pages/FaucetPage"));

const RouteFallback = () => (
  <div className="container mx-auto min-h-[60vh] max-w-screen-2xl px-4 py-8">
    <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
    <div className="mt-6 h-64 animate-pulse rounded-2xl bg-white/5" />
  </div>
);
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
        <Route
          path="market"
          element={
            <Suspense fallback={<RouteFallback />}>
              <MarketPage />
            </Suspense>
          }
        />
        <Route
          path="spot"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SpotPage />
            </Suspense>
          }
        />
        <Route
          path="futures"
          element={
            <Suspense fallback={<RouteFallback />}>
              <FuturesPage />
            </Suspense>
          }
        />
        <Route
          path="portfolio"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PortfolioPage />
            </Suspense>
          }
        />
        <Route
          path="faucet"
          element={
            <Suspense fallback={<RouteFallback />}>
              <FaucetPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
