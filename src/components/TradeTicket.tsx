import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, CONTRACT_ADDRESSES, PAIRS, MAX_LEVERAGE } from "../constants";
import { TradingMode, PairId } from "../types";
import { parseUsdc, formatUsdc, calcLiqPrice, getExplorerTxUrl } from "../utils";
import PerpEngineArtifact from "../../contracts/contract-metadata/PerpEngine.json";
import SpotPoolArtifact from "../../contracts/contract-metadata/SpotPoolFactory.json";
import { useWalletBalances } from "../../data/MarketStore";
import { formatPrice, usePoolFeed } from "../../data/OracleFeed";

interface TradeTicketProps {
  pairId: PairId;
}

export default function TradeTicket({ pairId }: TradeTicketProps) {
  const [mode, setMode] = useState<TradingMode>("spot");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(5);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const walletBalances = useWalletBalances(
    isConnected ? address : undefined,
  );
  const market = usePoolFeed(pairId);
  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;
  const pair = PAIRS[pairId];
  const usdcBalance = walletBalances?.usdc ?? 0;

  // USDC allowance for the relevant contract
  const spender = mode === "spot" ? CONTRACT_ADDRESSES.spotPool : CONTRACT_ADDRESSES.perpEngine;
  const { data: allowance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!spender },
  });

  // Approve
  const { writeContract: approveUsdc, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });

  // Spot swap
  const { writeContract: doSwap, data: swapHash, isPending: isSwapping } = useWriteContract();
  const { isLoading: isSwapConfirming, isSuccess: swapSuccess } = useWaitForTransactionReceipt({ hash: swapHash });

  // Perp deposit + open
  const { writeContract: doDeposit, data: depositHash, isPending: isDepositing } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });

  const { writeContract: doOpen, data: openHash, isPending: isOpening } = useWriteContract();
  const { isLoading: isOpenConfirming, isSuccess: openSuccess } = useWaitForTransactionReceipt({ hash: openHash });

  const amountBigint = parseUsdc(amount);
  const marginRequired = amountBigint / BigInt(leverage);
  const needsApproval = !allowance || allowance < amountBigint;
  const contractsDeployed = !!CONTRACT_ADDRESSES.spotPool && !!CONTRACT_ADDRESSES.perpEngine;

  // Seed price for liquidation calc
  const SEED_PRICE = market.price ?? 0;
  const liqPrice = amount && parseFloat(amount) > 0
    ? calcLiqPrice(SEED_PRICE, leverage, side === "buy")
    : null;

  const handleSwitchChain = useCallback(() => {
    switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
  }, [switchChain]);

  const handleApprove = useCallback(() => {
    if (!spender || !amountBigint) return;
    approveUsdc({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amountBigint * 10n],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [approveUsdc, spender, amountBigint]);

  const handleSpotSwap = useCallback(() => {
    if (!address || !amountBigint || !CONTRACT_ADDRESSES.spotPool) {
      toast.error("Contracts not yet deployed");
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
        args: [pairId, amountBigint, 0n, address],
        chainId: ARC_TESTNET_CHAIN_ID,
      });
    }
  }, [address, amountBigint, side, pairId, doSwap]);

  const handleOpenPerp = useCallback(() => {
    if (!address || !amountBigint || !CONTRACT_ADDRESSES.perpEngine) {
      toast.error("Contracts not yet deployed");
      return;
    }
    // First deposit margin, then open
    doDeposit({
      address: CONTRACT_ADDRESSES.perpEngine,
      abi: PerpEngineArtifact.abi,
      functionName: "depositMargin",
      args: [marginRequired],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [address, amountBigint, marginRequired, doDeposit]);

  // After deposit confirmed, open position
  const handleOpenAfterDeposit = useCallback(() => {
    if (!address || !amountBigint || !CONTRACT_ADDRESSES.perpEngine) return;
    doOpen({
      address: CONTRACT_ADDRESSES.perpEngine,
      abi: PerpEngineArtifact.abi,
      functionName: "openPosition",
      args: [pairId, side === "buy", amountBigint, leverage],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [address, amountBigint, side, leverage, pairId, doOpen]);

  // Toast on success
  if (swapSuccess && swapHash) toast.success(`Swap confirmed`, { description: swapHash.slice(0, 20) + "..." });
  if (openSuccess && openHash) toast.success(`Position opened`, { description: openHash.slice(0, 20) + "..." });
  if (depositSuccess && !openHash) handleOpenAfterDeposit();

  const isLoading = isApproving || isApproveConfirming || isSwapping || isSwapConfirming || isDepositing || isDepositConfirming || isOpening || isOpenConfirming;

  const getButtonLabel = () => {
    if (!isConnected) return "Connect Wallet";
    if (isWrongChain) return "Switch to Arc Testnet";
    if (!contractsDeployed) return "Contracts Deploying...";
    if (isApproving || isApproveConfirming) return "Approving USDC...";
    if (isSwapping || isSwapConfirming) return "Swapping...";
    if (isDepositing || isDepositConfirming) return "Depositing Margin...";
    if (isOpening || isOpenConfirming) return "Opening Position...";
    if (needsApproval && amountBigint > 0n) return "Approve USDC";
    if (mode === "spot") return side === "buy" ? `Buy ${pair.ticker}` : `Sell ${pair.ticker}`;
    return `${side === "buy" ? "Long" : "Short"} ${pair.ticker} ${leverage}×`;
  };

  const handleSubmit = () => {
    if (!isConnected) return;
    if (isWrongChain) { handleSwitchChain(); return; }
    if (!contractsDeployed) return;
    if (needsApproval && amountBigint > 0n) { handleApprove(); return; }
    if (mode === "spot") handleSpotSwap();
    else handleOpenPerp();
  };

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface-muted)" }}>
        {(["spot", "futures"] as TradingMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
            style={{
              background: mode === m ? "var(--surface-strong)" : "transparent",
              color: mode === m ? "var(--ink)" : "var(--subtle)",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Side toggle */}
      <div className="flex gap-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="flex-1 py-2 rounded-xl text-sm font-bold uppercase transition-all"
            style={{
              background:
                side === s
                  ? s === "buy" ? "rgba(141,216,159,0.2)" : "rgba(232,109,122,0.2)"
                  : "transparent",
              color:
                side === s
                  ? s === "buy" ? "var(--success)" : "var(--danger)"
                  : "var(--subtle)",
              border: `1px solid ${side === s ? (s === "buy" ? "var(--success)" : "var(--danger)") : "transparent"}`,
            }}
          >
            {mode === "spot" ? s : s === "buy" ? "Long" : "Short"}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div>
        <label className="block text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
          {mode === "spot" ? (side === "buy" ? "USDC to spend" : `${pair.ticker} to sell`) : "Position size (USDC notional)"}
        </label>
        <div
          className="flex items-center gap-2 px-3 py-3 rounded-xl"
          style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
        >
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            className="flex-1 bg-transparent outline-none text-lg font-semibold tabular mono"
            style={{ color: "var(--ink)" }}
          />
          <span className="text-sm font-medium" style={{ color: "var(--subtle)" }}>
            {mode === "spot" && side === "sell" ? pair.ticker : "USDC"}
          </span>
        </div>
        <div className="flex justify-between mt-1.5 text-xs" style={{ color: "var(--subtle)" }}>
          <span>
            Balance: {formatUsdc(BigInt(Math.round(usdcBalance * 1e6)))} USDC
          </span>
          <button
            onClick={() => usdcBalance && setAmount(usdcBalance.toFixed(2))}
            className="font-medium"
            style={{ color: "var(--accent)" }}
          >
            Max
          </button>
        </div>
      </div>

      {/* Leverage slider — futures only */}
      {mode === "futures" && (
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-xs" style={{ color: "var(--subtle)" }}>Leverage</label>
            <span className="mono font-semibold text-sm" style={{ color: "var(--accent)" }}>{leverage}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={MAX_LEVERAGE}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-blue-400"
            style={{ accentColor: "var(--accent)" }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: "var(--subtle)" }}>
            <span>1×</span>
            <span>10×</span>
            <span>20×</span>
          </div>
        </div>
      )}

      {/* Separator */}
      <div style={{ height: 1, background: "var(--border)" }} />

      {/* Preview rows */}
      <div className="space-y-2 text-sm">
        {mode === "spot" ? (
          <>
            <Row
              label="Est. price"
              value={`$${formatPrice(market.price)}`}
            />
            <Row label="Fee (0.3%)" value={amount ? `$${(parseFloat(amount || "0") * 0.003).toFixed(2)}` : "—"} />
            <Row
              label="You receive"
              value={
                amount && market.price
                  ? `≈${(parseFloat(amount) / market.price).toFixed(4)} ${pair.ticker}`
                  : "—"
              }
            />
          </>
        ) : (
          <>
            <Row label="Margin required" value={amount ? `$${(parseFloat(amount || "0") / leverage).toFixed(2)}` : "—"} />
            <Row label="Opening fee (0.1%)" value={amount ? `$${(parseFloat(amount || "0") * 0.001).toFixed(4)}` : "—"} />
            <Row
              label="Est. liq. price"
              value={liqPrice ? `$${liqPrice.toFixed(2)}` : "—"}
              color={liqPrice ? "var(--danger)" : undefined}
            />
          </>
        )}
      </div>

      {/* Tx confirmation links */}
      {(swapHash || openHash) && (
        <a
          href={getExplorerTxUrl((swapHash ?? openHash)!)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--accent)" }}
        >
          <ExternalLink size={11} /> View transaction
        </a>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || (!isConnected ? false : (!amount || parseFloat(amount) <= 0))}
        className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
        style={{
          background: side === "buy" ? "rgba(141,216,159,0.25)" : "rgba(232,109,122,0.25)",
          color: side === "buy" ? "var(--success)" : "var(--danger)",
          border: `1.5px solid ${side === "buy" ? "var(--success)" : "var(--danger)"}`,
        }}
      >
        {isLoading && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />}
        {getButtonLabel()}
      </button>

      <p className="text-center text-xs" style={{ color: "var(--subtle)" }}>
        ⚠ Testnet demo — not audited for production use
      </p>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--subtle)" }}>{label}</span>
      <span className="tabular mono font-medium" style={{ color: color ?? "var(--ink-2)" }}>{value}</span>
    </div>
  );
}
