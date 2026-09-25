"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Wallet } from "lucide-react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
} from "@reown/appkit/react";
import { useBalance } from "wagmi";
import { useUserStore } from "@/store/user.store";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS } from "@/lib/constants";
import Image from "next/image";
interface SwapPanelProps {
  asset: { ticker: string; name: string; quote: string; type: string };
}

const SwapPanel = ({ asset }: SwapPanelProps) => {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId } = useAppKitNetwork();

  const shortAddress = useUserStore((s) => s.shortAddress);
  const walletIcon = useUserStore((s) => s.walletIcon);

  const isOnArc = chainId === ARC_TESTNET_CHAIN_ID;

  const { data: usdcBalance, isLoading: isUsdcLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: ARC_USDC_ADDRESS,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address },
  });

  const formattedUsdc = usdcBalance
    ? Number(usdcBalance.formatted).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111111] p-5">
      {/* Buy / Sell toggle */}
      <div className="mb-5 flex gap-6">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`text-sm font-semibold ${
              side === s ? "text-[#C2E026]" : "text-gray-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tokenized share leg */}
      <div className="relative rounded-xl bg-[#1A1A1A] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-xs font-semibold">
              {asset.ticker.slice(0, 2)}
            </span>
            <div>
              <div className="font-semibold">{asset.ticker}</div>
              <div className="text-[10px] text-gray-500">{asset.name}</div>
            </div>
          </div>
          <span className="text-xs text-gray-400">
            You {side === "BUY" ? "Buy" : "Sell"}
          </span>
        </div>
        <div className="mt-3 text-3xl font-semibold">12.695</div>
        <div className="mt-1 text-xs text-gray-500">
          Balance{" "}
          <span className="text-gray-300">293.0187 t{asset.ticker}</span>
        </div>

        <div className="absolute -bottom-5 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-[#0A0A0A]">
          <ArrowUpDown className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Settlement currency leg — live Arc testnet USDC balance */}
      <div className="mt-6 rounded-xl bg-[#1A1A1A] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* <Image
              src="./assets/icons/usdc.png"
              width={16}
              height={16}
              alt="usdc"
            /> */}
            <span className="font-semibold">{asset.quote}</span>
          </div>
          <span className="text-xs text-gray-400">You Spend</span>
        </div>
        <div className="mt-3 text-3xl font-semibold">9,853.00</div>
        <div className="mt-1 text-xs text-gray-500">
          Balance{" "}
          <span className="text-gray-300">
            {!isConnected
              ? "—"
              : !isOnArc
                ? "Switch to Arc Testnet"
                : isUsdcLoading
                  ? "Loading…"
                  : formattedUsdc !== null
                    ? `${formattedUsdc} USDC`
                    : "—"}
          </span>
        </div>
      </div>

      <Button className="mt-6 w-full rounded-xl orange-btn">
        {side === "BUY" ? `Buy ${asset.ticker}` : `Sell ${asset.ticker}`}
      </Button>

      {/* Available balance */}
      <div className="mt-6 rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Available Balance</span>
          <span className="rounded-full bg-[#C2E026]/15 px-2 py-0.5 text-[#C2E026]">
            +7.45%
          </span>
        </div>
        <div className="mt-1 text-xl font-semibold">
          293.0187 t{asset.ticker}
        </div>

        <div className="mt-4 flex justify-between text-xs">
          <div>
            <div className="text-gray-500">Estimate fee</div>
            <div className="mt-1 text-gray-200">4.28 {asset.quote}</div>
          </div>
          <div>
            <div className="text-gray-500">You will receive</div>
            <div className="mt-1 text-gray-200">108.35 {asset.quote}</div>
          </div>
          <div>
            <div className="text-gray-500">Spread</div>
            <div className="mt-1 text-gray-200">0%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapPanel;
