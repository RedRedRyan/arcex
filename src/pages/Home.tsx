import React from "react";
import { PAIRS } from "../constants";
import AssetCard from "@/components/AssetCard";

const Home = () => {
  return (
    <div className="flex min-h-screen home-wrapper">
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
