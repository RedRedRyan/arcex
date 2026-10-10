-- 20261009000002_processed_logs.sql
-- PHASE 1 indexer: idempotency table (block_number, log_index, pool)
-- The indexer upserts every indexed event here; a primary key on these three
-- columns guarantees the same event is never counted twice.

CREATE TABLE IF NOT EXISTS public.processed_logs (
    block_number bigint NOT NULL,
    log_index integer NOT NULL,
    pool smallint NOT NULL,
    event_kind text NOT NULL CHECK (event_kind IN ('swap', 'liquidity_added', 'liquidity_removed')),
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (block_number, log_index, pool)
);

COMMENT ON TABLE public.processed_logs IS 'Idempotency ledger: one row per indexed pool event';
COMMENT ON COLUMN public.processed_logs.block_number IS 'Block containing the event';
COMMENT ON COLUMN public.processed_logs.log_index IS 'Event log index within the block';

CREATE INDEX IF NOT EXISTS processed_logs_pool_idx
    ON public.processed_logs (pool, block_number DESC);

ALTER TABLE public.processed_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Processed_logs are readable/writable by service role only" ON public.processed_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.processed_logs FROM anon, authenticated;
GRANT ALL ON public.processed_logs TO service_role;
