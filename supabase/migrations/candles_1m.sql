-- 20261009000000_candles_1m.sql
-- PHASE 1 indexer: 1-minute candles table (pool, bucket_start, open, high, low, close, volume)
-- Created as the first incremental table on top of the existing market_candles schema.

CREATE TABLE IF NOT EXISTS public.candles_1m (
    pool smallint NOT NULL,
    bucket_start timestamptz NOT NULL,
    open numeric(38, 18) NOT NULL,
    high numeric(38, 18) NOT NULL,
    low numeric(38, 18) NOT NULL,
    close numeric(38, 18) NOT NULL,
    volume numeric(38, 6) NOT NULL DEFAULT 0,
    PRIMARY KEY (pool, bucket_start)
);

COMMENT ON TABLE public.candles_1m IS '1-minute OHLCV candles from pool events, per pair';
COMMENT ON COLUMN public.candles_1m.pool IS 'Pair ID (0=TECHx, 1=ENERGYx, 2=ARCx)';
COMMENT ON COLUMN public.candles_1m.bucket_start IS 'Bucket start UTC (rounded to the minute)';

CREATE INDEX IF NOT EXISTS candles_1m_pool_time_idx
    ON public.candles_1m (pool, bucket_start DESC);

ALTER TABLE public.candles_1m ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candles_1m are readable by anyone" ON public.candles_1m
    FOR SELECT
    TO anon, authenticated
    USING (true);

REVOKE ALL ON public.candles_1m FROM anon, authenticated;
GRANT SELECT ON public.candles_1m TO anon, authenticated;
