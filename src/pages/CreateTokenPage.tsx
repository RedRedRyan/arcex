import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import type { Chain } from "viem";
import { toast } from "sonner";
import { Loader2, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNetwork } from "../config/NetworkProvider";
import TokenFactoryArtifact from "../../contracts/contract-metadata/TokenFactory.json";
import SpotPoolArtifact from "../../contracts/contract-metadata/SpotPoolFactoryV2.json";
import { getExplorerTxUrl } from "../utils";
import { NOT_DEPLOYED } from "../config/networks";

/**
 * Create-token page. Calls TokenFactory.createToken (permissionless, with a
 * per-creator cooldown), then SpotPoolFactoryV2.createPair so the new token is
 * immediately tradeable, then routes to its shareable /trade/:pairId page.
 *
 * Token metadata (name, image, description) is emitted on-chain in the
 * TokenCreated event and mirrored into the Supabase `tokens` table by the
 * indexer; the share pages read it from there.
 */

/** Reads the most recent token address the factory recorded. */
async function readLatestToken(
  factory: `0x${string}`,
  activeChain: Chain,
): Promise<`0x${string}`> {
  const { createPublicClient, http } = await import("viem");
  const client = createPublicClient({
    chain: activeChain,
    transport: http(),
  });
  const count = (await client.readContract({
    address: factory,
    abi: TokenFactoryArtifact.abi,
    functionName: "tokenCount",
  })) as bigint;
  return (await client.readContract({
    address: factory,
    abi: TokenFactoryArtifact.abi,
    functionName: "tokens",
    args: [count - 1n],
  })) as `0x${string}`;
}

export default function CreateTokenPage() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { config } = useNetwork();
  const CONTRACT_ADDRESSES = config.contracts;
  const activeChain = config.chain;
  const FACTORY_DEPLOYED = CONTRACT_ADDRESSES.tokenFactory !== NOT_DEPLOYED;
  const POOL_DEPLOYED = CONTRACT_ADDRESSES.spotPool !== NOT_DEPLOYED;

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [supply, setSupply] = useState("1000000");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ticks every 30s so the cooldown countdown refreshes without reading
  // Date.now() during render.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { data: cooldownSeconds } = useReadContract({
    address: CONTRACT_ADDRESSES.tokenFactory,
    abi: TokenFactoryArtifact.abi,
    functionName: "creationCooldown",
    query: { enabled: FACTORY_DEPLOYED },
  });

  const { data: lastCreatedAt } = useReadContract({
    address: CONTRACT_ADDRESSES.tokenFactory,
    abi: TokenFactoryArtifact.abi,
    functionName: "lastCreatedAt",
    args: address ? [address] : undefined,
    query: { enabled: FACTORY_DEPLOYED && !!address },
  });

  const cooldownRemaining = useMemo(() => {
    if (!address || !lastCreatedAt || !cooldownSeconds) return 0;
    const next = Number(lastCreatedAt) + Number(cooldownSeconds);
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, next - now);
    // Recompute on a 30s tick so the countdown ticks down without
    // Date.now() being read during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, lastCreatedAt, cooldownSeconds, tick]);

  const canSubmit =
    !!address &&
    FACTORY_DEPLOYED &&
    POOL_DEPLOYED &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    Number(supply) > 0 &&
    cooldownRemaining === 0 &&
    !submitting;

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!address || !canSubmit) return;

      const run = async () => {
        setSubmitting(true);
        try {
          const supplyBase = parseUnits(supply, decimals);

          // 1. Deploy the token
          const createHash = await writeContractAsync({
            address: CONTRACT_ADDRESSES.tokenFactory,
            abi: TokenFactoryArtifact.abi,
            functionName: "createToken",
            args: [name.trim(), symbol.trim(), decimals, supplyBase, imageUrl.trim(), description.trim()],
          });
          toast.success("Token created. Creating trading pool…", {
            description: getExplorerTxUrl(createHash) ?? undefined,
          });

          // 2. Read the token address the factory just recorded
          const tokenAddress = await readLatestToken(
            CONTRACT_ADDRESSES.tokenFactory,
            activeChain,
          );

          // 3. Register the USDC-quoted pool
          const pairHash = await writeContractAsync({
            address: CONTRACT_ADDRESSES.spotPool,
            abi: SpotPoolArtifact.abi,
            functionName: "createPair",
            args: [tokenAddress],
          });
          toast.success("Trading pool created", {
            description: getExplorerTxUrl(pairHash) ?? undefined,
          });

          navigate("/create");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          toast.error("Token creation failed", { description: message });
        } finally {
          setSubmitting(false);
        }
      };

      void run();
    },
    [address, canSubmit, decimals, description, imageUrl, name, navigate, supply, symbol, writeContractAsync, activeChain, CONTRACT_ADDRESSES],
  );

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#fb4f1f] focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium text-white/60";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Coins className="h-6 w-6 text-[#fb4f1f]" />
        <h1 className="text-2xl font-bold text-white">Create a token</h1>
      </div>

      {!FACTORY_DEPLOYED || !POOL_DEPLOYED ? (
        <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Contracts are not deployed yet. Run{" "}
          <code className="rounded bg-black/40 px-1">forge script Deploy.s.sol</code>{" "}
          and set VITE_TOKEN_FACTORY_ADDRESS / VITE_SPOT_POOL_ADDRESS.
        </p>
      ) : !address ? (
        <p className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/60">
          Connect your wallet to create a token.
        </p>
      ) : cooldownRemaining > 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/60">
          You can create another token in{" "}
          <span className="font-mono text-white">{Math.ceil(cooldownRemaining / 60)} min</span>.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Name</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Community Token"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Symbol</label>
              <input
                className={inputClass}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="MYTOK"
                maxLength={11}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Initial supply</label>
              <input
                className={inputClass}
                value={supply}
                onChange={(e) => setSupply(e.target.value)}
                type="number"
                min="1"
                required
              />
              <p className="mt-1 text-xs text-white/40">
                Minted to your wallet in the token's base unit.
              </p>
            </div>
            <div>
              <label className={labelClass}>Decimals</label>
              <select
                className={inputClass}
                value={decimals}
                onChange={(e) => setDecimals(Number(e.target.value))}
              >
                {[0, 6, 8, 9, 18].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Image URL (optional)</label>
            <input
              className={inputClass}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://cdn.example.com/logo.png"
            />
          </div>

          <div>
            <label className={labelClass}>Description (optional)</label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token for?"
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#fb4f1f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#e04418] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Creating…" : "Create token"}
          </button>
        </form>
      )}
    </div>
  );
}
