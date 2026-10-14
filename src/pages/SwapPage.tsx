import { useMemo, useState } from "react";
import type { WalletAccount } from "@dynamic-labs-sdk/client";
import {
  DynamicProvider,
  useConnectWithWalletProvider,
  useExecuteSwapTransaction,
  useGetAvailableWalletProvidersData,
  useGetSwapQuote,
  useGetSwapStatus,
  useGetWalletAccounts,
} from "@dynamic-labs-sdk/react-hooks";
import {
  ArrowDown,
  ArrowDownUp,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { SWAP_TOKENS } from "../config/networks";
import { dynamicClient } from "../dynamicClient";

const DEFAULT_FROM = "ethereum-usdc";
const DEFAULT_TO = "ethereum-weth";
const SLIPPAGE = 0.005;
const STATUS_POLL_INTERVAL_MS = 3_000;

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

function TokenOption({ token }: { token: (typeof SWAP_TOKENS)[number] }) {
  return (
    <>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
        style={{ background: token.color }}
        aria-hidden="true"
      >
        {token.symbol.slice(0, 1)}
      </span>
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

function TokenSelect({
  token,
  onChange,
  label,
}: {
  token: (typeof SWAP_TOKENS)[number];
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <label
      className="relative flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 sm:gap-3 sm:px-3"
      style={{
        background: "var(--surface-strong)",
        borderColor: "var(--border)",
      }}
    >
      <span className="sr-only">{label}</span>
      <TokenOption token={token} />
      <ChevronDown
        size={15}
        aria-hidden="true"
        style={{ color: "var(--subtle)" }}
      />
      <select
        aria-label={label}
        value={token.id}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {SWAP_TOKENS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.symbol} · {option.networkName}
          </option>
        ))}
      </select>
    </label>
  );
}

function SwapPageContent() {
  const {
    address: legacyAddress,
    chain,
    chainId,
    isConnected: legacyConnected,
  } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { data: walletAccounts = [], error: walletAccountsError } =
    useGetWalletAccounts();
  const {
    data: walletProviders = [],
    error: walletProvidersError,
    isLoading: walletProvidersLoading,
  } = useGetAvailableWalletProvidersData();
  const [connectedWallet, setConnectedWallet] = useState<WalletAccount | null>(
    null,
  );
  const {
    mutateAsync: connectWallet,
    isPending: walletConnecting,
    error: walletConnectionError,
  } = useConnectWithWalletProvider();
  const [fromId, setFromId] = useState(DEFAULT_FROM);
  const [toId, setToId] = useState(DEFAULT_TO);
  const [amount, setAmount] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [executionStep, setExecutionStep] = useState<
    "approval" | "transaction" | null
  >(null);

  const fromToken =
    SWAP_TOKENS.find((token) => token.id === fromId) ?? SWAP_TOKENS[2];
  const toToken =
    SWAP_TOKENS.find((token) => token.id === toId) ?? SWAP_TOKENS[3];
  const walletAccount =
    connectedWallet ??
    walletAccounts.find(
      (account) =>
        legacyAddress &&
        account.address.toLowerCase() === legacyAddress.toLowerCase(),
    ) ??
    walletAccounts[0];
  const address = walletAccount?.address;
  const isConnected = !!walletAccount;

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
  } = useExecuteSwapTransaction({
    mutateParams: {
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
    if (!walletAccount || !quote?.signingPayload) return;
    setExecutionStep(null);
    executeSwap({
      walletAccount,
      signingPayload: quote.signingPayload,
      onStepChange: setExecutionStep,
    });
  };

  const handleConnectWallet = async (walletProviderKey: string) => {
    try {
      const account = await connectWallet({ walletProviderKey });
      setConnectedWallet(account);
      toast.success("Wallet connected", {
        description: `Connected ${account.address.slice(0, 6)}…${account.address.slice(-4)}`,
      });
    } catch (error) {
      toast.error("Wallet connection failed", {
        description:
          error instanceof Error
            ? error.message
            : "The wallet could not be connected.",
      });
    }
  };

  return (
    <div className="container mx-auto max-w-screen-xl px-4 pb-16 pt-10 sm:pt-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-7 text-center">
          <p className="mt-2 text-sm text-white">
            Get a live quote and swap tokens across supported networks.
          </p>
        </div>

        <section
          className="rounded-3xl p-4 sm:p-6"
          aria-label="Token swap"
          style={{
            background: "rgba(12,17,25,0.9)",
            border: "1px solid var(--border)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">You pay</span>
            <span className="text-xs" style={{ color: "var(--subtle)" }}>
              {isConnected
                ? `${chain?.name ?? "Connected"} wallet`
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

          {!isConnected ? (
            <div className="space-y-2">
              {(walletProvidersError || walletAccountsError) && (
                <p role="alert" className="text-center text-xs text-red-300">
                  {(walletProvidersError ?? walletAccountsError)?.message}
                </p>
              )}
              {walletConnectionError && (
                <p role="alert" className="text-center text-xs text-red-300">
                  {walletConnectionError.message}
                </p>
              )}
              {walletProviders.map((provider) => (
                <button
                  key={provider.key}
                  type="button"
                  disabled={walletConnecting}
                  onClick={() => void handleConnectWallet(provider.key)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
                  style={{
                    background: "rgba(251,79,31,0.12)",
                    color: "var(--accent)",
                    border: "1px solid rgba(251,79,31,0.2)",
                  }}
                >
                  {walletConnecting ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : provider.metadata.icon ? (
                    <img
                      src={provider.metadata.icon}
                      alt=""
                      className="size-4 rounded-full"
                    />
                  ) : (
                    <Wallet size={16} aria-hidden="true" />
                  )}
                  Connect {provider.metadata.displayName}
                </button>
              ))}
              {walletProvidersLoading ? (
                <p
                  className="py-2 text-center text-xs"
                  style={{ color: "var(--subtle)" }}
                >
                  Loading wallet options…
                </p>
              ) : walletProviders.length === 0 &&
                !walletProvidersError &&
                !walletAccountsError ? (
                <p
                  className="rounded-xl px-4 py-3.5 text-center text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--subtle)",
                  }}
                >
                  {legacyConnected
                    ? "Connect a supported wallet provider to continue."
                    : "Connect an EVM wallet to get started."}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleExecute}
              disabled={!quoteReady || swapPending || isSwitchingChain}
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
                          : !amountInSmallestUnit
                            ? "Enter an amount"
                            : quoteReady
                              ? `Swap ${fromToken.symbol}`
                              : "No route available"}
            </button>
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
