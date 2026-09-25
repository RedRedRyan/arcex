"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { Copy, LogOut, Check } from "lucide-react";
import NavItems from "./NavItems";
import { useAppKitAccount, useWalletInfo } from "@reown/appkit/react";
import {
  AppKitButton,
  AppKitConnectButton,
  AppKitAccountButton,
  AppKitNetworkButton,
} from "@reown/appkit/react";
import { useUserStore } from "@/store/user.store";
import { useState } from "react";

const UserDropdown = () => {
  const router = useRouter();

  const handleSignOut = async () => {
    router.push("/sign-in");
  };
  const { address, isConnected, caipAddress, status, embeddedWalletInfo } =
    useAppKitAccount();

  const { walletName, walletIcon, shortAddress } = useUserStore();
  const { walletInfo } = useWalletInfo();

  const [copied, setCopied] = useState(false);
  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-4 text-gray-400 hover:text:yellow-500 orange-btn"
        >
          <div className="flex relative items-center gap-4 a py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={walletInfo?.icon}
                alt={walletInfo?.name ?? "Wallet"}
              />
              <AvatarFallback className="bg-yellow-500 text-yellow-900 text-sm font-bold">
                {walletName?.[0] ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-md text-white">{shortAddress}</span>
            </div>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40 text-gray-400">
        <DropdownMenuLabel>
          <div className="flex relative items-center gap-3 py-2">
            <div className="flex-col items-center">
              <span className="hidden md:flex text-sm text-white">
                {walletInfo?.name}
              </span>
              <span className="text-xs text-white">{shortAddress}</span>
            </div>
            <Button type="button" onClick={handleCopyAddress} className="">
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-600" />
        <DropdownMenuItem>
          <AppKitAccountButton />
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-gray-100 text-md font-meddium focus:bg-transparent focus:text-yellow-500 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 mr-2 hidden sm:block" />
          Log Out
        </DropdownMenuItem>
        <DropdownMenuSeparator className="hidden sm:block bg-gray-600" />
        <nav className="sm:hidden">
          <NavItems />
        </nav>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
