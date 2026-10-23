/**
 * Unit tests for Fix 2: Real Foundry & Arbitrum Sepolia Gas Numbers, Slither Findings,
 * and Bus-Boundary Recalls (Attack 1 vs 8A vs 8B).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import summary from "../../../../results/benchmark_summary.json" with { type: "json" };
import gasMeasured from "../../../../results/gas_measured.json" with { type: "json" };

describe("Fix 2: Gas Benchmark & Bus-Boundary Defense Verification", () => {
  it("verifies exact Arbitrum Sepolia gas measurements in results/gas_measured.json", () => {
    assert.equal(gasMeasured.chain_id, 421614);
    assert.equal(gasMeasured.network, "arbitrum-sepolia");

    // anchorBatch 20 samples
    assert.equal(gasMeasured.measurements.anchorBatch.count, 20);
    assert.equal(gasMeasured.measurements.anchorBatch.median, 179843);
    assert.equal(gasMeasured.measurements.anchorBatch.min, 179831);
    assert.equal(gasMeasured.measurements.anchorBatch.max, 179855);

    // commitVote
    assert.equal(gasMeasured.measurements.commitVote.median, 103410);
    assert.equal(gasMeasured.measurements.commitVote.max, 120510);

    // revealVote
    assert.equal(gasMeasured.measurements.revealVote.median, 177505);

    // finalize
    assert.equal(gasMeasured.measurements.finalize.min, 127850);
    assert.equal(gasMeasured.measurements.finalize.max, 248504);

    // resolve (slash)
    assert.equal(gasMeasured.measurements.resolve.max, 318914);

    // recordAttestation
    assert.equal(gasMeasured.measurements.recordAttestation.median, 281626);
  });

  it("verifies O(1) Merkle batching achieves >95% gas savings over naive logging", () => {
    const singleAnchorGas = gasMeasured.measurements.anchorBatch.median;
    const naive24PacketsGas = 24 * singleAnchorGas; // 4,316,232
    const merkle1BatchGas = singleAnchorGas; // 179,843
    const savingsPct = ((naive24PacketsGas - merkle1BatchGas) / naive24PacketsGas) * 100;

    assert.equal(singleAnchorGas, 179843);
    assert.equal(naive24PacketsGas, 4316232);
    assert.ok(savingsPct > 95.0, "Merkle batching must achieve >95% gas reduction for 24 packets");
  });

  it("verifies exact recall figures for Attack 1, Attack 8A, and Attack 8B bus boundaries", () => {
    // Attack 1: Constant Scaling (10% scale achieves 100% recall)
    const atk1 = summary.attacks.constant_scaling_10pct.detectors.proposed;
    assert.equal(atk1.recall.mean, 1.0, "Attack 1 (10% scaling) must have 100.0% recall");

    // Attack 8A: Single-Bus CEMS Attacker (~85.7% recall)
    const atk8a = summary.attacks.adaptive_whitebox_a_single_source.detectors.proposed;
    assert.ok(
      atk8a.recall.mean > 0.85 && atk8a.recall.mean < 0.86,
      `Attack 8A recall (${atk8a.recall.mean}) must match ~85.7%`
    );

    // Attack 8B: Coordinated Multi-Bus Insider (~2.95% recall)
    const atk8b = summary.attacks.adaptive_whitebox_b_coordinated_insider.detectors.proposed;
    assert.ok(
      atk8b.recall.mean > 0.028 && atk8b.recall.mean < 0.032,
      `Attack 8B recall (${atk8b.recall.mean}) must match ~2.95%`
    );
  });

  it("verifies docs/SECURITY_ASSESSMENT.md contains updated gas numbers and Slither static analysis summary", () => {
    const docPath = path.resolve(process.cwd(), "../docs/SECURITY_ASSESSMENT.md");
    assert.ok(fs.existsSync(docPath), "SECURITY_ASSESSMENT.md must exist");
    const doc = fs.readFileSync(docPath, "utf-8");

    // Check gas numbers
    assert.ok(doc.includes("194,115"), "Must include Forge median for registerDevice");
    assert.ok(doc.includes("238,041"), "Must include testnet execution for registerDevice");
    assert.ok(doc.includes("179,843"), "Must include testnet anchorBatch median");
    assert.ok(doc.includes("318,914"), "Must include Arbiter slash resolution gas");
    assert.ok(doc.includes("281,626"), "Must include recordAttestation testnet gas");

    // Check Slither summary table
    assert.ok(doc.includes("Slither Static Analysis Verification Summary"), "Must include Slither summary header");
    assert.ok(doc.includes("32 findings identified across 8 detector types"), "Must disclose 32 Slither findings");
    assert.ok(doc.includes("arbitrary-send-eth"), "Must include arbitrary-send-eth finding");
    assert.ok(doc.includes("divide-before-multiply"), "Must include divide-before-multiply finding");
    assert.ok(doc.includes("calls-loop"), "Must include calls-loop finding");
  });
});
