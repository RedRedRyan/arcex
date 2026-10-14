/**
 * NetworkBadge — persistent indicator of the active network, shown in the
 * header so the user always knows whether they are on Testnet or Mainnet.
 */

import { FlaskConical, Globe } from "lucide-react";
import { useNetwork } from "./NetworkProvider";

export function NetworkBadge() {
  const { network, config, unsupportedChain } = useNetwork();
  const isMainnet = network === "mainnet";
  const color = isMainnet ? "#10b981" : "#f59e0b";
  const Icon = isMainnet ? Globe : FlaskConical;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        color,
        boxShadow: `0 0 10px ${color}33`,
      }}
      title={
        unsupportedChain
          ? `Wallet is on an unsupported chain. Switch to ${config.label} in your wallet.`
          : `Active network: ${config.label} (chain ${config.chainId})`
      }
      aria-live="polite"
    >
      <Icon className="size-3" aria-hidden="true" />
      {unsupportedChain ? "Unsupported chain" : config.shortLabel}
      {/* Mirrors the chain id so a mis-set RPC is obvious at a glance. */}
      <span className="hidden opacity-60 sm:inline">{config.chainId}</span>
    </span>
  );
}

export default NetworkBadge;
