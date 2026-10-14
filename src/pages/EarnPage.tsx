import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import {
  Check,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
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

/** One-tap amounts in the deposit sheet (USDC). */
const QUICK_AMOUNTS = [10, 50, 100, 500];

const AMOUNT_PATTERN = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;

function VaultCard({
  vault,
  onDeposit,
  pending,
  disabledReason,
  explorerUrl,
}: {
  vault: EarnVault;
  onDeposit: (v: EarnVault) => void;
  pending: boolean;
  disabledReason: string | null;
  explorerUrl: string;
}) {
  const lowLiquidity = vault.status === "low_liquidity";
  const liquidityPct =
    vault.totalDeposits > 0
      ? Math.min(
          100,
          Math.max(0, (vault.liquidity / vault.totalDeposits) * 100),
        )
      : 0;

  return (
    <div className="vault-card">
      <div className="vault-top">
        <AssetIcon symbol="USDC" size={30} />
        <div className="vault-apy">
          <span className="vault-apy-value">{formatApy(vault.apy)}</span>
          <span className="vault-apy-label">APY</span>
        </div>
      </div>

      <div className="vault-id">
        <div className="vault-name">{vault.name}</div>
        <div className="vault-sub">
          {vault.protocol} · {vault.manager}
        </div>
      </div>

      <div className="vault-stats">
        <div className="vault-stat">
          <span className="vault-stat-label">Deposits</span>
          <span className="vault-stat-value">
            ${formatCompact(vault.totalDeposits)}
          </span>
        </div>
        <div className="vault-stat">
          <span className="vault-stat-label">Liquidity</span>
          <span className={`vault-stat-value ${lowLiquidity ? "warn" : ""}`}>
            ${formatCompact(vault.liquidity)}
          </span>
        </div>
      </div>

      <div
        className="vault-meter"
        role="img"
        aria-label={`${Math.round(liquidityPct)}% of deposits available`}
      >
        <span
          className={lowLiquidity ? "warn" : ""}
          style={{ width: `${liquidityPct}%` }}
        />
      </div>

      <div className="vault-fees">
        {formatFee(vault.managementFee)} mgmt
        {vault.performanceFee > 0 && (
          <> · {formatFee(vault.performanceFee)} perf</>
        )}
      </div>

      <div className="vault-foot">
        <a
          className="vault-contract"
          href={`${explorerUrl}/address/${vault.vaultAddress}`}
          target="_blank"
          rel="noreferrer noopener"
          title={vault.vaultAddress}
        >
          {vault.vaultAddress.slice(0, 6)}…{vault.vaultAddress.slice(-4)}
          <ExternalLink size={11} />
        </a>
        <button
          type="button"
          className="vault-deposit-btn"
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

function VaultCardSkeleton() {
  return (
    <div className="vault-card">
      <div className="vault-top">
        <div
          className="sk"
          style={{ height: 30, width: 30, borderRadius: 15 }}
        />
        <div
          className="sk"
          style={{ height: 22, width: 46, borderRadius: 8 }}
        />
      </div>
      <div className="sk" style={{ height: 13, width: "75%" }} />
      <div className="sk" style={{ height: 10, width: "55%" }} />
      <div
        className="sk"
        style={{ height: 28, width: "100%", borderRadius: 8 }}
      />
      <div
        className="sk"
        style={{ height: 4, width: "100%", borderRadius: 4 }}
      />
      <div
        className="sk"
        style={{ height: 34, width: "100%", borderRadius: 999 }}
      />
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

  // Top 6 by APY: fills a 3 × 2 grid on large screens and 2 × 3 on mobile.
  const vaultsToShow = useMemo(() => {
    const copy = [...vaults];
    copy.sort((a, b) => b.apy - a.apy);
    return copy.slice(0, 6);
  }, [vaults]);

  // Escape closes the sheet; the page behind it doesn't scroll while it's open.
  useEffect(() => {
    if (!selected) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setSelected(null);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected, pending]);

  const onDeposit = (v: EarnVault) => {
    setSelected(v);
    setAmount("");
    setOutcome(null);
  };

  const confirmDeposit = async () => {
    if (!selected) return;
    if (!AMOUNT_PATTERN.test(amount.trim())) {
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

  // Derived deposit-sheet state
  const amountTrim = amount.trim();
  const amountNum = Number(amountTrim) || 0;
  const amountValid = AMOUNT_PATTERN.test(amountTrim) && amountNum > 0;
  const success =
    outcome !== null && typeof outcome === "object" && outcome.ok
      ? outcome
      : null;
  const errorMessage =
    outcome === null
      ? null
      : typeof outcome === "string"
        ? outcome
        : outcome.ok
          ? null
          : outcome.message;

  return (
    <div className={`page fade-in ${ACCENT_GLOW}`}>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Deposit USDC into audited vaults</h1>
        </div>
        <button
          type="button"
          className="earn-refresh"
          onClick={() => void refetch()}
          aria-label="Refresh vaults"
          title="Refresh vaults"
        >
          <RefreshCw size={14} />
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
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <VaultCardSkeleton key={i} />
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
              explorerUrl={config.explorerUrl}
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

      {/* Deposit sheet: bottom sheet on mobile, centered modal on desktop */}
      {selected && (
        <div
          className="dp-backdrop"
          onClick={() => {
            if (!pending) setSelected(null);
          }}
        >
          <div
            className="dp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dp-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dp-grab" aria-hidden="true" />

            <div className="dp-head">
              <AssetIcon symbol="USDC" size={38} />
              <div className="dp-head-id">
                <div className="dp-title" id="dp-title">
                  {selected.name}
                </div>
                <div className="dp-sub">
                  {selected.protocol} · {selected.manager}
                </div>
              </div>
              <button
                type="button"
                className="dp-close"
                onClick={() => setSelected(null)}
                disabled={pending}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {!isConnected ? (
              <>
                <p className="dp-note">
                  Connect a wallet to deposit into {selected.name}.
                </p>
                <div className="dp-connect">
                  <DynamicWidget
                    buttonClassName="btn btn-primary"
                    innerButtonComponent={
                      <span className="earn-connect-button">
                        Connect wallet
                      </span>
                    }
                  />
                </div>
                <button
                  type="button"
                  className="dp-secondary"
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
              </>
            ) : wrongChain ? (
              <>
                <p className="dp-note">
                  Deposits require Arc Mainnet. Switch your connected wallet to
                  continue.
                </p>
                {errorMessage && (
                  <div className="dp-alert" role="alert">
                    <TriangleAlert size={15} />
                    <span>{errorMessage}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="dp-primary"
                  onClick={() => void switchToRequiredChain()}
                  disabled={isSwitchingChain}
                >
                  {isSwitchingChain ? "Switching…" : "Switch to Arc Mainnet"}
                </button>
                <button
                  type="button"
                  className="dp-secondary"
                  onClick={() => setSelected(null)}
                  disabled={isSwitchingChain}
                >
                  Cancel
                </button>
              </>
            ) : success ? (
              <div className="dp-success">
                <div className="dp-success-icon">
                  <Check size={26} />
                </div>
                <div className="dp-success-title">Deposit submitted</div>
                <p className="dp-note" role="status">
                  {success.message}
                </p>
                {success.txHash && (
                  <a
                    className="deposit-transaction-link"
                    href={`${config.explorerUrl}/tx/${success.txHash}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    View transaction <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  className="dp-primary"
                  onClick={() => setSelected(null)}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="dp-apy-row">
                  <span>Current APY</span>
                  <strong>{formatApy(selected.apy)}</strong>
                </div>

                <label className="dp-label" htmlFor="earn-amount">
                  Amount
                </label>
                <div className="dp-input-wrap">
                  <input
                    id="earn-amount"
                    className="dp-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={amount}
                    disabled={pending}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span className="dp-input-unit">
                    <AssetIcon symbol="USDC" size={18} />
                    USDC
                  </span>
                </div>

                <div className="dp-chips">
                  {QUICK_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`dp-chip ${
                        amountTrim === String(value) ? "active" : ""
                      }`}
                      onClick={() => setAmount(String(value))}
                      disabled={pending}
                    >
                      ${value}
                    </button>
                  ))}
                </div>

                <div className="dp-summary">
                  <div>
                    <span>You deposit</span>
                    <strong>{formatUsdc(amountNum)} USDC</strong>
                  </div>
                  <div>
                    <span>Est. monthly yield</span>
                    <strong>
                      {formatUsdc((amountNum * selected.apy) / 12)} USDC
                    </strong>
                  </div>
                  <div>
                    <span>Est. yearly yield</span>
                    <strong>{formatUsdc(amountNum * selected.apy)} USDC</strong>
                  </div>
                  <div>
                    <span>Fees</span>
                    <strong>
                      {formatFee(selected.managementFee)} mgmt
                      {selected.performanceFee > 0 && (
                        <> · {formatFee(selected.performanceFee)} perf</>
                      )}
                    </strong>
                  </div>
                </div>

                {errorMessage && (
                  <div className="dp-alert" role="alert">
                    <TriangleAlert size={15} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="dp-primary"
                  onClick={() => void confirmDeposit()}
                  disabled={pending || !amountValid}
                >
                  {pending
                    ? "Confirm in wallet…"
                    : amountValid
                      ? `Deposit ${formatUsdc(amountNum)} USDC`
                      : "Enter an amount"}
                </button>
                <button
                  type="button"
                  className="dp-secondary"
                  onClick={() => setSelected(null)}
                  disabled={pending}
                >
                  Cancel
                </button>

                <p className="dp-fine">
                  <ShieldCheck size={13} />
                  <span>
                    Confirm the transaction in your wallet. Deposits go straight
                    to the vault contract and arcex never takes custody.
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
