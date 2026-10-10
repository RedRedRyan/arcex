create table if not exists public.pool_events (
  chain_id integer not null,
  block_number bigint not null,
  block_hash text not null,
  log_index integer not null,
  pair_id smallint not null check (pair_id between 0 and 2),
  event_kind text not null check (
    event_kind in ('swap', 'liquidity_added', 'liquidity_removed')
  ),
  block_time timestamptz not null,
  spot_price numeric(38, 18),
  volume_usdc numeric(38, 6) not null default 0,
  primary key (chain_id, block_hash, log_index)
);

create index if not exists pool_events_pair_time_idx
  on public.pool_events (chain_id, pair_id, block_time, block_number, log_index);

alter table public.pool_events enable row level security;
revoke all on public.pool_events from anon, authenticated;
grant all on public.pool_events to service_role;

create table if not exists public.indexer_state (
  chain_id integer not null,
  contract_address text not null,
  last_processed_block bigint not null,
  reserves jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract_address)
);

alter table public.indexer_state enable row level security;
revoke all on public.indexer_state from anon, authenticated;
grant all on public.indexer_state to service_role;

create table if not exists public.market_candles (
  chain_id integer not null,
  pair_id smallint not null check (pair_id between 0 and 2),
  timeframe_seconds integer not null check (
    timeframe_seconds in (60, 300, 3600, 86400)
  ),
  open_time timestamptz not null,
  open numeric(38, 18) not null,
  high numeric(38, 18) not null,
  low numeric(38, 18) not null,
  close numeric(38, 18) not null,
  volume numeric(38, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (chain_id, pair_id, timeframe_seconds, open_time)
);

create index if not exists market_candles_lookup_idx
  on public.market_candles (chain_id, timeframe_seconds, pair_id, open_time desc);

alter table public.market_candles enable row level security;
drop policy if exists "Market candles are readable" on public.market_candles;
create policy "Market candles are readable"
  on public.market_candles for select
  to anon, authenticated
  using (true);
revoke insert, update, delete on public.market_candles from anon, authenticated;
grant select on public.market_candles to anon, authenticated;
grant all on public.market_candles to service_role;

create or replace function public.rebuild_market_candles(
  p_chain_id integer,
  p_pair_id smallint,
  p_from_time timestamptz,
  p_to_time timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  with timeframes(seconds) as (
    values (60), (300), (3600), (86400)
  ),
  bucketed as (
    select
      e.chain_id,
      e.pair_id,
      tf.seconds as timeframe_seconds,
      to_timestamp(
        floor(extract(epoch from e.block_time) / tf.seconds) * tf.seconds
      ) as open_time,
      e.block_number,
      e.log_index,
      e.spot_price,
      e.volume_usdc
    from public.pool_events e
    cross join timeframes tf
    where e.chain_id = p_chain_id
      and e.pair_id = p_pair_id
      and e.event_kind = 'swap'
      and e.spot_price is not null
      and to_timestamp(
        floor(extract(epoch from e.block_time) / tf.seconds) * tf.seconds
      ) >= to_timestamp(
        floor(extract(epoch from p_from_time) / tf.seconds) * tf.seconds
      )
      and to_timestamp(
        floor(extract(epoch from e.block_time) / tf.seconds) * tf.seconds
      ) <= to_timestamp(
        floor(extract(epoch from p_to_time) / tf.seconds) * tf.seconds
      )
  ),
  candles as (
    select
      chain_id,
      pair_id,
      timeframe_seconds,
      open_time,
      (array_agg(spot_price order by block_number, log_index))[1] as candle_open,
      max(spot_price) as candle_high,
      min(spot_price) as candle_low,
      (array_agg(spot_price order by block_number desc, log_index desc))[1]
        as candle_close,
      sum(volume_usdc) as candle_volume
    from bucketed
    group by chain_id, pair_id, timeframe_seconds, open_time
  )
  insert into public.market_candles (
    chain_id,
    pair_id,
    timeframe_seconds,
    open_time,
    open,
    high,
    low,
    close,
    volume,
    updated_at
  )
  select
    chain_id,
    pair_id,
    timeframe_seconds,
    open_time,
    candle_open,
    candle_high,
    candle_low,
    candle_close,
    candle_volume,
    now()
  from candles
  on conflict (chain_id, pair_id, timeframe_seconds, open_time)
  do update set
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    volume = excluded.volume,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.rebuild_market_candles(
  integer, smallint, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.rebuild_market_candles(
  integer, smallint, timestamptz, timestamptz
) to service_role;
