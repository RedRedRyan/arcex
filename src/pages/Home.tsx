import React from "react";
import Grainient from "../components/Grainient";
import MarketCard from "../components/MarketCard";
import { PairId } from "../types";
import { PAIRS } from "../constants";
import { useNavigate } from "react-router-dom";
import AssetCard from "@/components/AssetCard";

const Home = () => {
  const navigate = useNavigate();

  const goSpot = (pairId: PairId) => navigate(`/spot?pair=${pairId}`);
  const goFutures = (pairId: PairId) => navigate(`/futures?pair=${pairId}`);
  return (
    <div className="flex min-h-screen home-wrapper">
      {/* <div className="absolute inset-0 -z-10">
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
      </div> */}
      <section className="home-section container">
        {/* Hello - full width on small screens, 2 columns on large */}
        <div className="flex lg:flex-row flex-col items-center justify-center col-span-1 lg:col-span-3 gap-3">
          <div className="text-[#FB4F1F]  text-3xl">
            <span>
              Buy <br /> Sell <br /> Earn
            </span>
          </div>
          <h1 className="text-8xl md:text-[8vw] leading-none text-center  text-white  font-inter ">
            Trade Stocks
          </h1>
        </div>

        {/* Asset cards - full width on small screens, 1 column on large */}
        <div className="col-span-1 lg:col-span-1">
          <div className="relative isolate">
            <div className="grid grid-cols-1 gap-3">
              <AssetCard key={1} pair={{ ...PAIRS[0] }} />
            </div>
          </div>
        </div>
        <div className="col-span-1 lg:col-span-2"></div>

        {/* Asset cards - full width on small screens, 1 column on large */}
        <div className="col-span-1 lg:col-span-1">
          <div className="relative isolate">
            <div className="grid grid-cols-1 gap-3">
              <AssetCard key={2} pair={{ ...PAIRS[1] }} />
            </div>
          </div>
        </div>
        <div className=" hidden lg:block  col-span-1 lg:col-span-1">
          <h1 className="text-4xl md:text-[4vw] leading-none text-center text-gradient">
            Simulated <br />
            Assets
          </h1>
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
