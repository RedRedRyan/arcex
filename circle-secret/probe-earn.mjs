/**
 * probe-earn.mjs — does exploreVaults work from a plain Node/browser-like
 * context with NO api key? Prints only counts and shapes, never a key.
 *
 * This decides whether the Earn page can be fully client-side or needs the
 * server module (@circle-fin/app-kit/server).
 */

import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();

// Arc mainnet, per the user's request ("NOW ON MAINNET").
for (const chain of ["Arc", "Arc_Testnet"]) {
  try {
    const result = await kit.earn.exploreVaults({ chain, sortBy: "apy" });
    const vaults = result?.vaults ?? [];
    console.log(`${chain}: OK — ${vaults.length} vault(s)`);
    if (vaults.length > 0) {
      const v = vaults[0];
      console.log(`  first vault keys: ${Object.keys(v).join(", ")}`);
      console.log(`  vaultAddress: ${v.vaultAddress}`);
      console.log(`  name: ${v.name ?? v.vaultName ?? "n/a"}`);
      console.log(`  apy: ${JSON.stringify(v.apyProfile?.current ?? v.apy)}`);
      console.log(`  asset: ${v.asset ?? "n/a"}`);
    }
    if (result?.errors?.length) {
      console.log(`  errors: ${JSON.stringify(result.errors).slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`${chain}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
}
