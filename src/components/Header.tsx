import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { BarChart2, ChevronDown, AlertTriangle } from "lucide-react";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, PAIRS } from "../constants";
import { formatUsdc, formatAddress } from "../utils";
import { Page, PairId } from "../types";

interface HeaderProps {
  page: Page;
  setPage: (p: Page) => void;
  activePair: PairId;
  setActivePair: (id: PairId) => void;
}

const NAV: { key: Page; label: string }[] = [
  { key: "market",    label: "Markets" },
  { key: "spot",      label: "Spot" },
  { key: "futures",   label: "Futures" },
  { key: "portfolio", label: "Portfolio" },
  { key: "faucet",    label: "Faucet" },
];

export default function Header({ page, setPage, activePair, setActivePair }: HeaderProps) {
  const { address, isConnected, chainId } = useAccount();
  const [pairMenuOpen, setPairMenuOpen] = useState(false);

  const { data: usdcBalance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address },
  });

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;
  const currentPair = PAIRS[activePair];
  const isTrading = page === "spot" || page === "futures";

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-6 h-[60px]"
      style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Logo */}
      <button
        onClick={() => setPage("market")}
        className="flex items-center gap-2 display font-bold text-lg shrink-0"
        style={{ color: "var(--ink)" }}
      >
        <BarChart2 size={20} style={{ color: "var(--accent)" }} />
        <span>stockX <span style={{ color: "var(--accent)" }}>Pro</span></span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ background: "rgba(251,79,31,0.15)", color: "var(--accent)" }}
        >
          Testnet
        </span>
      </button>

      {/* Nav */}
      <nav className="hidden md:flex items-center gap-0.5 mx-4">
        {NAV.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: page === key ? "rgba(251,79,31,0.12)" : "transparent",
              color: page === key ? "var(--accent)" : "var(--subtle)",
              borderBottom: page === key ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Right section */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Pair switcher on trading pages */}
        {isTrading && (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setPairMenuOpen(!pairMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: "var(--surface-strong)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: currentPair.color }} />
              {currentPair.ticker}/USDC
              <ChevronDown size={12} style={{ color: "var(--subtle)" }} />
            </button>
            {pairMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 rounded-xl py-1 z-50"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
              >
                {PAIRS.map((pair) => (
                  <button
                    key={pair.id}
                    onClick={() => { setActivePair(pair.id); setPairMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors"
                    style={{
                      background: activePair === pair.id ? "rgba(251,79,31,0.08)" : "transparent",
                      color: activePair === pair.id ? "var(--ink)" : "var(--subtle)",
                    }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pair.color }} />
                    <span className="font-medium">{pair.ticker}/USDC</span>
                    <span className="ml-auto text-xs" style={{ color: "var(--subtle)" }}>${pair.seedPrice}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wrong chain badge */}
        {isWrongChain && (
          <div
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
            style={{ background: "rgba(232,109,122,0.15)", color: "var(--danger)" }}
          >
            <AlertTriangle size={11} />
            Wrong network
          </div>
        )}

        {/* USDC balance */}
        {isConnected && !isWrongChain && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
          >
            <span className="text-xs" style={{ color: "var(--subtle)" }}>USDC</span>
            <span className="mono tabular font-semibold">{formatUsdc(usdcBalance)}</span>
          </div>
        )}

        {/* Connect button */}
        <ConnectKitButton.Custom>
          {({ isConnected, show, address, isConnecting }) => (
            <button
              onClick={show}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: isConnected ? "var(--surface-strong)" : "var(--accent)",
                color: isConnected ? "var(--ink)" : "#fff",
                border: isConnected ? "1px solid var(--border)" : "none",
              }}
            >
              {isConnecting
                ? "Connecting..."
                : isConnected && address
                  ? formatAddress(address)
                  : "Connect Wallet"}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  );
}
