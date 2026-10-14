#!/usr/bin/env node
// Seed market_candles with starting price anchors for the 3 live mainnet pools.
// The pools were seeded with real LiquidityAdded events but no swaps yet, so
// the charts have no trade-driven history. This inserts one 5-minute candle
// per pool at the seed price (from the contract reserves) as a chart anchor.
//
// Uses the service_role key from .env.local (write access to market_candles).

import { readFileSync } from "fs";

const ENV = "C:/Users/Dell/works/hackathons/Dorahacks/arcex-src/.env.local";
const RPC = "https://rpc.mainnet.arc.io";

const env = Object.fromEntries(
  readFileSync(ENV, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SECRET_KEY;

// Live mainnet pool seed prices (USDC per base token), 8-decimal on-chain
// values divided by 1e8. Verified against getSpotPrice() on Arc mainnet.
const PAIRS = [
  { pairId: 0, price: 150 },
  { pairId: 1, price: 75 },
  { pairId: 2, price: 25 },
];
const CHAIN_ID = 5042;
const TF = 300; // 5-minute candles (matches MarketStore's CANDLE_SECONDS)

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

async function supabasePost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text;
}

async function main() {
  if (!SERVICE_KEY) { console.error("No SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }

  // Current block timestamp to anchor the candle.
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const nowSec = parseInt(block.result.timestamp, 16);
  // Floor to the 5-minute boundary.
  const openTime = new Date(Math.floor(nowSec / TF) * TF * 1000).toISOString();

  console.log(`Seeding ${PAIRS.length} pools at open_time ${openTime}`);

  const rows = PAIRS.map((p) => ({
    chain_id: CHAIN_ID,
    pair_id: p.pairId,
    timeframe_seconds: TF,
    open_time: openTime,
    open: p.price,
    high: p.price,
    low: p.price,
    close: p.price,
    volume: 0,
  }));

  await supabasePost("market_candles", rows);
  console.log("Inserted market_candles rows:", rows.length);

  // Verify the read path the frontend uses.
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/market_candles?chain_id=eq.${CHAIN_ID}&select=pair_id,open,close&limit=5`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  console.log("Read-back:", await check.text());
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
