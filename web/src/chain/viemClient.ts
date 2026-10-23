import { createPublicClient, http, defineChain } from "viem";
import { deploymentConfig } from "./deploymentConfig.ts";

const env = (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) || {};

export const DEFAULT_CHAIN_ID = Number(env.VITE_CHAIN_ID || deploymentConfig.chainId);
export const DEFAULT_RPC_URL = env.VITE_CHAIN_RPC_URL || "http://127.0.0.1:8545";
export const CONTRACT_ADDRESSES = deploymentConfig.contracts;

export function getPublicClient(rpcUrl: string = DEFAULT_RPC_URL, chainId: number = DEFAULT_CHAIN_ID) {
  const chain = defineChain({
    id: chainId,
    name: deploymentConfig.chainName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  });

  return createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 1500, retryCount: 0 }),
  });
}

export const publicClient = getPublicClient();
