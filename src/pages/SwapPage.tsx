import { useEffect, useMemo, useState } from "react";
import {
  DynamicProvider,
  useGetSwapQuote,
  useGetSwapStatus,
} from "@dynamic-labs-sdk/react-hooks";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import {
  formatUnits,
  getAddress,
  isHex,
  parseAbi,
  parseUnits,
  publicActions,
} from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SWAP_TOKENS } from "../config/networks";
import { dynamicClient } from "../dynamicClient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";

type SwapToken = (typeof SWAP_TOKENS)[number];

// ── Token list ───────────────────────────────────────────────────────────────
// 1. Everything from SWAP_TOKENS, minus anything labelled "testnet".
// 2. Extra tokens for Arc, Ethereum and Base, built from an existing token on
//    that chain so networkId / chainId / explorerUrl always match your config.
//    Add more rows to EXTRA_TOKENS to list more coins.
//
// Arc mainnet addresses are from docs.arc.io/arc/references/contract-addresses.
// On Arc, always use the ERC-20 interface of USDC (6 decimals). The native gas
// balance uses 18 decimals, so never mix the two. USYC is left out on purpose:
// it is allowlisted and restricted to eligible institutions.
const CONFIGURED_TOKENS: SwapToken[] = SWAP_TOKENS.filter(
  (token) => !/testnet/i.test(`${token.id} ${token.networkName}`),
);

const chainRef = (pattern: RegExp): SwapToken | undefined =>
  CONFIGURED_TOKENS.find((token) => pattern.test(token.networkName));

const ARC_REF = chainRef(/^arc/i);
const ETH_REF = chainRef(/ethereum/i);
const BASE_REF = chainRef(/^base/i);

const NATIVE = "0x0000000000000000000000000000000000000000";

type ExtraToken = {
  ref: SwapToken | undefined;
  id: string;
  symbol: string;
  address: string;
  decimals: number;
  color: string;
};

// Verify the Ethereum and Base addresses on Etherscan / Basescan before shipping.
const EXTRA_TOKENS: ExtraToken[] = [
  // Arc mainnet
  {
    ref: ARC_REF,
    id: "arc-eurc",
    symbol: "EURC",
    address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    decimals: 6,
    color: "#2775CA",
  },
  {
    ref: ARC_REF,
    id: "arc-weth",
    symbol: "WETH",
    address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
    decimals: 18,
    color: "#627EEA",
  },
  {
    ref: ARC_REF,
    id: "arc-cirbtc",
    symbol: "cirBTC",
    address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
    decimals: 8,
    color: "#F7931A",
  },
  // Ethereum
  {
    ref: ETH_REF,
    id: "ethereum-eth",
    symbol: "ETH",
    address: NATIVE,
    decimals: 18,
    color: "#627EEA",
  },
  {
    ref: ETH_REF,
    id: "ethereum-usdt",
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    color: "#26A17B",
  },
  {
    ref: ETH_REF,
    id: "ethereum-eurc",
    symbol: "EURC",
    address: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
    decimals: 6,
    color: "#2775CA",
  },
  {
    ref: ETH_REF,
    id: "ethereum-dai",
    symbol: "DAI",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    color: "#F5AC37",
  },
  {
    ref: ETH_REF,
    id: "ethereum-wbtc",
    symbol: "WBTC",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    color: "#F7931A",
  },
  {
    ref: ETH_REF,
    id: "ethereum-cbbtc",
    symbol: "cbBTC",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    decimals: 8,
    color: "#0052FF",
  },
  // Base
  {
    ref: BASE_REF,
    id: "base-eth",
    symbol: "ETH",
    address: NATIVE,
    decimals: 18,
    color: "#627EEA",
  },
  {
    ref: BASE_REF,
    id: "base-eurc",
    symbol: "EURC",
    address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    decimals: 6,
    color: "#2775CA",
  },
  {
    ref: BASE_REF,
    id: "base-dai",
    symbol: "DAI",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    decimals: 18,
    color: "#F5AC37",
  },
  {
    ref: BASE_REF,
    id: "base-cbbtc",
    symbol: "cbBTC",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    decimals: 8,
    color: "#0052FF",
  },
];

const tokenKey = (token: { chainId: number; address: string }) =>
  `${token.chainId}:${token.address.toLowerCase()}`;

const TOKENS: SwapToken[] = (() => {
  const seen = new Set(CONFIGURED_TOKENS.map(tokenKey));
  const extras: SwapToken[] = [];
  for (const extra of EXTRA_TOKENS) {
    if (!extra.ref) continue;
    const token = {
      ...extra.ref,
      id: extra.id,
      symbol: extra.symbol,
      address: extra.address,
      decimals: extra.decimals,
      color: extra.color,
    } as SwapToken;
    if (seen.has(tokenKey(token))) continue;
    seen.add(tokenKey(token));
    extras.push(token);
  }
  return [...CONFIGURED_TOKENS, ...extras];
})();

// Dropdown sections by network, Arc first.
const TOKEN_GROUPS: Array<[string, SwapToken[]]> = (() => {
  const groups = new Map<string, SwapToken[]>();
  for (const token of TOKENS) {
    const list = groups.get(token.networkName) ?? [];
    list.push(token);
    groups.set(token.networkName, list);
  }
  return Array.from(groups.entries()).sort(
    (a, b) => Number(/^arc/i.test(b[0])) - Number(/^arc/i.test(a[0])),
  );
})();

// Opens as Ethereum USDC → Arc USDC, the main bridge route.
const DEFAULT_FROM = "ethereum-usdc";
const DEFAULT_TO = ARC_REF?.id ?? "ethereum-weth";
const SLIPPAGE = 0.005;
const STATUS_POLL_INTERVAL_MS = 3_000;
const ERC20_ALLOWANCE_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const ERC20_APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const isRateLimitError = (error: unknown): boolean => {
  const seen = new Set<Error>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if (/429|rate.?limit|too many requests/i.test(current.message)) return true;
    seen.add(current);
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
};

async function readWithRateLimitRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= 3) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** attempt),
      );
    }
  }
}

// ── CoinGecko icons (chains + coins) ─────────────────────────────────────────
// Chain logos: /asset_platforms, matched by EVM chain id.
// Coin logos:  /coins/markets, matched by CoinGecko coin id (via token symbol).
// One request each, cached in sessionStorage. Anything missing or failing falls
// back to a colored letter (coin) or the network's initial (chain).
const CG_API = "https://api.coingecko.com/api/v3";
const CG_CACHE_KEY = "nbx:cg-swap-icons:v3";

const SYMBOL_TO_CG_ID: Record<string, string> = {
  USDC: "usd-coin",
  EURC: "euro-coin",
  USDT: "tether",
  DAI: "dai",
  ETH: "ethereum",
  WETH: "weth",
  WBTC: "wrapped-bitcoin",
  CBBTC: "coinbase-wrapped-btc",
};

const CG_COIN_IDS = Array.from(
  new Set(
    TOKENS.map((t) => SYMBOL_TO_CG_ID[t.symbol.toUpperCase()]).filter(
      (id): id is string => !!id,
    ),
  ),
);

type IconMaps = {
  chains: Record<number, string>;
  coins: Record<string, string>;
};

const ICON_SEED: IconMaps = {
  chains: {
    1: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  },
  coins: {},
};

let iconPromise: Promise<IconMaps> | null = null;

function loadIcons(): Promise<IconMaps> {
  if (iconPromise) return iconPromise;
  iconPromise = (async () => {
    try {
      const raw = sessionStorage.getItem(CG_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as IconMaps;
        return {
          chains: { ...ICON_SEED.chains, ...cached.chains },
          coins: cached.coins,
        };
      }
    } catch {
      /* ignore bad cache */
    }

    try {
      const [platformsRes, coinsRes] = await Promise.all([
        fetch(`${CG_API}/asset_platforms`),
        CG_COIN_IDS.length
          ? fetch(
              `${CG_API}/coins/markets?vs_currency=usd&ids=${CG_COIN_IDS.join(
                ",",
              )}&per_page=50&sparkline=false`,
            )
          : Promise.resolve(null),
      ]);

      const chains: Record<number, string> = {};
      if (platformsRes.ok) {
        const platforms = (await platformsRes.json()) as Array<{
          chain_identifier: number | null;
          image?: { thumb?: string; small?: string; large?: string };
        }>;
        for (const p of platforms) {
          if (p.chain_identifier == null || !p.image) continue;
          const url = p.image.small || p.image.large || p.image.thumb;
          if (url) chains[p.chain_identifier] = url;
        }
      }

      const coins: Record<string, string> = {};
      if (coinsRes && coinsRes.ok) {
        const markets = (await coinsRes.json()) as Array<{
          id: string;
          image?: string;
        }>;
        for (const m of markets) if (m.image) coins[m.id] = m.image;
      }

      if (Object.keys(chains).length === 0 && Object.keys(coins).length === 0) {
        throw new Error("CoinGecko returned no icons");
      }

      try {
        sessionStorage.setItem(CG_CACHE_KEY, JSON.stringify({ chains, coins }));
      } catch {
        /* storage unavailable */
      }
      return { chains: { ...ICON_SEED.chains, ...chains }, coins };
    } catch {
      iconPromise = null; // retry on next mount
      return ICON_SEED;
    }
  })();
  return iconPromise;
}

function useSwapIcons(): IconMaps {
  const [icons, setIcons] = useState<IconMaps>(ICON_SEED);
  useEffect(() => {
    let alive = true;
    loadIcons().then((m) => {
      if (alive) setIcons(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return icons;
}

function coinIconFor(token: SwapToken, icons: IconMaps): string | undefined {
  const id = SYMBOL_TO_CG_ID[token.symbol.toUpperCase()];
  return id ? icons.coins[id] : undefined;
}

function IconImg({
  src,
  alt,
  fallback,
}: {
  src?: string;
  alt: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}

/** Coin logo with the chain's logo as a small badge in the corner. */
function TokenIcon({
  token,
  icons,
  size = 36,
}: {
  token: SwapToken;
  icons: IconMaps;
  size?: number;
}) {
  const badge = Math.round(size * 0.46);
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="grid size-full place-items-center overflow-hidden rounded-full text-xs font-bold text-white"
        style={{
          background: token.color,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        <IconImg
          src={coinIconFor(token, icons)}
          alt=""
          fallback={token.symbol.slice(0, 1)}
        />
      </span>
      <span
        className="absolute grid place-items-center overflow-hidden rounded-full text-[9px] font-bold text-white"
        style={{
          width: badge,
          height: badge,
          right: -3,
          bottom: -3,
          background: "#171d28",
          border: "2px solid #0c1119",
        }}
      >
        <IconImg
          src={icons.chains[token.chainId]}
          alt=""
          fallback={token.networkName.slice(0, 1)}
        />
      </span>
    </span>
  );
}

function formatAmount(value: string | undefined, decimals: number): string {
  if (!value) return "—";
  try {
    const amount = Number(formatUnits(BigInt(value), decimals));
    return amount.toLocaleString("en-US", {
      maximumFractionDigits: decimals > 6 ? 6 : 4,
    });
  } catch {
    return "—";
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function TokenOption({ token, icons }: { token: SwapToken; icons: IconMaps }) {
  return (
    <>
      <TokenIcon token={token} icons={icons} />
      <span className="min-w-0 text-left">
        <span className="block font-semibold">{token.symbol}</span>
        <span
          className="block truncate text-xs"
          style={{ color: "var(--subtle)" }}
        >
          {token.networkName}
        </span>
      </span>
    </>
  );
}

/**
 * Custom dropdown (replaces the native <select>, whose option list rendered
 * white-on-white). Tokens are grouped by network, Arc first, and every row
 * shows the coin + chain icons.
 */
function TokenSelect({
  token,
  onChange,
  label,
  icons,
}: {
  token: SwapToken;
  onChange: (id: string) => void;
  label: string;
  icons: IconMaps;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className="flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-white sm:gap-3 sm:px-3"
        style={{
          background: "var(--surface-strong)",
          borderColor: "var(--border)",
        }}
      >
        <TokenOption token={token} icons={icons} />
        <ChevronDown
          size={15}
          aria-hidden="true"
          style={{ color: "var(--subtle)" }}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-0 text-white shadow-xl"
      >
        <div
          className="max-h-96 overflow-y-auto p-2"
          role="listbox"
          aria-label={label}
        >
          {TOKEN_GROUPS.map(([network, list]) => (
            <div key={network}>
              <div
                className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide first:pt-1"
                style={{ color: "var(--subtle)" }}
              >
                {network}
              </div>
              {list.map((option) => {
                const selected = option.id === token.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-white transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                    style={
                      selected
                        ? { background: "rgba(255,255,255,0.06)" }
                        : undefined
                    }
                  >
                    <TokenOption token={option} icons={icons} />
                    {selected && (
                      <Check
                        size={15}
                        className="ml-auto shrink-0"
                        aria-hidden="true"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwapPageContent() {
  const { address: legacyAddress, chain, chainId } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { data: walletClient, isLoading: walletClientLoading } =
    useWalletClient();
  const publicClient = usePublicClient();
  const icons = useSwapIcons();

  const [fromId, setFromId] = useState(DEFAULT_FROM);
  const [toId, setToId] = useState(DEFAULT_TO);
  const [amount, setAmount] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [executionStep, setExecutionStep] = useState<
    "approval" | "transaction" | null
  >(null);

  const fromToken = TOKENS.find((token) => token.id === fromId) ?? TOKENS[0];
  const toToken =
    TOKENS.find((token) => token.id === toId) ?? TOKENS[1] ?? TOKENS[0];

  const address = legacyAddress ?? walletClient?.account.address;
  const isConnected = !!address;

  const amountInSmallestUnit = useMemo(() => {
    if (!/^\d*\.?\d*$/.test(amount) || amount.trim() === "") return undefined;
    try {
      const parsed = parseUnits(amount, fromToken.decimals);
      return parsed > 0n ? parsed.toString() : undefined;
    } catch {
      return undefined;
    }
  }, [amount, fromToken.decimals]);

  const sourceChainMismatch =
    isConnected && chainId !== undefined && chainId !== fromToken.chainId;
  const canRequestQuote =
    !!address &&
    !!amountInSmallestUnit &&
    fromToken.id !== toToken.id &&
    !sourceChainMismatch;

  const {
    data: quote,
    isLoading: quoteLoading,
    isFetching: quoteFetching,
    error: quoteError,
  } = useGetSwapQuote({
    from: {
      address: address ?? "",
      chain: "EVM",
      networkId: fromToken.networkId,
      tokenAddress: fromToken.address,
      amount: amountInSmallestUnit ?? "0",
    },
    to: {
      address: address ?? "",
      chain: "EVM",
      networkId: toToken.networkId,
      tokenAddress: toToken.address,
    },
    slippage: SLIPPAGE,
    queryParams: {
      enabled: canRequestQuote,
      staleTime: 15_000,
    },
  });

  const {
    mutate: executeSwap,
    isPending: swapPending,
    error: swapError,
  } = useMutation({
    mutationFn: async ({
      signingPayload,
    }: {
      signingPayload: SigningPayload;
    }) => {
      if (!walletClient || !publicClient) {
        throw new Error("Your connected wallet is not ready to sign transactions.");
      }

      const signingChainId = Number(signingPayload.chainId);
      if (
        !Number.isSafeInteger(signingChainId) ||
        signingChainId !== fromToken.chainId ||
        walletClient.chain.id !== signingChainId ||
        chainId !== signingChainId
      ) {
        throw new Error(
          `The quote is for chain ${signingPayload.chainId}, but your wallet is not connected to ${fromToken.networkName}. Refresh the quote and try again.`,
        );
      }

      const { evmApproval, evmTransaction } = signingPayload;
      if (!evmTransaction) {
        throw new Error("The swap quote does not contain an EVM transaction.");
      }
      if (!isHex(evmTransaction.data)) {
        throw new Error("The swap quote contains invalid transaction data.");
      }

      if (evmApproval) {
        const tokenAddress = getAddress(evmApproval.tokenAddress);
        const spenderAddress = getAddress(evmApproval.spenderAddress);
        const allowanceArgs = {
          address: tokenAddress,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: "allowance" as const,
          args: [walletClient.account.address, spenderAddress] as const,
        };
        let allowance: bigint;
        try {
          allowance = await readWithRateLimitRetry(() =>
            publicClient.readContract(allowanceArgs),
          );
        } catch (error) {
          if (!isRateLimitError(error)) throw error;
          const walletReader = walletClient.extend(publicActions);
          allowance = await readWithRateLimitRetry(() =>
            walletReader.readContract(allowanceArgs),
          );
        }

        if (allowance < BigInt(evmApproval.amount)) {
          setExecutionStep("approval");
          const approvalHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [spenderAddress, BigInt(evmApproval.amount)],
          });
          const receipt = await walletClient
            .extend(publicActions)
            .waitForTransactionReceipt({
              hash: approvalHash,
            });
          if (receipt.status !== "success") {
            throw new Error("Token approval failed on-chain.");
          }
        }
      }

      setExecutionStep("transaction");
      const gasParams =
        evmTransaction.maxFeePerGas && evmTransaction.maxPriorityFeePerGas
          ? {
              maxFeePerGas: BigInt(evmTransaction.maxFeePerGas),
              maxPriorityFeePerGas: BigInt(
                evmTransaction.maxPriorityFeePerGas,
              ),
            }
          : evmTransaction.gasPrice
            ? { gasPrice: BigInt(evmTransaction.gasPrice) }
            : {};
      const nonce =
        evmTransaction.nonce === undefined
          ? undefined
          : Number(evmTransaction.nonce);
      if (nonce !== undefined && !Number.isSafeInteger(nonce)) {
        throw new Error("The swap quote contains an invalid transaction nonce.");
      }

      const hash = await walletClient.sendTransaction({
        to: getAddress(evmTransaction.to),
        data: evmTransaction.data,
        value: evmTransaction.value ? BigInt(evmTransaction.value) : 0n,
        ...(evmTransaction.gasLimit
          ? { gas: BigInt(evmTransaction.gasLimit) }
          : {}),
        ...gasParams,
        ...(nonce !== undefined ? { nonce } : {}),
      });
      return { transactionHash: hash };
    },
    onSuccess: ({ transactionHash: hash }) => {
      setTransactionHash(hash);
      setExecutionStep(null);
      toast.success("Swap submitted", {
        description: "Tracking the swap until it settles.",
      });
    },
    onError: (error) => {
      setExecutionStep(null);
      toast.error("Swap failed", { description: error.message });
    },
  });

  const {
    data: swapStatus,
    error: statusError,
    refetch: refetchStatus,
    isFetching: statusFetching,
  } = useGetSwapStatus({
    txHash: transactionHash,
    queryParams: {
      enabled: !!transactionHash,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "DONE" || status === "FAILED"
          ? false
          : STATUS_POLL_INTERVAL_MS;
      },
    },
  });

  const outputAmount = quote
    ? formatAmount(quote.to.amount, toToken.decimals)
    : "—";
  const quoteReady =
    canRequestQuote && !!quote?.signingPayload && !quoteLoading && !quoteError;
  type SigningPayload = NonNullable<
    NonNullable<typeof quote>["signingPayload"]
  >;
  const statusLabel =
    swapStatus?.status === "DONE"
      ? "Swap complete"
      : swapStatus?.status === "FAILED"
        ? "Swap failed"
        : swapStatus?.status === "NOT_FOUND"
          ? "Waiting for status"
          : "Swap in progress";

  const handleSwapDirection = () => {
    setFromId(toToken.id);
    setToId(fromToken.id);
    setAmount("");
  };

  const handleExecute = () => {
    if (!walletClient || !quote?.signingPayload) return;
    setExecutionStep(null);
    executeSwap({ signingPayload: quote.signingPayload });
  };

  return (
    <div className="container mx-auto max-w-screen-xl px-4 pb-16 pt-2">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 text-center">
          <h1 className="display text-3xl font-bold sm:text-4xl">Swap</h1>
        </div>

        <section
          className="rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-white/15 via-transparent to-transparent"
          aria-label="Token swap"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">You pay</span>
            <span className="text-xs" style={{ color: "var(--subtle)" }}>
              {isConnected && address
                ? `${shortAddress(address)}${chain?.name ? ` · ${chain.name}` : ""}`
                : "Wallet not connected"}
            </span>
          </div>
          <div
            className="flex min-h-[104px] items-center justify-between gap-3 rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.045)",
              border: "1px solid var(--border)",
            }}
          >
            <input
              aria-label={`Amount of ${fromToken.symbol} to swap`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
              className="min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none placeholder:text-white/20 sm:text-4xl"
            />
            <TokenSelect
              token={fromToken}
              icons={icons}
              label="Token to pay"
              onChange={(id) => {
                setFromId(id);
                setAmount("");
              }}
            />
          </div>

          <div className="relative z-10 -my-3 flex justify-center">
            <button
              type="button"
              onClick={handleSwapDirection}
              aria-label="Reverse swap direction"
              title="Reverse swap direction"
              className="grid size-10 place-items-center rounded-xl transition hover:rotate-180"
              style={{
                color: "var(--accent)",
                background: "#171d28",
                border: "4px solid #0c1119",
              }}
            >
              <ArrowDown size={17} aria-hidden="true" />
            </button>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.045)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">You receive</span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>
                Estimated
              </span>
            </div>
            <div className="flex min-h-[55px] items-center justify-between gap-3">
              <span
                className={`min-w-0 flex-1 truncate text-3xl font-semibold sm:text-4xl ${
                  quoteLoading ? "animate-pulse text-white/35" : ""
                }`}
                aria-live="polite"
              >
                {outputAmount}
              </span>
              <TokenSelect
                token={toToken}
                icons={icons}
                label="Token to receive"
                onChange={(id) => setToId(id)}
              />
            </div>
          </div>

          {sourceChainMismatch && (
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-xs"
              style={{
                color: "#fbbf24",
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <span>
                Switch your wallet to {fromToken.networkName} to swap from this
                token.
              </span>
              <button
                type="button"
                disabled={isSwitchingChain}
                onClick={() => {
                  void switchChainAsync({ chainId: fromToken.chainId }).catch(
                    (error: Error) => {
                      toast.error("Could not switch network", {
                        description: error.message,
                      });
                    },
                  );
                }}
                className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-60"
              >
                {isSwitchingChain ? "Switching…" : "Switch"}
              </button>
            </div>
          )}

          {fromToken.id === toToken.id && (
            <p className="mt-3 text-xs" style={{ color: "#fbbf24" }}>
              Choose two different tokens to get a quote.
            </p>
          )}

          <div
            className="my-5 space-y-3 rounded-xl px-1 py-1 text-xs"
            style={{ color: "var(--subtle)" }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Settings2 size={13} aria-hidden="true" /> Slippage tolerance
              </span>
              <span className="font-medium text-white/80">0.50%</span>
            </div>
            {quote && (
              <>
                <div className="flex items-center justify-between">
                  <span>Estimated gas</span>
                  <span>
                    {quote.gasCostUSD
                      ? `$${quote.gasCostUSD}`
                      : "Included in route"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Route</span>
                  <span>
                    {fromToken.networkName} → {toToken.networkName}
                  </span>
                </div>
              </>
            )}
          </div>

          {quoteError && (
            <div
              role="alert"
              className="mb-4 flex gap-2 rounded-xl p-3 text-sm"
              style={{
                color: "#fca5a5",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              <TriangleAlert
                size={17}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                {quoteError.message ||
                  "Could not find a swap route. Try another amount or token."}
              </span>
            </div>
          )}

          {swapError && (
            <div
              role="alert"
              className="mb-4 rounded-xl p-3 text-sm text-red-300"
              style={{ background: "rgba(239,68,68,0.08)" }}
            >
              {swapError.message}
            </div>
          )}

          {isConnected && !walletClient && (
            <p role="status" className="mb-3 text-center text-xs text-amber-300">
              {walletClientLoading
                ? "Preparing wallet for the swap…"
                : "Your wallet is connected, but its signer is unavailable. Reconnect your wallet and try again."}
            </p>
          )}

          {isConnected ? (
            <button
              type="button"
              onClick={handleExecute}
              disabled={
                !walletClient ||
                !quoteReady ||
                swapPending ||
                isSwitchingChain
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {swapPending || quoteFetching ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {sourceChainMismatch
                ? "Switch network to continue"
                : executionStep === "approval"
                  ? "Approve token…"
                  : executionStep === "transaction"
                    ? "Confirm swap…"
                    : swapPending
                      ? "Waiting for wallet…"
                      : quoteFetching
                        ? "Refreshing quote…"
                        : quoteLoading
                          ? "Getting quote…"
                          : !walletClient
                            ? walletClientLoading
                              ? "Preparing wallet…"
                              : "Wallet unavailable"
                          : !amountInSmallestUnit
                            ? "Enter an amount"
                            : quoteReady
                              ? `Swap ${fromToken.symbol}`
                              : "No route available"}
            </button>
          ) : (
            <div
              role="status"
              className="w-full rounded-xl px-4 py-3.5 text-center text-sm"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--subtle)",
              }}
            >
              Connect your wallet to swap.
            </div>
          )}
        </section>

        {transactionHash && (
          <section
            className="mt-4 rounded-2xl p-4"
            aria-live="polite"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full"
                  style={{
                    color:
                      swapStatus?.status === "DONE"
                        ? "var(--success)"
                        : swapStatus?.status === "FAILED"
                          ? "var(--danger)"
                          : "var(--accent)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  {swapStatus?.status === "DONE" ? (
                    <Check size={16} aria-hidden="true" />
                  ) : swapStatus?.status === "FAILED" ? (
                    <TriangleAlert size={16} aria-hidden="true" />
                  ) : (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">{statusLabel}</p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--subtle)" }}
                  >
                    {statusError
                      ? statusError.message
                      : (swapStatus?.substatus ??
                        "Waiting for the network to settle.")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refetchStatus()}
                  disabled={statusFetching}
                  aria-label="Refresh swap status"
                  title="Refresh status"
                  className="rounded-lg p-2 hover:bg-white/5 disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={statusFetching ? "animate-spin" : ""}
                  />
                </button>
                <a
                  href={`${fromToken.explorerUrl}/tx/${transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 hover:bg-white/5"
                  aria-label="View swap transaction"
                  title="View transaction"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </section>
        )}

        <p
          className="mt-4 text-center text-[11px] leading-relaxed"
          style={{ color: "var(--subtle)" }}
        >
          Quotes can change before confirmation. Always review the transaction
          in your wallet.
        </p>
      </div>
    </div>
  );
}

export default function SwapPage() {
  return (
    <DynamicProvider client={dynamicClient}>
      <SwapPageContent />
    </DynamicProvider>
  );
}
