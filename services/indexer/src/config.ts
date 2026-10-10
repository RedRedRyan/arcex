import { z } from "zod";
import { getAddress } from "viem";
import { ARC_TESTNET_CHAIN_ID } from "@arcex/shared";
import { arcTestnet } from "viem/chains";

const schema = z.object({
  ARC_RPC_HTTP: z.string().url().default(arcTestnet.rpcUrls.default.http[2]),
  CHAIN_ID: z.coerce.number().int().default(ARC_TESTNET_CHAIN_ID),
  SPOT_POOL_ADDRESS: z
    .string()
    .default("0x0ff9a151D9BE48d9222f9C680Ce4052E7c1f7b98")
    .transform((value) => getAddress(value)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  INDEXER_START_BLOCK: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.bigint().nonnegative().optional(),
  ),
  CONFIRMATIONS: z.coerce.number().int().nonnegative().default(2),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(3_000),
  LOG_CHUNK_SIZE: z.coerce.number().int().min(100).max(10_000).default(2_000),
});

export function loadConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid indexer configuration:\n${details}`);
  }
  if (result.data.CHAIN_ID !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(
      `This indexer currently supports Arc Testnet (${ARC_TESTNET_CHAIN_ID}) only.`,
    );
  }
  return result.data;
}
