/**
 * probe-earn-shape.mjs — capture the exact fields the UI will render.
 * Numbers only; no keys involved.
 */

import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
const { vaults } = await kit.earn.exploreVaults({ chain: "Arc", sortBy: "apy" });

console.log(`total: ${vaults.length}\n`);

const v = vaults[0];
console.log("=== all field values on vault[0] ===");
for (const [k, val] of Object.entries(v)) {
  const s = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val);
  console.log(`  ${k}: ${s.length > 110 ? s.slice(0, 110) + "…" : s}`);
}

console.log("\n=== top 8 by APY ===");
for (const x of vaults.slice(0, 8)) {
  const apy = (x.currentApy * 100).toFixed(2);
  const tvl = x.totalDeposits?.formatted ?? x.totalDeposits ?? "?";
  console.log(`  ${apy}%  ${String(x.name).slice(0, 42).padEnd(42)}  tvl=${tvl}  ${x.protocol}`);
}

console.log("\n=== protocols present ===");
console.log([...new Set(vaults.map((x) => x.protocol))].join(", "));

console.log("\n=== statuses present ===");
console.log([...new Set(vaults.map((x) => x.status))].join(", "));
