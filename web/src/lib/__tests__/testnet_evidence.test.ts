/**
 * Unit tests for Arbitrum Sepolia Deployment Metadata, Explorer Links, and Testnet Evidence (Fix 1).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arbitrumSepoliaDeployment,
  getArbiscanExplorerUrl,
  isArbitrumSepoliaAddress,
  isArbitrumSepoliaTx,
  deploymentConfig,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  ARBITRUM_SEPOLIA_EXPLORER_BASE,
} from "../../chain/deploymentConfig.ts";
import testnetJson from "../../../../deployments/testnet.json" with { type: "json" };

describe("Fix 1: Arbitrum Sepolia Explorer Links & Testnet Evidence", () => {
  it("exposes Arbitrum Sepolia deployment metadata with Chain ID 421614 and explorer base", () => {
    assert.equal(arbitrumSepoliaDeployment.chainId, 421614);
    assert.equal(ARBITRUM_SEPOLIA_CHAIN_ID, 421614);
    assert.equal(arbitrumSepoliaDeployment.explorerBaseUrl, "https://sepolia.arbiscan.io");
    assert.equal(ARBITRUM_SEPOLIA_EXPLORER_BASE, "https://sepolia.arbiscan.io");
    assert.equal(arbitrumSepoliaDeployment.network, "arbitrum-sepolia");
    assert.equal(deploymentConfig.explorerBaseUrl, "https://sepolia.arbiscan.io");
  });

  it("exposes all 6 deployed Arbitrum Sepolia contract addresses", () => {
    const contracts = arbitrumSepoliaDeployment.contracts;
    assert.equal(contracts.Attestation.toLowerCase(), testnetJson.contracts.Attestation.toLowerCase());
    assert.equal(contracts.BatchAnchor.toLowerCase(), testnetJson.contracts.BatchAnchor.toLowerCase());
    assert.equal(contracts.BondVault.toLowerCase(), testnetJson.contracts.BondVault.toLowerCase());
    assert.equal(contracts.Challenge.toLowerCase(), testnetJson.contracts.Challenge.toLowerCase());
    assert.equal(contracts.DeviceRegistry.toLowerCase(), testnetJson.contracts.DeviceRegistry.toLowerCase());
    assert.equal(contracts.VerifierQuorum.toLowerCase(), testnetJson.contracts.VerifierQuorum.toLowerCase());

    // Verify detailed contract URLs
    for (const key of Object.keys(contracts) as Array<keyof typeof contracts>) {
      const detail = arbitrumSepoliaDeployment.contractsDetail[key];
      assert.ok(detail, `Missing detail for contract ${key}`);
      assert.equal(detail.address.toLowerCase(), contracts[key].toLowerCase());
      assert.ok(detail.explorerUrl.startsWith("https://sepolia.arbiscan.io/address/"));
      assert.ok(detail.deployTxExplorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));
    }
  });

  it("exposes the real Arbitrum Sepolia transaction hashes for all required lifecycle operations", () => {
    const kt = arbitrumSepoliaDeployment.keyTransactions;

    // 1. registerDevice
    assert.equal(
      kt.registerDevice.txHash,
      "0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce"
    );
    assert.ok(kt.registerDevice.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));

    // 2. deposit
    assert.equal(
      kt.depositOperatorBond.txHash,
      "0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621"
    );
    assert.ok(kt.depositOperatorBond.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));

    // 3. anchorBatch Honest #4
    assert.equal(
      kt.anchorBatchHonest4.txHash,
      "0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22"
    );
    assert.ok(kt.anchorBatchHonest4.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));

    // 4. anchorBatch Tampered #6
    assert.equal(
      kt.anchorBatchTampered6.txHash,
      "0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9"
    );
    assert.ok(kt.anchorBatchTampered6.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));

    // 5. commitVote (Honest & Attack)
    assert.equal(
      kt.commitVoteHonestV0.txHash,
      "0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5"
    );
    assert.equal(
      kt.commitVoteAttackV0.txHash,
      "0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100"
    );

    // 6. revealVote (Honest & Attack)
    assert.equal(
      kt.revealVoteHonestV0.txHash,
      "0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f"
    );
    assert.equal(
      kt.revealVoteAttackV0.txHash,
      "0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80"
    );

    // 7. resolve / slash
    assert.equal(
      kt.resolveSlash.txHash,
      "0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540"
    );
    assert.ok(kt.resolveSlash.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));

    // 8. recordAttestation (Batch #4)
    assert.equal(
      kt.recordAttestation.txHash,
      "0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd"
    );
    assert.ok(kt.recordAttestation.explorerUrl.startsWith("https://sepolia.arbiscan.io/tx/"));
  });

  it("correctly identifies Arbitrum Sepolia addresses and transactions", () => {
    // Contract addresses
    assert.equal(isArbitrumSepoliaAddress("0x872d5ef7c6a457d1b8ed68221350236151c763b0"), true);
    assert.equal(isArbitrumSepoliaAddress("0x872D5EF7C6a457d1B8eD68221350236151c763B0"), true); // casing insensitivity
    assert.equal(isArbitrumSepoliaAddress("0x10b6647d48888a7c3c4dc28f0df0a2e5c23b3471"), true);
    assert.equal(isArbitrumSepoliaAddress("0x0000000000000000000000000000000000000001"), false);

    // Tx hashes
    assert.equal(isArbitrumSepoliaTx("0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22"), true);
    assert.equal(isArbitrumSepoliaTx("0x46e5be70FEE08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22"), true);
    assert.equal(isArbitrumSepoliaTx("0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540"), true);
    assert.equal(isArbitrumSepoliaTx("0x0000000000000000000000000000000000000000000000000000000000000000"), false);
  });

  it("generates exact working Arbiscan explorer links via getArbiscanExplorerUrl", () => {
    // Contract address lookup
    const attestationUrl = getArbiscanExplorerUrl("0x872d5ef7c6a457d1b8ed68221350236151c763b0");
    assert.equal(attestationUrl, "https://sepolia.arbiscan.io/address/0x872d5ef7c6a457d1b8ed68221350236151c763b0");

    // Key transaction lookup
    const honestTxUrl = getArbiscanExplorerUrl("0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22");
    assert.equal(honestTxUrl, "https://sepolia.arbiscan.io/tx/0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22");

    const slashTxUrl = getArbiscanExplorerUrl("0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540");
    assert.equal(slashTxUrl, "https://sepolia.arbiscan.io/tx/0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540");

    // Explicit type address fallback
    const arbitraryAddress = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
    assert.equal(
      getArbiscanExplorerUrl(arbitraryAddress, "address"),
      "https://sepolia.arbiscan.io/address/0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
    );

    // Root without explicit match returns undefined
    const arbitraryRoot = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    assert.equal(getArbiscanExplorerUrl(arbitraryRoot, "root"), undefined);
  });
});
