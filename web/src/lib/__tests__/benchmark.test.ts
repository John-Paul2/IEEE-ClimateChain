import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Direct JSON imports via ESM Import Attributes
import summary from "../../../../results/benchmark_summary.json" with { type: "json" };
import manifest from "../../../../results/run_manifest.json" with { type: "json" };
import {
  TELEMETRY_CHANNELS_PROVENANCE,
  DETECTOR_METADATA,
  formatMeanStd,
} from "../benchmarkTypes.ts";

describe("VeriCEMS Benchmark Artifacts & Honesty Verification", () => {
  it("loads results/benchmark_summary.json with valid structure and 14 attack scenarios", () => {
    assert.ok(summary, "summary should exist");
    assert.equal(summary.schema_version, "1.0.0");
    assert.equal(summary.n_splits, 5);
    assert.equal(summary.n_attacks, 14);
    assert.equal(summary.target_validation_fpr, 0.02);

    const attackKeys = Object.keys(summary.attacks);
    assert.equal(attackKeys.length, 14, "should contain exactly 14 benchmark attack scenarios");

    const requiredDetectors = ["proposed", "baseline_2_physics", "autoencoder_only", "baseline_1_static"];

    for (const key of attackKeys) {
      const atk = summary.attacks[key];
      assert.ok(atk.attack_id, `attack ${key} must have attack_id`);
      assert.ok(atk.attack_name, `attack ${key} must have attack_name`);
      assert.ok(atk.co2_reduction_achieved_pct, `attack ${key} must have co2 reduction`);

      for (const detKey of requiredDetectors) {
        const det = atk.detectors[detKey];
        assert.ok(det, `attack ${key} must contain detector ${detKey}`);
        assert.ok(typeof det.recall.mean === "number");
        assert.ok(typeof det.recall.std === "number");
        assert.ok(typeof det.precision.mean === "number");
        assert.ok(typeof det.fpr.mean === "number");
        assert.ok(typeof det.auroc.mean === "number");
        assert.ok(typeof det.detection_delay_hours.mean === "number");
      }
    }
  });

  it("verifies macro averages and ROC curve coordinates", () => {
    assert.ok(summary.overall_macro_average.proposed);
    const proposedMacro = summary.overall_macro_average.proposed;
    assert.ok(proposedMacro.recall.mean > 0 && proposedMacro.recall.mean <= 1.0);
    assert.ok(
      proposedMacro.auroc.mean > 0.85 && proposedMacro.auroc.mean < 0.95,
      `Proposed overall AUROC (${proposedMacro.auroc.mean}) should reflect measured empirical benchmark`
    );

    // 101 points for ROC curve
    const rocKeys = Object.keys(summary.roc_curves_overall);
    assert.deepEqual(rocKeys.sort(), ["autoencoder_only", "baseline_1_static", "baseline_2_physics", "proposed"].sort());
    for (const rk of rocKeys) {
      const curve = summary.roc_curves_overall[rk];
      assert.equal(curve.fpr.length, 101);
      assert.equal(curve.tpr_mean.length, 101);
      assert.equal(curve.tpr_std.length, 101);
    }

    // Adaptive attacker curve sweeps
    assert.ok(summary.adaptive_curve.variant_a_single_source.length >= 10);
    assert.ok(summary.adaptive_curve.variant_b_coordinated_insider.length >= 10);
  });

  it("loads results/run_manifest.json with exact reproducibility metadata", () => {
    assert.ok(manifest);
    assert.equal(manifest.base_seed, 42);
    assert.deepEqual(manifest.split_seeds, [42, 43, 44, 45, 46]);
    assert.equal(manifest.n_facilities_total, 29);
    assert.equal(manifest.n_splits, 5);
    assert.ok(manifest.git_commit_hash);
    assert.equal(manifest.parameters.target_fpr, 0.02);
    assert.equal(manifest.parameters.series_hours_per_unit, 720);
    assert.equal(manifest.parameters.attack_window_fraction, 0.40);
  });

  it("validates telemetry channels provenance strictly adheres to AGENTS.md real vs synthetic rule", () => {
    const real = TELEMETRY_CHANNELS_PROVENANCE.filter((c) => c.source === "real");
    const synthetic = TELEMETRY_CHANNELS_PROVENANCE.filter((c) => c.source === "synthetic");

    assert.equal(real.length, 8, "Must document 8 real CAMPD channels");
    assert.equal(synthetic.length, 4, "Must document 4 synthetic channels");

    // Every synthetic channel must have 'synthetic' in its name
    for (const ch of synthetic) {
      assert.ok(
        ch.name.startsWith("synthetic_"),
        `Synthetic channel '${ch.name}' must be prefixed with 'synthetic_' per Rule 3`
      );
    }
  });

  it("verifies formatMeanStd helper formats numbers deterministically", () => {
    assert.equal(formatMeanStd({ mean: 0.8575, std: 0.3181 }), "85.8% ± 31.8%");
    assert.equal(
      formatMeanStd({ mean: 0.8575, std: 0.3181 }, { decimals: 2 }),
      "85.75% ± 31.81%"
    );
    assert.equal(
      formatMeanStd({ mean: 24.9, std: 55.7 }, { isPercent: false, decimals: 1, unit: "h" }),
      "24.9 ± 55.7 h"
    );
    assert.equal(formatMeanStd(undefined), "—");
  });

  it("reads results/WHAT_STILL_GETS_THROUGH.md and ensures prominent disclosure of attacks under 50% recall", () => {
    const mdPath = path.resolve(process.cwd(), "../results/WHAT_STILL_GETS_THROUGH.md");
    assert.ok(fs.existsSync(mdPath), "WHAT_STILL_GETS_THROUGH.md must exist on disk");
    const content = fs.readFileSync(mdPath, "utf-8");

    // Must prominently disclose slow drift and Variant B
    assert.ok(content.includes("slow_drift_0_1pct_day"), "Must disclose slow_drift_0_1pct_day");
    assert.ok(content.includes("slow_drift_0_3pct_day"), "Must disclose slow_drift_0_3pct_day");
    assert.ok(
      content.includes("adaptive_whitebox_b_coordinated_insider"),
      "Must disclose adaptive_whitebox_b_coordinated_insider"
    );
    assert.ok(
      content.includes("Prominent Disclosure"),
      "Must include prominent disclosure title"
    );
  });
});
