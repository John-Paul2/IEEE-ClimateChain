import anvilDeployment from "../../../deployments/anvil.json" with { type: "json" };
import testnetDeployment from "../../../deployments/testnet.json" with { type: "json" };
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export interface DeploymentContracts {
  Attestation: `0x${string}`;
  BatchAnchor: `0x${string}`;
  BondVault: `0x${string}`;
  Challenge: `0x${string}`;
  DeviceRegistry: `0x${string}`;
  VerifierQuorum: `0x${string}`;
}

export interface ContractDetail {
  address: `0x${string}`;
  deployTxHash: `0x${string}`;
  explorerUrl: string;
  deployTxExplorerUrl: string;
}

export interface TestnetTransaction {
  name: string;
  role: string;
  txHash: `0x${string}`;
  explorerUrl: string;
  notes?: string;
  gasUsed?: number;
  block?: number;
}

export interface ArbitrumSepoliaDeployment {
  chainId: 421614;
  chainName: "Arbitrum Sepolia";
  network: "arbitrum-sepolia";
  explorerBaseUrl: "https://sepolia.arbiscan.io";
  admin: `0x${string}`;
  treasury: `0x${string}`;
  arbiters: `0x${string}`[];
  verifiers: `0x${string}`[];
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

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614 as const;
export const ARBITRUM_SEPOLIA_EXPLORER_BASE = "https://sepolia.arbiscan.io" as const;

export const arbitrumSepoliaDeployment: ArbitrumSepoliaDeployment = {
  chainId: 421614,
  chainName: "Arbitrum Sepolia",
  network: "arbitrum-sepolia",
  explorerBaseUrl: "https://sepolia.arbiscan.io",
  admin: testnetDeployment.admin as `0x${string}`,
  treasury: testnetDeployment.treasury as `0x${string}`,
  arbiters: testnetDeployment.arbiters as `0x${string}`[],
  verifiers: testnetDeployment.verifiers as `0x${string}`[],
  contracts: testnetDeployment.contracts as DeploymentContracts,
  contractsDetail: testnetDeployment.contracts_detail as Record<keyof DeploymentContracts, ContractDetail>,
  keyTransactions: {
    registerDevice: {
      name: "DeviceRegistry.registerDevice",
      role: "Operator / Verifier",
      txHash: "0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce",
      notes: "CEMS device registered on Arbitrum Sepolia",
      gasUsed: 238041,
      block: 321580773,
    },
    depositOperatorBond: {
      name: "BondVault.depositOperatorBond",
      role: "Operator",
      txHash: "0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621",
      notes: "Operator deposited 0.002 ETH bond",
      gasUsed: 117845,
      block: 321580907,
    },
    depositVerifierStakeV0: {
      name: "BondVault.depositVerifierStake[V0]",
      role: "Verifier 0",
      txHash: "0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd",
      notes: "Verifier 0 deposited 0.0005 ETH stake",
      gasUsed: 72211,
      block: 321580926,
    },
    anchorBatchHonest4: {
      name: "BatchAnchor.anchorBatch (Honest #4)",
      role: "Operator",
      txHash: "0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22",
      notes: "Anchored Batch #4 with authentic telemetry Merkle root",
      gasUsed: 179843,
      block: 321582952,
    },
    commitVoteHonestV0: {
      name: "VerifierQuorum.commitVote (Honest V0)",
      role: "Verifier 0",
      txHash: "0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5",
      notes: "V0 submitted sealed vote commitment",
      gasUsed: 120510,
      block: 321582964,
    },
    revealVoteHonestV0: {
      name: "VerifierQuorum.revealVote (Honest V0)",
      role: "Verifier 0",
      txHash: "0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f",
      notes: "V0 revealed Clean verdict (score=0bp)",
      gasUsed: 194083,
      block: 321583050,
    },
    finalizeHonest: {
      name: "VerifierQuorum.finalize (Honest)",
      role: "Operator / Verifier",
      txHash: "0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722",
      notes: "Quorum reached 3-of-3 Clean consensus -> Status=Verified",
      gasUsed: 127850,
      block: 321583075,
    },
    recordAttestation: {
      name: "Attestation.recordAttestation (Attestation #4)",
      role: "Operator",
      txHash: "0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd",
      notes: "Recorded EU CBAM Attestation Certificate for Batch #4",
      gasUsed: 281626,
      block: 321583085,
    },
    anchorBatchTampered6: {
      name: "BatchAnchor.anchorBatch (Tampered #6)",
      role: "Operator",
      txHash: "0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9",
      notes: "Anchored Tampered Batch #6 (synthetic scale attack injected)",
      gasUsed: 179843,
      block: 321584995,
    },
    commitVoteAttackV0: {
      name: "VerifierQuorum.commitVote (Attack V0)",
      role: "Verifier 0",
      txHash: "0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100",
      notes: "V0 committed Fraud detection hash",
      gasUsed: 120510,
      block: 321585012,
    },
    revealVoteAttackV0: {
      name: "VerifierQuorum.revealVote (Attack V0)",
      role: "Verifier 0",
      txHash: "0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80",
      notes: "V0 revealed Fraud verdict (score=8500bp, residual mismatch)",
      gasUsed: 194605,
      block: 321585097,
    },
    submitOperatorDispute: {
      name: "Challenge.submitOperatorDispute",
      role: "Operator",
      txHash: "0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4",
      notes: "Operator lodged dispute challenging the quarantine",
      gasUsed: 82020,
      block: 321585333,
    },
    resolveVote: {
      name: "Challenge.resolve (Arbiter 0 Vote)",
      role: "Arbiter 0",
      txHash: "0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049",
      notes: "Arbiter 0 cast vote 1 of 2 (UPHELD_FRAUD)",
      gasUsed: 77704,
      block: 321585379,
    },
    resolveSlash: {
      name: "Challenge.resolve (Arbiter 1 Resolution & Slash)",
      role: "Arbiter 1",
      txHash: "0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540",
      explorerUrl: "https://sepolia.arbiscan.io/tx/0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540",
      notes: "Arbiter 1 completed 2-of-3 quorum: Slashed 50% operator bond",
      gasUsed: 318914,
      block: 321585388,
    },
  },
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

// Canonical sets for fast lookup of Arbitrum Sepolia addresses and transactions
const testnetAddresses = new Set<string>([
  testnetDeployment.admin.toLowerCase(),
  testnetDeployment.treasury.toLowerCase(),
  ...Object.values(testnetDeployment.contracts).map((a: string) => a.toLowerCase()),
  ...testnetDeployment.arbiters.map((a: string) => a.toLowerCase()),
  ...testnetDeployment.verifiers.map((a: string) => a.toLowerCase()),
]);

const testnetTxHashes = new Set<string>([
  ...testnetDeployment.transactions.map((t: { transactionHash: string }) => t.transactionHash.toLowerCase()),
  "0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce",
  "0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621",
  "0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd",
  "0x51151074c274888636aa56a112a8ba4f4b73cee3d5c2860743c8d521d50fc904",
  "0x04bcb069f85fd07c35e709cbca64f546cf41f7d802a9090dd0965a4c5fcd3604",
  "0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22",
  "0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5",
  "0xe2c3a560ef6b18318bc883a68a55c34640cba33f4b9cc70d59deb938f7c6fb1a",
  "0x0c30600033232ac0b6e4632d1a88d1111f6c5357ed5f10ffe0cbbb72ff40383f",
  "0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f",
  "0x52f236196386c69a50fc894682a9df4a4a387f6111578c8fd19c05f171556b51",
  "0xcef8dec16d2275758f6a9a3d3f9d008bf5c7619398d15ba367d3d2a5091e3eba",
  "0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722",
  "0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd",
  "0x2ee068a31e36f7685d0eb87abc5787ae0b8b417bd1b60052d91cb5c82e7a31a2",
  "0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9",
  "0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100",
  "0xf0d74c40b5712f845920a5ad228aaf9d4ffbb0fbc1ea3a00f849831c8e349bc5",
  "0x2d95ed6647721313d10c678c2632907ab0532ef96cbab069f6d267f94996f887",
  "0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80",
  "0x7fd4ee06cea972e95876de38de982b5ae8b2e10b70a04955fcfc9a3afa9495b8",
  "0x1a081e098cec5136a192366329af3fd666c8a75dc770b93451f06787a9285ec8",
  "0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4",
  "0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049",
  "0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540",
  "0xcf769c0141964062a3abd780c5b7148bfe8c0d503aec8d1bfe9797273dd6d2a7",
  "0x9d511c6cc4a8e3c8c4797f3aa88518460def3bb154bfa25ebbe8bb46ed0b66d6",
  "0x12c427a36b008e6745bd2186c0772cf210806feb37a509f23ec7b237634f461b",
  "0x525b1dd5744d0674edaec6cf0812ca03fde4745de697755d2c27863f146b8137",
  "0x4be3c846ae8ee3af84c85d41c55aea6cade02dac10aa79ba821b6db081c7f18e",
  "0xdea0840e07576901f13532b673c6299475ac476e20f4253b009d4d94c895297d",
  "0x8e8cd9be3b31103c2a55e38fa88c92b435fa19d8d6364d2c98c0553cb5e4faec",
  "0x96af26f11d9460ada1a8bbd8bfb0e08c6394544bf83c23ac4ee11018e8ebdb6d",
  "0x448612c2d6d550df9bd5fad51cf53f9841facfd6228137c086e04b6778384ccb",
  "0xcf5a53eed81ce13c2862113e01cbef69c5dc82a45cdd113e2b27180c46e343d2",
  "0x73d99103df24149acd55587b0a455fa2c88a7dba69240cb93400c75fdb5b2f0c",
  "0x96e8861c807a9ae6d5cd6881b3a3aa7f8ab10ffdb313db620fbe712add068806",
  "0x416085b9251333041aac693a7be14c4b22111cd4e871fcdca0d425d329be68f6",
  "0x2e796c807c18b8fb3afabbfa4c48609ed71d0cdd40608e2132fef0e9571f06f2",
  "0x794448c32bea1dd8b3a6591a1cc0aa82cf6ca279b54f386718f334f284af17ca",
  "0x4b3abe282c6044ca0550c854e7b7729662573a3eb901fef0d582d837f52c9399",
  "0xbf7654ec43061357bcdaf5da72d7f27dda67c01fe76162fceb4f32a6c1185a26",
  "0x1c7f61ce50bfddb1d3a2a71cf8ae02cc175b2d59a9fa39e86e9aeca31fbcbbdf",
  "0x8a7a5450c266d254ba96fab435ac24c8e40d74b9df60bee10686a89aa0cef73e",
  "0x8bc08869068f1205286c8b54ef4e2ebdc0fb8387575ef7b0f512e22ffb195675",
  "0xc4b248400f8bf1d8414e3001fb8db6874dfb75ffc75e31c0b8cc85cd78e25919",
  "0xb0bff261e0af2b2e4731c07fb3c22f161860074847530088424a0b4578f59ee3",
]);

export function isArbitrumSepoliaAddress(address?: string | null): boolean {
  if (!address) return false;
  return testnetAddresses.has(address.toLowerCase());
}

export function isArbitrumSepoliaTx(txHash?: string | null): boolean {
  if (!txHash) return false;
  return testnetTxHashes.has(txHash.toLowerCase());
}

export function getArbiscanExplorerUrl(
  hash?: string | null,
  type?: "tx" | "address" | "root" | "digest"
): string | undefined {
  if (!hash) return undefined;
  const clean = hash.startsWith("0x") ? hash.toLowerCase() : `0x${hash.toLowerCase()}`;

  // If matched as an Arbitrum Sepolia deployed contract or address
  if (testnetAddresses.has(clean) || (type === "address" && clean.length === 42)) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/address/${clean}`;
  }

  // If matched as an Arbitrum Sepolia testnet transaction
  if (testnetTxHashes.has(clean) || (type === "tx" && clean.length === 66)) {
    return `${ARBITRUM_SEPOLIA_EXPLORER_BASE}/tx/${clean}`;
  }

  // Fallback for general 42-char address or 66-char tx when explicitly typed
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
  explorerBaseUrl: string | null;
  contracts: DeploymentContracts;
  admin?: string;
  arbiters?: string[];
  verifiers?: string[];
  testnet?: ArbitrumSepoliaDeployment;
}

export function getDeploymentConfig(): DeploymentConfig {
  const explorerBaseUrl =
    realRunSnapshot?.chain?.explorer_base_url ||
    (testnetDeployment as unknown as { explorerBaseUrl?: string })?.explorerBaseUrl ||
    ARBITRUM_SEPOLIA_EXPLORER_BASE;

  if (realRunSnapshot && realRunSnapshot.chain) {
    return {
      chainName: realRunSnapshot.chain.name || `Chain ${realRunSnapshot.chain.chain_id}`,
      chainId: Number(realRunSnapshot.chain.chain_id),
      explorerBaseUrl,
      contracts: realRunSnapshot.chain.contracts as DeploymentContracts,
      admin: (anvilDeployment as unknown as { admin?: string }).admin,
      arbiters: (anvilDeployment as unknown as { arbiters?: string[] }).arbiters,
      verifiers: (anvilDeployment as unknown as { verifiers?: string[] }).verifiers,
      testnet: arbitrumSepoliaDeployment,
    };
  }

  const anvil = anvilDeployment as unknown as {
    chainId: number;
    contracts: DeploymentContracts;
    chainName?: string;
    explorerBaseUrl?: string | null;
    admin?: string;
    arbiters?: string[];
    verifiers?: string[];
  };

  return {
    chainName: anvil.chainName || `Chain ${anvil.chainId}`,
    chainId: Number(anvil.chainId),
    explorerBaseUrl: anvil.explorerBaseUrl || explorerBaseUrl,
    contracts: anvil.contracts,
    admin: anvil.admin,
    arbiters: anvil.arbiters,
    verifiers: anvil.verifiers,
    testnet: arbitrumSepoliaDeployment,
  };
}

export const deploymentConfig = getDeploymentConfig();
