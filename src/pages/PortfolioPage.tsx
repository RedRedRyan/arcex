import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ConnectKitButton } from "connectkit";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  History,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import PositionsTable from "../components/PositionsTable";
import {
  formatAddress,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from "../utils";
import {
  usePortfolio,
  type ActivityItem,
  type AssetHolding,
  type HistoryPoint,
  type TxType,
} from "../../data/UsePortfolio";

// ── Helpers ──────────────────────────────────────────────────────────────────
const usd = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}$${usd(Math.abs(n))}`;

const qty = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

function timeAgo(unixSeconds: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const fmtWeekday = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { weekday: "short" });

const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const POSITIVE = "var(--success)";
const NEGATIVE = "var(--danger)";
const NEUTRAL = "var(--sunset)";

const TX_META: Record<
  TxType,
  { label: string; color: string; bg: string; Icon: LucideIcon }
> = {
  buy: {
    label: "Buy",
    color: POSITIVE,
    bg: "rgba(141,216,159,0.12)",
    Icon: ArrowDownLeft,
  },
  sell: {
    label: "Sell",
    color: NEGATIVE,
    bg: "rgba(232,109,122,0.12)",
    Icon: ArrowUpRight,
  },
  long: {
    label: "Long",
    color: POSITIVE,
    bg: "rgba(141,216,159,0.12)",
    Icon: TrendingUp,
  },
  short: {
    label: "Short",
    color: NEGATIVE,
    bg: "rgba(232,109,122,0.12)",
    Icon: TrendingDown,
  },
  close: {
    label: "Close",
    color: NEUTRAL,
    bg: "rgba(255,160,77,0.12)",
    Icon: X,
  },
  sent: {
    label: "Sent",
    color: NEGATIVE,
    bg: "rgba(232,109,122,0.12)",
    Icon: ArrowUpRight,
  },
  received: {
    label: "Received",
    color: POSITIVE,
    bg: "rgba(141,216,159,0.12)",
    Icon: ArrowDownLeft,
  },
};

const ASSET_ICONS: Record<number, string> = {
  0: "/assets/icons/tech.png",
  1: "/assets/icons/energy.png",
  2: "/assets/icons/arc.svg",
};

// ── Small building blocks ────────────────────────────────────────────────────
const Card = ({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <div
    className={`rounded-3xl ${className}`}
    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
  >
    {children}
  </div>
);

const ChangePill = ({
  value,
  suffix = "",
}: {
  value: number | null;
  suffix?: string;
}) => {
  if (value === null) {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: "rgba(255,255,255,0.06)", color: "var(--subtle)" }}
      >
        —
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span
      className="tabular mono inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background: up ? "rgba(141,216,159,0.12)" : "rgba(232,109,122,0.12)",
        color: up ? POSITIVE : NEGATIVE,
      }}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}
      {value.toFixed(2)}%
      {suffix && <span className="opacity-70"> {suffix}</span>}
    </span>
  );
};

const Money = ({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) => {
  const [whole, cents] = usd(value).split(".");
  return (
    <span className={`display tabular ${className}`}>
      ${whole}
      <span style={{ color: "var(--subtle)" }}>.{cents}</span>
    </span>
  );
};

const Sparkline = ({ asset }: { asset: AssetHolding }) => {
  const data = useMemo(() => {
    const c = asset.candles;
    if (c.length < 2) return [];
    const step = Math.max(1, Math.ceil(c.length / 40));
    const out: { v: number }[] = [];
    for (let i = 0; i < c.length; i += step) out.push({ v: c[i].close });
    out.push({ v: c[c.length - 1].close });
    return out;
    // candles are mutated in place — sparkKey changes whenever they do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.sparkKey]);

  if (data.length < 2) return <div className="h-10 w-24" />;

  return (
    <ChartContainer
      config={{ v: { color: asset.color } }}
      className="aspect-auto h-10 w-24"
    >
      <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line
          dataKey="v"
          type="monotone"
          stroke="var(--color-v)"
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
};

const AssetCard = ({
  icon,
  ticker,
  caption,
  value,
  amount,
  asset,
}: {
  icon: string;
  ticker: string;
  caption: string;
  value: number;
  amount: string;
  asset?: AssetHolding;
}) => (
  <div
    className="min-w-[220px] flex-1 snap-start rounded-3xl p-4"
    style={{
      background:
        "linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
      border: "1px solid var(--border)",
    }}
  >
    <div className="flex items-center gap-2.5">
      <img src={icon} alt="" className="size-8 rounded-full object-cover" />
      <div className="leading-tight">
        <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {ticker}
        </div>
        <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
          {caption}
        </div>
      </div>
    </div>

    <div className="mt-5 flex items-end justify-between gap-2">
      <div>
        <div
          className="display tabular text-2xl font-bold"
          style={{ color: "var(--ink)" }}
        >
          ${usd(value)}
        </div>
        <div
          className="mono tabular mt-0.5 text-xs"
          style={{ color: "var(--subtle)" }}
        >
          {amount}
        </div>
      </div>
      {asset && <Sparkline asset={asset} />}
    </div>

    {asset && (
      <div className="mt-3 flex items-center justify-between">
        <ChangePill value={asset.changePct24h} suffix="24h" />
        <span
          className="mono tabular text-xs"
          style={{ color: "var(--subtle)" }}
        >
          @ ${usd(asset.price)}
        </span>
      </div>
    )}
  </div>
);

// ── Activity popover ─────────────────────────────────────────────────────────
const ActivityRow = ({ item }: { item: ActivityItem }) => {
  const meta = TX_META[item.type];
  const color =
    item.positive === null
      ? "var(--ink-2)"
      : item.positive
        ? POSITIVE
        : NEGATIVE;
  return (
    <a
      href={getExplorerTxUrl(item.hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <div
        className="grid size-9 shrink-0 place-items-center rounded-full"
        style={{ background: meta.bg, color: meta.color }}
      >
        <meta.Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            {meta.label}
          </span>
          <span
            className="mono inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--subtle)" }}
          >
            {formatAddress(item.hash)}
            <ExternalLink size={10} />
          </span>
        </div>
        <div
          className="text-xs"
          style={{ color: "var(--subtle)" }}
          title={fmtDateTime(item.time * 1000)}
        >
          {timeAgo(item.time)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="mono tabular text-sm font-semibold" style={{ color }}>
          {item.amount}
        </div>
        <div className="text-xs" style={{ color: "var(--subtle)" }}>
          {item.detail}
        </div>
      </div>
    </a>
  );
};

const ActivityPopover = ({
  items,
  loading,
  address,
}: {
  items: ActivityItem[];
  loading: boolean;
  address?: string;
}) => (
  <Popover>
    <PopoverTrigger
      className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border)",
        color: "var(--ink)",
      }}
    >
      <History size={16} />
      Activity
    </PopoverTrigger>
    <PopoverContent
      align="end"
      sideOffset={8}
      className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 rounded-2xl bg-[#0b0f14] p-0 text-white ring-1 ring-white/10"
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="display text-sm font-semibold">
          Recent transactions
        </span>
        <span className="text-xs" style={{ color: "var(--subtle)" }}>
          Last 5
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="px-4 py-10 text-center text-sm"
          style={{ color: "var(--subtle)" }}
        >
          No transactions yet
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {address && (
        <a
          href={getExplorerAddressUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--sunset)",
          }}
        >
          View all on explorer <ExternalLink size={12} />
        </a>
      )}
    </PopoverContent>
  </Popover>
);

// ── Balance chart ────────────────────────────────────────────────────────────
const chartConfig = {
  value: { label: "Net worth", color: "#fb4f1f" },
} satisfies ChartConfig;

const BalanceChart = ({
  series,
  loading,
  error,
}: {
  series: HistoryPoint[];
  loading: boolean;
  error: boolean;
}) => {
  const { domain, ticks } = useMemo(() => {
    if (series.length === 0)
      return { domain: [0, 1] as [number, number], ticks: [] as number[] };
    const values = series.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || max * 0.02 || 1;

    // One tick per local midnight inside the range
    const out: number[] = [];
    const d = new Date(series[0].t);
    d.setHours(24, 0, 0, 0);
    while (d.getTime() <= series[series.length - 1].t) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return {
      domain: [Math.max(0, min - pad), max + pad] as [number, number],
      ticks: out,
    };
  }, [series]);

  if (loading) {
    return (
      <div className="grid h-[220px] animate-pulse place-items-center rounded-2xl bg-white/5 text-xs">
        <span style={{ color: "var(--subtle)" }}>Building 7-day history…</span>
      </div>
    );
  }

  if (series.length < 2) {
    return (
      <div
        className="grid h-[220px] place-items-center text-sm"
        style={{ color: "var(--subtle)" }}
      >
        {error ? "History unavailable right now" : "Not enough data yet"}
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[220px] w-full"
    >
      <AreaChart
        data={series}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
      >
        <defs>
          <linearGradient id="networthFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-value)"
              stopOpacity={0.35}
            />
            <stop
              offset="95%"
              stopColor="var(--color-value)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={fmtWeekday}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <YAxis hide domain={domain} />
        <ChartTooltip
          cursor={{ stroke: "rgba(255,255,255,0.25)", strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              hideIndicator
              className="rounded-xl border border-white/10 bg-[#0b0f14] px-3 py-2 text-xs text-white shadow-xl"
              labelFormatter={(_label, payload) => {
                const t = (payload?.[0]?.payload as HistoryPoint | undefined)
                  ?.t;
                return t ? fmtDateTime(t) : "";
              }}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-6">
                  <span style={{ color: "var(--subtle)" }}>Net worth</span>
                  <span className="mono tabular font-semibold">
                    ${usd(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          name="Net worth"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#networthFill)"
          activeDot={{ r: 4, stroke: "#000", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const PortfolioPage = () => {
  const p = usePortfolio();

  if (!p.isConnected) {
    return (
      <div className="container mx-auto flex max-w-screen-2xl flex-col items-center gap-6 px-4 py-20 md:px-6">
        <div className="space-y-2 text-center">
          <h1 className="display text-2xl font-bold text-orange">Portfolio</h1>
          <p className="text-sm" style={{ color: "var(--subtle)" }}>
            Connect your wallet to view your balances and positions
          </p>
        </div>
        <ConnectKitButton />
      </div>
    );
  }

  const coverageDays = p.series.length
    ? (p.series[p.series.length - 1].t - p.series[0].t) / 86_400_000
    : 0;
  const rangeLabel =
    coverageDays >= 6.5
      ? "Last 7 days"
      : p.series.length
        ? `Since ${new Date(p.series[0].t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "Last 7 days";

  const breakdown = [
    { label: "Wallet", value: p.usdc },
    { label: "Synthetics", value: p.spotValue },
    { label: "Margin", value: p.marginValue },
  ];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* ── Hero ── */}
      <section>
        <p className="text-sm" style={{ color: "var(--subtle)" }}>
          Total Balance
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1
            className="text-4xl font-bold md:text-5xl"
            style={{ color: "var(--ink)" }}
          >
            {p.ready ? (
              <Money value={p.netWorth} />
            ) : (
              <span className="inline-block h-12 w-56 animate-pulse rounded-xl bg-white/10 align-middle" />
            )}
          </h1>
          <ChangePill value={p.changePct} suffix="7d" />
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          style={{ color: "var(--subtle)" }}
        >
          {breakdown.map((b) => (
            <span key={b.label}>
              {b.label}:{" "}
              <b
                className="mono tabular font-medium"
                style={{ color: "var(--ink-2)" }}
              >
                {p.ready ? `$${usd(b.value)}` : "—"}
              </b>
            </span>
          ))}
        </div>
      </section>

      {/* ── Actions ── */}
      <section className="grid grid-cols-3 gap-3">
        <Link
          to="/faucet"
          className="flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-colors hover:brightness-110"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={16} />
          Add Funds
        </Link>
        <Link
          to="/spot"
          className="flex h-12 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors hover:bg-white/10"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          <ArrowLeftRight size={16} />
          Trade
        </Link>
        <ActivityPopover
          items={p.recent}
          loading={p.activityLoading}
          address={p.address}
        />
      </section>

      {/* ── Assets ── */}
      <section>
        <h2
          className="display mb-3 text-lg font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Assets
        </h2>
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          <AssetCard
            icon="/assets/icons/usdc.png"
            ticker="USDC"
            caption="Wallet cash"
            value={p.usdc}
            amount={`${qty(p.usdc)} USDC`}
          />
          {p.assets.map((asset) => (
            <AssetCard
              key={asset.pairId}
              icon={ASSET_ICONS[asset.pairId]}
              ticker={asset.ticker}
              caption={asset.name}
              value={asset.value}
              amount={`${qty(asset.balance)} ${asset.ticker}`}
              asset={asset}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default PortfolioPage;
