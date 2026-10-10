import { readFileSync, writeFileSync } from "fs";

const path = "services/indexer/src/index.ts";
const content = readFileSync(path, "utf-8");
const lines = content.split("\n");

// Find the first runIndexOnce (L374) block
// It starts at L374 with 'export async function runIndexOnce()'
// and ends at L411 with '}'
const firstStart = 373; // 0-indexed L374
const firstEnd = 411;   // 0-indexed L411 (the closing '}')

console.log("Removing lines", firstStart + 1, "to", firstEnd);

// Remove L374-L411 (first runIndexOnce + its void runIndexOnce().catch)
// Keep everything else (L1-L373, L412-L466)
const kept = lines.slice(0, firstStart).concat(lines.slice(firstEnd + 1));

writeFileSync(path, kept.join("\n"));

console.log("New total lines:", kept.length);
console.log("--- Last 12 lines ---");
for (let i = kept.length - 12; i < kept.length; i++) {
  console.log((i + 1) + "| " + kept[i]);
}
