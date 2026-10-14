import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  History,
} from "lucide-react";
import { useAccount } from "wagmi";
import {
  DynamicProvider,
  useGetMultichainTokenBalances,
} from "@dynamic-labs-sdk/react-hooks";
import { DynamicBridgeWidget } from "@dynamic-labs/sdk-react-core";
import { usePortfolio, type ActivityItem } from "../../data/UsePortfolio";
import { useNetwork, useNetworkFeature } from "../config/NetworkProvider";
import { NetworkBadge } from "../config/NetworkBadge";
import { FeatureLockedNotice } from "../config/FeatureGuards";
import { explorerAddressUrl, explorerTxUrl } from "../config/networks";
import { dynamicClient } from "../dynamicClient";
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

// This project lives on three chains only.
const ETHEREUM_CHAIN_ID = 1;
const BASE_CHAIN_ID = 8453;
const ARC_CHAIN_ID = 5042;

// Chains queried through Dynamic's getMultichainTokenBalances. Arc assets keep
// coming from usePortfolio(); add ARC_CHAIN_ID here only if Dynamic returns
// Arc balances for your environment (then drop the Arc cards below to avoid
// duplicates).
const DYNAMIC_NETWORK_IDS = [ETHEREUM_CHAIN_ID, BASE_CHAIN_ID];

function chainKeyFor(chainId: number): string {
  return chainId === ETHEREUM_CHAIN_ID
    ? "ethereum"
    : chainId === ARC_CHAIN_ID
      ? "arc"
      : "base";
}

function chainNameFor(chainId: number): string {
  return chainId === ETHEREUM_CHAIN_ID
    ? "Ethereum"
    : chainId === ARC_CHAIN_ID
      ? "Arc"
      : "Base";
}

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

// ── CoinGecko chain icons ────────────────────────────────────────────────────
// Chain logos come from CoinGecko's public /asset_platforms endpoint, keyed by
// EVM chain id. Fetched once per session, cached in sessionStorage. Ethereum is
// seeded with a static CoinGecko URL so it renders instantly. Any chain that
// CoinGecko doesn't list (or any failed image) falls back to <AssetIcon />.
const CG_PLATFORMS_URL = "https://api.coingecko.com/api/v3/asset_platforms";
const CG_CACHE_KEY = "nbx:cg-chain-icons:v1";
const CG_SEED: Record<number, string> = {
  1: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
};

type CgPlatform = {
  chain_identifier: number | null;
  image?: { thumb?: string; small?: string; large?: string };
};

let chainIconPromise: Promise<Record<number, string>> | null = null;

function readIconCache(): Record<number, string> | null {
  try {
    const raw = sessionStorage.getItem(CG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, string>) : null;
  } catch {
    return null;
  }
}

function loadChainIcons(): Promise<Record<number, string>> {
  if (chainIconPromise) return chainIconPromise;
  chainIconPromise = (async () => {
    const cached = readIconCache();
    if (cached) return { ...CG_SEED, ...cached };
    try {
      const res = await fetch(CG_PLATFORMS_URL);
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const list = (await res.json()) as CgPlatform[];
      const map: Record<number, string> = {};
      for (const p of list) {
        if (p.chain_identifier == null || !p.image) continue;
        const url = p.image.small || p.image.large || p.image.thumb;
        if (url) map[p.chain_identifier] = url;
      }
      try {
        sessionStorage.setItem(CG_CACHE_KEY, JSON.stringify(map));
      } catch {
        /* storage unavailable, ignore */
      }
      return { ...CG_SEED, ...map };
    } catch {
      chainIconPromise = null; // allow a retry on next mount
      return CG_SEED;
    }
  })();
  return chainIconPromise;
}

function useChainIcons(): Record<number, string> {
  const [icons, setIcons] = useState<Record<number, string>>(CG_SEED);
  useEffect(() => {
    let alive = true;
    loadChainIcons().then((m) => {
      if (alive) setIcons(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return icons;
}

function ChainIcon({
  src,
  fallbackKey,
  label,
  size = 30,
}: {
  src?: string;
  fallbackKey: string;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={label}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <AssetIcon symbol={fallbackKey} size={Math.max(size - 6, 8)} />
      )}
    </span>
  );
}

/** Coin logo (Dynamic's logoURI when available) falling back to <AssetIcon />. */
function CoinImage({
  src,
  symbol,
  size,
}: {
  src?: string | null;
  symbol: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <AssetIcon symbol={symbol} size={size} />;
  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
      }}
    />
  );
}

/** Coin logo with the chain's logo as a small badge in the bottom-right. */
function CoinWithChain({
  symbol,
  logoUrl,
  chainId,
  chainIcons,
  size = 32,
}: {
  symbol: string;
  logoUrl?: string | null;
  chainId: number;
  chainIcons: Record<number, string>;
  size?: number;
}) {
  const badge = Math.round(size * 0.5);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <CoinImage src={logoUrl} symbol={symbol} size={size} />
      <span style={{ position: "absolute", right: -4, bottom: -4 }}>
        <ChainIcon
          src={chainIcons[chainId]}
          fallbackKey={chainKeyFor(chainId)}
          label={chainNameFor(chainId)}
          size={badge}
        />
      </span>
    </span>
  );
}

// ── Dynamic multichain balances ──────────────────────────────────────────────
type DynamicToken = {
  address?: string | null;
  symbol?: string;
  name?: string;
  balance?: number;
  marketValue?: number | null;
  price?: number | null;
  logoURI?: string | null;
  networkId?: number;
  isNative?: boolean;
};

type DynamicAsset = {
  key: string;
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl: string | null;
  chainId: number;
};

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
      <Skeleton h={30} w={30} r={15} />
      <div style={{ flex: 1 }}>
        <Skeleton h={12} w={80} />
      </div>
      <Skeleton h={13} w={72} />
    </div>
  );
}

// ── Mainnet asset card (coin logo + chain logo) ──────────────────────────────
function AssetCard({
  symbol,
  name,
  balance,
  priceUsd,
  valueUsd,
  changePct24h,
  status,
  chainId,
  logoUrl,
  chainIcons,
}: {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  changePct24h: number | null;
  status: "success" | "error";
  chainId: number;
  logoUrl?: string | null;
  chainIcons: Record<number, string>;
}) {
  const up = (changePct24h ?? 0) >= 0;
  return (
    <div className="asset-card">
      <div className="asset-card-head">
        <CoinWithChain
          symbol={symbol}
          logoUrl={logoUrl}
          chainId={chainId}
          chainIcons={chainIcons}
          size={32}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="asset-ticker">{symbol}</div>
          <div className="asset-name">
            {name} · {chainNameFor(chainId)}
          </div>
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

// ── Activity popover (button lives top-right of the total section) ───────────
function ActivityPopover({
  portfolio,
  address,
}: {
  portfolio: ReturnType<typeof usePortfolio>;
  address?: `0x${string}`;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--border)",
          color: "var(--ink)",
          backdropFilter: "blur(8px)",
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
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function PortfolioPageContent() {
  const { address, isConnected } = useAccount();
  const { network, isMainnet, config } = useNetwork();
  const bridgeEnabled = useNetworkFeature("bridge");
  const faucetEnabled = useNetworkFeature("faucet");
  const portfolio = usePortfolio();
  const chainIcons = useChainIcons();
  const accent = ACCENT[network];

  // Real holdings on Ethereum + Base, straight from Dynamic (balance, USD price,
  // market value and logo per token).
  const balanceRequest = useMemo(
    () =>
      address && isMainnet
        ? {
            filterSpamTokens: true,
            balanceRequests: [
              {
                address,
                chain: "EVM" as const,
                networkIds: DYNAMIC_NETWORK_IDS,
              },
            ],
          }
        : undefined,
    [address, isMainnet],
  );
  const {
    data: chainBalances,
    isLoading: dynamicLoading,
    error: dynamicError,
  } = useGetMultichainTokenBalances({ balanceRequest });

  const dynamicAssets = useMemo<DynamicAsset[]>(() => {
    const rows: DynamicAsset[] = [];
    for (const chain of chainBalances ?? []) {
      for (const net of chain.networks ?? []) {
        for (const token of (net.balances ?? []) as DynamicToken[]) {
          const chainId = Number(token.networkId ?? net.networkId);
          if (!DYNAMIC_NETWORK_IDS.includes(chainId)) continue;
          const symbol = token.symbol ?? "";
          // USDC per chain is already shown in the total section.
          if (!symbol || symbol.toUpperCase() === "USDC") continue;
          if (!(Number(token.balance) > 0)) continue;
          rows.push({
            key: `${chainId}:${token.address ?? "native"}`,
            symbol,
            name: token.name ?? symbol,
            balance: Number(token.balance),
            priceUsd: token.price ?? null,
            valueUsd: token.marketValue ?? null,
            logoUrl: token.logoURI ?? null,
            chainId,
          });
        }
      }
    }
    return rows.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  }, [chainBalances]);

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
  const noMainnetAssets =
    portfolio.mainnetAssets.length === 0 &&
    dynamicAssets.length === 0 &&
    !loading &&
    !dynamicLoading;

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
      <section className="total-section" style={{ position: "relative" }}>
        {/* Activity button: pinned to the top right of the total section */}
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 2 }}>
          <ActivityPopover portfolio={portfolio} address={address} />
        </div>

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
            <div className="usdc-list">
              {loading
                ? config.usdcChains.map((c) => (
                    <UsdcRowSkeleton key={c.chainId} />
                  ))
                : portfolio.usdcByChain.map((row) => {
                    const chain = config.usdcChains.find(
                      (c) => c.chainId === row.chainId,
                    );
                    return (
                      <div className="usdc-row" key={row.chainId}>
                        <ChainIcon
                          src={chainIcons[row.chainId]}
                          fallbackKey={chainKeyFor(row.chainId)}
                          label={row.label}
                          size={30}
                        />
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
          </div>
        )}
      </section>

      {/* ── Assets ─────────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">
          Assets
          {isMainnet && (
            <span className="section-note">Arc · Ethereum · Base</span>
          )}
        </h2>

        {isMainnet ? (
          noMainnetAssets ? (
            <div className="empty-note">
              No verified mainnet assets are configured yet.
            </div>
          ) : (
            <>
              <div className="asset-row">
                {/* Arc assets (usePortfolio) */}
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
                        chainId={ARC_CHAIN_ID}
                        chainIcons={chainIcons}
                      />
                    ))}

                {/* Ethereum + Base assets (Dynamic) */}
                {dynamicLoading
                  ? [0, 1].map((i) => <AssetCardSkeleton key={`dyn-${i}`} />)
                  : dynamicAssets.map((a) => (
                      <AssetCard
                        key={a.key}
                        symbol={a.symbol}
                        name={a.name}
                        balance={a.balance}
                        priceUsd={a.priceUsd}
                        valueUsd={a.valueUsd}
                        changePct24h={null}
                        status="success"
                        chainId={a.chainId}
                        logoUrl={a.logoUrl}
                        chainIcons={chainIcons}
                      />
                    ))}
              </div>
              {dynamicError && (
                <div className="empty-note">
                  Ethereum and Base holdings are unavailable right now.
                </div>
              )}
            </>
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
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <DynamicProvider client={dynamicClient}>
      <PortfolioPageContent />
    </DynamicProvider>
  );
}
