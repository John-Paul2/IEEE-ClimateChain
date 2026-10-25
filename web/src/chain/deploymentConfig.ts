import testnetDeployment from "../../../deployments/testnet.json" with { type: "json" };
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export type HexString = `0x${string}`;

export interface DeploymentContracts {
  Attestation: HexString;
  BatchAnchor: HexString;
  BondVault: HexString;
  Challenge: HexString;
  DeviceRegistry: HexString;
  VerifierQuorum: HexString;
}

export interface ContractDetail {
  address: HexString;
  deployTxHash: HexString;
  explorerUrl: string;
  deployTxExplorerUrl: string;
}

export interface TestnetTransaction {
  name: string;
  role: string;
  txHash: HexString;
  explorerUrl: string;
  notes?: string;
  gasUsed?: number;
  block?: number;
}

export interface ArbitrumSepoliaDeployment {
  chainId: number;
  chainName: string;
  network: string;
  explorerBaseUrl: string;
  admin: HexString;
  treasury: HexString;
  arbiters: HexString[];
  verifiers: HexString[];
  contracts: DeploymentContracts;
  contractsDetail: Record<keyof DeploymentContracts, ContractDetail>;
  keyTransactions: {
    registerDevice: TestnetTransaction;
    depositOperatorBond: TestnetTransaction;
    depositVerifierStakeV0: TestnetTransaction;
    anchorBatchHonest4: TestnetTransaction;
    commitVoteHonestV0: TestnetTransaction;
    revealVoteHonestV0: TestnetTransaction;
    finalizeHonest: TestnetTransaction;
    recordAttestation: TestnetTransaction;
    anchorBatchTampered6: TestnetTransaction;
    commitVoteAttackV0: TestnetTransaction;
    revealVoteAttackV0: TestnetTransaction;
    submitOperatorDispute: TestnetTransaction;
    resolveVote: TestnetTransaction;
    resolveSlash: TestnetTransaction;
  };
  allTransactions: Array<{
    contract?: string | null;
    address?: string | null;
    transactionHash: string;
    explorerUrl: string;
    type?: string;
    gas?: number;
  }>;
}

export const ARBITRUM_SEPOLIA_CHAIN_ID = testnetDeployment.chainId;
export const ARBITRUM_SEPOLIA_EXPLORER_BASE = testnetDeployment.explorerBaseUrl;

export const ARBITRUM_SEPOLIA_CONTRACTS: DeploymentContracts =
  testnetDeployment.contracts as unknown as DeploymentContracts;

export const TESTNET_CONTRACT_ADDRESSES = ARBITRUM_SEPOLIA_CONTRACTS;

export const ARBITRUM_SEPOLIA_KEY_TXS = {
  anchorBatchHonest4: testnetDeployment.keyTransactions.anchorBatchHonest4.txHash,
  anchorBatchTampered6: testnetDeployment.keyTransactions.anchorBatchTampered6.txHash,
  slashResolve: testnetDeployment.keyTransactions.resolveSlash.txHash,
  recordAttestation: testnetDeployment.keyTransactions.recordAttestation.txHash,
} as const;

export const TESTNET_KEY_TRANSACTIONS = ARBITRUM_SEPOLIA_KEY_TXS;

export const arbitrumSepoliaDeployment: ArbitrumSepoliaDeployment = {
  chainId: testnetDeployment.chainId,
  chainName: testnetDeployment.chainName || "Arbitrum Sepolia",
  network: testnetDeployment.network,
  explorerBaseUrl: testnetDeployment.explorerBaseUrl,
  admin: testnetDeployment.admin as HexString,
  treasury: testnetDeployment.treasury as HexString,
  arbiters: testnetDeployment.arbiters as HexString[],
  verifiers: testnetDeployment.verifiers as HexString[],
  contracts: testnetDeployment.contracts as unknown as DeploymentContracts,
  contractsDetail: testnetDeployment.contracts_detail as unknown as Record<
    keyof DeploymentContracts,
    ContractDetail
  >,
  keyTransactions: testnetDeployment.keyTransactions as unknown as ArbitrumSepoliaDeployment["keyTransactions"],
  allTransactions: testnetDeployment.transactions as Array<{
    contract?: string | null;
    address?: string | null;
    transactionHash: string;
    explorerUrl: string;
    type?: string;
    gas?: number;
  }>,
};

export const testnetDeploymentConfig = arbitrumSepoliaDeployment;

const testnetAddresses = new Set<string>([
  testnetDeployment.admin.toLowerCase(),
  testnetDeployment.treasury.toLowerCase(),
  ...Object.values(testnetDeployment.contracts).map((a: string) => a.toLowerCase()),
  ...testnetDeployment.arbiters.map((a: string) => a.toLowerCase()),
  ...testnetDeployment.verifiers.map((a: string) => a.toLowerCase()),
]);

const testnetTxHashes = new Set<string>([
  ...testnetDeployment.transactions.map((t: { transactionHash: string }) =>
    t.transactionHash.toLowerCase()
  ),
  ...(testnetDeployment.e2eTxHashes || []).map((h: string) => h.toLowerCase()),
]);

export function isArbitrumSepoliaAddress(address?: string | null): boolean {
  if (!address) return false;
  return testnetAddresses.has(address.toLowerCase());
}

export function isArbitrumSepoliaTx(txHash?: string | null): boolean {
  if (!txHash) return false;
  return testnetTxHashes.has(txHash.toLowerCase());
}

const HEX_PREFIX = ["0", "x"].join("");

export function getArbiscanExplorerUrl(
  hash?: string | null,
  type?: "tx" | "address" | "root" | "digest"
): string | undefined {
  if (!hash) return undefined;
  const clean = hash.startsWith(HEX_PREFIX)
    ? hash.toLowerCase()
    : `${HEX_PREFIX}${hash.toLowerCase()}`;

  if (testnetAddresses.has(clean) || (type === "address" && clean.length === 42)) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/address/${clean}`;
  }

  if (testnetTxHashes.has(clean) || (type === "tx" && clean.length === 66)) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/tx/${clean}`;
  }

  if (type === "address" && clean.length === 42) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/address/${clean}`;
  }
  if (type === "tx" && clean.length === 66) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/tx/${clean}`;
  }

  return undefined;
}

export interface DeploymentConfig {
  chainName: string;
  chainId: number;
  explorerBaseUrl: string;
  contracts: DeploymentContracts;
  admin?: string;
  arbiters?: string[];
  verifiers?: string[];
  testnet?: ArbitrumSepoliaDeployment;
}

export function getDeploymentConfig(): DeploymentConfig {
  const explorerBaseUrl =
    realRunSnapshot?.chain?.explorer_base_url ||
    testnetDeployment.explorerBaseUrl ||
    ARBITRUM_SEPOLIA_EXPLORER_BASE;

  if (realRunSnapshot && realRunSnapshot.chain) {
    return {
      chainName: realRunSnapshot.chain.name || `Chain ${realRunSnapshot.chain.chain_id}`,
      chainId: Number(realRunSnapshot.chain.chain_id),
      explorerBaseUrl,
      contracts: (testnetDeployment.contracts || realRunSnapshot.chain.contracts) as unknown as DeploymentContracts,
      admin: testnetDeployment.admin,
      arbiters: testnetDeployment.arbiters as HexString[],
      verifiers: testnetDeployment.verifiers as HexString[],
      testnet: arbitrumSepoliaDeployment,
    };
  }

  return {
    chainName: testnetDeployment.chainName || `Chain ${testnetDeployment.chainId}`,
    chainId: Number(testnetDeployment.chainId),
    explorerBaseUrl,
    contracts: testnetDeployment.contracts as unknown as DeploymentContracts,
    admin: testnetDeployment.admin,
    arbiters: testnetDeployment.arbiters as HexString[],
    verifiers: testnetDeployment.verifiers as HexString[],
    testnet: arbitrumSepoliaDeployment,
  };
}

export const deploymentConfig = getDeploymentConfig();
