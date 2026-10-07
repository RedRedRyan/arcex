import { useState, useCallback, useEffect, useRef } from "react";
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
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  CONTRACT_ADDRESSES,
  PAIRS,
  BASE_TOKENS,
} from "../constants";
import { PairId } from "../types";
import { parseUsdc, formatUsdc, getExplorerTxUrl } from "../utils";
import SpotPoolArtifact from "../../contracts/out/SpotPoolFactory.sol/SpotPoolFactory.json";
import MockERC20Artifact from "../../contracts/out/MockERC20.sol/MockERC20.json";

interface SpotTicketProps {
  pairId: PairId;
}

export default function SpotTicket({ pairId }: SpotTicketProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;
  const pair = PAIRS[pairId];
  const baseToken = BASE_TOKENS[pairId];

  // USDC balance
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address },
  });

  // Base token balance
  const { data: baseBalance, refetch: refetchBase } = useReadContract({
    address: baseToken,
    abi: MockERC20Artifact.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!baseToken },
  });

  // Pool state — check if active and has liquidity
  const { data: poolState } = useReadContract({
    address: CONTRACT_ADDRESSES.spotPool,
    abi: SpotPoolArtifact.abi,
    functionName: "pools",
    args: [pairId],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!CONTRACT_ADDRESSES.spotPool },
  });

  const poolActive = Array.isArray(poolState) ? poolState[3] : false;
  const reserveUSDC = Array.isArray(poolState) ? (poolState[1] as bigint) : 0n;
  const reserveBase = Array.isArray(poolState) ? (poolState[2] as bigint) : 0n;
  const hasLiquidity = reserveUSDC > 0n && reserveBase > 0n;

  // Allowance for SpotPool
  const spender = CONTRACT_ADDRESSES.spotPool;
  const tokenToApprove = side === "buy" ? ARC_USDC_ADDRESS : baseToken;
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenToApprove,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
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
    address: CONTRACT_ADDRESSES.spotPool,
    abi: SpotPoolArtifact.abi,
    functionName: "getAmountOut",
    args: [
      pairId,
      side === "buy",
      side === "buy" ? amountBigint : amountBaseIn,
    ],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: {
      enabled:
        !!CONTRACT_ADDRESSES.spotPool &&
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
      refetchUsdc();
      refetchBase();
      refetchAllowance();
    }
  }, [swapSuccess, swapHash, refetchUsdc, refetchBase, refetchAllowance]);

  const handleApprove = useCallback(() => {
    if (!address || !spender) return;
    approve({
      address: tokenToApprove,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, effectiveAmount * 100n],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [approve, tokenToApprove, spender, effectiveAmount, address]);

  const handleSwap = useCallback(() => {
    if (!address || !CONTRACT_ADDRESSES.spotPool) {
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
    if (side === "buy") {
      doSwap({
        address: CONTRACT_ADDRESSES.spotPool,
        abi: SpotPoolArtifact.abi,
        functionName: "swapUSDCForBase",
        args: [pairId, amountBigint, 0n, address],
        chainId: ARC_TESTNET_CHAIN_ID,
      });
    } else {
      doSwap({
        address: CONTRACT_ADDRESSES.spotPool,
        abi: SpotPoolArtifact.abi,
        functionName: "swapBaseForUSDC",
        args: [pairId, amountBaseIn, 0n, address],
        chainId: ARC_TESTNET_CHAIN_ID,
      });
    }
  }, [
    address,
    pairId,
    side,
    amountBigint,
    amountBaseIn,
    doSwap,
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

  const getBtn = () => {
    if (!isConnected) return "Connect Wallet";
    if (isWrongChain) return "Switch to Arc Testnet";
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
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
      return;
    }
    if (!poolActive || !hasLiquidity) return;
    if (needsApproval && effectiveAmount > 0n) {
      handleApprove();
      return;
    }
    handleSwap();
  };

  const btnDisabled =
    isLoading ||
    !poolActive ||
    !hasLiquidity ||
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
              ? `Balance: ${formatUsdc(usdcBalance)} USDC`
              : `Balance: ${baseBalance ? (Number(baseBalance) / 1e18).toFixed(4) : "0.0000"} ${pair.ticker}`}
          </span>
          <button
            onClick={() => {
              if (side === "buy" && usdcBalance)
                setAmount((Number(usdcBalance) / 1e6).toFixed(2));
              else if (side === "sell" && baseBalance)
                setAmount((Number(baseBalance) / 1e18).toFixed(4));
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
        <Row label="You receive" value={quoteDisplay} />
        <Row
          label="Fee (0.3%)"
          value={
            amount ? `$${(parseFloat(amount || "0") * 0.003).toFixed(4)}` : "—"
          }
        />
        <Row
          label="Price impact"
          value={amount && parseFloat(amount) > 0 ? "<0.1%" : "—"}
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
        ⚠ Testnet — AMM pool seeded with mock tokens
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
