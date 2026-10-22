import { createPublicClient, http } from "viem";
import { localhost, arbitrumSepolia } from "viem/chains";

const env = (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) || {};

export const DEFAULT_CHAIN_ID = Number(env.VITE_CHAIN_ID || "31337");
export const DEFAULT_RPC_URL = env.VITE_CHAIN_RPC_URL || "http://127.0.0.1:8545";

// Default contract addresses matching deployments/anvil.json
export const CONTRACT_ADDRESSES = {
  BatchAnchor: (env.VITE_BATCH_ANCHOR_ADDRESS ||
    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as `0x${string}`,
  Attestation: (env.VITE_ATTESTATION_ADDRESS ||
    "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707") as `0x${string}`,
  BondVault: (env.VITE_BOND_VAULT_ADDRESS ||
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as `0x${string}`,
  VerifierQuorum: (env.VITE_VERIFIER_QUORUM_ADDRESS ||
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9") as `0x${string}`,
  Challenge: (env.VITE_CHALLENGE_ADDRESS ||
    "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9") as `0x${string}`,
  DeviceRegistry: (env.VITE_DEVICE_REGISTRY_ADDRESS ||
    "0x5FbDB2315678afecb367f032d93F642f64180aa3") as `0x${string}`,
};

export function getPublicClient(rpcUrl: string = DEFAULT_RPC_URL, chainId: number = DEFAULT_CHAIN_ID) {
  const chain = chainId === 421614 ? arbitrumSepolia : localhost;
  return createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 1500, retryCount: 0 }),
  });
}

export const publicClient = getPublicClient();
