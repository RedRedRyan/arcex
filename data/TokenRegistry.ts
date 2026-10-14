import { supabase } from "../src/utils/supabase";
import { NETWORKS } from "../src/config/networks";
import { getActiveNetwork } from "./MarketStore";

/** Chain id of the active network — the indexer keys rows by chain_id. */
const activeChainId = () => NETWORKS[getActiveNetwork()].chainId;

/**
 * Token metadata as stored by the indexer from TokenFactory.TokenCreated
 * events. Read by the market list, the /create form, and the shareable
 * /trade/:pairId pages. All reads are anon-safe (RLS: select for anon).
 */
export interface TokenRecord {
  chain_id: number;
  token_address: string;
  /** pairId assigned by SpotPoolFactoryV2.createPair. */
  pair_id: number;
  creator_address: string;
  name: string;
  symbol: string;
  decimals: number;
  initial_supply: string;
  image_url: string;
  description: string;
  socials: Record<string, string>;
  created_at: string;
}

function toRecord(row: Record<string, unknown>): TokenRecord | null {
  const {
    chain_id,
    token_address,
    pair_id,
    creator_address,
    name,
    symbol,
    decimals,
    initial_supply,
    image_url,
    description,
    socials,
    created_at,
  } = row;
  if (
    typeof chain_id !== "number" ||
    typeof token_address !== "string" ||
    typeof pair_id !== "number" ||
    typeof creator_address !== "string" ||
    typeof name !== "string" ||
    typeof symbol !== "string" ||
    typeof decimals !== "number" ||
    typeof initial_supply !== "string" ||
    typeof image_url !== "string" ||
    typeof description !== "string" ||
    typeof created_at !== "string"
  ) {
    return null;
  }
  const socialsValue =
    typeof socials === "object" && socials !== null
      ? (socials as Record<string, string>)
      : {};
  return {
    chain_id,
    token_address,
    pair_id,
    creator_address,
    name,
    symbol,
    decimals,
    initial_supply,
    image_url,
    description,
    socials: socialsValue,
    created_at,
  };
}

/** Every token on this chain, newest first. */
export async function fetchTokens(): Promise<TokenRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tokens")
    .select(
      "chain_id,token_address,pair_id,creator_address,name,symbol,decimals,initial_supply,image_url,description,socials,created_at",
    )
    .eq("chain_id", activeChainId())
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Could not load token registry:", error.message);
    return [];
  }
  const records: TokenRecord[] = [];
  for (const row of data ?? []) {
    const record = toRecord(row as Record<string, unknown>);
    if (record) records.push(record);
  }
  return records;
}

/** One token by its pairId (used by /trade/:pairId). */
export async function fetchTokenByPairId(
  pairId: number,
): Promise<TokenRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tokens")
    .select(
      "chain_id,token_address,pair_id,creator_address,name,symbol,decimals,initial_supply,image_url,description,socials,created_at",
    )
    .eq("chain_id", activeChainId())
    .eq("pair_id", pairId)
    .maybeSingle();
  if (error) {
    console.warn("Could not load token:", error.message);
    return null;
  }
  if (!data) return null;
  return toRecord(data as Record<string, unknown>);
}

/** Every token created by one address. */
export async function fetchTokensByCreator(
  creator: string,
): Promise<TokenRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tokens")
    .select(
      "chain_id,token_address,pair_id,creator_address,name,symbol,decimals,initial_supply,image_url,description,socials,created_at",
    )
    .eq("chain_id", activeChainId())
    .eq("creator_address", creator.toLowerCase())
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Could not load creator tokens:", error.message);
    return [];
  }
  const records: TokenRecord[] = [];
  for (const row of data ?? []) {
    const record = toRecord(row as Record<string, unknown>);
    if (record) records.push(record);
  }
  return records;
}
