/**
 * TypeScript unit and shared-vector tests for `web/src/lib/cbam.ts`.
 * Run with Node 24 native test runner + TypeScript stripping:
 *   node --test web/src/lib/__tests__/cbam.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharedVectors from "../../../../calculator/tests/vectors.json" with { type: "json" };
import {
  CBAMValidationError,
  NeedsSourceError,
  calculateCbamComparison,
  calculateCostEur,
  calculateDefaultSeeWithMarkup,
  calculatePayablePerTonne,
  calculateSavingsEur,
  calculateSefa,
  explainCbamCalculation,
  getIllustrativeExampleInputs,
  loadCbamConfig,
  loadCbamSources,
  resolveInputsFromConfig,
} from "../cbam.ts";

describe("VeriCEMS TypeScript CBAM Calculator (web/src/lib/cbam.ts)", () => {
  it("loads cbam_config.json and enforces NEEDS_SOURCE honesty rules", () => {
    const cfg = loadCbamConfig();
    assert.equal(cfg.price_eur_per_tco2e.value, 82.32);
    assert.equal(cfg.price_eur_per_tco2e.quarter, "2026-Q3");
    assert.equal(cfg.price_eur_per_tco2e.status, "VERIFIED_SECONDARY");

    const faf2026 = cfg.free_allocation_factor_by_year["2026"];
    assert.equal(typeof faf2026, "object");
    if (typeof faf2026 === "object") {
      assert.equal(faf2026.value, 0.975);
      assert.equal(faf2026.status, "VERIFIED_SECONDARY");
    }

    const cscf2026 = cfg.cscf_by_year["2026"];
    assert.equal(typeof cscf2026, "object");
    if (typeof cscf2026 === "object") {
      assert.equal(cscf2026.value, null);
      assert.equal(cscf2026.status, "NEEDS_SOURCE");
    }

    assert.equal(cfg.benchmark_tco2e_per_t.value, null);
    assert.equal(cfg.benchmark_tco2e_per_t.status, "NEEDS_SOURCE");
    assert.equal(cfg.default_value_base_tco2e_per_t.value, null);
    assert.equal(cfg.default_value_base_tco2e_per_t.status, "NEEDS_SOURCE");
  });

  it("loads calculator/sources.json with all 7 required regulations", () => {
    const sources = loadCbamSources();
    assert.equal(
      sources.commission_cbam_legislation_url,
      "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en"
    );
    const regs = Object.keys(sources.regulations);
    assert.ok(regs.includes("2023/956"));
    assert.ok(regs.includes("2025/2083"));
    assert.ok(regs.includes("2025/2546"));
    assert.ok(regs.includes("2025/2547"));
    assert.ok(regs.includes("2025/2548"));
    assert.ok(regs.includes("2025/2620"));
    assert.ok(regs.includes("2025/2621 (as corrected by 2026/1740)"));
  });

  for (const vector of sharedVectors.valid_vectors) {
    it(`reproduces shared valid vector: ${vector.name}`, () => {
      const inp = vector.inputs;
      const exp = vector.expected;

      const result = calculateCbamComparison({
        year: inp.year,
        tonnes_shipped: inp.tonnes_shipped,
        verified_see: inp.verified_see,
        default_value_base: inp.default_value_base,
        benchmark: inp.benchmark,
        default_benchmark: inp.default_benchmark,
        free_allocation_factor: inp.free_allocation_factor,
        cscf: inp.cscf,
        default_markup: inp.default_markup,
        certificate_price: inp.certificate_price,
        price_quarter: inp.price_quarter,
        tag: vector.tag,
      });

      assert.equal(result.tag, "ILLUSTRATIVE");
      assert.equal(result.net_liability_after_free_allocation, true);
      assert.equal(result.sefa_verified, exp.sefa_verified);
      assert.equal(result.sefa_default, exp.sefa_default);
      assert.equal(result.default_see_with_markup, exp.default_see_with_markup);
      assert.equal(result.payable_per_tonne_verified, exp.payable_per_tonne_verified);
      assert.equal(result.payable_per_tonne_default, exp.payable_per_tonne_default);
      assert.equal(result.total_payable_tonnes_verified, exp.total_payable_tonnes_verified);
      assert.equal(result.total_payable_tonnes_default, exp.total_payable_tonnes_default);
      assert.equal(result.cost_with_verified_eur, exp.cost_with_verified_eur);
      assert.equal(result.cost_with_default_eur, exp.cost_with_default_eur);
      assert.equal(result.savings_per_tonne_tco2e, exp.savings_per_tonne_tco2e);
      assert.equal(result.savings_eur, exp.savings_eur);

      const steps = explainCbamCalculation(result);
      assert.equal(steps.length, 7);
      assert.equal(steps[4].result, exp.cost_with_verified_eur);
      assert.equal(steps[5].result, exp.cost_with_default_eur);
      assert.equal(steps[6].result, exp.savings_eur);
    });
  }

  it("reproduces Guide Appendix A illustrative worked example (EUR 22,020.60 / EUR 47,951.40 / EUR 25,930.80)", () => {
    const inputs = getIllustrativeExampleInputs();
    assert.equal(inputs.tag, "ILLUSTRATIVE");
    const result = calculateCbamComparison(inputs);

    assert.equal(result.sefa_verified, 1.365);
    assert.equal(result.default_see_with_markup, 2.53);
    assert.equal(result.payable_per_tonne_verified, 0.535);
    assert.equal(result.payable_per_tonne_default, 1.165);
    assert.equal(result.cost_with_verified_eur, 22020.6);
    assert.equal(result.cost_with_default_eur, 47951.4);
    assert.equal(result.savings_eur, 25930.8);
    assert.equal(
      result.steps[0].substituted,
      "SEFA = 0.975 * 1.00 * 1.40 = 1.365 tCO2e/t"
    );
  });

  for (const errVec of sharedVectors.error_vectors) {
    it(`enforces shared error vector: ${errVec.name}`, () => {
      const inp = errVec.inputs;
      if (errVec.expected_error === "NeedsSourceError") {
        assert.throws(
          () => calculateCbamComparison(inp),
          (err: unknown) => {
            assert.ok(err instanceof NeedsSourceError);
            if ("missing_parameter" in errVec && errVec.missing_parameter) {
              assert.ok(err.missing_parameters.includes(errVec.missing_parameter));
            }
            return true;
          }
        );
      } else if (errVec.expected_error === "CBAMValidationError") {
        assert.throws(
          () => calculateCbamComparison(inp),
          (err: unknown) => err instanceof CBAMValidationError
        );
      }
    });
  }

  it("throws NeedsSourceError when resolving from raw config without overrides for null parameters", () => {
    const cfg = loadCbamConfig();
    assert.throws(
      () =>
        resolveInputsFromConfig(cfg, {
          year: 2026,
          tonnes_shipped: 500,
          verified_see: 1.9,
        }),
      (err: unknown) => {
        assert.ok(err instanceof NeedsSourceError);
        assert.ok(err.missing_parameters.includes("default_value_base_tco2e_per_t"));
        assert.ok(err.missing_parameters.includes("benchmark_tco2e_per_t"));
        assert.ok(err.missing_parameters.includes("cscf_by_year[2026]"));
        return true;
      }
    );
  });

  it("validates pure helper functions for zero floor and null parameters", () => {
    assert.equal(calculateSefa(0.975, 1.0, 1.4), 1.365);
    assert.equal(calculateDefaultSeeWithMarkup(2.3, 0.1), 2.53);
    assert.equal(calculatePayablePerTonne(1.0, 1.365), 0);
    assert.equal(calculateCostEur(0, 0.535, 82.32), 0);
    assert.equal(calculateSavingsEur(47951.4, 22020.6), 25930.8);

    assert.throws(() => calculateSefa(0.975, null, 1.4), NeedsSourceError);
    assert.throws(() => calculatePayablePerTonne(null, 1.365), NeedsSourceError);
    assert.throws(() => calculateCostEur(-5, 0.535, 82.32), CBAMValidationError);
  });
});
