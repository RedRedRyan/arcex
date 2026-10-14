// routes/cron/index.ts
// Vercel cron route for the pool-event indexer.
//
// Vercel Cron invokes this once per minute. Unlike the long-lived bun process
// in services/indexer, this route runs to completion and returns a response —
// it must never call process.exit() and must export a real handler, not
// construct a VercelResponse by hand.
//
// The indexer reads Swap/LiquidityAdded/LiquidityRemoved logs from
// SpotPoolFactoryV2, starts from indexer_state.last_processed_block (or
// INDEXER_START_BLOCK), and upserts pool_events rows.
//
// Environment (from env.example):
//   ARC_RPC_HTTP          – Arc testnet RPC endpoint
//   SPOT_POOL_ADDRESS     – SpotPoolFactoryV2 address
//   SUPABASE_URL          – Supabase project URL
//   SUPABASE_SECRET_KEY   – Supabase service_role key
//   INDEXER_START_BLOCK   – optional explicit block to start from

import type { VercelRequest, VercelResponse } from "@vercel/node";

const REQUIRED = ["ARC_RPC_HTTP", "SPOT_POOL_ADDRESS", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Vercel Cron issues GET requests; reject anything else.
  if (req.method !== "GET") {
    res.status(405).json({ status: "error", error: "Method not allowed" });
    return;
  }

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    res
      .status(500)
      .json({ status: "error", error: `Missing env: ${missing.join(", ")}` });
    return;
  }

  try {
    // Load the indexer config lazily so env validation happens at request
    // time, not at module scope (which would break `vercel dev`).
    const { loadConfig } = await import("../services/indexer/src/config.js");
    const idxConfig = loadConfig();

    // Run exactly one pass of the indexer.
    const { main } = await import("../services/indexer/src/index.js");
    const indexed = await main();

    res.status(200).json({
      status: indexed ? "indexed" : "no_work_needed",
      chunkSize: idxConfig.LOG_CHUNK_SIZE,
      ok: true,
    });
  } catch (error) {
    console.error("[cron/index] error:", error);
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
