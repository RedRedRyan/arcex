import { create } from "zustand";

interface WalletBalance {
  formatted: string;
  symbol: string;
}

interface UserState {
  // address
  address: string | undefined;
  shortAddress: string | undefined;
  isConnected: boolean;

  // balance
  balance: WalletBalance | undefined;
  isBalanceLoading: boolean;

  // wallet info
  walletName: string | undefined;
  walletIcon: string | undefined;

  // actions
  setAddress: (address: string | undefined) => void;
  setConnected: (isConnected: boolean) => void;
  setBalance: (balance: WalletBalance | undefined) => void;
  setBalanceLoading: (isLoading: boolean) => void;
  setWalletInfo: (name: string | undefined, icon: string | undefined) => void;
  reset: () => void;
}

function shortenAddress(address?: string): string | undefined {
  if (!address) return undefined;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const initialState = {
  address: undefined,
  shortAddress: undefined,
  isConnected: false,
  balance: undefined,
  isBalanceLoading: false,
  walletName: undefined,
  walletIcon: undefined,
};

export const useUserStore = create<UserState>((set) => ({
  ...initialState,

  setAddress: (address) =>
    set({
      address,
      shortAddress: shortenAddress(address),
    }),

  setConnected: (isConnected) => set({ isConnected }),

  setBalance: (balance) => set({ balance }),

  setBalanceLoading: (isBalanceLoading) => set({ isBalanceLoading }),

  setWalletInfo: (walletName, walletIcon) => set({ walletName, walletIcon }),

  reset: () => set(initialState),
}));
