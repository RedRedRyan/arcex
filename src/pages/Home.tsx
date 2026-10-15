import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { PAIRS } from "../constants";
import AssetCard from "@/components/AssetCard";

const ACTIONS = [
  {
    title: "Swap",
    description: "Exchange tokens at the best available rate.",
    icon: "/assets/icons/swap.png",
    to: "/swap",
  },
  {
    title: "Trade",
    description: "Buy and sell coins.",
    icon: "/assets/icons/spot.png",
    to: "/spot",
  },
  {
    title: "Earn",
    description: "Put your assets to work and earn yield.",
    icon: "/assets/icons/vault.png",
    to: "/earn",
  },
];

const ActionCarousel = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStartX = useRef<number | null>(null);

  const go = (next: number) =>
    setIndex((next + ACTIONS.length) % ACTIONS.length);

  // Autoplay; restarts after every slide change so manual moves get a full beat.
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => go(index + 1), 4000);
    return () => clearTimeout(id);
  }, [index, paused]);

  return (
    <div
      className="relative h-56 w-full overflow-hidden rounded-[28px] border border-white/20 bg-white/[0.07] text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:h-full"
      style={{ touchAction: "pan-y" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={(e) => (dragStartX.current = e.clientX)}
      onPointerUp={(e) => {
        if (dragStartX.current === null) return;
        const dx = e.clientX - dragStartX.current;
        dragStartX.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {/* Glass sheen, same as AssetCard */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent"
      />

      {/* Slides */}
      <div
        className="relative flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {ACTIONS.map((action) => (
          <div
            key={action.title}
            className="flex h-full w-full shrink-0 items-center justify-between gap-4 px-6 pb-10 pt-6 sm:px-8"
          >
            {/* Left: text + link */}
            <div className="flex min-w-0 flex-col items-start gap-4">
              <div>
                <h2 className="text-4xl font-semibold leading-none xl:text-5xl">
                  {action.title}
                </h2>
                <p className="mt-2 max-w-[16rem] text-sm text-white/60">
                  {action.description}
                </p>
              </div>
              <Link
                to={action.to}
                aria-label={`Open ${action.title}`}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
              >
                <ArrowUpRight size={20} />
              </Link>
            </div>

            {/* Right: small icon */}
            <img
              src={action.icon}
              alt=""
              draggable={false}
              className="h-24 w-24 shrink-0 object-contain drop-shadow-xl sm:h-28 sm:w-28 xl:h-32 xl:w-32"
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
        {ACTIONS.map((action, i) => (
          <button
            key={action.title}
            type="button"
            aria-label={`Go to ${action.title}`}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-white" : "w-2 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

const Home = () => {
  const [first, second, third] = PAIRS;

  return (
    <div className="flex min-h-screen home-wrapper">
      <section className="home-section container">
        {/* Row 1: 3/4 heading + 1/4 first asset card */}
        <div className="flex flex-col items-center justify-center lg:col-span-3">
          <h1 className="pt-16 text-center font-inter text-8xl leading-none text-white md:text-[8vw] xl:mt-16 xl:mb-32">
            Trade, Swap
          </h1>
        </div>
        <div className="hidden lg:col-span-1 lg:block xl:mt-16">
          {first && <AssetCard pair={{ ...first }} />}
        </div>

        {/* Row 2: 2/4 carousel + 1/4 + 1/4 asset cards.
            The grid row takes the asset cards' height and the carousel
            stretches to fill it (lg:h-full), so the heights always match. */}
        <div className="mt-10 lg:col-span-2 lg:mt-0">
          <ActionCarousel />
        </div>
        <div className="hidden lg:col-span-1 lg:block">
          {second && <AssetCard pair={{ ...second }} />}
        </div>
        <div className="hidden lg:col-span-1 lg:block">
          {third && <AssetCard pair={{ ...third }} />}
        </div>
      </section>
    </div>
  );
};

export default Home;
