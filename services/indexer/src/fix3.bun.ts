import { readFileSync, writeFileSync } from "fs";

const path = "services/indexer/src/index.ts";
const content = readFileSync(path, "utf-8");
const lines = content.split("\n");

// The file currently (after first fix):
// L1-373: imports, config, client, state functions, main(), SIGINT/SIGTERM
// L374: export async function runIndexOnce() {
// L375-411: runIndexOnce body
// L412: }  (closing of runIndexOnce)
// L413: void main().catch(...)
// L414: });
// L416: // PHASE 1 comment
// L417: // Exported so the Vercel cron route can call it and exit cleanly.
// L418: export async function runIndexOnce() {   <-- second duplicate
// L419-456: runIndexOnce body (similar but with effectiveToBlock)
// L457: }
// L458: void runIndexOnce().catch(...)  <-- this one also calls runIndexOnce
// L459-466: void main().catch(...)

// We want to KEEP:
// - L1-373 (imports through SIGTERM handler)
// - L374-411 (first runIndexOnce, the clean one)
// - L413-414 (void main().catch)
// L416 onwards: comment + second runIndexOnce + calls - these need careful handling

// Let's verify by finding exact indices
const firstRunStart = lines.findIndex((l, i) => i > 360 && l.trim() === "export async function runIndexOnce()");
const firstRunVoidCatch = lines.findIndex((l, i) => i > firstRunStart && l.includes("void runIndexOnce().catch"));
const mainCatch = lines.findIndex((l, i) => i > firstRunVoidCatch && l.includes("void main().catch"));

console.log("first runStart:", firstRunStart + 1);
console.log("first runVoidCatch:", firstRunVoidCatch + 1);
console.log("mainCatch:", mainCatch + 1);

// Keep: lines[0..firstRunStart-1]  (L1-L373, index 0-372)
// Then: first runIndexOnce from firstRunStart to firstRunVoidCatch (L374-L413)
// Then: main().catch (L414 to mainCatch-1)
// Then: a clean tail with comment + runIndexOnce export + call + main().catch

const head = lines.slice(0, firstRunStart);
const firstRunBlock = lines.slice(firstRunStart, firstRunVoidCatch + 1); // includes the void runIndexOnce().catch
const firstMainCatch = lines.slice(mainCatch, mainCatch + 3); // void main().catch, });  (3 lines)

// Build final
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

const result = head.concat(firstRunBlock, firstMainCatch, tail);
writeFileSync(path, result.join("\n"));
console.log("Wrote", result.length, "lines");
console.log("--- Last 12 ---");
for (let i = result.length - 12; i < result.length; i++) console.log((i + 1) + "| " + result[i]);
