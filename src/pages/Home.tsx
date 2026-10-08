import React from "react";
import { PAIRS } from "../constants";
import AssetCard from "@/components/AssetCard";

const Home = () => {
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
        <div className="col-span-1 flex flex-col items-center justify-center gap-3 lg:col-span-4">
          <h1 className="text-8xl md:text-[8vw] leading-none text-center  text-white  font-inter ">
            Trade Stocks
          </h1>
        </div>

        <div className="relative isolate col-span-1 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 lg:col-span-4">
          {PAIRS.map((pair) => (
            <AssetCard key={pair.id} pair={{ ...pair }} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
