import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PriceChart from "../components/PriceChart";
import SpotTicket from "../components/SpotTicket";
import { fetchTokenByPairId, type TokenRecord } from "../../data/TokenRegistry";
import { formatPrice, usePoolFeed } from "../../data/OracleFeed";
import { PAIRS } from "../constants";

/**
 * Shareable per-pair trade page: /trade/:pairId
 * Renders the chart + ticket for any pair, including tokens created through
 * the TokenFactory. Metadata comes from the Supabase `tokens` table; the
 * creator can share the URL anywhere.
 */
export default function TradePage() {
  const { pairId: pairIdParam } = useParams<{ pairId: string }>();
  const navigate = useNavigate();
  const parsed = Number(pairIdParam);
  const validPair = Number.isInteger(parsed) && parsed >= 0;
  const pairId = validPair ? parsed : 0;

  const [token, setToken] = useState<TokenRecord | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const feed = usePoolFeed(pairId);
  const seedPair = PAIRS.find((p) => p.id === pairId);
  const ticker = token?.symbol ?? seedPair?.ticker ?? `PAIR ${pairId}`;
  const color = seedPair?.color ?? "#fb4f1f";
  const loading = validPair && loadedFor !== pairId;

  useEffect(() => {
    if (!validPair) return;
    let cancelled = false;
    void fetchTokenByPairId(pairId)
      .then((record) => {
        if (cancelled) return;
        setToken(record);
        setLoadedFor(pairId);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setLoadedFor(pairId);
      });
    return () => {
      cancelled = true;
    };
  }, [pairId, validPair]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/trade/${pairId}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    void navigator.share?.({ title: `${ticker}/USDC`, url }).catch(() => undefined);
  }, [pairId, ticker]);

  if (!validPair) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-white/60">Invalid pair id.</p>
        <button
          onClick={() => navigate("/market")}
          className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
        >
          Back to markets
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-3 md:px-6">
      <div className="mx-auto grid max-w-screen-2xl gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-black px-4 pt-4 pb-2">
            <div className="flex items-center gap-3">
              {token?.image_url ? (
                <img
                  src={token.image_url}
                  alt={ticker}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : null}
              <div>
                <div className="text-lg font-bold text-white">
                  {ticker}/USDC
                </div>
                {token ? (
                  <div className="text-xs text-white/40">
                    {token.name} · {token.token_address.slice(0, 10)}…
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="mono text-2xl font-bold" style={{ color }}>
                ${formatPrice(feed.price)}
              </span>
              <button
                onClick={handleShare}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white"
              >
                Share
              </button>
            </div>
          </div>

          {token?.description ? (
            <p className="px-4 pb-2 text-sm text-white/50">{token.description}</p>
          ) : null}

          <div className="relative h-[400px] xl:h-[480px]">
            <div className="absolute inset-0">
              <PriceChart
                key={`trade-${pairId}`}
                pairId={pairId}
                variant="candle"
                height="100%"
                accentColor={color}
                seedPrice={feed.price ?? undefined}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 p-4">
          <SpotTicket pairId={pairId} />
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-center text-xs text-white/30">Loading token info…</p>
      ) : null}
    </div>
  );
}
