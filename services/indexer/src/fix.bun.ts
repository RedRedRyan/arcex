import { readFileSync, writeFileSync } from "fs";

const path = "services/indexer/src/index.ts";
const content = readFileSync(path, "utf-8");
const lines = content.split("\n");

// Find the second runIndexOnce block (after the original main().catch at L416)
let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("// ── PHASE 1: run the indexer exactly once") && i > 410) {
    start = i;
    break;
  }
}

if (start === -1) {
  console.log("ERROR: second runIndexOnce block not found");
  console.log("All lines:");
  lines.forEach((l, i) => console.log(`${i}: ${l}`));
  process.exit(1);
}

for (let j = start; j < lines.length; j++) {
  if (lines[j].includes("void main().catch")) {
    end = j + 1;
    break;
  }
}

console.log("second block: lines", start + 1, "to", end);
console.log("total lines:", lines.length);

// Keep everything up to and including the original main().catch (L416)
const kept = lines.slice(0, 416);

const newBlock = [
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

const result = kept.concat(newBlock);

writeFileSync(path, result.join("\n"));

console.log("Wrote", result.length, "lines (removed", (end - start) + 1, "duplicate lines)");
console.log("--- Last 8 lines ---");
for (let i = result.length - 8; i < result.length; i++) {
  console.log((i + 1) + "| " + result[i]);
}
