import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ExternalLink, X } from "lucide-react";
import { CONTRACT_ADDRESSES, PAIRS, ARC_TESTNET_CHAIN_ID } from "../constants";
import { formatUsdc, formatPrice, getExplorerTxUrl } from "../utils";
import PerpEngineArtifact from "../../contracts/out/PerpEngine.sol/PerpEngine.json";
import { PairId } from "../types";

interface PositionRowData {
  pairId: PairId;
  isLong: boolean;
  sizeUsdc: bigint;
  entryPrice: bigint;
  margin: bigint;
  leverage: number;
  isOpen: boolean;
}

function PositionRow({ data, pairId }: { data: PositionRowData; pairId: PairId }) {
  const { address } = useAccount();
  const pair = PAIRS[pairId];

  const { data: pnl } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine || undefined,
    abi: PerpEngineArtifact.abi,
    functionName: "getUnrealizedPnl",
    args: address ? [address, pairId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!CONTRACT_ADDRESSES.perpEngine && data.isOpen },
  });

  const { data: liqPrice } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine || undefined,
    abi: PerpEngineArtifact.abi,
    functionName: "getLiquidationPrice",
    args: address ? [address, pairId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!CONTRACT_ADDRESSES.perpEngine && data.isOpen },
  });

  const { writeContract: closePos, data: closeTxHash, isPending: isClosing } = useWriteContract();
  const { isLoading: isCloseConfirming } = useWaitForTransactionReceipt({ hash: closeTxHash });

  const handleClose = () => {
    if (!CONTRACT_ADDRESSES.perpEngine) return;
    closePos({
      address: CONTRACT_ADDRESSES.perpEngine,
      abi: PerpEngineArtifact.abi,
      functionName: "closePosition",
      args: [pairId],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  };

  const pnlBigint = pnl as bigint | undefined;
  const pnlPositive = pnlBigint !== undefined && pnlBigint >= 0n;

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: `${pair.color}22`, color: pair.color }}
          >
            {pair.ticker.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{pair.ticker}/USDC</div>
            <div
              className="text-xs font-medium"
              style={{ color: data.isLong ? "var(--success)" : "var(--danger)" }}
            >
              {data.isLong ? "Long" : "Short"} {data.leverage}×
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 tabular mono text-sm" style={{ color: "var(--ink-2)" }}>
        ${formatUsdc(data.sizeUsdc)}
      </td>
      <td className="py-3 px-4 tabular mono text-sm" style={{ color: "var(--ink-2)" }}>
        ${formatPrice(data.entryPrice)}
      </td>
      <td className="py-3 px-4 tabular mono text-sm" style={{ color: "var(--ink-2)" }}>
        ${formatUsdc(data.margin)}
      </td>
      <td className="py-3 px-4 tabular mono text-sm" style={{ color: pnlPositive ? "var(--success)" : "var(--danger)" }}>
        {pnlBigint !== undefined ? (pnlPositive ? "+" : "") + "$" + formatUsdc(pnlBigint < 0n ? -pnlBigint : pnlBigint) : "—"}
      </td>
      <td className="py-3 px-4 tabular mono text-sm" style={{ color: "var(--danger)" }}>
        {liqPrice ? `$${formatPrice(liqPrice as bigint)}` : "—"}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {closeTxHash && (
            <a href={getExplorerTxUrl(closeTxHash)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} style={{ color: "var(--accent)" }} />
            </a>
          )}
          <button
            onClick={handleClose}
            disabled={isClosing || isCloseConfirming}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: "rgba(232,109,122,0.15)", color: "var(--danger)" }}
          >
            <X size={11} />
            {isClosing || isCloseConfirming ? "Closing..." : "Close"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function PositionsTable() {
  const { address, isConnected } = useAccount();

  // Read positions for each pair
  const { data: pos0 } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine || undefined,
    abi: PerpEngineArtifact.abi,
    functionName: "positions",
    args: address ? [address, 0] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });
  const { data: pos1 } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine || undefined,
    abi: PerpEngineArtifact.abi,
    functionName: "positions",
    args: address ? [address, 1] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });
  const { data: pos2 } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine || undefined,
    abi: PerpEngineArtifact.abi,
    functionName: "positions",
    args: address ? [address, 2] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine },
  });

  type RawPos = [number, boolean, bigint, bigint, bigint, number, bigint, bigint, boolean];

  const parsePos = (raw: unknown, pairId: PairId): (PositionRowData & { pairId: PairId }) | null => {
    if (!Array.isArray(raw)) return null;
    const r = raw as RawPos;
    if (!r[8]) return null; // isOpen at index 8
    return {
      pairId,
      isLong: r[1],
      sizeUsdc: r[2],
      entryPrice: r[3],
      margin: r[4],
      leverage: Number(r[5]),
      isOpen: r[8],
    };
  };

  const openPositions = [
    parsePos(pos0, 0),
    parsePos(pos1, 1),
    parsePos(pos2, 2),
  ].filter(Boolean) as (PositionRowData & { pairId: PairId })[];

  if (!isConnected) {
    return (
      <div className="glass rounded-2xl p-8 text-center" style={{ color: "var(--subtle)" }}>
        Connect your wallet to see open positions
      </div>
    );
  }

  if (!CONTRACT_ADDRESSES.perpEngine) {
    return (
      <div className="glass rounded-2xl p-8 text-center" style={{ color: "var(--subtle)" }}>
        Contracts deploying — check back shortly
      </div>
    );
  }

  if (openPositions.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center" style={{ color: "var(--subtle)" }}>
        No open futures positions
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-semibold display" style={{ color: "var(--ink)" }}>Open Positions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Asset", "Size", "Entry", "Margin", "PnL", "Liq. Price", "Action"].map((h) => (
                <th key={h} className="py-2 px-4 text-left text-xs font-medium" style={{ color: "var(--subtle)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openPositions.map((pos) => (
              <PositionRow key={pos.pairId} data={pos} pairId={pos.pairId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
