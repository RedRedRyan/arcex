import { readFileSync, writeFileSync } from "fs";

const path = "services/indexer/src/index.ts";
const content = readFileSync(path, "utf-8");
const lines = content.split("\n");

// Current state:
// L1-373: imports, config, client, state functions, main(), SIGINT/SIGTERM
// L374-411: first runIndexOnce (clean)
// L413-416: void main().catch
// L418-466: second runIndexOnce block (duplicates) - NEED TO REMOVE

// Find the second runIndexOnce block start (L418)
const secondStart = lines.findIndex(
  (l, i) => i > 400 && l.trim() === "export async function runIndexOnce()"
);
console.log("second runIndexOnce starts at line", secondStart + 1);

// Find the end of that block - the last line before the original main().catch
const secondEnd = lines.findIndex(
  (l, i) => i > secondStart && l.includes("void main().catch")
);
console.log("original main().catch starts at line", secondEnd + 1);

// Keep: lines[0..415] (L1-L416, through original main().catch)
const kept = lines.slice(0, 416);

// The original main().catch is L413-416 (0-indexed 412-415)
// We already have that in `kept`.

// Build new tail: comment + clean runIndexOnce + call + main().catch
const cleanTail = [
  "",
  "// ── PHASE 1: run the indexer exactly once (no loop, no interval) ────────────",
  "// Exported so the Vercel cron route can call it and exit cleanly.",
  "export async function runIndexOnce() {",
  "  if (config.CHAIN_ID !== ARC_TESTNET_CHAIN_ID) {",
  "    throw new Error(`Indexer chain mismatch: expected ${ARC_TESTNET_CHAIN_ID}.`);",
  "  }",
  "  let state = await loadState();",
  "  console.info(",
  "    `Indexing Arc Testnet pool ${poolAddress} from block ${state.cursor + 1n}.`,",
  "  );",
  "",
  "  while (!shuttingDown && state.cursor < (await client.getBlockNumber()) - BigInt(config.CONFIRMATIONS)) {",
  "    try {",
  "      const fromBlock = state.cursor + 1n;",
  "      const toBlock = fromBlock + BigInt(config.LOG_CHUNK_SIZE) - 1n;",
  "      let head = await client.getBlockNumber();",
  "      const confirmedHead = head > BigInt(config.CONFIRMATIONS) ? head - BigInt(config.CONFIRMATIONS) : 0n;",
  "      const effectiveToBlock = toBlock < confirmedHead ? toBlock : confirmedHead;",
  "",
  "      if (effectiveToBlock <= state.cursor) {",
  "        break;",
  "      }",
  "",
  "      const logs = await getRawLogs(fromBlock, effectiveToBlock);",
  "      state = await saveBatch(effectiveToBlock, logs, state);",
  "      if (logs.length > 0) {",
  "        console.info(",
  "          `Indexed ${logs.length} pool events through block ${effectiveToBlock}.`,",
  "        );",
  "      }",
  "    } catch (error) {",
  "      console.error(\"Indexer sync failed; retaining checkpoint and retrying.\", error);",
  "      shuttingDown = true;",
  "      throw error;",
  "    }",
  "  }",
  "",
  "  return true;",
  "}",
  "",
  "void runIndexOnce().catch((error: unknown) => {",
  "  console.error(\"Indexer run failed.\", error);",
  "  process.exitCode = 1;",
  "});",
  "",
  "void main().catch((error: unknown) => {",
  "  console.error(\"Indexer stopped unexpectedly.\", error);",
  "  process.exitCode = 1;",
  "});",
  "",
];

const result = kept.concat(cleanTail);
writeFileSync(path, result.join("\n"));

console.log("Wrote", result.length, "lines (removed", secondEnd - secondStart, "duplicate lines)");
console.log("--- Last 12 ---");
for (let i = result.length - 12; i < result.length; i++) {
  console.log((i + 1) + "| " + result[i]);
}
