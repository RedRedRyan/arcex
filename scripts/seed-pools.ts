/**
 * Seed SpotPoolFactory pools with liquidity on Arc Testnet.
 * Run: bun run scripts/seed-pools.ts
 *
 * Uses Circle SCP wallet 3c2464b2-8369-52e2-a782-800bbeca5396 (the platform deployer).
 * Requires CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET in .env
 */

import {
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, encodeFunctionData, parseAbi, parseUnits } from "viem";

const CHAIN_ID = 5042002;
const RPC = process.env.RPC_URL || "https://rpc.testnet.arc.io";
const WALLET_ID = "3c2464b2-8369-52e2-a782-800bbeca5396";

const USDC = "0x3600000000000000000000000000000000000000";
const SPOT_POOL = "0x34d8dceb7d9638cc5be504f8540c25a143b51ac5";

const TOKENS = [
  { name: "TECHx",    addr: "0xcf4fd3c37325756d71e85ab88f5e0394e134365c", seedPrice: 150n },
  { name: "ENERGYx",  addr: "0x485cb7c7ea822366e35d119def803e5074bbfd5d", seedPrice: 75n  },
  { name: "ARCx",     addr: "0xe70d621729b3c306b8f97e75711c142bc3824ded", seedPrice: 25n  },
];

// Seed: 10,000 USDC per pool → base token amount = 10000 / seedPrice (18-dec)
// USDC is 6-dec on testnet
const USDC_PER_POOL = 10_000n * 1_000_000n; // 10,000 USDC (6 dec)

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const SPOT_ABI = parseAbi([
  "function setBaseToken(uint8 pairId, address baseToken)",
  "function addLiquidity(uint8 pairId, uint256 amountUSDC, uint256 amountBase, uint256 minLpOut)",
  "function pools(uint8) view returns (address baseToken, uint128 reserveUSDC, uint128 reserveBase, bool active)",
]);

const client = createPublicClient({ transport: http(RPC) });

async function main() {
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    console.error("Missing CIRCLE_DEVELOPER_CONTROLLED_API_KEY or CIRCLE_ENTITY_SECRET");
    process.exit(1);
  }

  const wallets = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  const send = async (contractAddress: string, data: `0x${string}`, label: string) => {
    console.log(`  → ${label}`);
    // Circle SDK: pass raw calldata without abiFunctionSignature
    const res = await (wallets as unknown as {
      createContractExecutionTransaction: (args: Record<string, unknown>) => Promise<{ data?: { id?: string } }>;
    }).createContractExecutionTransaction({
      walletId: WALLET_ID,
      contractAddress,
      callData: data,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      blockchain: "ARC-TESTNET",
    });
    const txId = res.data?.id;
    if (!txId) throw new Error(`No tx id for ${label}`);
    // Poll until complete
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const tx = await wallets.getTransaction({ id: txId });
      const state = tx.data?.transaction?.state;
      if (state === "COMPLETE") { console.log(`    ✓ confirmed`); return; }
      if (state === "FAILED" || state === "CANCELLED") throw new Error(`${label} tx ${state}`);
    }
    throw new Error(`${label} timed out`);
  };

  for (let i = 0; i < TOKENS.length; i++) {
    const tok = TOKENS[i];
    const pairId = i as 0 | 1 | 2;
    const baseAmount = (10_000n * 10n ** 18n) / tok.seedPrice; // 18-dec base tokens

    console.log(`\n=== Pool ${i}: ${tok.name} ===`);

    // Check if pool already active
    const pool = await client.readContract({
      address: SPOT_POOL,
      abi: SPOT_ABI,
      functionName: "pools",
      args: [pairId],
    });
    const active = pool[3];

    if (!active) {
      // setBaseToken
      await send(
        SPOT_POOL,
        encodeFunctionData({ abi: SPOT_ABI, functionName: "setBaseToken", args: [pairId, tok.addr as `0x${string}`] }),
        `setBaseToken(${pairId}, ${tok.name})`
      );
    } else {
      console.log(`  ℹ pool already active`);
    }

    // Mint base tokens to deployer
    await send(
      tok.addr,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "mint", args: [SPOT_POOL, baseAmount] }),
      `mint ${tok.name} → SpotPool`
    );

    // Mint USDC to SpotPool (since USDC is the native gas token on Arc, we send it directly)
    // Actually on Arc testnet USDC is an ERC-20 at 0x3600...; we need to transfer USDC from deployer wallet.
    // First mint USDC via transfer (we can't mint USDC), so instead we seed the pool with the deployer's USDC.
    // Approve USDC for SpotPool
    await send(
      USDC,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [SPOT_POOL as `0x${string}`, USDC_PER_POOL * 10n] }),
      `approve USDC for SpotPool`
    );

    // addLiquidity — but base tokens are already transferred to pool, so we need a different approach:
    // The contract pulls tokens via safeTransferFrom. Mint base tokens to the DEPLOYER wallet first.
    // Let's re-mint to deployer, approve SpotPool, then addLiquidity.
    // Re-mint to deployer instead of SpotPool:
    await send(
      tok.addr,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "mint", args: ["0x5B12Ce46C7194aD57d143bC22847224047b1Ef42", baseAmount] }),
      `mint ${tok.name} → deployer`
    );

    // Approve base token for SpotPool
    await send(
      tok.addr,
      encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [SPOT_POOL as `0x${string}`, baseAmount * 2n] }),
      `approve ${tok.name} for SpotPool`
    );

    // addLiquidity
    await send(
      SPOT_POOL,
      encodeFunctionData({ abi: SPOT_ABI, functionName: "addLiquidity", args: [pairId, USDC_PER_POOL, baseAmount, 0n] }),
      `addLiquidity pool ${i}`
    );

    console.log(`  ✅ Pool ${i} (${tok.name}) seeded with $10,000 USDC`);
  }

  console.log("\n🎉 All pools seeded!");
}

main().catch((e) => { console.error(e); process.exit(1); });
