import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ChevronDown, Copy, ExternalLink, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  DynamicUserProfile,
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import NavItems from "./NavItems";
import { formatAddress } from "../utils";
import { usePortfolio } from "../../data/UsePortfolio";
import { useNetwork } from "../config/NetworkProvider";
import { explorerAddressUrl } from "../config/networks";

const UserDropdown = () => {
  const { address, isConnected, chainId } = useAccount();
  const { handleLogOut, setShowDynamicUserProfile } = useDynamicContext();
  const { config, network, isMainnet } = useNetwork();
  // Same hook as the Portfolio page, so the number here always matches.
  const portfolio = usePortfolio();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // If the wallet is not on the active network's chain, the numbers below
  // would be for a different world — say so instead of showing wrong values.
  const walletChainMismatch =
    isConnected && chainId !== undefined && chainId !== config.chain.id;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Not connected — render the Dynamic connect widget (handles all wallet types,
  // email, social, passkeys, injected, WalletConnect, etc.)
  if (!isConnected || !address) {
    return (
      <>
        <DynamicWidget
          buttonClassName="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
          innerButtonComponent={
            <span
              style={{
                background: "var(--accent)",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Connect Wallet
            </span>
          }
        />
        <DynamicUserProfile />
      </>
    );
  }

  const copyAddress = () => {
    void navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        toast.error("Could not copy wallet address.");
      });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="orange-btn flex items-center gap-2 px-3 py-1.5"
      >
        <img src="/assets/icons/wallet.png" alt="Wallet" className="size-6" />
        <span className="text-xs">{formatAddress(address)}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id="account-menu"
          role="menu"
          aria-label="Wallet account"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-56 rounded-lg p-1 shadow-xl"
          style={{
            background: "var(--surface-muted)",
            color: "var(--ink)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-16 rounded-lg flex flex-col items-center">
              <span className="text-orange-500 text-lg font-medium">
                {portfolio.usdcTotal.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-white text-xs">usdc</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {formatAddress(address)}
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>
                {isMainnet ? "Mainnet" : "Testnet"} · {config.label}
                {isMainnet && (
                  <span title="Total USDC across Arc, Ethereum and Base">
                    {" "}
                    · 3 chains
                  </span>
                )}
              </span>
              {walletChainMismatch && (
                <span
                  className="mt-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#f59e0b",
                  }}
                >
                  Switch wallet network to see {isMainnet ? "mainnet" : "testnet"}{" "}
                  balances
                </span>
              )}
            </div>
          </div>

          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <nav className="sm:hidden">
            <NavItems onNavigate={() => setOpen(false)} />
          </nav>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowDynamicUserProfile(true);
            }}
            className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-white/10"
          >
            <UserRound className="mr-2 h-4 w-4" />
            User profile
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={copyAddress}
            className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-white/10"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copied!" : "Copy address"}
          </button>

          <a
            role="menuitem"
            href={explorerAddressUrl(network, address)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center rounded-md px-2 py-2 text-sm hover:bg-white/10"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View on explorer
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleLogOut();
              setOpen(false);
            }}
            className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-white/10"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </button>

          <div
            className="my-1 h-px sm:hidden"
            style={{ background: "var(--border)" }}
          />
        </div>
      )}
      <DynamicUserProfile />
    </div>
  );
};

export default UserDropdown;
