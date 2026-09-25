import React from "react";

export default function SpotTradingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-7xl">{children}</div>
    </div>
  );
}
