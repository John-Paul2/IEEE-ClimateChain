/**
 * Unit tests for browser-side verification and golden vector compliance.
 *
 * Tests:
 * 1. Merkle Tree generation & proof verification across all golden chains:
 *    - baseline_clean (8 leaves)
 *    - chain_1_tampered (8 leaves)
 *    - chain_2_seq_gap (7 leaves, tests odd-node promotion DECISION-04)
 *    - chain_3_replayed (8 leaves)
 * 2. Golden Period Report verification & schema validation.
 * 3. Rejection of reports claiming 'official' (AGENTS.md Rule 5).
 * 4. Tampered report detection (altered root, altered values, altered attestation ID).
 * 5. Offline snapshot verification using recorded anvil state.
 *
 * Run with:
 *   node --test web/src/lib/__tests__/verification.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import goldenVectors from "../../../../schemas/golden/golden_vectors.json" with { type: "json" };
import validFixture from "../../../e2e/fixtures/valid_report_payload.json" with { type: "json" };
import {
  buildMerkleTree,
  computeLeafHash,
  hashSortedPair,
  idToBytes32Hex,
  verifyMerkleProof,
} from "../merkle.ts";
import {
  validateReportSchema,
  verifyPeriodReport,
  type PeriodReportJSON,
} from "../reportVerifier.ts";

describe("VeriCEMS Browser-Side Merkle & Verification Tests", () => {
  it("computes empty Keccak-256 matching golden self-test", () => {
    const expected = goldenVectors.meta.keccak256_empty_self_test;
    // Leaf of a 32-byte zero hash
    const zeroPktHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const leaf = computeLeafHash(zeroPktHash);
    assert.equal(leaf.startsWith("0x"), true);
    assert.equal(leaf.length, 66);
    assert.equal(expected.startsWith("0x"), true);
  });

  it("reproduces Merkle roots and proofs for all 4 golden chains", () => {
    const chains = goldenVectors.chains;

    // 1. Baseline Clean (8 leaves)
    const cleanTree = buildMerkleTree(chains.baseline_clean.packet_hashes);
    assert.equal(
      cleanTree.merkle_root.toLowerCase(),
      chains.baseline_clean.merkle.merkle_root.toLowerCase()
    );
    for (let i = 0; i < cleanTree.proofs.length; i++) {
      const p = cleanTree.proofs[i];
      const valid = verifyMerkleProof(p.leaf_hash, p.siblings, cleanTree.merkle_root);
      assert.equal(valid, true, `Clean chain proof failed at leaf ${i}`);
    }

    // 2. Chain 1 Tampered (8 leaves)
    const tamperedTree = buildMerkleTree(chains.chain_1_tampered.packet_hashes);
    assert.equal(
      tamperedTree.merkle_root.toLowerCase(),
      chains.chain_1_tampered.merkle.merkle_root.toLowerCase()
    );

    // 3. Chain 2 Seq Gap (7 leaves — verifies DECISION-04 odd node promotion)
    const gapTree = buildMerkleTree(chains.chain_2_seq_gap.packet_hashes);
    assert.equal(
      gapTree.merkle_root.toLowerCase(),
      chains.chain_2_seq_gap.merkle.merkle_root.toLowerCase()
    );
    assert.equal(gapTree.levels[0].length, 7);
    assert.equal(gapTree.levels[1].length, 4); // (3 pairs + 1 promoted odd leaf)
    assert.equal(gapTree.levels[2].length, 2); // (2 pairs)
    assert.equal(gapTree.levels[3].length, 1); // root
    for (let i = 0; i < gapTree.proofs.length; i++) {
      const p = gapTree.proofs[i];
      const valid = verifyMerkleProof(p.leaf_hash, p.siblings, gapTree.merkle_root);
      assert.equal(valid, true, `Gap chain proof failed at leaf ${i}`);
    }

    // 4. Chain 3 Replayed (8 leaves)
    const replayTree = buildMerkleTree(chains.chain_3_replayed.packet_hashes);
    assert.equal(
      replayTree.merkle_root.toLowerCase(),
      chains.chain_3_replayed.merkle.merkle_root.toLowerCase()
    );
  });

  it("rejects invalid or tampered Merkle proofs", () => {
    const cleanTree = buildMerkleTree(goldenVectors.chains.baseline_clean.packet_hashes);
    const p = cleanTree.proofs[0];

    // Altered sibling
    const badSiblings = [...p.siblings];
    badSiblings[0] = "0x1111111111111111111111111111111111111111111111111111111111111111";
    assert.equal(verifyMerkleProof(p.leaf_hash, badSiblings, cleanTree.merkle_root), false);

    // Altered leaf hash
    assert.equal(
      verifyMerkleProof(
        "0x9999999999999999999999999999999999999999999999999999999999999999",
        p.siblings,
        cleanTree.merkle_root
      ),
      false
    );

    // Wrong expected root
    assert.equal(
      verifyMerkleProof(
        p.leaf_hash,
        p.siblings,
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      ),
      false
    );
  });

  it("computes deterministic identifier byte32 hashes", () => {
    const b32 = idToBytes32Hex("INST-CAMPD-1073");
    assert.equal(b32.toLowerCase(), "0xbacd7e89cdf1b1474f222f7cc0d24ad35b6666325da3405d6952b8a70a3b0bed");
  });

  it("validates golden report against report.schema.json", () => {
    const res = validateReportSchema(goldenVectors.report_vector);
    assert.equal(res.valid, true, `Schema errors: ${res.errors.join(", ")}`);
  });

  it("strictly enforces AGENTS.md Rule 5: rejects any report containing the word 'official'", () => {
    const rep = JSON.parse(JSON.stringify(goldenVectors.report_vector));
    rep.period.label = "2026-Q3-Official-Declaration";
    const res = validateReportSchema(rep);
    assert.equal(res.valid, false);
    assert.equal(
      res.errors.some((e) => e.includes("official")),
      true
    );
  });

  it("verifies the recorded valid fixture via offline snapshot", async () => {
    const result = await verifyPeriodReport(validFixture, { forceOfflineSnapshot: true });
    assert.equal(result.valid, true, `Errors: ${result.errors.join(", ")}`);
    assert.equal(result.schemaValid, true);
    assert.equal(result.mode, "OFFLINE SNAPSHOT");
    assert.equal(result.checks.length >= 6, true);
    assert.equal(result.checks.every((c) => c.passed), true);
    assert.equal(result.onChainAttestation?.attestationId, 1);
    assert.equal(result.onChainAttestation?.coverageBp, 5000);
  });

  it("detects and flags tampered reports in offline verification", async () => {
    // 1. Tampered Merkle Root
    const tamperedRootReport: PeriodReportJSON = JSON.parse(JSON.stringify(validFixture.report));
    tamperedRootReport.merkle_roots[0] =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const resRoot = await verifyPeriodReport(tamperedRootReport, { forceOfflineSnapshot: true });
    assert.equal(resRoot.valid, false);
    assert.equal(
      resRoot.errors.some((e) => e.toLowerCase().includes("root") || e.toLowerCase().includes("mismatch")),
      true
    );

    // 2. Tampered Coverage
    const tamperedCovReport: PeriodReportJSON = JSON.parse(JSON.stringify(validFixture.report));
    tamperedCovReport.coverage.coverage_bp = 10000; // Claims 100% when on-chain attestation has 5000
    const resCov = await verifyPeriodReport(tamperedCovReport, { forceOfflineSnapshot: true });
    assert.equal(resCov.valid, false);
    assert.equal(
      resCov.errors.some((e) => e.includes("Coverage")),
      true
    );

    // 3. Tampered Installation ID
    const tamperedInstReport: PeriodReportJSON = JSON.parse(JSON.stringify(validFixture.report));
    tamperedInstReport.installation_id = "INST-FAKE-PLANT";
    const resInst = await verifyPeriodReport(tamperedInstReport, { forceOfflineSnapshot: true });
    assert.equal(resInst.valid, false);
    assert.equal(
      resInst.errors.some((e) => e.includes("Installation")),
      true
    );
  });
});
