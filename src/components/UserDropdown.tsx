import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { arcTestnet } from "viem/chains";
import { ChevronDown, Copy, ExternalLink, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  DynamicUserProfile,
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import NavItems from "./NavItems";
import { formatAddress, formatUsdc } from "../utils";
import { useWalletBalances } from "../../data/MarketStore";

const EXPLORER_URL = arcTestnet.blockExplorers.default.url;

const UserDropdown = () => {
  const { address, isConnected } = useAccount();
  const { handleLogOut, setShowDynamicUserProfile } = useDynamicContext();
  const walletBalances = useWalletBalances(
    isConnected ? address : undefined,
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
                {formatUsdc(
                  BigInt(Math.round((walletBalances?.usdc ?? 0) * 1e6)),
                )}
              </span>
              <span className="text-white text-xs">usdc</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {formatAddress(address)}
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>
                {arcTestnet.name}
              </span>
            </div>
          </div>

          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <nav className="sm:hidden">
            <NavItems onNavigate={() => setOpen(false)} />
          </nav>
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />

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
            href={`${EXPLORER_URL}/address/${address}`}
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
