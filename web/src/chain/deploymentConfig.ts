import anvilDeployment from "../../../deployments/anvil.json" with { type: "json" };
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export interface DeploymentContracts {
  Attestation: `0x${string}`;
  BatchAnchor: `0x${string}`;
  BondVault: `0x${string}`;
  Challenge: `0x${string}`;
  DeviceRegistry: `0x${string}`;
  VerifierQuorum: `0x${string}`;
}

export interface DeploymentConfig {
  chainName: string;
  chainId: number;
  explorerBaseUrl: string | null;
  contracts: DeploymentContracts;
  admin?: string;
  arbiters?: string[];
  verifiers?: string[];
}

export function getDeploymentConfig(): DeploymentConfig {
  if (realRunSnapshot && realRunSnapshot.chain) {
    return {
      chainName: realRunSnapshot.chain.name || `Chain ${realRunSnapshot.chain.chain_id}`,
      chainId: Number(realRunSnapshot.chain.chain_id),
      explorerBaseUrl: realRunSnapshot.chain.explorer_base_url || null,
      contracts: realRunSnapshot.chain.contracts as DeploymentContracts,
      admin: (anvilDeployment as unknown as { admin?: string }).admin,
      arbiters: (anvilDeployment as unknown as { arbiters?: string[] }).arbiters,
      verifiers: (anvilDeployment as unknown as { verifiers?: string[] }).verifiers,
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
    explorerBaseUrl: anvil.explorerBaseUrl || null,
    contracts: anvil.contracts,
    admin: anvil.admin,
    arbiters: anvil.arbiters,
    verifiers: anvil.verifiers,
  };
}

export const deploymentConfig = getDeploymentConfig();
