import {
  createPublicClient,
  decodeEventLog,
  fallback,
  formatUnits,
  getAddress,
  http,
  isHex,
  parseAbi,
  toEventSelector,
  type Address,
} from "viem";
import { arcTestnet } from "viem/chains";
import spotPoolMetadata from "../../../contracts/contract-metadata/SpotPoolFactory.json";
import { ARC_TESTNET_CHAIN_ID } from "@arcex/shared";
import { loadConfig } from "./config";
import { applyPoolMutation, poolPrice, type PoolReserves } from "./market";
import { supabase } from "./supabase";

const PAIR_IDS = [0, 1, 2] as const;
const POOL_ABI = parseAbi([
  "event LiquidityAdded(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpMinted)",
  "event LiquidityRemoved(uint8 indexed pairId, address indexed provider, uint256 amountUSDC, uint256 amountBase, uint256 lpBurned)",
  "event Swap(uint8 indexed pairId, address indexed sender, bool usdcIn, uint256 amountIn, uint256 amountOut, address indexed to)",
  "event PoolActivated(uint8 indexed pairId, address baseToken)",
]);
const INDEXED_EVENT_TOPICS = new Set(
  [
    "LiquidityAdded(uint8,address,uint256,uint256,uint256)",
    "LiquidityRemoved(uint8,address,uint256,uint256,uint256)",
    "Swap(uint8,address,bool,uint256,uint256,address)",
    "PoolActivated(uint8,address)",
  ].map(toEventSelector),
);
const EVENT_CONFLICT_KEY = "chain_id,block_hash,log_index";

interface StoredState {
  last_processed_block: string;
  reserves: Record<string, { reserveQuote: string; reserveBase: string }>;
}

interface IndexedEventRow {
  chain_id: number;
  block_number: string;
  block_hash: string;
  log_index: number;
  pair_id: number;
  event_kind: "swap" | "liquidity_added" | "liquidity_removed";
  block_time: string;
  spot_price: string | null;
  volume_usdc: string;
}

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  if (
    typeof state.last_processed_block !== "string" ||
    typeof state.reserves !== "object" ||
    state.reserves === null
  )
    return false;
  const reserves = state.reserves as Record<string, unknown>;
  return PAIR_IDS.every((pairId) => {
    const reserve = reserves[String(pairId)];
    if (typeof reserve !== "object" || reserve === null) return false;
    const values = reserve as Record<string, unknown>;
    return (
      typeof values.reserveQuote === "string" &&
      typeof values.reserveBase === "string"
    );
  });
}

const config = loadConfig();
const poolAddress: Address = config.SPOT_POOL_ADDRESS;
const client = createPublicClient({
  chain: arcTestnet,
  transport: fallback([
    http(config.ARC_RPC_HTTP, { batch: { wait: 20, batchSize: 100 } }),
  ]),
});

let shuttingDown = false;

function blankReserves(): Record<number, PoolReserves> {
  return Object.fromEntries(
    PAIR_IDS.map((pairId) => [
      pairId,
      { reserveQuote: 0n, reserveBase: 0n },
    ]),
  );
}

function cloneReserves(source: Record<number, PoolReserves>) {
  return Object.fromEntries(
    PAIR_IDS.map((pairId) => [pairId, { ...source[pairId] }]),
  );
}

function isPairId(value: number): value is (typeof PAIR_IDS)[number] {
  return value === 0 || value === 1 || value === 2;
}

function decodeMutation(log: (typeof EMPTY_LOGS)[number]) {
  const decoded = decodeEventLog({
    abi: POOL_ABI,
    data: log.data,
    topics: log.topics,
  });
  if (decoded.eventName === "PoolActivated") return null;

  const pairId = Number(decoded.args.pairId);
  if (!isPairId(pairId))
    throw new Error(`Unexpected pool pair id ${pairId} in block ${log.blockNumber}.`);

  if (decoded.eventName === "Swap") {
    return {
      pairId,
      kind: "swap" as const,
      mutation: {
        kind: "swap" as const,
        usdcIn: decoded.args.usdcIn,
        amountIn: decoded.args.amountIn,
        amountOut: decoded.args.amountOut,
      },
      volume: decoded.args.usdcIn ? decoded.args.amountIn : decoded.args.amountOut,
    };
  }
  if (decoded.eventName === "LiquidityAdded") {
    return {
      pairId,
      kind: "liquidity_added" as const,
      mutation: {
        kind: "add" as const,
        amountUSDC: decoded.args.amountUSDC,
        amountBase: decoded.args.amountBase,
      },
      volume: 0n,
    };
  }
  return {
    pairId,
    kind: "liquidity_removed" as const,
    mutation: {
      kind: "remove" as const,
      amountUSDC: decoded.args.amountUSDC,
      amountBase: decoded.args.amountBase,
    },
    volume: 0n,
  };
}

const EMPTY_LOGS: Awaited<ReturnType<typeof getRawLogs>> = [];

async function getRawLogs(fromBlock: bigint, toBlock: bigint) {
  return client.getLogs({ address: poolAddress, fromBlock, toBlock });
}

async function deploymentBlock(): Promise<bigint> {
  if (config.INDEXER_START_BLOCK !== undefined)
    return config.INDEXER_START_BLOCK;
  if (
    getAddress(spotPoolMetadata.contractAddress) !== poolAddress ||
    !spotPoolMetadata.contract_deployments[0]?.txHash
  ) {
    throw new Error(
      "Set INDEXER_START_BLOCK when indexing a pool not matching the checked-in deployment metadata.",
    );
  }
  const txHash = spotPoolMetadata.contract_deployments[0].txHash;
  if (!isHex(txHash)) throw new Error("Pool deployment metadata has an invalid transaction hash.");
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  return receipt.blockNumber;
}

async function loadState(): Promise<{
  cursor: bigint;
  reserves: Record<number, PoolReserves>;
}> {
  const { data, error } = await supabase
    .from("indexer_state")
    .select("last_processed_block,reserves")
    .eq("chain_id", ARC_TESTNET_CHAIN_ID)
    .eq("contract_address", poolAddress)
    .maybeSingle();
  if (error) throw new Error(`Could not load indexer checkpoint: ${error.message}`);

  const rawState: unknown = data;
  if (rawState !== null) {
    if (!isStoredState(rawState))
      throw new Error("Supabase returned a malformed indexer checkpoint.");
    const saved = rawState;
    const reserves = blankReserves();
    for (const pairId of PAIR_IDS) {
      const value = saved.reserves[String(pairId)];
      if (!value) throw new Error(`Checkpoint missing reserves for pair ${pairId}.`);
      reserves[pairId] = {
        reserveQuote: BigInt(value.reserveQuote),
        reserveBase: BigInt(value.reserveBase),
      };
    }
    return { cursor: BigInt(saved.last_processed_block), reserves };
  }

  const start = await deploymentBlock();
  return { cursor: start > 0n ? start - 1n : 0n, reserves: blankReserves() };
}

async function blockTimestamps(blockNumbers: bigint[]) {
  const unique = [...new Set(blockNumbers.map(String))].map(BigInt);
  const values = await Promise.all(
    unique.map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      return [blockNumber.toString(), Number(block.timestamp)] as const;
    }),
  );
  return new Map(values);
}

async function saveBatch(
  toBlock: bigint,
  logs: Awaited<ReturnType<typeof getRawLogs>>,
  state: { cursor: bigint; reserves: Record<number, PoolReserves> },
) {
  const nextReserves = cloneReserves(state.reserves);
  const ordered = logs
    .filter((log) => log.topics[0] && INDEXED_EVENT_TOPICS.has(log.topics[0]))
    .sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? (a.logIndex ?? 0) - (b.logIndex ?? 0)
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
    );
  const timestamps = await blockTimestamps(
    ordered.flatMap((log) => (log.blockNumber === null ? [] : [log.blockNumber])),
  );
  const rows: IndexedEventRow[] = [];

  for (const log of ordered) {
    if (
      log.blockNumber === null ||
      log.blockHash === null ||
      log.logIndex === null
    )
      throw new Error("RPC returned an incomplete pool event log.");

    const event = decodeMutation(log);
    if (!event) continue;
    const blockTime = timestamps.get(log.blockNumber.toString());
    if (blockTime === undefined)
      throw new Error(`Missing timestamp for event block ${log.blockNumber}.`);

    const updated = applyPoolMutation(
      nextReserves[event.pairId],
      event.mutation,
    );
    nextReserves[event.pairId] = updated;
    rows.push({
      chain_id: ARC_TESTNET_CHAIN_ID,
      block_number: log.blockNumber.toString(),
      block_hash: log.blockHash,
      log_index: log.logIndex,
      pair_id: event.pairId,
      event_kind: event.kind,
      block_time: new Date(blockTime * 1_000).toISOString(),
      spot_price: event.kind === "swap" ? poolPrice(updated) : null,
      volume_usdc:
        event.kind === "swap" ? formatUnits(event.volume, 6) : "0",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("pool_events").upsert(rows, {
      onConflict: EVENT_CONFLICT_KEY,
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Could not persist pool events: ${error.message}`);

    const changedPairs = [...new Set(rows.map((row) => row.pair_id))];
    for (const pairId of changedPairs) {
      const pairRows = rows.filter((row) => row.pair_id === pairId);
      const times = pairRows.map((row) => Date.parse(row.block_time));
      const fromTime = new Date(Math.min(...times)).toISOString();
      const toTime = new Date(Math.max(...times)).toISOString();
      const { error: candleError } = await supabase.rpc(
        "rebuild_market_candles",
        {
          p_chain_id: ARC_TESTNET_CHAIN_ID,
          p_pair_id: pairId,
          p_from_time: fromTime,
          p_to_time: toTime,
        },
      );
      if (candleError)
        throw new Error(
          `Could not aggregate candles for pair ${pairId}: ${candleError.message}`,
        );
    }
  }

  const savedState: StoredState = {
    last_processed_block: toBlock.toString(),
    reserves: Object.fromEntries(
      PAIR_IDS.map((pairId) => [
        pairId,
        {
          reserveQuote: nextReserves[pairId].reserveQuote.toString(),
          reserveBase: nextReserves[pairId].reserveBase.toString(),
        },
      ]),
    ),
  };
  const { error } = await supabase.from("indexer_state").upsert(
    {
      chain_id: ARC_TESTNET_CHAIN_ID,
      contract_address: poolAddress,
      ...savedState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chain_id,contract_address" },
  );
  if (error) throw new Error(`Could not save indexer checkpoint: ${error.message}`);
  return { cursor: toBlock, reserves: nextReserves };
}

async function main() {
  if (config.CHAIN_ID !== ARC_TESTNET_CHAIN_ID)
    throw new Error(`Indexer chain mismatch: expected ${ARC_TESTNET_CHAIN_ID}.`);

  let state = await loadState();
  console.info(
    `Indexing Arc Testnet pool ${poolAddress} from block ${state.cursor + 1n}.`,
  );

  while (!shuttingDown) {
    try {
      const head = await client.getBlockNumber();
      const confirmedHead =
        head > BigInt(config.CONFIRMATIONS)
          ? head - BigInt(config.CONFIRMATIONS)
          : 0n;

      while (!shuttingDown && state.cursor < confirmedHead) {
        const fromBlock = state.cursor + 1n;
        const toBlock =
          fromBlock + BigInt(config.LOG_CHUNK_SIZE) - 1n < confirmedHead
            ? fromBlock + BigInt(config.LOG_CHUNK_SIZE) - 1n
            : confirmedHead;
        const logs = await getRawLogs(fromBlock, toBlock);
        state = await saveBatch(toBlock, logs, state);
        if (logs.length > 0)
          console.info(
            `Indexed ${logs.length} pool events through block ${toBlock}.`,
          );
      }
    } catch (error) {
      console.error("Indexer sync failed; retaining checkpoint and retrying.", error);
    }
    await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
  }
}

process.once("SIGINT", () => {
  shuttingDown = true;
});
process.once("SIGTERM", () => {
  shuttingDown = true;
});

// ── PHASE 1: run the indexer exactly once (no loop, no interval) ────────────
// Exported so the Vercel cron route can call it and exit cleanly.
export async function runIndexOnce() {
  if (config.CHAIN_ID !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(`Indexer chain mismatch: expected ${ARC_TESTNET_CHAIN_ID}.`);
  }
  let state = await loadState();
  console.info(
    `Indexing Arc Testnet pool ${poolAddress} from block ${state.cursor + 1n}.`,
  );

  while (!shuttingDown && state.cursor < (await client.getBlockNumber()) - BigInt(config.CONFIRMATIONS)) {
    try {
      const fromBlock = state.cursor + 1n;
      const toBlock = fromBlock + BigInt(config.LOG_CHUNK_SIZE) - 1n;
      let head = await client.getBlockNumber();
      const confirmedHead = head > BigInt(config.CONFIRMATIONS) ? head - BigInt(config.CONFIRMATIONS) : 0n;
      const effectiveToBlock = toBlock < confirmedHead ? toBlock : confirmedHead;

      if (effectiveToBlock <= state.cursor) {
        break;
      }

      const logs = await getRawLogs(fromBlock, effectiveToBlock);
      state = await saveBatch(effectiveToBlock, logs, state);
      if (logs.length > 0) {
        console.info(
          `Indexed ${logs.length} pool events through block ${effectiveToBlock}.`,
        );
      }
    } catch (error) {
      console.error("Indexer sync failed; retaining checkpoint and retrying.", error);
      // Stop this run so the route can report the error.
      shuttingDown = true;
      throw error;
    }
  }

  return true;
}

void main().catch((error: unknown) => {
  console.error("Indexer stopped unexpectedly.", error);
  process.exitCode = 1;
});

// ── PHASE 1: run the indexer exactly once (no loop, no interval) ────────────
// Exported so the Vercel cron route can call it and exit cleanly.
export async function runIndexOnce() {
  if (config.CHAIN_ID !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(`Indexer chain mismatch: expected ${ARC_TESTNET_CHAIN_ID}.`);
  }
  let state = await loadState();
  console.info(
    `Indexing Arc Testnet pool ${poolAddress} from block ${state.cursor + 1n}.`,
  );

  while (!shuttingDown && state.cursor < (await client.getBlockNumber()) - BigInt(config.CONFIRMATIONS)) {
    try {
      const fromBlock = state.cursor + 1n;
      const toBlock = fromBlock + BigInt(config.LOG_CHUNK_SIZE) - 1n;
      let head = await client.getBlockNumber();
      const confirmedHead = head > BigInt(config.CONFIRMATIONS) ? head - BigInt(config.CONFIRMATIONS) : 0n;
      const effectiveToBlock = toBlock < confirmedHead ? toBlock : confirmedHead;

      if (effectiveToBlock <= state.cursor) {
        break;
      }

      const logs = await getRawLogs(fromBlock, effectiveToBlock);
      state = await saveBatch(effectiveToBlock, logs, state);
      if (logs.length > 0) {
        console.info(
          `Indexed ${logs.length} pool events through block ${effectiveToBlock}.`,
        );
      }
    } catch (error) {
      console.error("Indexer sync failed; retaining checkpoint and retrying.", error);
      shuttingDown = true;
      throw error;
    }
  }

  return true;
}

void runIndexOnce().catch((error: unknown) => {
  console.error("Indexer run failed.", error);
  process.exitCode = 1;
});
