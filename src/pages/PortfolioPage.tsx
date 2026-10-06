import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { ConnectKitButton } from "connectkit";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ADDRESS,
  CONTRACT_ADDRESSES,
  PAIRS,
  BASE_TOKENS,
} from "../constants";
import { formatUsdc } from "../utils";
import PositionsTable from "../components/PositionsTable";
import PerpEngineArtifact from "../../contracts/out/PerpEngine.sol/PerpEngine.json";

const BaseTokenBalance = ({ pairId }: { pairId: number }) => {
  const { address, isConnected } = useAccount();
  const pair = PAIRS[pairId as 0 | 1 | 2];
  const tokenAddr = BASE_TOKENS[pairId];

  const { data: bal } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && !!tokenAddr },
  });

  const formatted = bal ? (Number(bal) / 1e18).toFixed(4) : "0.0000";

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl"
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ background: `${pair.color}1a`, color: pair.color }}
        >
          {pair.ticker.slice(0, 2)}
        </div>
        <div>
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            {pair.ticker}
          </div>
          <div className="text-xs" style={{ color: "var(--subtle)" }}>
            {pair.name}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className="tabular mono font-semibold"
          style={{ color: "var(--ink-2)" }}
        >
          {formatted}
        </div>
        <div className="text-xs" style={{ color: "var(--subtle)" }}>
          {pair.ticker}
        </div>
      </div>
    </div>
  );
};

const BalanceCard = ({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: string;
}) => {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--surface-strong)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs mb-2" style={{ color: "var(--subtle)" }}>
        {label}
      </div>
      <div
        className="tabular mono font-bold text-2xl display mb-1"
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--subtle)" }}>
        {sublabel}
      </div>
    </div>
  );
};

const PortfolioPage = () => {
  const { address, isConnected } = useAccount();

  const { data: usdcBalance } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address },
  });

  const { data: marginBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.perpEngine,
    abi: PerpEngineArtifact.abi,
    functionName: "marginAccounts",
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: {
      enabled: isConnected && !!address && !!CONTRACT_ADDRESSES.perpEngine,
    },
  });

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20 flex flex-col items-center gap-6 max-w-screen-2xl">
        <div className="text-center space-y-2">
          <h1 className="display text-2xl font-bold text-orange">Portfolio</h1>
          <p className="text-sm" style={{ color: "var(--subtle)" }}>
            Connect your wallet to view your balances and positions
          </p>
        </div>
        <ConnectKitButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-8 max-w-screen-2xl">
      <h1
        className="display text-2xl font-bold"
        style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
      >
        Portfolio
      </h1>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BalanceCard
          label="Wallet USDC"
          value={`$${formatUsdc(usdcBalance)}`}
          sublabel="Available in wallet"
          color="white"
        />
        <BalanceCard
          label="Deposited Margin"
          value={`$${formatUsdc(marginBalance as bigint | undefined)}`}
          sublabel="Free in PerpEngine"
          color="var(--sunset)"
        />
        <BalanceCard
          label="Net Worth"
          value={`$${(
            (Number(usdcBalance ?? 0n) + Number(marginBalance ?? 0n)) /
            1e6
          ).toFixed(2)}`}
          sublabel="USDC equivalent"
          color="var(--success)"
        />
      </div>

      {/* Spot holdings */}
      <div>
        <h2
          className="display text-lg font-semibold mb-3"
          style={{ color: "var(--ink)" }}
        >
          Spot Holdings
        </h2>
        <div className="space-y-2">
          {[0, 1, 2].map((id) => (
            <BaseTokenBalance key={id} pairId={id} />
          ))}
        </div>
      </div>

      {/* Futures positions */}
      <div>
        <h2
          className="display text-lg font-semibold mb-3"
          style={{ color: "var(--ink)" }}
        >
          Open Futures Positions
        </h2>
        <PositionsTable />
      </div>
    </div>
  );
};

export default PortfolioPage;
