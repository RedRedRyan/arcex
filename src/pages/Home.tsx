import React from "react";
import Grainient from "../components/Grainient";
import MarketCard from "../components/MarketCard";
import { PairId } from "../types";
import { PAIRS } from "../constants";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();

  const goSpot = (pairId: PairId) => navigate(`/spot?pair=${pairId}`);
  const goFutures = (pairId: PairId) => navigate(`/futures?pair=${pairId}`);
  return (
    <div className="flex min-h-screen home-wrapper">
      <div className="absolute inset-0 -z-10">
        <Grainient
          color1="#FB4F1F"
          color2="#000000"
          color3="#000000"
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
          centerX={0.53}
          centerY={0.06}
          zoom={0.9}
        />
      </div>
      <section className="grid w-full gap-8 home-section">
        <div className="md:col-span-1 xl:col-span-1"> </div>
        <div className="md-col-span-1 xl-col-span-2">
          {PAIRS.map((pair) => (
            <MarketCard
              key={pair.id}
              pair={{ ...pair }}
              onSpot={() => goSpot(pair.id)}
              onFutures={() => goFutures(pair.id)}
            />
          ))}
        </div>
      </section>
      {/* new section */}
      <section className="grid w-full gap-8 home-section">
        <div className="h-full md:col-span-1 xl:col-span-1"></div>
        <div className="h-full md:col-span-1 xl:col-span-2"></div>
      </section>
    </div>
  );
};

export default Home;
