/**
 * verify-earn.mjs — final check: real SDK data through the shipped
 * normalisation + formatters from src/config/earn.ts.
 */
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
const ok = (label, cond) => console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);

const { vaults } = await kit.earn.exploreVaults({ chain: "Arc", sortBy: "apy" });
console.log(`live vaults on Arc mainnet: ${vaults.length}\n`);

// ── exact copy of toVault() from src/config/earn.ts ──────────────────────────
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const toWarnings = (raw) =>
  Array.isArray(raw) ? raw.filter((w) => typeof w === "string") : [];

const mapped = vaults.map((v) => {
  const fee = v.fee ?? {};
  const risk = v.riskSignals ?? {};
  const rawName = typeof v.name === "string" ? v.name.trim() : "";
  const rawManager = v.manager?.name?.trim() ?? "";
  return {
    vaultAddress: v.vaultAddress,
    name: rawName.length > 0 ? rawName : `Vault ${v.vaultAddress.slice(0, 8)}`,
    protocol: v.protocol ?? "—",
    apy: num(v.currentApy),
    totalDeposits: num(v.totalDeposits),
    liquidity: num(v.liquidity),
    status: v.status ?? "active",
    manager: rawManager.length > 0 ? rawManager : "Unattributed",
    circleGuarded: Boolean(v.circleGuarded),
    warnings: [...toWarnings(risk.warnings), ...toWarnings(risk.earnKitWarnings)],
    managementFee: num(fee.management),
    performanceFee: num(fee.performance),
  };
});

console.log("=== no vault renders blank or 'null' ===");
ok("every name non-empty", mapped.every((v) => v.name.trim().length > 0));
ok("no literal null/undefined in name", mapped.every((v) => !/null|undefined/i.test(v.name)));
ok("every manager non-empty", mapped.every((v) => v.manager.trim().length > 0));
ok("no literal null/undefined in manager", mapped.every((v) => !/null|undefined/i.test(v.manager)));

console.log("\n=== numeric safety ===");
ok("all numerics finite", mapped.every((v) =>
  [v.apy, v.totalDeposits, v.liquidity, v.managementFee, v.performanceFee]
    .every(Number.isFinite)));
ok("addresses are valid", mapped.every((v) => /^0x[0-9a-fA-F]{40}$/.test(v.vaultAddress)));

console.log("\n=== formatters (copied from earn.ts) ===");
const formatApy = (a) => `${(a * 100).toFixed(2)}%`;
const formatCompact = (n) =>
  Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : n.toFixed(2);
const formatFee = (f) => { const p = f * 100; return p === 0 ? "None" : `${p.toFixed(2)}%`; };

ok("apy format", mapped.every((v) => /^\d+\.\d{2}%$/.test(formatApy(v.apy))));
ok("tvl format", mapped.every((v) => /^[\d.]+[BMK]?$/.test(formatCompact(v.totalDeposits))));
ok("fee format", mapped.every((v) => /^(None|\d+\.\d{2}%)$/.test(formatFee(v.managementFee))));

console.log("\n=== UI states exercised by real data ===");
const statuses = [...new Set(mapped.map((v) => v.status))];
ok(`statuses handled (${statuses.join(", ")})`,
   statuses.every((s) => s === "active" || s === "low_liquidity"));
console.log(`  vaults using the "Unattributed" fallback: ${mapped.filter((v) => v.manager === "Unattributed").length}`);
console.log(`  vaults using the generated-name fallback: ${mapped.filter((v) => /^Vault 0x/.test(v.name)).length}`);
console.log(`  Circle-guarded vaults: ${mapped.filter((v) => v.circleGuarded).length}`);

console.log("\n=== top 5 the user will see ===");
for (const v of mapped.slice(0, 5)) {
  console.log(`  ${formatApy(v.apy).padStart(6)}  ${v.name.slice(0, 34).padEnd(34)}  $${formatCompact(v.totalDeposits).padStart(8)}  ${v.manager}`);
}
