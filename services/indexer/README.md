# Arc spot-pool candle indexer

This is a standalone Bun service. It backfills confirmed pool events from the
SpotPoolFactory deployment block, resumes from its Supabase checkpoint, and
continues polling for new confirmed blocks. It tracks liquidity events as well
as swaps so reserve-derived prices remain correct. Swap events are stored
idempotently and aggregated into 1m, 5m, 1h, and 1d OHLCV candles.

## Setup

1. Apply `supabase/migrations/20261009000000_market_candles.sql` to the Supabase
   project (for example, with the Supabase SQL editor).
2. Copy `services/indexer/env.example` to `services/indexer/.env`.
3. Set `SUPABASE_SECRET_KEY` in the indexer environment to the project's
   **secret/service-role key**. Never put this key in the Vite environment or
   browser code. The browser uses only `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the root
   `.env.example` in the frontend's local or deployment environment.
5. Install workspace dependencies with `bun install`, then start the service:

   ```sh
   bun run indexer
   ```

   Use `bun run indexer:dev` for watch mode.

By default, the start block is read from the checked-in SpotPoolFactory
deployment transaction. Set `INDEXER_START_BLOCK` when indexing a different
pool address. The service waits for the configured confirmation depth before
indexing, retries RPC or database failures without advancing its checkpoint,
and can be restarted safely. The indexer's only database write credentials
stay server-side; anonymous/authenticated users have read-only access to
`market_candles`.

The frontend requests the most recent 24 hours of 5-minute candles for all
three markets in one query. The live market store continues to own the current
reserve-derived price and updates the current candle as new reserves arrive.
