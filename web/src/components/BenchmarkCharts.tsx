import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp, ShieldAlert, Image as ImageIcon, LineChart as ChartIcon } from "lucide-react";
import type { BenchmarkSummary } from "../lib/benchmarkData";
import { DETECTOR_METADATA, benchmarkFigures } from "../lib/benchmarkData";
import { Badge } from "./Badge";

interface BenchmarkChartsProps {
  summary: BenchmarkSummary;
}

export const BenchmarkCharts: React.FC<BenchmarkChartsProps> = ({ summary }) => {
  const [viewMode, setViewMode] = useState<"interactive" | "publication">("interactive");
  const [selectedFigure, setSelectedFigure] = useState<"roc" | "adaptive" | "recall">("roc");

  // Prepare ROC curve data for Recharts (101 points)
  const rocData = React.useMemo(() => {
    if (!summary?.roc_curves_overall?.proposed?.fpr) return [];
    const fprArr = summary.roc_curves_overall.proposed.fpr;
    return fprArr.map((fprVal, idx) => ({
      fpr: Number((fprVal * 100).toFixed(1)),
      rawFpr: fprVal,
      proposed: Number(((summary.roc_curves_overall.proposed.tpr_mean[idx] ?? 0) * 100).toFixed(2)),
      baseline2: Number(((summary.roc_curves_overall.baseline_2_physics.tpr_mean[idx] ?? 0) * 100).toFixed(2)),
      autoencoder: Number(((summary.roc_curves_overall.autoencoder_only.tpr_mean[idx] ?? 0) * 100).toFixed(2)),
      baseline1: Number(((summary.roc_curves_overall.baseline_1_static.tpr_mean[idx] ?? 0) * 100).toFixed(2)),
      random: Number((fprVal * 100).toFixed(1)),
    }));
  }, [summary]);

  // Prepare Adaptive Attacker curve data for Recharts (10 points)
  const adaptiveData = React.useMemo(() => {
    if (!summary?.adaptive_curve?.variant_a_single_source) return [];
    const varA = summary.adaptive_curve.variant_a_single_source;
    const varB = summary.adaptive_curve.variant_b_coordinated_insider || [];

    return varA.map((ptA, idx) => {
      const ptB = varB[idx];
      return {
        targetReduction: ptA.target_reduction_pct,
        varA_proposed: Number(((ptA.proposed_detection_prob_mean ?? 0) * 100).toFixed(2)),
        varA_b2: Number(((ptA.baseline_2_detection_prob_mean ?? 0) * 100).toFixed(2)),
        varB_proposed: ptB ? Number(((ptB.proposed_detection_prob_mean ?? 0) * 100).toFixed(2)) : 0,
        varB_b2: ptB ? Number(((ptB.baseline_2_detection_prob_mean ?? 0) * 100).toFixed(2)) : 0,
      };
    });
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <ChartIcon className="w-5 h-5 text-info" aria-hidden="true" />
          <span className="text-sm font-semibold text-text">Empirical Curves & Figures</span>
          <Badge
            variant="verified"
            label="5 Facility Splits"
            className="text-[10px]"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-surface-sunken p-1 rounded-lg border border-border/80">
          <button
            type="button"
            onClick={() => setViewMode("interactive")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "interactive"
                ? "bg-surface-raised text-text font-semibold shadow-sm border border-border"
                : "text-muted hover:text-text"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Interactive Plots</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("publication")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              viewMode === "publication"
                ? "bg-surface-raised text-text font-semibold shadow-sm border border-border"
                : "text-muted hover:text-text"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Publication PNGs</span>
          </button>
        </div>
      </div>

      {viewMode === "interactive" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ROC Curves Plot */}
          <div className="p-5 rounded-xl border border-border bg-surface-card flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-text flex items-center gap-2">
                  <span>Receiver Operating Characteristic (ROC)</span>
                </h3>
                <span className="text-xs font-mono text-muted">101 FPR Steps</span>
              </div>
              <p className="text-xs text-muted mb-4">
                Macro-averaged True Positive Rate (Recall) vs False Positive Rate across all 14 evaluated attack scenarios.
              </p>

              {/* Chart Container */}
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rocData} margin={{ top: 20, right: 15, left: 18, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
                    <XAxis
                      dataKey="fpr"
                      stroke="#8FA0BF"
                      tick={{ fill: "#8FA0BF", fontSize: 11 }}
                      unit="%"
                      label={{
                        value: "False Positive Rate (FPR %)",
                        position: "insideBottom",
                        offset: -12,
                        fill: "#8FA0BF",
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      stroke="#8FA0BF"
                      tick={{ fill: "#8FA0BF", fontSize: 11 }}
                      unit="%"
                      domain={[0, 100]}
                      width={52}
                      label={{
                        value: "True Positive Rate (%)",
                        angle: -90,
                        position: "insideLeft",
                        offset: -2,
                        style: { textAnchor: "middle", fill: "#8FA0BF", fontSize: 11 },
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-surface-raised border border-border p-3 rounded-lg shadow-xl text-xs space-y-1 font-mono">
                              <div className="font-bold text-text border-b border-border pb-1">
                                FPR: {data.fpr}%
                              </div>
                              <div className="text-verified">
                                Proposed: {data.proposed}%
                              </div>
                              <div className="text-info">
                                B2 Physics: {data.baseline2}%
                              </div>
                              <div className="text-[#A78BFA]">
                                Autoencoder: {data.autoencoder}%
                              </div>
                              <div className="text-muted">
                                B1 Static: {data.baseline1}%
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      x={2.0}
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      label={({ viewBox }: any) => {
                        if (!viewBox) return null;
                        const x = viewBox.x ?? viewBox.x1 ?? 0;
                        const y = viewBox.y ?? viewBox.y1 ?? 0;
                        return (
                          <text
                            x={x + 10}
                            y={y + 14}
                            fill="#F59E0B"
                            fontSize={10}
                            fontWeight={600}
                            fontFamily="ui-monospace, monospace"
                          >
                            2% FPR
                          </text>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="proposed"
                      stroke={DETECTOR_METADATA.proposed.color}
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline2"
                      stroke={DETECTOR_METADATA.baseline_2_physics.color}
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="autoencoder"
                      stroke={DETECTOR_METADATA.autoencoder_only.color}
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline1"
                      stroke={DETECTOR_METADATA.baseline_1_static.color}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      dot={false}
                    />
                    <Line
                      type="linear"
                      dataKey="random"
                      stroke="#4B5563"
                      strokeDasharray="5 5"
                      strokeWidth={1}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Clean Non-Overlapping HTML Legend */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3 border-t border-border/40 text-[11px] font-mono text-muted-strong">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.proposed.color }} />
                  <span className="text-text font-medium">Proposed (AUROC {(summary.roc_curves_overall.proposed?.auroc_mean ?? 0).toFixed(3)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.baseline_2_physics.color }} />
                  <span>B2 Physics (AUROC {(summary.roc_curves_overall.baseline_2_physics?.auroc_mean ?? 0).toFixed(3)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.autoencoder_only.color }} />
                  <span>Autoencoder (AUROC {(summary.roc_curves_overall.autoencoder_only?.auroc_mean ?? 0).toFixed(3)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.baseline_1_static.color }} />
                  <span>B1 Static (AUROC {(summary.roc_curves_overall.baseline_1_static?.auroc_mean ?? 0).toFixed(3)})</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <span className="w-3 h-0.5 bg-gray-500 inline-block shrink-0" />
                  <span>Random Guess</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted">
              <span>Calibration bound: FPR ≤ 2.0% on clean val plants</span>
              <span className="font-mono text-verified font-semibold">
                AUROC = {(summary.roc_curves_overall.proposed?.auroc_mean ?? 0).toFixed(3)}
              </span>
            </div>
          </div>

          {/* Adaptive Attacker Plot */}
          <div className="p-5 rounded-xl border border-border bg-surface-card flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-text flex items-center gap-2">
                  <span>Adaptive Attacker Response Curves</span>
                </h3>
                <span className="text-xs font-mono text-muted">Target Reduction Sweep</span>
              </div>
              <p className="text-xs text-muted mb-4">
                Detection probability as white-box attacker increases reported CO₂ reduction (Variant A single-source vs. Variant B coordinated insider).
              </p>

              {/* Chart Container */}
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={adaptiveData} margin={{ top: 20, right: 15, left: 18, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
                    <XAxis
                      dataKey="targetReduction"
                      stroke="#8FA0BF"
                      tick={{ fill: "#8FA0BF", fontSize: 11 }}
                      unit="%"
                      label={{
                        value: "Target CO₂ Reduction (%)",
                        position: "insideBottom",
                        offset: -12,
                        fill: "#8FA0BF",
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      stroke="#8FA0BF"
                      tick={{ fill: "#8FA0BF", fontSize: 11 }}
                      unit="%"
                      domain={[0, 100]}
                      width={52}
                      label={{
                        value: "Detection Probability (%)",
                        angle: -90,
                        position: "insideLeft",
                        offset: -2,
                        style: { textAnchor: "middle", fill: "#8FA0BF", fontSize: 11 },
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-surface-raised border border-border p-3 rounded-lg shadow-xl text-xs space-y-1 font-mono">
                              <div className="font-bold text-text border-b border-border pb-1">
                                Target Reduction: {data.targetReduction}%
                              </div>
                              <div className="text-verified">
                                Var A (Proposed): {data.varA_proposed}%
                              </div>
                              <div className="text-info">
                                Var A (B2 Physics): {data.varA_b2}%
                              </div>
                              <div className="text-flagged">
                                Var B Insider (Proposed): {data.varB_proposed}%
                              </div>
                              <div className="text-muted">
                                Var B Insider (B2 Physics): {data.varB_b2}%
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="varA_proposed"
                      stroke={DETECTOR_METADATA.proposed.color}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="varA_b2"
                      stroke={DETECTOR_METADATA.baseline_2_physics.color}
                      strokeWidth={1.8}
                      strokeDasharray="4 2"
                      dot={{ r: 2.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="varB_proposed"
                      stroke="#F43F5E"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="varB_b2"
                      stroke="#9CA3AF"
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Clean Non-Overlapping HTML Legend */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3 border-t border-border/40 text-[11px] font-mono text-muted-strong">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.proposed.color }} />
                  <span className="text-text font-medium">Var A: Proposed Detector</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DETECTOR_METADATA.baseline_2_physics.color }} />
                  <span>Var A: B2 Physics</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#F43F5E]" />
                  <span className="text-text font-medium">Var B (Insider): Proposed Detector</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#9CA3AF]" />
                  <span>Var B (Insider): B2 Physics</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted">
              <span className="flex items-center gap-1 text-flagged">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Var B evades CEMS+fuel ledger checks</span>
              </span>
              <span className="font-mono text-info">Var A caught at ≥ 4% CO₂ shaved</span>
            </div>
          </div>
        </div>
      ) : (
        /* Publication PNG Figures View */
        <div className="p-6 rounded-xl border border-border bg-surface-card space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <button
              type="button"
              onClick={() => setSelectedFigure("roc")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                selectedFigure === "roc"
                  ? "bg-info/20 text-info border border-info/40"
                  : "bg-surface-raised text-muted hover:text-text border border-border"
              }`}
            >
              1. roc_curves.png
            </button>
            <button
              type="button"
              onClick={() => setSelectedFigure("adaptive")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                selectedFigure === "adaptive"
                  ? "bg-info/20 text-info border border-info/40"
                  : "bg-surface-raised text-muted hover:text-text border border-border"
              }`}
            >
              2. adaptive_attacker_curve.png
            </button>
            <button
              type="button"
              onClick={() => setSelectedFigure("recall")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                selectedFigure === "recall"
                  ? "bg-info/20 text-info border border-info/40"
                  : "bg-surface-raised text-muted hover:text-text border border-border"
              }`}
            >
              3. recall_per_attack_detector.png
            </button>
          </div>

          <div className="bg-surface-sunken p-4 rounded-xl border border-border flex flex-col items-center justify-center">
            {selectedFigure === "roc" && (
              <div className="max-w-3xl text-center space-y-2">
                <img
                  src={benchmarkFigures.rocCurves}
                  alt="Overall ROC Curves across all 4 detectors"
                  className="rounded-lg border border-border max-h-[480px] object-contain mx-auto shadow-lg"
                />
                <p className="text-xs font-mono text-muted">
                  Figure 1: ROC Curves — Evaluated across 5 facility splits (base seed 42)
                </p>
              </div>
            )}
            {selectedFigure === "adaptive" && (
              <div className="max-w-3xl text-center space-y-2">
                <img
                  src={benchmarkFigures.adaptiveAttacker}
                  alt="Adaptive Attacker Trade-Off Curve"
                  className="rounded-lg border border-border max-h-[480px] object-contain mx-auto shadow-lg"
                />
                <p className="text-xs font-mono text-muted">
                  Figure 2: Adaptive Attacker Curve — White-box attack sweep (Variants A and B)
                </p>
              </div>
            )}
            {selectedFigure === "recall" && (
              <div className="max-w-3xl text-center space-y-2">
                <img
                  src={benchmarkFigures.recallPerAttack}
                  alt="Recall per attack scenario and detector"
                  className="rounded-lg border border-border max-h-[480px] object-contain mx-auto shadow-lg"
                />
                <p className="text-xs font-mono text-muted">
                  Figure 3: Detection Recall — Breakdown across 14 configurations
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
