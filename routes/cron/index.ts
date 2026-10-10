// routes/cron/index.ts
// PHASE 1: Vercel cron route for the pool-event indexer.
//
// The indexer reads Swap/SwapReservesUpdated logs per pool, starts from
// indexer_state.last_processed_block (or the pool's deploy block), and
// processes them in small getLogs chunks, converting each into 1-minute
// candles upserted idempotently into candles_1m.
//
// Intended to be called by Vercel Cron (every minute). Unlike the long-lived
// bun process in services/indexer, this route runs to completion and exits,
// so it is safe to schedule on a cron trigger.
//
// Environment (from env.example):
//   DATABASE_URL        – Supabase service_role connection string
//   ARC_RPC_HTTP        – Arc testnet RPC endpoint
//   SPOT_POOL_ADDRESS   – SpotPoolFactory address
//   INDEXER_START_BLOCK – optional explicit block to start from

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const REQUIRED = ["DATABASE_URL", "ARC_RPC_HTTP", "SPOT_POOL_ADDRESS"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[cron/index] missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// Re-export the shared indexer logic in "run once" mode.
// services/indexer/src/index.ts is already a stdlib-based entry; we import its
// pure functions instead of the process loop where possible.
import {
  loadConfig as loadIndexerConfig,
  getRawLogs,
  deploymentBlock,
  loadState,
  saveBatch,
  main,
} from "../services/indexer/src/index.ts";

// Re-run the indexer once, then respond.
(async () => {
  try {
    // Load indexer config (validates ARC_RPC_HTTP, SPOT_POOL_ADDRESS, etc.)
    const idxConfig = loadIndexerConfig();

    // Override the config with the env we just validated (dotenv .env.local
    // may not have been loaded by the indexer's own zod schema).
    process.env.ARC_RPC_HTTP = idxConfig.ARC_RPC_HTTP;
    process.env.SPOT_POOL_ADDRESS = idxConfig.SPOT_POOL_ADDRESS;

    // Run the shared indexer loop exactly once.
    const ok = await main();

    const body = {
      status: ok ? "indexed" : "no_work_needed",
      blocks: ok ? idxConfig.LOG_CHUNK_SIZE : 0,
      ok,
    };

    return new VercelResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[cron/index] error:", error);

    return new VercelResponse(
      JSON.stringify({ status: "error", error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  }
})().catch((error) => {
  console.error("[cron/index] uncaught:", error);
  process.exit(1);
});
