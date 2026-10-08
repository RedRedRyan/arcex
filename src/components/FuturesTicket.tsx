import { useState, useCallback, useRef, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { toast } from "sonner";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, CONTRACT_ADDRESSES, PAIRS, MAX_LEVERAGE } from "../constants";
import { PairId } from "../types";
import { parseUsdc, formatUsdc, calcLiqPrice, getExplorerTxUrl } from "../utils";
import PerpEngineArtifact from "../../contracts/contract-metadata/PerpEngine.json";
import { useWalletBalances } from "../../data/MarketStore";
import { usePoolFeed } from "../../data/OracleFeed";

interface FuturesTicketProps {
  pairId: PairId;
}

export default function FuturesTicket({ pairId }: FuturesTicketProps) {
  const [side, setSide] = useState<"long" | "short">("long");
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

  // Deposited margin
  const { data: depositedMargin, refetch: refetchMargin } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine,
    abi: PerpEngineArtifact.abi,
    functionName: "marginAccounts",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });

  // Existing position for this pair
  const { data: position, refetch: refetchPos } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine,
    abi: PerpEngineArtifact.abi,
    functionName: "positions",
    args: address ? [address, pairId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });
  const hasOpenPosition = Array.isArray(position) ? position[8] : false;

  // Allowance for PerpEngine
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CONTRACT_ADDRESSES.perpEngine] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });

  const sizeUsdc = parseUsdc(amount);
  const marginRequired = sizeUsdc / BigInt(leverage);
  const openFee = sizeUsdc / 10000n; // 0.01% base — note contract uses 10 bps (0.1%)
  const totalRequired = marginRequired + openFee;
  const needsApproval = !allowance || (allowance) < totalRequired;
  const hasEnoughMargin = (depositedMargin as bigint ?? 0n) >= totalRequired;

  const SEED_PRICE = market.price ?? 0;
  const liqPrice = amount && parseFloat(amount) > 0 && SEED_PRICE > 0
    ? calcLiqPrice(SEED_PRICE, leverage, side === "long")
    : null;

  // Approve USDC
  const { writeContract: doApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });

  // Deposit margin
  const { writeContract: doDeposit, data: depositHash, isPending: isDepositing } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });

  // Open position
  const { writeContract: doOpen, data: openHash, isPending: isOpening } = useWriteContract();
  const { isLoading: isOpenConfirming, isSuccess: openSuccess } = useWaitForTransactionReceipt({ hash: openHash });

  const handleApprove = useCallback(() => {
    if (!address) return;
    doApprove({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACT_ADDRESSES.perpEngine, totalRequired * 100n],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [doApprove, totalRequired, address]);

  const handleDeposit = useCallback(() => {
    if (!address) return;
    doDeposit({
      address: CONTRACT_ADDRESSES.perpEngine,
      abi: PerpEngineArtifact.abi,
      functionName: "depositMargin",
      args: [totalRequired],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [doDeposit, totalRequired, address]);

  const handleOpenPosition = useCallback(() => {
    if (!address) return;
    doOpen({
      address: CONTRACT_ADDRESSES.perpEngine,
      abi: PerpEngineArtifact.abi,
      functionName: "openPosition",
      args: [pairId, side === "long", sizeUsdc, leverage],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  }, [doOpen, pairId, side, sizeUsdc, leverage, address]);

  // After deposit confirmed → open position (only fire once)
  const posOpenedRef = useRef(false);
  useEffect(() => {
    if (depositSuccess && depositHash && !openHash && !posOpenedRef.current) {
      posOpenedRef.current = true;
      handleOpenPosition();
    }
  }, [depositSuccess, depositHash, openHash, handleOpenPosition]);

  useEffect(() => {
    if (openSuccess && openHash) {
      toast.success("Position opened!", { description: `${openHash.slice(0, 14)}...` });
      refetchMargin();
      refetchPos();
      refetchAllowance();
    }
  }, [openSuccess, openHash, refetchMargin, refetchPos, refetchAllowance]);

  const isLoading = isApproving || isApproveConfirming || isDepositing || isDepositConfirming || isOpening || isOpenConfirming;

  const getBtn = () => {
    if (!isConnected) return "Connect Wallet";
    if (isWrongChain) return "Switch to Arc Testnet";
    if (hasOpenPosition) return `Position Already Open`;
    if (isApproving || isApproveConfirming) return "Approving USDC...";
    if (isDepositing || isDepositConfirming) return "Depositing Margin...";
    if (isOpening || isOpenConfirming) return "Opening Position...";
    if (needsApproval && totalRequired > 0n) return "Approve USDC";
    if (!hasEnoughMargin && totalRequired > 0n) return "Deposit Margin First";
    return `${side === "long" ? "Long" : "Short"} ${pair.ticker} ${leverage}×`;
  };

  const handleSubmit = () => {
    if (!isConnected) return;
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    if (hasOpenPosition) { toast.error("Close current position first"); return; }
    if (needsApproval && totalRequired > 0n) { handleApprove(); return; }
    if (!hasEnoughMargin && totalRequired > 0n) { handleDeposit(); return; }
    handleOpenPosition();
  };

  const btnDisabled = isLoading || hasOpenPosition ||
    (isConnected && !isWrongChain && (!amount || parseFloat(amount) <= 0));

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="display font-semibold text-sm" style={{ color: "var(--ink)" }}>Futures Trade</h3>
        <div className="text-xs" style={{ color: "var(--subtle)" }}>
          Margin: <span className="mono tabular font-semibold" style={{ color: "var(--ink-2)" }}>
            {formatUsdc(depositedMargin as bigint | undefined)} USDC
          </span>
        </div>
      </div>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: "var(--surface-muted)" }}>
        {(["long", "short"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="py-2 rounded-lg text-sm font-bold uppercase transition-all flex items-center justify-center gap-1.5"
            style={{
              background: side === s
                ? s === "long" ? "rgba(141,216,159,0.2)" : "rgba(232,109,122,0.2)"
                : "transparent",
              color: side === s
                ? s === "long" ? "var(--success)" : "var(--danger)"
                : "var(--subtle)",
              border: `1px solid ${side === s ? (s === "long" ? "rgba(141,216,159,0.4)" : "rgba(232,109,122,0.4)") : "transparent"}`,
            }}
          >
            {s === "long" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {s}
          </button>
        ))}
      </div>

      {/* Position size */}
      <div>
        <label className="block text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
          Position size (USDC notional)
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
            className="flex-1 bg-transparent outline-none text-xl font-bold tabular mono"
            style={{ color: "var(--ink)" }}
          />
          <span
            className="text-sm font-semibold px-2 py-1 rounded-lg"
            style={{ background: "var(--surface-strong)", color: "var(--subtle)" }}
          >
            USDC
          </span>
        </div>
        <div className="flex justify-between mt-1.5 text-xs" style={{ color: "var(--subtle)" }}>
          <span>
            Wallet: {formatUsdc(BigInt(Math.round(usdcBalance * 1e6)))} USDC
          </span>
          <button
            onClick={() => usdcBalance && setAmount(usdcBalance.toFixed(2))}
            className="font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Max
          </button>
        </div>
      </div>

      {/* Leverage slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs" style={{ color: "var(--subtle)" }}>Leverage</label>
          <span
            className="mono font-bold text-sm px-2 py-0.5 rounded"
            style={{ background: "rgba(251,79,31,0.12)", color: "var(--accent)" }}
          >
            {leverage}×
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: "var(--accent)" }}
        />
        <div className="flex justify-between text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
          {[1, 5, 10, 15, 20].map((v) => (
            <button key={v} onClick={() => setLeverage(v)} style={{ color: leverage === v ? "var(--accent)" : undefined }}>
              {v}×
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)" }} />

      {/* Preview */}
      <div className="space-y-2 text-sm">
        <Row label="Margin required" value={amount ? `$${(parseFloat(amount || "0") / leverage).toFixed(2)}` : "—"} />
        <Row label="Opening fee (0.1%)" value={amount ? `$${(parseFloat(amount || "0") * 0.001).toFixed(4)}` : "—"} />
        <Row
          label="Est. liq. price"
          value={liqPrice ? `$${liqPrice.toFixed(2)}` : "—"}
          danger={!!liqPrice}
        />
        <Row
          label="Notional exposure"
          value={amount ? `$${(parseFloat(amount || "0")).toFixed(2)}` : "—"}
          accent
        />
      </div>

      {/* Explorer link */}
      {openHash && (
        <a
          href={getExplorerTxUrl(openHash)}
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
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        style={{
          background: side === "long"
            ? "linear-gradient(135deg, var(--accent), var(--sunset))"
            : "rgba(232,109,122,0.2)",
          color: side === "long" ? "#fff" : "var(--danger)",
          border: side === "long" ? "none" : "1.5px solid var(--danger)",
          boxShadow: side === "long" && !btnDisabled ? "0 4px 20px rgba(251,79,31,0.3)" : "none",
        }}
      >
        {isLoading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {getBtn()}
      </button>

      <p className="text-center text-xs" style={{ color: "var(--subtle)" }}>
        ⚠ Testnet — simplified perpetual engine, not audited
      </p>
    </div>
  );
}

function Row({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--subtle)" }}>{label}</span>
      <span
        className="tabular mono font-semibold"
        style={{ color: danger ? "var(--danger)" : accent ? "var(--accent)" : "var(--ink-2)" }}
      >
        {value}
      </span>
    </div>
  );
}
