import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { formatAddress } from "../utils";
import { TRADING_CHAIN_ID } from "../config";

/**
 * Wallet button with a network guard.
 *
 * The app trades on Arc Mainnet (TRADING_CHAIN_ID), so a wallet sitting
 * elsewhere gets a one-click switch back. This is a convenience, not a
 * restriction — the full network switcher lives in the navbar via DynamicNav,
 * and the user is free to be on Ethereum, Base, or Arc Testnet at any time
 * (e.g. while bridging).
 */
export default function WalletButton() {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [switching, setSwitching] = useState(false);

  const offTradingChain = isConnected && chainId !== TRADING_CHAIN_ID;

  const handleSwitch = () => {
    setSwitching(true);
    switchChain(
      { chainId: TRADING_CHAIN_ID },
      {
        onSuccess: () => {
          setSwitching(false);
          toast.success("Switched to Arc Mainnet");
        },
        onError: (error) => {
          setSwitching(false);
          toast.error("Could not switch network", {
            description: error.message.split("\n")[0],
          });
        },
      },
    );
  };

  const busy = switching || isPending;

  return (
    <div className="flex items-center gap-2">
      {offTradingChain && (
        <button
          onClick={handleSwitch}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-60"
          style={{
            background: "rgba(234,179,8,0.15)",
            border: "1px solid rgba(234,179,8,0.4)",
            color: "#eab308",
          }}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <AlertTriangle size={14} />
          )}
          {busy ? "Switching…" : "Switch to Arc Mainnet"}
        </button>
      )}

      <ConnectKitButton.Custom>
        {({ isConnected: ckConnected, show, address, isConnecting }) => (
          <button
            onClick={show}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all"
            style={{
              background: ckConnected
                ? "var(--surface-strong)"
                : "var(--accent)",
              color: ckConnected ? "var(--ink)" : "#fff",
              border: ckConnected ? "1px solid var(--border)" : "none",
            }}
          >
            {isConnecting
              ? "Connecting..."
              : ckConnected && address
                ? formatAddress(address)
                : "Connect Wallet"}
          </button>
        )}
      </ConnectKitButton.Custom>
    </div>
  );
}
