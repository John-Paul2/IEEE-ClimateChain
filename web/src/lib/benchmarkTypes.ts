/**
 * Benchmark & Provenance Data Types and Definitions
 * Zero-dependency pure TypeScript types and constants.
 */

export type DetectorKey = "proposed" | "baseline_2_physics" | "autoencoder_only" | "baseline_1_static";

export interface MetricMeanStd {
  mean: number;
  std: number;
}

export interface DetectorMetrics {
  recall: MetricMeanStd;
  precision: MetricMeanStd;
  fpr: MetricMeanStd;
  auroc: MetricMeanStd;
  detection_delay_hours: MetricMeanStd;
  detected_series_delay_hours?: MetricMeanStd;
  detected_series_fraction?: MetricMeanStd;
}

export interface AttackSummaryEntry {
  attack_id: string;
  attack_name: string;
  attack_family: string;
  co2_reduction_achieved_pct: MetricMeanStd;
  detectors: Record<DetectorKey, DetectorMetrics>;
}

export interface RocCurveData {
  fpr: number[];
  tpr_mean: number[];
  tpr_std: number[];
  auroc_mean: number;
  auroc_std: number;
}

export interface AdaptivePoint {
  target_reduction_pct: number;
  achieved_reduction_pct_mean: number;
  achieved_reduction_pct_std: number;
  proposed_detection_prob_mean: number;
  proposed_detection_prob_std: number;
  baseline_1_detection_prob_mean: number;
  baseline_1_detection_prob_std: number;
  baseline_2_detection_prob_mean: number;
  baseline_2_detection_prob_std: number;
}

export interface BenchmarkSummary {
  schema_version: string;
  n_splits: number;
  n_attacks: number;
  series_hours_evaluated_per_unit: number;
  attack_window_hours: number;
  attack_window_fraction: number;
  target_validation_fpr: number;
  attacks: Record<string, AttackSummaryEntry>;
  overall_macro_average: Record<DetectorKey, DetectorMetrics>;
  roc_curves_overall: Record<DetectorKey, RocCurveData>;
  adaptive_curve: {
    variant_a_single_source: AdaptivePoint[];
    variant_b_coordinated_insider: AdaptivePoint[];
  };
}

export interface RunManifest {
  schema_version: string;
  base_seed: number;
  split_seeds: number[];
  git_commit_hash: string;
  n_facilities_total: number;
  n_splits: number;
  runtime_seconds: number;
  parameters: {
    attack_window_fraction: number;
    autoencoder_hidden_dim: number;
    autoencoder_latent_dim: number;
    autoencoder_max_epochs: number;
    autoencoder_physics_penalty_weight: number;
    fuel_ledger_synthetic_noise_std_fraction: number;
    rolling_window_hours: number;
    series_hours_per_unit: number;
    target_fpr: number;
  };
  library_versions: Record<string, string>;
  split_onnx_model_hashes: Record<string, string>;
  data_hashes: {
    campd_hourly_processed_parquet_sha256: string;
    preprocessing_manifest_json_sha256: string;
    splits_json_sha256: string;
  };
}

export interface ThreatModelEntry {
  attack: string;
  defence: string;
  remaining_weakness: string;
}

export interface TelemetryChannelProvenance {
  name: string;
  unit: string;
  source: "real" | "synthetic";
  epaField?: string;
  isDerivedPart75: boolean;
  rationale: string;
}

export const TELEMETRY_CHANNELS_PROVENANCE: TelemetryChannelProvenance[] = [
  {
    name: "gross_load_mw",
    unit: "MW",
    source: "real",
    epaField: "Gross Load (MW)",
    isDerivedPart75: false,
    rationale: "Real electrical output measured by generator revenue meter under 40 CFR Part 75.",
  },
  {
    name: "steam_load_1000_lb_hr",
    unit: "1000 lb/hr",
    source: "real",
    epaField: "Steam Load (1000 lb/hr)",
    isDerivedPart75: false,
    rationale: "Real steam output for steam-producing units (null on purely electric utility units).",
  },
  {
    name: "heat_input_mmbtu",
    unit: "mmBtu",
    source: "real",
    epaField: "Heat Input (mmBtu)",
    isDerivedPart75: true,
    rationale: "Co-derived with CO2 Mass under Part 75 Appendix D/F/G (exhibits stoichiometric circularity).",
  },
  {
    name: "co2_mass_short_tons",
    unit: "short_tons",
    source: "real",
    epaField: "CO2 Mass (short tons)",
    isDerivedPart75: true,
    rationale: "Co-derived from fuel/diluent equations under Part 75; correlated r >= 0.9998 with Heat Input.",
  },
  {
    name: "co2_rate_short_tons_mmbtu",
    unit: "short_tons/mmBtu",
    source: "real",
    epaField: "CO2 Rate (short tons/mmBtu)",
    isDerivedPart75: true,
    rationale: "Stoichiometric emission rate ratio co-reported in Part 75 telemetry.",
  },
  {
    name: "so2_mass_lbs",
    unit: "lb",
    source: "real",
    epaField: "SO2 Mass (lbs)",
    isDerivedPart75: false,
    rationale: "Reported sulfur dioxide mass emitted under Part 75.",
  },
  {
    name: "nox_mass_lbs",
    unit: "lb",
    source: "real",
    epaField: "NOx Mass (lbs)",
    isDerivedPart75: false,
    rationale: "Reported nitrogen oxides mass emitted under Part 75.",
  },
  {
    name: "op_time_fraction",
    unit: "fraction 0..1",
    source: "real",
    epaField: "Operating Time",
    isDerivedPart75: false,
    rationale: "Fraction of the clock hour during which unit operated under Part 75.",
  },
  {
    name: "synthetic_stack_o2_pct",
    unit: "% vol dry",
    source: "synthetic",
    isDerivedPart75: false,
    rationale: "Simulated combustion excess air; absent from hourly EPA CAMPD bulk files.",
  },
  {
    name: "synthetic_flue_temp_c",
    unit: "°C",
    source: "synthetic",
    isDerivedPart75: false,
    rationale: "Simulated stack flue temperature as thermal load function; absent from hourly CAMPD bulk files.",
  },
  {
    name: "synthetic_stack_flow_kscfm",
    unit: "kscfm",
    source: "synthetic",
    isDerivedPart75: false,
    rationale: "Simulated stack volumetric flow rate from combustion models; absent from hourly CAMPD bulk files.",
  },
  {
    name: "synthetic_fuel_flow_mmbtu_indep",
    unit: "mmBtu",
    source: "synthetic",
    isDerivedPart75: false,
    rationale: "Independent custody-transfer fuel meter cross-check signal (noise std=0.15%) used to break Part 75 circularity.",
  },
];

export const DETECTOR_METADATA: Record<DetectorKey, { label: string; shortLabel: string; color: string; description: string }> = {
  proposed: {
    label: "Proposed Multi-Layer Union Detector",
    shortLabel: "Proposed (Union)",
    color: "#2DD4BF", // verified / teal
    description: "Multi-layer union of static range, zero-variance, sequence gap, mass-balance physics, and physics-informed autoencoder.",
  },
  baseline_2_physics: {
    label: "Baseline 2: Mass-Balance & Load Physics",
    shortLabel: "B2 Physics",
    color: "#60A5FA", // info / blue
    description: "Deterministic stoichiometric mass-balance residual check against gross electrical load envelope.",
  },
  autoencoder_only: {
    label: "Standalone Physics-Informed Autoencoder",
    shortLabel: "Autoencoder Only",
    color: "#A78BFA", // purple
    description: "Neural autoencoder reconstruction residual without hard stoichiometric or sequence gates.",
  },
  baseline_1_static: {
    label: "Baseline 1: Static Plausibility Bounds",
    shortLabel: "B1 Static",
    color: "#9CA3AF", // gray
    description: "Standard min/max physical range checks on individual channels without cross-channel correlations.",
  },
};

/**
 * Format helper for mean +/- std.
 */
export function formatMeanStd(
  metric: MetricMeanStd | undefined,
  options?: { isPercent?: boolean; decimals?: number; unit?: string }
): string {
  if (!metric) return "—";
  const { isPercent = true, decimals = 1, unit = "" } = options || {};
  if (isPercent) {
    const meanPct = (metric.mean * 100).toFixed(decimals);
    const stdPct = (metric.std * 100).toFixed(decimals);
    return `${meanPct}% ± ${stdPct}%`;
  }
  const meanVal = metric.mean.toFixed(decimals);
  const stdVal = metric.std.toFixed(decimals);
  return `${meanVal} ± ${stdVal}${unit ? ` ${unit}` : ""}`;
}
