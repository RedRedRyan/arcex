import io

path = "services/indexer/src/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.split("\n")

# Find the second runIndexOnce block (after the original main).catch at L416)
start = None
end = None
for i, l in enumerate(lines):
    if "// ── PHASE 1: run the indexer exactly once" in l and i > 410:
        start = i
        break

if start is None:
    print("ERROR: second runIndexOnce block not found")
    exit(1)

# Find the end of that block (the closing of void main().catch)
for j in range(start, len(lines)):
    if "void main().catch" in lines[j]:
        end = j + 1
        break

print(f"second block: lines {start+1}-{end}")
print(f"total lines: {len(lines)}")

# Keep everything up to and including the original main().catch (L416)
# Then drop the second runIndexOnce block and re-add a clean one
kept = lines[:416]
new_lines = kept + [
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
]

result = kept + new_lines
result = [l for l in result if l != ""]  # remove empty lines we may have added

with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(result))

print("Wrote", len(result), "lines (removed", (end - start) + 1, "duplicate lines)")
