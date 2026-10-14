import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  History,
} from "lucide-react";
import { useAccount } from "wagmi";
import { DynamicBridgeWidget } from "@dynamic-labs/sdk-react-core";
import { usePortfolio, type ActivityItem } from "../../data/UsePortfolio";
import { useNetwork, useNetworkFeature } from "../config/NetworkProvider";
import { NetworkBadge } from "../config/NetworkBadge";
import { FeatureLockedNotice } from "../config/FeatureGuards";
import { explorerAddressUrl, explorerTxUrl } from "../config/networks";
import { AssetIcon } from "../components/AssetIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";

/**
 * Testnet = amber, Mainnet = emerald. Same layout, distinct identity, so the
 * two networks can never be confused.
 */
const ACCENT = {
  testnet: { glow: "glow-amber" },
  mainnet: { glow: "glow-emerald" },
} as const;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
}

// ── Skeletons ────────────────────────────────────────────────────────────────
function Skeleton({
  h = 14,
  w = "100%",
  r = 6,
}: {
  h?: number;
  w?: string | number;
  r?: number;
}) {
  return (
    <div className="sk" style={{ height: h, width: w, borderRadius: r }} />
  );
}

function TotalSkeleton() {
  return (
    <div className="total-block">
      <Skeleton h={12} w={130} />
      <div style={{ height: 10 }} />
      <Skeleton h={38} w={230} r={10} />
      <div style={{ height: 8 }} />
      <Skeleton h={12} w={190} />
    </div>
  );
}

function AssetCardSkeleton() {
  return (
    <div className="asset-card">
      <div className="asset-card-head">
        <Skeleton h={32} w={32} r={16} />
        <div style={{ flex: 1 }}>
          <Skeleton h={13} w={90} />
          <div style={{ height: 6 }} />
          <Skeleton h={11} w={52} />
        </div>
      </div>
      <div style={{ height: 12 }} />
      <Skeleton h={20} w={110} />
      <div style={{ height: 6 }} />
      <Skeleton h={11} w={80} />
    </div>
  );
}

function UsdcRowSkeleton() {
  return (
    <div className="usdc-row">
      <Skeleton h={26} w={26} r={13} />
      <div style={{ flex: 1 }}>
        <Skeleton h={12} w={80} />
      </div>
      <Skeleton h={13} w={72} />
    </div>
  );
}

// ── Mainnet asset card ───────────────────────────────────────────────────────
function AssetCard({
  symbol,
  name,
  balance,
  priceUsd,
  valueUsd,
  changePct24h,
  status,
}: {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  changePct24h: number | null;
  status: "success" | "error";
}) {
  const up = (changePct24h ?? 0) >= 0;
  return (
    <div className="asset-card">
      <div className="asset-card-head">
        <AssetIcon symbol={symbol} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="asset-ticker">{symbol}</div>
          <div className="asset-name">{name}</div>
        </div>
        {changePct24h !== null && (
          <span className={`chg ${up ? "up" : "down"}`}>
            {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {fmtPct(changePct24h)}
          </span>
        )}
      </div>
      <div style={{ height: 12 }} />
      <div className="asset-balance">
        {status === "error" ? (
          <span>Balance unavailable</span>
        ) : (
          <>
            {fmtNum(balance)} <span>{symbol}</span>
          </>
        )}
      </div>
      <div className="asset-value">
        {valueUsd === null ? "USD unavailable" : fmtUsd(valueUsd)}
      </div>
      {priceUsd !== null && (
        <div className="asset-price">@ {fmtUsd(priceUsd)}</div>
      )}
    </div>
  );
}

// ── Testnet synthetic card ───────────────────────────────────────────────────
function SyntheticCard({
  ticker,
  name,
  color,
  balance,
  price,
  value,
  changePct24h,
}: {
  ticker: string;
  name: string;
  color: string;
  balance: number;
  price: number;
  value: number;
  changePct24h: number | null;
}) {
  const up = (changePct24h ?? 0) >= 0;
  return (
    <div className="asset-card">
      <div className="asset-card-head">
        <span className="syn-dot" style={{ background: color }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="asset-ticker">{ticker}</div>
          <div className="asset-name">{name}</div>
        </div>
        <span className={`chg ${up ? "up" : "down"}`}>
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {fmtPct(changePct24h)}
        </span>
      </div>
      <div style={{ height: 12 }} />
      <div className="asset-balance">
        {fmtNum(balance)} <span>{ticker}</span>
      </div>
      <div className="asset-value">{fmtUsd(value)}</div>
      <div className="asset-price">
        pool price {fmtUsd(price)}
        <span className="pool-src"> · from pool reserves</span>
      </div>
    </div>
  );
}

// ── Activity row ─────────────────────────────────────────────────────────────
function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <a
      className="activity-row"
      href={explorerTxUrl("mainnet", item.hash)}
      target="_blank"
      rel="noreferrer noopener"
    >
      <span className={`act-dot ${item.positive ? "pos" : "neg"}`} />
      <span className="act-amount">{item.amount}</span>
      <span className="act-detail">{item.detail}</span>
      <span className="act-time">
        {item.time ? new Date(item.time * 1000).toLocaleDateString() : "—"}
      </span>
      <ExternalLink size={13} />
    </a>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { network, isMainnet, config } = useNetwork();
  const bridgeEnabled = useNetworkFeature("bridge");
  const faucetEnabled = useNetworkFeature("faucet");
  const portfolio = usePortfolio();
  const accent = ACCENT[network];

  const addressUrl = useMemo(
    () => (address ? explorerAddressUrl(network, address) : null),
    [network, address],
  );

  if (!isConnected) {
    return (
      <div className="page fade-in">
        <div className="empty-state">
          <h2>Connect your wallet</h2>
          <p>Your portfolio, balances and activity will appear here.</p>
        </div>
      </div>
    );
  }

  const loading = portfolio.loading;

  return (
    // `key` remounts on network change so skeletons show instead of stale numbers
    <div className={`page fade-in ${accent.glow}`} key={network}>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Portfolio</h1>
        </div>
        {addressUrl && (
          <a
            className="explorer-link"
            href={addressUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on explorer <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* Total balance — its MEANING differs per network */}
      <section className="total-section">
        {loading ? (
          <TotalSkeleton />
        ) : (
          <div className="total-block">
            <div className="total-label">
              Total Balance
              {isMainnet && <span className="mainnet-badge">Mainnet</span>}
            </div>
            <div className="total-value">{fmtUsd(portfolio.netWorth)}</div>
            <div className="total-sub">
              {isMainnet
                ? `USDC across ${config.usdcChains.length} chains + real assets`
                : "Testnet USDC + synthetics at live pool price"}
            </div>
          </div>
        )}

        {/* 7-day chart: testnet only. Mainnet has no reliable history yet. */}
        {!isMainnet && (
          <div className="chart-slot">
            {portfolio.series.length === 0 ? (
              <div className="chart-skeleton">
                <Skeleton h={12} w={90} />
                <div style={{ height: 8 }} />
                <Skeleton h={120} w="100%" r={10} />
              </div>
            ) : (
              <div className="chart-legend">
                <span className="chart-change">
                  7d {fmtPct(portfolio.changePct)}
                </span>
                <span className="chart-note">
                  reconstructed from on-chain activity
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── MAINNET: USDC across exactly 3 chains ───────────────────────── */}
      {isMainnet && (
        <section className="section">
          <h2 className="section-title">
            USDC
            <span className="section-note">
              across {config.usdcChains.length} chains
            </span>
          </h2>
          <div className="usdc-list">
            {loading
              ? config.usdcChains.map((c) => (
                  <UsdcRowSkeleton key={c.chainId} />
                ))
              : portfolio.usdcByChain.map((row) => {
                  const chain = config.usdcChains.find(
                    (c) => c.chainId === row.chainId,
                  );
                  const iconKey =
                    row.chainId === 1
                      ? "ethereum"
                      : row.chainId === 8453
                        ? "base"
                        : "arc";
                  return (
                    <div className="usdc-row" key={row.chainId}>
                      <AssetIcon symbol={iconKey} size={26} />
                      <div className="usdc-meta">
                        <span className="usdc-chain">{row.label}</span>
                        {row.status === "error" && (
                          <span className="usdc-err">failed to load</span>
                        )}
                      </div>
                      <span className="usdc-bal">
                        {row.status === "loading"
                          ? "…"
                          : row.status === "error"
                            ? "Unavailable"
                            : `${fmtNum(row.balance)} USDC`}
                      </span>
                      {chain && address && (
                        <a
                          className="usdc-link"
                          href={`${chain.explorerUrl}/address/${address}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={`View on ${chain.label}`}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  );
                })}
          </div>
          {!loading && (
            <div className="usdc-total">
              <span>Total USDC</span>
              <strong>{fmtNum(portfolio.usdcTotal)} USDC</strong>
            </div>
          )}
        </section>
      )}

      {/* ── Assets ─────────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">
          Assets
          {isMainnet && <span className="section-note">Arc Mainnet</span>}
        </h2>

        {isMainnet ? (
          portfolio.mainnetAssets.length === 0 && !loading ? (
            <div className="empty-note">
              No verified mainnet assets are configured yet.
            </div>
          ) : (
            <div className="asset-row">
              {loading
                ? [0, 1, 2].map((i) => <AssetCardSkeleton key={i} />)
                : portfolio.mainnetAssets.map((a) => (
                    <AssetCard
                      key={a.key}
                      symbol={a.symbol}
                      name={a.name}
                      balance={a.balance}
                      priceUsd={a.priceUsd}
                      valueUsd={a.valueUsd}
                      changePct24h={a.changePct24h}
                      status={a.status}
                    />
                  ))}
            </div>
          )
        ) : (
          <div className="asset-row">
            {loading
              ? config.pairs.map((p) => <AssetCardSkeleton key={p.id} />)
              : portfolio.assets.map((a) => (
                  <SyntheticCard
                    key={a.ticker}
                    ticker={a.ticker}
                    name={a.name}
                    color={a.color}
                    balance={a.balance}
                    price={a.price}
                    value={a.value}
                    changePct24h={a.changePct24h}
                  />
                ))}
          </div>
        )}
      </section>

      {/* ── Activity ───────────────────────────────────────────────────── */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Activity</h2>
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
            >
              <History size={15} />
              Activity
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[min(26rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-0 text-white shadow-xl"
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span className="text-sm font-semibold">
                  Recent Arc Mainnet transactions
                </span>
                <span className="text-xs" style={{ color: "var(--subtle)" }}>
                  Last 5
                </span>
              </div>
              {portfolio.activityLoading ? (
                <div className="space-y-2 p-4" aria-label="Loading activity">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} h={40} />
                  ))}
                </div>
              ) : portfolio.recent.length === 0 ? (
                <div
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--subtle)" }}
                >
                  {portfolio.error ?? "No Arc Mainnet transactions found."}
                </div>
              ) : (
                <div className="activity-list max-h-80 overflow-y-auto p-2">
                  {portfolio.recent.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              )}
              {address && (
                <a
                  href={explorerAddressUrl("mainnet", address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors hover:bg-white/5"
                  style={{
                    borderTop: "1px solid var(--border)",
                    color: "var(--accent)",
                  }}
                >
                  View all on ArcScan <ExternalLink size={12} />
                </a>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </section>
    </div>
  );
}
