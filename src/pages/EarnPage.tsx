import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import {
  ExternalLink,
  Info,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useNetwork } from "../config/NetworkProvider";
import { NetworkBadge } from "../config/NetworkBadge";
import { FeatureLockedNotice } from "../config/FeatureGuards";
import { AssetIcon } from "../components/AssetIcon";
import {
  formatApy,
  formatCompact,
  formatFee,
  formatUsdc,
  type EarnVault,
} from "../config/earn";
import { useEarnVaults, type EarnActionOutcome } from "../hooks/useEarnVaults";

/** Emerald accent — Earn is a mainnet surface, matching the Portfolio identity. */
const ACCENT_GLOW = "glow-emerald";

function VaultCard({
  vault,
  onDeposit,
  pending,
  disabledReason,
}: {
  vault: EarnVault;
  onDeposit: (v: EarnVault) => void;
  pending: boolean;
  disabledReason: string | null;
}) {
  const lowLiquidity = vault.status === "low_liquidity";
  const hasWarnings = vault.warnings.length > 0;

  return (
    <div className="vault-card">
      <div className="vault-head">
        <AssetIcon symbol="USDC" size={34} />
        <div className="vault-id">
          <div className="vault-name">{vault.name}</div>
          <div className="vault-sub">
            {vault.protocol} · {vault.manager}
          </div>
        </div>
        <div className="vault-apy">
          <span className="vault-apy-value">{formatApy(vault.apy)}</span>
          <span className="vault-apy-label">APY</span>
        </div>
      </div>

      <div className="vault-stats">
        <div className="vault-stat">
          <span className="vault-stat-label">Total deposits</span>
          <span className="vault-stat-value">
            ${formatCompact(vault.totalDeposits)}
          </span>
        </div>
        <div className="vault-stat">
          <span className="vault-stat-label">Available liquidity</span>
          <span className={`vault-stat-value ${lowLiquidity ? "warn" : ""}`}>
            ${formatCompact(vault.liquidity)}
          </span>
        </div>
        <div className="vault-stat">
          <span className="vault-stat-label">Fees</span>
          <span className="vault-stat-value">
            {formatFee(vault.managementFee)} mgmt
            {vault.performanceFee > 0 && (
              <> · {formatFee(vault.performanceFee)} perf</>
            )}
          </span>
        </div>
      </div>

      <div className="vault-flags">
        <a
          className="vault-contract"
          href={`https://abscan.org/address/${vault.vaultAddress}`}
          target="_blank"
          rel="noreferrer noopener"
          title={vault.vaultAddress}
        >
          {vault.vaultAddress.slice(0, 6)}…{vault.vaultAddress.slice(-4)}
          <ExternalLink size={11} />
        </a>
        <button
          type="button"
          className="deposit-btn bg-white text-black"
          onClick={() => onDeposit(vault)}
          disabled={pending}
          title={disabledReason ?? undefined}
        >
          {pending ? "Depositing…" : "Deposit"}
        </button>
      </div>
    </div>
  );
}

export default function EarnPage() {
  const { config } = useNetwork();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const {
    vaults,
    loading,
    error,
    enabled,
    unavailable,
    refetch,
    deposit,
    pending,
  } = useEarnVaults();
  const [selected, setSelected] = useState<EarnVault | null>(null);
  const [amount, setAmount] = useState("");
  const [outcome, setOutcome] = useState<
    string | (EarnActionOutcome & { txHash?: string }) | null
  >(null);

  const wrongChain = isConnected && chainId !== config.chain.id;

  const vaultsToShow = useMemo(() => {
    const copy = [...vaults];
    copy.sort((a, b) => b.apy - a.apy);
    return copy.slice(0, 6);
  }, [vaults]);

  useEffect(() => {
    if (!selected) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setSelected(null);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selected, pending]);

  const onDeposit = (v: EarnVault) => {
    setSelected(v);
    setAmount("");
    setOutcome(null);
  };

  const confirmDeposit = async () => {
    if (!selected) return;
    if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(amount.trim())) {
      setOutcome("Enter a valid USDC amount with up to 6 decimal places.");
      return;
    }

    const trimmedAmount = amount.trim();
    const value = Number(trimmedAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setOutcome("Enter an amount greater than zero.");
      return;
    }
    const normalizedAmount = trimmedAmount.startsWith(".")
      ? `0${trimmedAmount}`
      : trimmedAmount;
    const result: EarnActionOutcome & { txHash?: string } = await deposit(
      selected.vaultAddress,
      normalizedAmount,
    );
    setOutcome(result);
  };

  const switchToRequiredChain = async () => {
    try {
      await switchChainAsync({ chainId: config.chain.id });
      setOutcome(null);
    } catch (err) {
      setOutcome(
        err instanceof Error
          ? err.message
          : "Could not switch to Arc Mainnet. Switch networks in your wallet and try again.",
      );
    }
  };

  // ── Testnet: Earn is mainnet-only ─────────────────────────────────────────
  if (!enabled) {
    return (
      <div className={`page fade-in ${ACCENT_GLOW}`}>
        <div className="page-head">
          <div className="page-head-left">
            <h1>Earn</h1>
            <div className="head-sub">
              <NetworkBadge />
              <span className="tagline">Vault yield on USDC</span>
            </div>
          </div>
        </div>

        <div className="earn-locked">
          <FeatureLockedNotice
            feature="bridge"
            title="Earn is available on Mainnet only"
          />
          <p className="earn-locked-note">
            {unavailable
              ? "Live vaults are deployed on Arc mainnet. Switch your wallet to mainnet to see real APYs and deposit."
              : "Vaults could not be loaded for this network."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`page fade-in ${ACCENT_GLOW}`}>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Deposit USDC into audited vaults</h1>
        </div>
        <button className="" onClick={() => void refetch()}>
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="earn-disclaimer">
        <Info size={14} />
        <span>
          Yield is variable and not guaranteed. Deposits go straight from your
          wallet into the vault contract — arcex never holds your USDC.
        </span>
      </div>

      {wrongChain && (
        <div className="notice notice-warn">
          Switch your wallet to Arc mainnet to deposit.
        </div>
      )}
      {!isConnected && (
        <div className="notice notice-warn">
          Connect a wallet to deposit into a vault.
        </div>
      )}
      {error && <div className="notice notice-error">{error}</div>}

      {loading ? (
        <div className="vault-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="vault-card" key={i}>
              <div
                className="sk"
                style={{ height: 34, width: 34, borderRadius: 17 }}
              />
              <div style={{ height: 10 }} />
              <div className="sk" style={{ height: 14, width: "60%" }} />
              <div style={{ height: 8 }} />
              <div className="sk" style={{ height: 12, width: "40%" }} />
              <div style={{ height: 14 }} />
              <div
                className="sk"
                style={{ height: 30, width: "100%", borderRadius: 8 }}
              />
            </div>
          ))}
        </div>
      ) : vaultsToShow.length === 0 ? (
        <div className="empty-note">
          No vaults are available right now. Try refreshing.
        </div>
      ) : (
        <div className="vault-grid">
          {vaultsToShow.map((v) => (
            <VaultCard
              key={v.vaultAddress}
              vault={v}
              onDeposit={onDeposit}
              pending={pending && selected?.vaultAddress === v.vaultAddress}
              disabledReason={
                !isConnected
                  ? "Connect a wallet first"
                  : wrongChain
                    ? "Switch to Arc mainnet"
                    : null
              }
            />
          ))}
        </div>
      )}

      {/* Deposit popover */}
      {selected && (
        <div
          className="deposit-popover-backdrop"
          onClick={() => {
            if (!pending) setSelected(null);
          }}
        >
          <div
            className="deposit-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-popover-title"
            onClick={(e) => e.stopPropagation()}
          >
            {!isConnected ? (
              <>
                <div className="sheet-title" id="deposit-popover-title">
                  Connect your wallet
                </div>
                <div className="sheet-sub">
                  Connect a wallet to deposit into {selected.name}.
                </div>
                <DynamicWidget
                  buttonClassName="btn btn-primary"
                  innerButtonComponent={
                    <span className="earn-connect-button">Connect wallet</span>
                  }
                />
                <div className="sheet-actions">
                  <button
                    className="btn btn-soft"
                    onClick={() => setSelected(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : wrongChain ? (
              <>
                <div className="sheet-title" id="deposit-popover-title">
                  Switch network
                </div>
                <div className="sheet-sub">
                  Deposits require Arc Mainnet. Switch your connected wallet to
                  continue.
                </div>
                {typeof outcome === "string" && (
                  <div className="sheet-outcome" role="alert">
                    {outcome}
                  </div>
                )}
                <div className="sheet-actions">
                  <button
                    className="btn btn-soft"
                    onClick={() => setSelected(null)}
                    disabled={isSwitchingChain}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => void switchToRequiredChain()}
                    disabled={isSwitchingChain}
                  >
                    {isSwitchingChain ? "Switching…" : "Switch to Arc Mainnet"}
                  </button>
                </div>
              </>
            ) : typeof outcome === "object" && outcome?.ok ? (
              <>
                <div className="sheet-title" id="deposit-popover-title">
                  Deposit submitted
                </div>
                <div className="sheet-sub">
                  Your wallet submitted the deposit transaction.
                </div>
                <div className="sheet-outcome" role="status">
                  {outcome.message}
                </div>
                {outcome.txHash && (
                  <a
                    className="deposit-transaction-link"
                    href={`${config.explorerUrl}/tx/${outcome.txHash}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    View transaction <ExternalLink size={13} />
                  </a>
                )}
                <div className="sheet-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => setSelected(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="sheet-title" id="deposit-popover-title">
                  Deposit into {selected.name}
                </div>
                <div className="sheet-sub">
                  Current APY {formatApy(selected.apy)} · {selected.protocol}
                </div>

                <label className="sheet-label" htmlFor="earn-amount">
                  Amount (USDC)
                </label>
                <input
                  id="earn-amount"
                  className="sheet-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  disabled={pending}
                  onChange={(e) => setAmount(e.target.value)}
                />

                <div className="sheet-summary">
                  <div>
                    <span>You deposit</span>
                    <strong>{formatUsdc(Number(amount) || 0)} USDC</strong>
                  </div>
                  <div>
                    <span>Est. yearly yield</span>
                    <strong>
                      {formatUsdc((Number(amount) || 0) * selected.apy)} USDC
                    </strong>
                  </div>
                </div>

                {outcome !== null &&
                  (typeof outcome === "string" || !outcome.ok) && (
                    <div className="sheet-outcome" role="alert">
                      {typeof outcome === "string" ? outcome : outcome.message}
                    </div>
                  )}

                <div className="sheet-actions">
                  <button
                    className="btn btn-soft"
                    onClick={() => setSelected(null)}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => void confirmDeposit()}
                    disabled={pending}
                  >
                    {pending ? "Confirm in wallet…" : "Continue deposit"}
                  </button>
                </div>

                <p className="sheet-fine">
                  Confirm the transaction in your wallet. arcex never takes
                  custody of the deposit.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
