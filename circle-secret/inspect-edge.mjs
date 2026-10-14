/**
 * inspect-edge.mjs — find the vaults missing name/manager.
 */
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
const { vaults } = await kit.earn.exploreVaults({ chain: "Arc", sortBy: "apy" });

console.log(`total: ${vaults.length}\n`);
console.log("=== vaults with missing/blank name or manager ===");
for (const v of vaults) {
  const badName = !v.name || String(v.name).trim() === "";
  const badMgr = !v.manager || !v.manager.name || String(v.manager.name).trim() === "";
  if (badName || badMgr) {
    console.log(`  ${v.vaultAddress}`);
    console.log(`    name    : ${JSON.stringify(v.name)}`);
    console.log(`    manager : ${JSON.stringify(v.manager)}`);
    console.log(`    protocol: ${JSON.stringify(v.protocol)}`);
    console.log(`    status  : ${JSON.stringify(v.status)}`);
  }
}

console.log("\n=== sample of well-formed vaults ===");
for (const v of vaults.filter((x) => x.name && x.manager?.name).slice(0, 3)) {
  console.log(`  "${v.name}" by ${v.manager.name} — ${v.protocol}`);
}
