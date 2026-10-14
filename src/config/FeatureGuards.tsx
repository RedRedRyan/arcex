/**
 * Feature guards — one place to gate network-specific UI and routes.
 *
 * Use these instead of scattering `isMainnet` checks through components.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useNetwork, useNetworkFeature } from "./NetworkProvider";
import type { FeatureKey } from "./networks";

/** True when the feature is available on the active network. */
export function useFeatureEnabled(feature: FeatureKey): boolean {
  return useNetworkFeature(feature);
}

interface GateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Shown instead of `children` when the feature is unavailable. */
  fallback?: ReactNode;
}

/**
 * Renders `children` only when the feature is enabled on the active network.
 * With no `fallback`, renders nothing.
 */
export function FeatureGate({ feature, children, fallback = null }: GateProps) {
  const enabled = useFeatureEnabled(feature);
  return <>{enabled ? children : fallback}</>;
}

/** Renders children on Mainnet only. */
export function MainnetOnly({ children, fallback = null }: Omit<GateProps, "feature">) {
  return <FeatureGate feature="bridge" fallback={fallback}>{children}</FeatureGate>;
}

/** Renders children on Testnet only. */
export function TestnetOnly({ children, fallback = null }: Omit<GateProps, "feature">) {
  const { isTestnet } = useNetwork();
  return <>{isTestnet ? children : fallback}</>;
}

/**
 * Locked-state notice for a gated feature. Used by nav entries and routes so
 * the reason is always visible rather than silently absent.
 */
export function FeatureLockedNotice({
  feature,
  title,
}: {
  feature: FeatureKey;
  title: string;
}) {
  const { isMainnet } = useNetwork();
  const reason = isMainnet
    ? "Faucet is available on Testnet only"
    : "Bridge is available on Mainnet only";

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
        color: "var(--subtle)",
      }}
      title={reason}
    >
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {title}
        <span className="ml-1 opacity-70">· {reason}</span>
      </span>
    </div>
  );
}

/**
 * Route guard. Blocks a gated route and shows a locked page instead of
 * silently rendering broken UI — also catches direct URL entry.
 */
export function NetworkRouteGuard({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const enabled = useFeatureEnabled(feature);
  const { config } = useNetwork();
  const isBridge = feature === "bridge";

  if (enabled) return <>{children}</>;

  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <div
        className="grid size-12 place-items-center rounded-full"
        style={{ background: "rgba(255,255,255,0.06)", color: "var(--subtle)" }}
      >
        <Lock className="size-5" aria-hidden="true" />
      </div>
      <h1 className="display text-xl font-bold" style={{ color: "var(--ink)" }}>
        {isBridge ? "Bridge is on Mainnet" : "Faucet is on Testnet"}
      </h1>
      <p className="text-sm" style={{ color: "var(--subtle)" }}>
        {isBridge
          ? "Bridging moves real USDC, so it is only available on Arc Mainnet. Switch your network to Mainnet to continue."
          : "The faucet drips testnet USDC, so it is only available on Arc Testnet. Switch your network to Testnet to continue."}
      </p>
      <p className="text-xs" style={{ color: "var(--subtle)" }}>
        You are currently on {config.label}.
      </p>
      <Link
        to="/"
        className="rounded-lg px-4 py-2 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Back to markets
      </Link>
    </div>
  );
}
