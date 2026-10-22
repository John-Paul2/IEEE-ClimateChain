import React, { useState, useEffect } from "react";
import {
  BarChart3,
  ShieldAlert,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Shield,
  Database,
  Terminal,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

import {
  getBenchmarkSummary,
  getRunManifest,
  getWhatStillGetsThroughMarkdown,
  getThreatModel,
  type BenchmarkSummary,
  type RunManifest,
  type ThreatModelEntry,
} from "../lib/benchmarkData";

import { BenchmarkTable } from "../components/BenchmarkTable";
import { BenchmarkCharts } from "../components/BenchmarkCharts";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { ThreatModelTable } from "../components/ThreatModelTable";
import { DataProvenancePanel } from "../components/DataProvenancePanel";
import { ReproduceBox } from "../components/ReproduceBox";

export const BenchmarkPage: React.FC = () => {
  const { state } = useData();
  const { showToast } = useToast();

  // Data states
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [manifest, setManifest] = useState<RunManifest | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [threatModel, setThreatModel] = useState<ThreatModelEntry[] | null>(null);

  // Status & Missing file simulation controls
  const [loading, setLoading] = useState<boolean>(true);
  const [simulatedMissing, setSimulatedMissing] = useState<{
    summary?: boolean;
    manifest?: boolean;
    markdown?: boolean;
    threatModel?: boolean;
  }>({});

  const loadData = () => {
    setLoading(true);
    try {
      const s = getBenchmarkSummary();
      const m = getRunManifest();
      const md = getWhatStillGetsThroughMarkdown();
      const tm = getThreatModel();

      setSummary(s);
      setManifest(m);
      setMarkdown(md);
      setThreatModel(tm);
    } catch (err) {
      console.error("Error loading benchmark artifacts:", err);
      showToast("error", "Failed to load benchmark files", String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const effectiveSummary = simulatedMissing.summary ? null : summary;
  const effectiveManifest = simulatedMissing.manifest ? null : manifest;
  const effectiveMarkdown = simulatedMissing.markdown ? null : markdown;
  const effectiveThreatModel = simulatedMissing.threatModel ? null : threatModel;

  const proposedMacro = effectiveSummary?.overall_macro_average?.proposed;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Benchmark & Threat Model
            </h1>
            <Badge variant="verified" label="CBAM-Aligned Empirical Evaluation" />
          </div>
          <p className="text-sm text-muted">
            Empirical evaluation against 8 tamper strategies (14 configurations) evaluated on US EPA CAMPD facility-grouped splits
          </p>
        </div>

        {/* State Indicators & Missing State Simulator */}
        <div className="flex flex-wrap items-center gap-2">
          {state?.attack && state.attack !== "none" ? (
            <Badge variant="flagged" label={`ACTIVE ATTACK: ${state.attack}`} />
          ) : (
            <Badge variant="muted" label="GATEWAY: NORMAL MODE" />
          )}

          {/* Missing File Simulation Drawer/Dropdown for Verification */}
          <div className="relative inline-block text-left">
            <select
              value={
                simulatedMissing.summary
                  ? "missing_summary"
                  : simulatedMissing.markdown
                  ? "missing_markdown"
                  : simulatedMissing.manifest
                  ? "missing_manifest"
                  : "all_present"
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "missing_summary") {
                  setSimulatedMissing({ summary: true });
                  showToast("warning", "Simulating Missing File", "results/benchmark_summary.json set to null");
                } else if (val === "missing_markdown") {
                  setSimulatedMissing({ markdown: true });
                  showToast("warning", "Simulating Missing File", "results/WHAT_STILL_GETS_THROUGH.md set to null");
                } else if (val === "missing_manifest") {
                  setSimulatedMissing({ manifest: true });
                  showToast("warning", "Simulating Missing File", "results/run_manifest.json set to null");
                } else {
                  setSimulatedMissing({});
                  showToast("info", "Real Data Restored", "All files loaded from results/ and docs/");
                }
              }}
              aria-label="Simulate Missing Files State"
              className="bg-surface-raised border border-border text-xs text-muted hover:text-text rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-info font-mono"
            >
              <option value="all_present">State: Real Files Loaded</option>
              <option value="missing_summary">Simulate: Missing benchmark_summary.json</option>
              <option value="missing_markdown">Simulate: Missing WHAT_STILL_GETS_THROUGH.md</option>
              <option value="missing_manifest">Simulate: Missing run_manifest.json</option>
            </select>
          </div>
        </div>
      </div>

      {/* 1. Macro KPI Tiles from benchmark_summary.json (No Hardcoded Numbers) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : effectiveSummary && proposedMacro ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatTile
            label="Macro Recall (Proposed)"
            value={`${(proposedMacro.recall.mean * 100).toFixed(1)}%`}
            delta={{ value: `± ${(proposedMacro.recall.std * 100).toFixed(1)}% (5 splits)`, isPositive: true }}
            variant="verified"
            icon={ShieldAlert}
          />
          <StatTile
            label="Macro Precision"
            value={`${(proposedMacro.precision.mean * 100).toFixed(1)}%`}
            delta={{ value: `± ${(proposedMacro.precision.std * 100).toFixed(1)}%`, isPositive: true }}
            variant="verified"
            icon={CheckCircle2}
          />
          <StatTile
            label="Empirical FPR"
            value={`${(proposedMacro.fpr.mean * 100).toFixed(2)}%`}
            delta={{ value: `Target ≤ ${(effectiveSummary.target_validation_fpr * 100).toFixed(1)}%`, isPositive: true }}
            variant="verified"
            icon={Zap}
          />
          <StatTile
            label="Overall AUROC"
            value={proposedMacro.auroc.mean.toFixed(3)}
            delta={{ value: `± ${proposedMacro.auroc.std.toFixed(3)}`, isPositive: true }}
            variant="verified"
            icon={BarChart3}
          />
          <StatTile
            label="Detection Lag"
            value={proposedMacro.detection_delay_hours.mean.toFixed(1)}
            unit="hours"
            delta={{ value: `± ${proposedMacro.detection_delay_hours.std.toFixed(1)}h`, isPositive: false }}
            variant="info"
            icon={Clock}
          />
        </div>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Macro Summary Metrics Unavailable"
          description="results/benchmark_summary.json could not be loaded. Run 'make benchmark' to produce summary results."
        />
      )}

      {/* 2. Attack x Detector Summary Table */}
      <section aria-labelledby="section-attack-table" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="section-attack-table" className="text-lg font-bold text-text">
              1. Attack × Detector Empirical Benchmark
            </h2>
            <p className="text-xs text-muted">
              Evaluated across 14 configurations on held-out test facilities with strictly out-of-fold calibration
            </p>
          </div>
        </div>

        {effectiveSummary ? (
          <BenchmarkTable summary={effectiveSummary} />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Benchmark Summary Data Missing"
            description="results/benchmark_summary.json is missing or corrupted. The summary table cannot be rendered without empirical results."
            action={{
              label: "Reload Real Files",
              onClick: () => setSimulatedMissing({}),
            }}
          />
        )}
      </section>

      {/* 3. ROC Curves & Adaptive Attacker Curve */}
      <section aria-labelledby="section-curves" className="space-y-3">
        <div>
          <h2 id="section-curves" className="text-lg font-bold text-text">
            2. Receiver Operating Characteristic & Adaptive Attacker Sweep
          </h2>
          <p className="text-xs text-muted">
            101-point ROC curves and white-box adaptive evasion limits (Variants A and B)
          </p>
        </div>

        {effectiveSummary ? (
          <BenchmarkCharts summary={effectiveSummary} />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Curve Data Missing"
            description="results/benchmark_summary.json is missing. Cannot re-plot ROC and adaptive attacker curves."
          />
        )}
      </section>

      {/* 4. Prominent Disclosure: "What Still Gets Through" */}
      <section aria-labelledby="section-what-still-gets-through" className="space-y-3">
        <div>
          <h2 id="section-what-still-gets-through" className="text-lg font-bold text-text flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" aria-hidden="true" />
            <span>3. Prominent Disclosure: What Still Gets Through</span>
          </h2>
          <p className="text-xs text-muted">
            Mandatory honesty disclosure of residual vulnerabilities rendered directly from results/WHAT_STILL_GETS_THROUGH.md
          </p>
        </div>

        {effectiveMarkdown ? (
          <div className="p-6 rounded-xl border border-warning/30 bg-surface-card shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-mono text-warning font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warning" aria-hidden="true" />
                <span>Honesty Disclosure: Attacks with Proposed Detector Recall &lt; 50%</span>
              </span>
              <Badge variant="warning" label="AGENTS.md Enforced" />
            </div>

            <MarkdownViewer content={effectiveMarkdown} />
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Disclosure Document Missing"
            description="results/WHAT_STILL_GETS_THROUGH.md is missing. Generate it using 'python -m ml.benchmark.run_benchmark'."
            action={{
              label: "Restore Document",
              onClick: () => setSimulatedMissing({}),
            }}
          />
        )}
      </section>

      {/* 5. Threat Model Table */}
      <section aria-labelledby="section-threat-model" className="space-y-3">
        <div>
          <h2 id="section-threat-model" className="text-lg font-bold text-text flex items-center gap-2">
            <Shield className="w-5 h-5 text-verified" aria-hidden="true" />
            <span>4. Threat Model & Residual Weakness Matrix</span>
          </h2>
          <p className="text-xs text-muted">
            Loaded from docs/threat_model.json when it exists; displays EmptyState if file is absent
          </p>
        </div>

        <ThreatModelTable
          entries={effectiveThreatModel}
          onRefresh={loadData}
        />
      </section>

      {/* 6. Data Provenance Panel */}
      <section aria-labelledby="section-provenance" className="space-y-3">
        <div>
          <h2 id="section-provenance" className="text-lg font-bold text-text flex items-center gap-2">
            <Database className="w-5 h-5 text-info" aria-hidden="true" />
            <span>5. Data Provenance & Run Manifest</span>
          </h2>
          <p className="text-xs text-muted">
            Real vs. synthetic channels, facility counts, splits, seeds, and commit hash from results/run_manifest.json
          </p>
        </div>

        {effectiveManifest ? (
          <DataProvenancePanel manifest={effectiveManifest} />
        ) : (
          <EmptyState
            icon={Database}
            title="Run Manifest Missing"
            description="results/run_manifest.json is missing. The data provenance panel cannot be displayed."
            action={{
              label: "Restore Manifest",
              onClick: () => setSimulatedMissing({}),
            }}
          />
        )}
      </section>

      {/* 7. "Reproduce This" Box */}
      <section aria-labelledby="section-reproduce" className="space-y-3">
        <div>
          <h2 id="section-reproduce" className="text-lg font-bold text-text flex items-center gap-2">
            <Terminal className="w-5 h-5 text-verified" aria-hidden="true" />
            <span>6. Reproduce Results</span>
          </h2>
          <p className="text-xs text-muted">
            Deterministic commands to regenerate all benchmark figures, tables, and manifest files
          </p>
        </div>

        <ReproduceBox />
      </section>
    </div>
  );
};
