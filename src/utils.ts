export const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const formatUsdc = (raw: bigint | undefined, decimals = 6): string => {
  if (raw === undefined || raw === null) return "0.00";
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatPrice = (raw: bigint | undefined, decimals = 8): string => {
  if (raw === undefined || raw === null) return "0.00";
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const parseUsdc = (val: string): bigint => {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 1_000_000));
};

/**
 * Explorer links default to Arc mainnet. For other chains use the relevant
 * network configuration.
 */
export const getExplorerTxUrl = (hash: string) =>
  `https://explorer.arc.io/tx/${hash}`;

export const getExplorerAddressUrl = (addr: string) =>
  `https://explorer.arc.io/address/${addr}`;
