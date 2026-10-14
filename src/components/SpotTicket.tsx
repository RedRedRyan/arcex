import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { erc20Abi } from "viem";
import { toast } from "sonner";
import { ExternalLink, Zap } from "lucide-react";
import {
  PAIRS,
} from "../constants";
import { parseUsdc, formatUsdc, getExplorerTxUrl } from "../utils";
import { useNetwork } from "../config/NetworkProvider";
import { useMarketPair, useWalletBalances } from "../../data/MarketStore";
import { formatPrice } from "../../data/OracleFeed";
import SpotPoolArtifact from "../../contracts/contract-metadata/SpotPoolFactoryV2.json";

/** pairId accepts any SpotPoolFactoryV2 pool id (0/1/2 seed pairs, plus ids from createPair). */
interface SpotTicketProps {
  pairId: number;
}

export default function SpotTicket({ pairId }: SpotTicketProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { config, isTestnet } = useNetwork();
  const chainIdOfNetwork = config.chainId;
  const isWrongChain = isConnected && chainId !== chainIdOfNetwork;
  const spotPool = config.contracts.spotPool;
  const usdc = config.usdcAddress;
  const walletBalances = useWalletBalances(
    isConnected ? address : undefined,
  );
  const pair = PAIRS.find((p) => p.id === pairId) ?? { id: pairId, ticker: `PAIR `, name: `Pair `, quote: "USDC", color: "#fb4f1f", seedPrice: 0 };
  const baseToken = config.pairs.find((p) => p.id === pairId)?.baseToken ?? usdc;
  const pool = useMarketPair(pairId);

  const usdcBalance = walletBalances?.usdc ?? 0;
  const baseBalance = walletBalances?.tokens[pairId] ?? 0;

  const reserveUSDC = pool.reserveQuote ?? 0n;
  const reserveBase = pool.reserveBase ?? 0n;
  const poolActive = pool.active && reserveUSDC > 0n && reserveBase > 0n;
  const hasLiquidity = reserveUSDC > 0n && reserveBase > 0n;

  // Allowance for SpotPool
  const spender = spotPool;
  const tokenToApprove = side === "buy" ? usdc : baseToken;
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenToApprove,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    chainId: chainIdOfNetwork,
    query: { enabled: isConnected && !!address && !!spender },
  });

  const amountBigint = parseUsdc(amount);
  // For sell side, base token has 18 decimals
  const amountBaseIn = amount
    ? BigInt(Math.floor(parseFloat(amount) * 1e18))
    : 0n;
  const effectiveAmount = side === "buy" ? amountBigint : amountBaseIn;
  const needsApproval = !allowance || allowance < effectiveAmount;

  // Quote: estimated output
  const { data: quoteOut } = useReadContract({
    address: spotPool,
    abi: SpotPoolArtifact.abi,
    functionName: "getAmountOut",
    args: [
      pairId,
      side === "buy",
      side === "buy" ? amountBigint : amountBaseIn,
    ],
    chainId: chainIdOfNetwork,
    query: {
      enabled:
        !!spotPool &&
        effectiveAmount > 0n &&
        poolActive &&
        hasLiquidity,
    },
  });

  // ── Approve ─────────────────────────────────────────────────────────────
  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Refetch allowance once the approve tx confirms (so button transitions to Buy/Sell)
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !isApproveConfirming && approveSuccess) {
      refetchAllowance();
    }
    wasConfirming.current = isApproveConfirming;
  }, [isApproveConfirming, approveSuccess, refetchAllowance]);

  // ── Swap ────────────────────────────────────────────────────────────────
  const {
    writeContract: doSwap,
    data: swapHash,
    isPending: isSwapping,
  } = useWriteContract();
  const { isLoading: isSwapConfirming, isSuccess: swapSuccess } =
    useWaitForTransactionReceipt({ hash: swapHash });

  useEffect(() => {
    if (swapSuccess && swapHash) {
      toast.success("Swap confirmed!", {
        description: `${swapHash.slice(0, 14)}...`,
      });
      refetchAllowance();
    }
  }, [swapSuccess, swapHash, refetchAllowance]);

  const handleApprove = useCallback(() => {
    if (!address || !spender) return;
    approve({
      address: tokenToApprove,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, effectiveAmount * 100n],
      chainId: chainIdOfNetwork,
    });
  }, [approve, tokenToApprove, spender, effectiveAmount, address, chainIdOfNetwork]);

  const handleSwap = useCallback(() => {
    if (!address || !spotPool) {
      toast.error("Contract not deployed");
      return;
    }
    if (!poolActive) {
      toast.error("Pool not yet activated — awaiting liquidity seed");
      return;
    }
    if (!hasLiquidity) {
      toast.error("Pool has no liquidity yet");
      return;
    }
    // Slippage floor from the live quote. The quote already reflects this
    // swap's price impact, so we only need to guard against the price moving
    // further between quote and execution — a small tolerance on top. A fixed
    // 98% would wrongly reject normal swaps on thin pools whose impact is
    // large. Requires a quote so we never swap with no floor.
    if (!quoteOut) {
      toast.error("Waiting for a fresh quote…");
      return;
    }
    const quote = BigInt(quoteOut as bigint);
    const minOut = quote - (quote * 50n) / 10_000n; // quote − 0.5%
    if (side === "buy") {
      doSwap({
        address: spotPool,
        abi: SpotPoolArtifact.abi,
        functionName: "swapUSDCForBase",
        args: [pairId, amountBigint, minOut, address],
        chainId: chainIdOfNetwork,
      });
    } else {
      doSwap({
        address: spotPool,
        abi: SpotPoolArtifact.abi,
        functionName: "swapBaseForUSDC",
        args: [pairId, amountBaseIn, minOut, address],
        chainId: chainIdOfNetwork,
      });
    }
  }, [
    address,
    pairId,
    side,
    amountBigint,
    amountBaseIn,
    doSwap,
    spotPool,
    chainIdOfNetwork,
    quoteOut,
    poolActive,
    hasLiquidity,
  ]);

  const isLoading =
    isApproving || isApproveConfirming || isSwapping || isSwapConfirming;

  const quoteDisplay = quoteOut
    ? side === "buy"
      ? `≈${(Number(quoteOut) / 1e18).toFixed(4)} ${pair.ticker}`
      : `≈${(Number(quoteOut) / 1e6).toFixed(2)} USDC`
    : "—";

  // Real fee + price impact, both derived from the on-chain quote vs the
  // ideal spot-price output. The pool applies a 0.3% fee, so the quote is
  // below the ideal; the gap is fee + slippage combined (price impact).
  const feeImpact = useMemo(() => {
    if (effectiveAmount <= 0n || !quoteOut) return null;
    const inNum = Number(effectiveAmount);
    const spotPrice = pool.price;
    if (!spotPrice || spotPrice <= 0) return null;
    // Ideal output at the spot price (no fee, no slippage), matching the
    // quote's units: buy returns base (18 dec), sell returns USDC (6 dec).
    const idealOut =
      side === "buy"
        ? (inNum / 1e6) / spotPrice // USDC in -> base out
        : (inNum / 1e18) * spotPrice; // base in -> USDC out
    const actualOut =
      side === "buy" ? Number(quoteOut) / 1e18 : Number(quoteOut) / 1e6;
    if (idealOut <= 0) return null;
    const impactPct = ((idealOut - actualOut) / idealOut) * 100;
    return { idealOut, actualOut, impactPct };
  }, [effectiveAmount, quoteOut, side, pool.price]);

  // Fee in USDC terms: 0.3% of the input's USDC value. On a sell the input is
  // base tokens, so convert to USDC at the spot price.
  const feeUsdc = useMemo(() => {
    if (effectiveAmount <= 0n) return null;
    const spotPrice = pool.price;
    if (!spotPrice || spotPrice <= 0) return null;
    const inputUsdc =
      side === "buy"
        ? Number(effectiveAmount) / 1e6
        : (Number(effectiveAmount) / 1e18) * spotPrice;
    return inputUsdc * 0.003;
  }, [effectiveAmount, side, pool.price]);

  const getBtn = () => {
    if (!isConnected) return "Connect Wallet";
    if (isWrongChain) return `Switch to ${config.label}`;
    if (!poolActive) return "Pool Not Active";
    if (!hasLiquidity) return "No Liquidity";
    if (isApproving || isApproveConfirming) return "Approving...";
    if (isSwapping || isSwapConfirming) return "Swapping...";
    if (needsApproval && effectiveAmount > 0n)
      return `Approve ${side === "buy" ? "USDC" : pair.ticker}`;
    return side === "buy" ? `Buy ${pair.ticker}` : `Sell ${pair.ticker}`;
  };

  const handleSubmit = () => {
    if (!isConnected) return;
    if (isWrongChain) {
      switchChain({ chainId: chainIdOfNetwork });
      return;
    }
    if (!poolActive || !hasLiquidity) return;
    if (needsApproval && effectiveAmount > 0n) {
      handleApprove();
      return;
    }
    handleSwap();
  };

  const hasAmount =
    isConnected && !isWrongChain && amount !== "" && parseFloat(amount) > 0;
  const btnDisabled =
    isLoading ||
    !poolActive ||
    !hasLiquidity ||
    (hasAmount && !quoteOut) ||
    (isConnected && !isWrongChain && (!amount || parseFloat(amount) <= 0));

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 "
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3
          className="display font-semibold text-sm"
          style={{ color: "var(--ink)" }}
        >
          Spot Trade
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background:
              poolActive && hasLiquidity
                ? "rgba(141,216,159,0.12)"
                : "rgba(232,109,122,0.12)",
            color:
              poolActive && hasLiquidity ? "var(--success)" : "var(--danger)",
          }}
        >
          {poolActive && hasLiquidity ? "Pool Active" : "Pool Inactive"}
        </span>
      </div>

      {/* Side toggle */}
      <div
        className="grid grid-cols-2 gap-1 p-1 rounded-xl"
        style={{ background: "var(--surface-muted)" }}
      >
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="py-2 rounded-lg text-sm font-bold uppercase transition-all"
            style={{
              background:
                side === s
                  ? s === "buy"
                    ? "rgba(141,216,159,0.2)"
                    : "rgba(232,109,122,0.2)"
                  : "transparent",
              color:
                side === s
                  ? s === "buy"
                    ? "var(--success)"
                    : "var(--danger)"
                  : "var(--subtle)",
              border: `1px solid ${side === s ? (s === "buy" ? "rgba(141,216,159,0.4)" : "rgba(232,109,122,0.4)") : "transparent"}`,
            }}
          >
            {s === "buy" ? `Buy ${pair.ticker}` : `Sell ${pair.ticker}`}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div>
        <label
          className="block text-xs mb-1.5"
          style={{ color: "var(--subtle)" }}
        >
          {side === "buy" ? "USDC to spend" : `${pair.ticker} to sell`}
        </label>
        <div
          className="flex items-center gap-2 px-3 py-3 rounded-xl"
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
          }}
        >
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            className="flex-1 bg-transparent outline-none text-xl font-bold tabular mono"
            style={{ color: "var(--ink)" }}
          />

          <img
            src={
              side === "buy"
                ? "/assets/icons/usdc.png"
                : [
                    "/assets/icons/tech.png",
                    "/assets/icons/energy.png",
                    "/assets/icons/arc.svg",
                  ][pairId]
            }
            alt=""
            className="h-5 w-5 rounded-full "
          />
        </div>
        <div
          className="flex justify-between mt-1.5 text-xs"
          style={{ color: "var(--subtle)" }}
        >
          <span>
            {side === "buy"
              ? `Balance: ${formatUsdc(BigInt(Math.round(usdcBalance * 1e6)))} USDC`
              : `Balance: ${baseBalance.toFixed(4)} ${pair.ticker}`}
            {isConnected && isWrongChain ? ` (on ${config.label})` : ""}
          </span>
          <button
            onClick={() => {
              if (side === "buy" && usdcBalance)
                setAmount(usdcBalance.toFixed(2));
              else if (side === "sell" && baseBalance)
                setAmount(baseBalance.toFixed(4));
            }}
            className="font-semibold text-white "
          >
            Max
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)" }} />

      {/* Quote */}
      <div className="space-y-2 text-sm">
        <Row
          label="Spot price"
          value={pool.price === null ? "—" : `$${formatPrice(pool.price)}`}
        />
        <Row label="You receive" value={quoteDisplay} />
        <Row
          label="Fee (0.3%)"
          value={
            feeUsdc !== null ? `$${feeUsdc.toFixed(4)}` : "—"
          }
        />
        <Row
          label="Price impact"
          value={
            feeImpact
              ? feeImpact.impactPct < 0.01
                ? "<0.01%"
                : `${feeImpact.impactPct.toFixed(2)}%`
              : "—"
          }
        />
      </div>

      {/* Explorer link */}
      {swapHash && (
        <a
          href={getExplorerTxUrl(swapHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--accent)" }}
        >
          <ExternalLink size={11} /> View transaction
        </a>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={btnDisabled}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 "
        style={{
          background: "#ffffff",
          color: side === "buy" ? "var(--success)" : "var(--danger)",
          border: "none",
          boxShadow: !btnDisabled
            ? "0 4px 20px rgba(255,255,255,0.15)"
            : "none",
        }}
      >
        {isLoading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}

        {!isLoading && side === "buy" && <Zap size={14} />}

        {getBtn()}
      </button>

      <p className="text-center text-xs" style={{ color: "var(--subtle)" }}>
        {isTestnet
          ? "⚠ Testnet — AMM pool seeded with mock tokens"
          : `${config.label} — live AMM pool`}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--subtle)" }}>{label}</span>
      <span
        className="tabular mono font-semibold"
        style={{ color: accent ? "var(--accent)" : "var(--ink-2)" }}
      >
        {value}
      </span>
    </div>
  );
}
