import { useEffect } from "react";
import {
  useAppKitAccount,
  useAppKitBalance,
  useWalletInfo,
} from "@reown/appkit/react";
import { useUserStore } from "./user.store";

/**
 * Mount this once (e.g. in your root layout / providers component).
 * It has no UI — it just keeps useUserStore in sync with AppKit.
 */
export function useSyncUserStore() {
  const { address, isConnected } = useAppKitAccount();
  const { fetchBalance } = useAppKitBalance();
  const { walletInfo } = useWalletInfo();

  const setAddress = useUserStore((s) => s.setAddress);
  const setConnected = useUserStore((s) => s.setConnected);
  const setBalance = useUserStore((s) => s.setBalance);
  const setBalanceLoading = useUserStore((s) => s.setBalanceLoading);
  const setWalletInfo = useUserStore((s) => s.setWalletInfo);
  const reset = useUserStore((s) => s.reset);

  // address + connection state
  useEffect(() => {
    setConnected(isConnected);
    setAddress(isConnected ? address : undefined);
    if (!isConnected) reset();
  }, [address, isConnected, setAddress, setConnected, reset]);

  // wallet name + icon
  useEffect(() => {
    setWalletInfo(walletInfo?.name, walletInfo?.icon);
  }, [walletInfo, setWalletInfo]);

  // balance
  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;
    setBalanceLoading(true);

    fetchBalance()
      .then((result) => {
        if (cancelled) return;
        setBalance(result?.data);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, fetchBalance, setBalance, setBalanceLoading]);
}
