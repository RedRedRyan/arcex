import { describe, it, expect } from "vitest";
import {
  getAddresses,
  requireAddress,
  requireMockToken,
} from "./addresses.js";
import { ARC_TESTNET_CHAIN_ID, ARC_MAINNET_CHAIN_ID } from "./chains.js";

describe("getAddresses", () => {
  it("returns testnet registry", () => {
    const addrs = getAddresses(ARC_TESTNET_CHAIN_ID);
    expect(addrs.usdc).toBe("0x3600000000000000000000000000000000000000");
    expect(addrs.admin).toBe("0x3B2f9f644312cdB69be095FCC3b353C69a0088B2");
  });

  it("returns mainnet registry", () => {
    const addrs = getAddresses(ARC_MAINNET_CHAIN_ID);
    expect(addrs.usdc).toBe("0x3600000000000000000000000000000000000000");
    expect(addrs.admin).toBe("0x3B2f9f644312cdB69be095FCC3b353C69a0088B2");
  });
});

describe("requireAddress", () => {
  it("returns non-null address", () => {
    expect(requireAddress(ARC_TESTNET_CHAIN_ID, "usdc")).toBe(
      "0x3600000000000000000000000000000000000000"
    );
  });

  it("throws for null (undeployed) address", () => {
    expect(() => requireAddress(ARC_TESTNET_CHAIN_ID, "timelock")).toThrow(
      /not deployed/
    );
  });

  it("throws for null on mainnet", () => {
    expect(() => requireAddress(ARC_MAINNET_CHAIN_ID, "spotPool")).toThrow(
      /not deployed/
    );
  });
});

describe("requireMockToken", () => {
  it("returns testnet mock token", () => {
    const addr = requireMockToken(ARC_TESTNET_CHAIN_ID, "techx");
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("throws on mainnet (no mock tokens)", () => {
    expect(() => requireMockToken(ARC_MAINNET_CHAIN_ID, "techx")).toThrow(
      /not available/
    );
  });
});
