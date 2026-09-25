"use client";
import React from "react";
import Header from "@/components/Header";
import { useAppKitAccount } from "@reown/appkit/react";
import SignIn from "../(auth)/sign-in/page";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const layout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { address, isConnected, caipAddress, status, embeddedWalletInfo } =
    useAppKitAccount();

  useEffect(() => {
    if (!isConnected) {
      router.push("/sign-in");
    }
  }, [isConnected, router]);

  if (!isConnected) {
    return null;
  }

  return (
    <main className="min-h-screen text-gray-400">
      <Header />
      <div className="container py-10">{children}</div>
    </main>
  );
};

export default layout;
