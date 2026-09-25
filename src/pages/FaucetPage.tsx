import { ExternalLink, Droplets, Zap, Copy } from "lucide-react";
import { ARC_USDC_ADDRESS, CONTRACT_ADDRESSES, BASE_TOKENS, PAIRS } from "../constants";
import { useState } from "react";

function CopyAddress({ label, addr }: { label: string; addr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl"
      style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
    >
      <div>
        <div className="text-xs mb-0.5" style={{ color: "var(--subtle)" }}>{label}</div>
        <div className="mono text-sm" style={{ color: "var(--ink-2)" }}>
          {addr.slice(0, 10)}...{addr.slice(-8)}
        </div>
      </div>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: copied ? "rgba(141,216,159,0.15)" : "rgba(251,79,31,0.1)",
          color: copied ? "var(--success)" : "var(--accent)",
        }}
      >
        <Copy size={11} />
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function FaucetPage() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-8 max-w-2xl space-y-8">
      <div>
        <h1 className="display text-2xl font-bold mb-1" style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}>
          Testnet Faucet
        </h1>
        <p className="text-sm" style={{ color: "var(--subtle)" }}>
          Get test USDC and base tokens to trade on Arc Testnet.
        </p>
      </div>

      {/* Step 1 — Arc Studio faucet */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid rgba(251,79,31,0.25)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: "rgba(251,79,31,0.15)", color: "var(--accent)" }}
          >
            1
          </div>
          <div>
            <h2 className="display font-semibold" style={{ color: "var(--ink)" }}>
              Get test USDC from Arc Studio
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--subtle)" }}>
              Use the <strong style={{ color: "var(--accent)" }}>Get test USDC</strong> button in the Arc Studio sidebar (bottom-left). Connect your wallet when prompted — Arc Studio drips Arc Testnet USDC directly to your connected wallet.
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "rgba(251,79,31,0.08)", color: "var(--tangerine)" }}
        >
          <Zap size={13} />
          USDC on Arc Testnet is both the gas token and the trading currency — one balance covers everything.
        </div>
      </div>

      {/* Step 2 — External faucet */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: "rgba(255,160,77,0.12)", color: "var(--sunset)" }}
          >
            2
          </div>
          <div>
            <h2 className="display font-semibold" style={{ color: "var(--ink)" }}>
              Circle USDC Faucet (alternative)
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--subtle)" }}>
              Visit the Circle faucet to request testnet USDC on Arc Testnet.
            </p>
          </div>
        </div>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: "rgba(255,160,77,0.12)",
            color: "var(--sunset)",
            border: "1px solid rgba(255,160,77,0.22)",
          }}
        >
          <Droplets size={15} />
          faucet.circle.com
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Network info */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="display font-semibold" style={{ color: "var(--ink)" }}>Arc Testnet Details</h2>
        <div className="space-y-3">
          <InfoRow label="Network name" value="Arc Testnet" />
          <InfoRow label="Chain ID" value="5042002" mono />
          <InfoRow label="RPC URL" value="https://rpc.testnet.arc.io" mono />
          <InfoRow label="Explorer" value="explorer.testnet.arc.io" mono />
          <InfoRow label="Currency" value="USDC (gas + ERC-20)" />
        </div>
      </div>

      {/* Contract addresses */}
      <div
        className="rounded-2xl p-6 space-y-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="display font-semibold mb-4" style={{ color: "var(--ink)" }}>Contract Addresses</h2>
        <CopyAddress label="USDC (ERC-20)" addr={ARC_USDC_ADDRESS} />
        <CopyAddress label="SpotPoolFactory" addr={CONTRACT_ADDRESSES.spotPool} />
        <CopyAddress label="PerpEngine" addr={CONTRACT_ADDRESSES.perpEngine} />
        <CopyAddress label="PriceOracle" addr={CONTRACT_ADDRESSES.priceOracle} />
        {[0, 1, 2].map((id) => (
          <CopyAddress
            key={id}
            label={`${PAIRS[id as 0 | 1 | 2].ticker} Mock Token`}
            addr={BASE_TOKENS[id]}
          />
        ))}
      </div>

      {/* Explorer links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "SpotPool Explorer", addr: CONTRACT_ADDRESSES.spotPool },
          { label: "PerpEngine Explorer", addr: CONTRACT_ADDRESSES.perpEngine },
          { label: "Oracle Explorer", addr: CONTRACT_ADDRESSES.priceOracle },
        ].map(({ label, addr }) => (
          <a
            key={addr}
            href={`https://explorer.testnet.arc.io/address/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-medium transition-all"
            style={{
              background: "rgba(251,79,31,0.08)",
              color: "var(--accent)",
              border: "1px solid rgba(251,79,31,0.15)",
            }}
          >
            {label} <ExternalLink size={11} />
          </a>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--subtle)" }}>{label}</span>
      <span
        className={mono ? "mono tabular" : "font-medium"}
        style={{ color: "var(--ink-2)" }}
      >
        {value}
      </span>
    </div>
  );
}
