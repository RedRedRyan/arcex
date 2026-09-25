import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId || !/^[a-f0-9]{32}$/i.test(projectId)) {
  throw new Error(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID must be a valid 32-character project ID",
  );
}

const arc = defineChain({
  id: 5042,
  caipNetworkId: "eip155:5042",
  chainNamespace: "eip155",
  name: "Arc",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.arc.io"],
      webSocket: ["wss://rpc.quicknode.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

const arcTestnet = defineChain({
  id: 5042002,
  caipNetworkId: "eip155:5042002",
  chainNamespace: "eip155",
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Block Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export const networks = [arc, arcTestnet] as const;

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

export const metadata = {
  name: "NBX",
  description: "Tokenizing Equities & Bonds",
  url: "http://localhost:3000",
  icons: ["/assets/icons/logo.svg"],
};
