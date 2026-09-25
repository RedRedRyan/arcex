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

export const formatPnl = (raw: bigint | undefined, decimals = 6): string => {
  if (raw === undefined) return "$0.00";
  const n = Number(raw) / 10 ** decimals;
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calcLiqPrice = (entryPrice: number, leverage: number, isLong: boolean, maintBps = 500): number => {
  const invLevBps = 10000 / leverage;
  const deltaBps = invLevBps - maintBps;
  if (isLong) return entryPrice * (1 - deltaBps / 10000);
  return entryPrice * (1 + deltaBps / 10000);
};

export const getExplorerTxUrl = (hash: string) =>
  `https://explorer.testnet.arc.io/tx/${hash}`;

export const getExplorerAddressUrl = (addr: string) =>
  `https://explorer.testnet.arc.io/address/${addr}`;
