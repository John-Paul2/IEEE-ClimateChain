/**
 * Benchmark & Provenance Data Loaders for Web UI
 */

// Re-export all types and pure definitions
export * from "./benchmarkTypes";

// Static imports of measured benchmark artifacts
import rawSummary from "../../../results/benchmark_summary.json" with { type: "json" };
import rawManifest from "../../../results/run_manifest.json" with { type: "json" };
import rawMarkdown from "../../../results/WHAT_STILL_GETS_THROUGH.md?raw";

// Static imports of publication figure assets
import rocCurveImg from "../../../results/figures/roc_curves.png";
import adaptiveCurveImg from "../../../results/figures/adaptive_attacker_curve.png";
import recallImg from "../../../results/figures/recall_per_attack_detector.png";

import type {
  BenchmarkSummary,
  RunManifest,
  ThreatModelEntry,
} from "./benchmarkTypes";

// Check for docs/threat_model.json via Vite glob. If not present at build time, evaluates to {}
const threatModelGlob = import.meta.glob<{ default: ThreatModelEntry[] }>(
  "../../../docs/threat_model.json",
  { eager: true }
);

function getInitialThreatModel(): ThreatModelEntry[] | null {
  const values = Object.values(threatModelGlob);
  if (values.length > 0 && values[0]?.default && Array.isArray(values[0].default)) {
    return values[0].default;
  }
  return null;
}

export const benchmarkFigures = {
  rocCurves: rocCurveImg,
  adaptiveAttacker: adaptiveCurveImg,
  recallPerAttack: recallImg,
};

export function getBenchmarkSummary(): BenchmarkSummary {
  return rawSummary as unknown as BenchmarkSummary;
}

export function getRunManifest(): RunManifest {
  return rawManifest as unknown as RunManifest;
}

export function getWhatStillGetsThroughMarkdown(): string {
  return rawMarkdown;
}

export function getThreatModel(): ThreatModelEntry[] | null {
  return getInitialThreatModel();
}
