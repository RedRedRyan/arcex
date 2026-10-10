-- 20261009000001_indexer_state.sql
-- PHASE 1 indexer: persistent checkpoint (pool, last_block) so the indexer can
-- resume exactly where it left off after a restart or redeploy.

CREATE TABLE IF NOT EXISTS public.indexer_state (
    chain_id integer NOT NULL,
    contract_address text NOT NULL,
    last_processed_block bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, contract_address)
);

COMMENT ON TABLE public.indexer_state IS 'Index checkpoint: last processed block + per-pool price snapshot';
COMMENT ON COLUMN public.indexer_state.last_processed_block IS 'Highest block number whose pool events have been processed';

CREATE INDEX IF NOT EXISTS indexer_state_contract_idx
    ON public.indexer_state (chain_id, contract_address);

ALTER TABLE public.indexer_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Index_state is readable by service role only" ON public.indexer_state
    FOR SELECT
    TO service_role
    USING (true);

REVOKE ALL ON public.indexer_state FROM anon, authenticated, service_role;
GRANT ALL ON public.indexer_state TO service_role;
