import { publicClient, CONTRACT_ADDRESSES } from "./viemClient.ts";
import { BatchAnchorAbi, AttestationAbi, BondVaultAbi } from "./abis.ts";
import type { BatchStatus } from "../types/telemetry";

const STATUS_MAP: Record<number, BatchStatus> = {
  0: "Anchored",
  1: "Anchored",
  2: "Verified",
  3: "Quarantined",
  4: "Slashed",
  5: "Cleared",
};

export interface OnChainBatchRecord {
  batchId: bigint;
  deviceId: `0x${string}`;
  installationId: `0x${string}`;
  merkleRoot: `0x${string}`;
  firstSeq: bigint;
  lastSeq: bigint;
  count: number;
  anchoredAt: bigint;
  status: BatchStatus;
}

export interface OnChainPeriodAttestation {
  attestationId: bigint;
  installationId: `0x${string}`;
  periodLabel: string;
  totalEmissionsKgCo2e: bigint;
  productionKg: bigint;
  coverageBp: number;
  periodMerkleRoot: `0x${string}`;
  attestedAt: bigint;
  attestedBy: `0x${string}`;
  batchIds: bigint[];
}

export async function fetchOnChainBatch(batchId: bigint): Promise<OnChainBatchRecord> {
  const result = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.BatchAnchor,
    abi: BatchAnchorAbi,
    functionName: "getBatch",
    args: [batchId],
  });

  return {
    batchId: result.batchId,
    deviceId: result.deviceId,
    installationId: result.installationId,
    merkleRoot: result.merkleRoot,
    firstSeq: result.firstSeq,
    lastSeq: result.lastSeq,
    count: result.count,
    anchoredAt: result.anchoredAt,
    status: STATUS_MAP[result.status] || "Anchored",
  };
}

export async function verifyOnChainPacketInclusion(
  batchId: bigint,
  packetHash: `0x${string}`,
  siblings: `0x${string}`[]
): Promise<boolean> {
  return await publicClient.readContract({
    address: CONTRACT_ADDRESSES.BatchAnchor,
    abi: BatchAnchorAbi,
    functionName: "verifyPacketInclusion",
    args: [batchId, packetHash, siblings],
  });
}

export async function fetchOnChainAttestation(attestationId: bigint): Promise<OnChainPeriodAttestation> {
  const [attestation, batchIds] = await Promise.all([
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.Attestation,
      abi: AttestationAbi,
      functionName: "getAttestation",
      args: [attestationId],
    }),
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.Attestation,
      abi: AttestationAbi,
      functionName: "getAttestationBatchIds",
      args: [attestationId],
    }),
  ]);

  return {
    attestationId: attestation.attestationId,
    installationId: attestation.installationId,
    periodLabel: attestation.periodLabel,
    totalEmissionsKgCo2e: attestation.totalEmissionsKgCo2e,
    productionKg: attestation.productionKg,
    coverageBp: attestation.coverageBp,
    periodMerkleRoot: attestation.periodMerkleRoot,
    attestedAt: attestation.attestedAt,
    attestedBy: attestation.attestedBy,
    batchIds: [...batchIds],
  };
}

export async function fetchVaultSummary(installationId: `0x${string}`) {
  const [total, slashed, active, isSufficient] = await publicClient.readContract({
    address: CONTRACT_ADDRESSES.BondVault,
    abi: BondVaultAbi,
    functionName: "getVaultSummary",
    args: [installationId],
  });
  return {
    totalOperatorBondWei: total.toString(),
    slashedOperatorBondWei: slashed.toString(),
    activeOperatorBondWei: active.toString(),
    isSufficient,
  };
}

export async function checkNetworkStatus(): Promise<{
  connected: boolean;
  chainId?: number;
  blockNumber?: bigint;
  networkType: "LOCAL" | "TESTNET" | "OFFLINE SNAPSHOT";
}> {
  try {
    const [chainId, blockNumber] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getBlockNumber(),
    ]);

    let networkType: "LOCAL" | "TESTNET" | "OFFLINE SNAPSHOT" = "LOCAL";
    if (chainId === 421614 || chainId === 80002 || chainId === 11155111) {
      networkType = "TESTNET";
    } else if (chainId === 31337) {
      networkType = "LOCAL";
    }

    return { connected: true, chainId, blockNumber, networkType };
  } catch {
    return {
      connected: false,
      networkType: "OFFLINE SNAPSHOT",
    };
  }
}
