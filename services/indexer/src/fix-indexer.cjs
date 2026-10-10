const fs = require("fs");
const path = "services/indexer/src/index.ts";
const newline = "\n";

const lines = fs.readFileSync(path, "utf8").split("\n");

// Find the second runIndexOnce block start (after original main().catch at line 416)
let secondStart = -1;
for (let i = 410; i < lines.length; i++) {
  if (lines[i].trim() === "export async function runIndexOnce()") {
    secondStart = i;
    break;
  }
}
console.log("second runIndexOnce at line", secondStart + 1);

// Find the end of that block (the closing of void runIndexOnce().catch)
let endIdx = lines.length;
for (let i = secondStart; i < lines.length; i++) {
  if (lines[i].includes("void runIndexOnce().catch")) {
    endIdx = i + 1;
    break;
  }
}
console.log("second block ends at line", endIdx);

// Keep lines[0]..lines[415] (L1-L416, through original main().catch)
let head = lines.slice(0, 416);

// Build clean tail
const tail = [
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

const result = head.concat(tail);
fs.writeFileSync(path, result.join(newline));
console.log("Total lines written:", result.length);

console.log("--- Last 10 lines ---");
for (let i = result.length - 10; i < result.length; i++) {
  console.log((i + 1) + "| " + result[i]);
}
