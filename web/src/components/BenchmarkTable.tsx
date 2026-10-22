import React, { useState, useMemo } from "react";
import { Search, ArrowUpDown, Layers } from "lucide-react";
import type { BenchmarkSummary, DetectorKey, AttackSummaryEntry } from "../lib/benchmarkData";
import { DETECTOR_METADATA, formatMeanStd } from "../lib/benchmarkData";

interface BenchmarkTableProps {
  summary: BenchmarkSummary;
}

type SortField = "name" | "co2" | "recall" | "precision" | "fpr" | "auroc" | "delay";
type SortOrder = "asc" | "desc";

export const BenchmarkTable: React.FC<BenchmarkTableProps> = ({ summary }) => {
  const [selectedDetector, setSelectedDetector] = useState<DetectorKey>("proposed");
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const attacksList: AttackSummaryEntry[] = useMemo(() => {
    if (!summary?.attacks) return [];
    return Object.values(summary.attacks);
  }, [summary]);

  const families = useMemo(() => {
    const famSet = new Set<string>();
    attacksList.forEach((a) => famSet.add(a.attack_family));
    return ["all", ...Array.from(famSet)];
  }, [attacksList]);

  const filteredAttacks = useMemo(() => {
    let list = attacksList.filter((a) => {
      const matchesSearch =
        a.attack_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.attack_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFamily = selectedFamily === "all" || a.attack_family === selectedFamily;
      return matchesSearch && matchesFamily;
    });

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortField === "name") {
        return sortOrder === "asc"
          ? a.attack_name.localeCompare(b.attack_name)
          : b.attack_name.localeCompare(a.attack_name);
      }

      if (sortField === "co2") {
        valA = a.co2_reduction_achieved_pct?.mean ?? 0;
        valB = b.co2_reduction_achieved_pct?.mean ?? 0;
      } else {
        const detA = a.detectors[selectedDetector];
        const detB = b.detectors[selectedDetector];
        if (sortField === "recall") {
          valA = detA?.recall?.mean ?? 0;
          valB = detB?.recall?.mean ?? 0;
        } else if (sortField === "precision") {
          valA = detA?.precision?.mean ?? 0;
          valB = detB?.precision?.mean ?? 0;
        } else if (sortField === "fpr") {
          valA = detA?.fpr?.mean ?? 0;
          valB = detB?.fpr?.mean ?? 0;
        } else if (sortField === "auroc") {
          valA = detA?.auroc?.mean ?? 0;
          valB = detB?.auroc?.mean ?? 0;
        } else if (sortField === "delay") {
          valA = detA?.detection_delay_hours?.mean ?? 0;
          valB = detB?.detection_delay_hours?.mean ?? 0;
        }
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return list;
  }, [attacksList, searchQuery, selectedFamily, sortField, sortOrder, selectedDetector]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "recall" || field === "auroc" || field === "co2" ? "desc" : "asc");
    }
  };

  const macroMetrics = summary?.overall_macro_average?.[selectedDetector];

  return (
    <div className="space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface-raised p-3.5 rounded-xl border border-border">
        {/* Detector Selectors */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(DETECTOR_METADATA) as DetectorKey[]).map((key) => {
            const meta = DETECTOR_METADATA[key];
            const isSelected = selectedDetector === key && !comparisonMode;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedDetector(key);
                  setComparisonMode(false);
                }}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
                  isSelected
                    ? "bg-surface text-text border border-info/50 shadow-sm font-bold"
                    : "bg-surface-sunken/60 text-muted hover:text-text border border-border/60 hover:bg-surface-sunken"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                {meta.shortLabel}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              comparisonMode
                ? "bg-info/20 text-info border border-info/60 font-bold"
                : "bg-surface-sunken/60 text-muted hover:text-text border border-border/60"
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>4-Detector Compare</span>
          </button>
        </div>

        {/* Search & Family Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search attacks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-info"
            />
          </div>

          <div className="relative">
            <select
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              className="bg-surface-sunken border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-info font-mono"
              aria-label="Filter by attack family"
            >
              {families.map((fam) => (
                <option key={fam} value={fam}>
                  {fam === "all" ? "All Families" : fam}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-card shadow-sm">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-surface-raised border-b border-border text-muted uppercase text-[11px] font-mono tracking-wider">
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort("name")}>
                <div className="flex items-center gap-1.5">
                  <span>Attack Scenario</span>
                  <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                </div>
              </th>
              <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("co2")}>
                <div className="flex items-center justify-end gap-1.5">
                  <span>CO₂ Shaved</span>
                  <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                </div>
              </th>

              {comparisonMode ? (
                <>
                  <th className="px-3 py-3 text-right font-semibold text-verified">Proposed Recall</th>
                  <th className="px-3 py-3 text-right font-semibold text-info">B2 Physics Recall</th>
                  <th className="px-3 py-3 text-right font-semibold text-[#A78BFA]">Autoencoder Recall</th>
                  <th className="px-3 py-3 text-right font-semibold text-muted">B1 Static Recall</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("recall")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Recall (Mean ± Std)</span>
                      <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("precision")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Precision</span>
                      <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("fpr")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>False Pos. Rate</span>
                      <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("auroc")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>AUROC</span>
                      <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort("delay")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Lag (h)</span>
                      <ArrowUpDown className="w-3 h-3 text-muted" aria-hidden="true" />
                    </div>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 font-mono text-xs">
            {filteredAttacks.map((atk, idx) => {
              const det = atk.detectors[selectedDetector];
              const recallMean = det?.recall?.mean ?? 0;
              const isBelowFifty = recallMean < 0.5;

              return (
                <tr
                  key={atk.attack_id}
                  className={`hover:bg-surface-raised/50 transition-colors ${
                    idx % 2 === 0 ? "bg-surface/20" : "bg-transparent"
                  }`}
                >
                  <td className="px-4 py-3 font-sans">
                    <div className="font-semibold text-text flex items-center gap-1.5">
                      <span>{atk.attack_name}</span>
                      {isBelowFifty && !comparisonMode && (
                        <span
                          title="Proposed detector recall below 50%"
                          className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded bg-flagged/20 text-flagged border border-flagged/40 font-mono"
                        >
                          &lt;50%
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-muted">{atk.attack_id}</div>
                  </td>

                  <td className="px-3 py-3 text-right text-text">
                    <span className="font-semibold text-info">
                      {formatMeanStd(atk.co2_reduction_achieved_pct, { isPercent: true, decimals: 1 })}
                    </span>
                  </td>

                  {comparisonMode ? (
                    <>
                      {/* Proposed Recall */}
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`font-bold ${
                            atk.detectors.proposed.recall.mean >= 0.8
                              ? "text-verified"
                              : atk.detectors.proposed.recall.mean < 0.5
                              ? "text-flagged"
                              : "text-warning"
                          }`}
                        >
                          {formatMeanStd(atk.detectors.proposed.recall)}
                        </span>
                      </td>

                      {/* B2 Physics Recall */}
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`font-medium ${
                            atk.detectors.baseline_2_physics.recall.mean >= 0.8
                              ? "text-info"
                              : atk.detectors.baseline_2_physics.recall.mean < 0.5
                              ? "text-flagged"
                              : "text-warning"
                          }`}
                        >
                          {formatMeanStd(atk.detectors.baseline_2_physics.recall)}
                        </span>
                      </td>

                      {/* Standalone Autoencoder Recall */}
                      <td className="px-3 py-3 text-right text-[#A78BFA]">
                        {formatMeanStd(atk.detectors.autoencoder_only.recall)}
                      </td>

                      {/* Baseline 1 Static Recall */}
                      <td className="px-3 py-3 text-right text-muted">
                        {formatMeanStd(atk.detectors.baseline_1_static.recall)}
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Single Detector Metrics */}
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`font-bold ${
                            recallMean >= 0.85
                              ? "text-verified"
                              : recallMean < 0.5
                              ? "text-flagged"
                              : "text-warning"
                          }`}
                        >
                          {formatMeanStd(det?.recall)}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right text-text">
                        {formatMeanStd(det?.precision)}
                      </td>

                      <td className="px-3 py-3 text-right text-muted">
                        {formatMeanStd(det?.fpr)}
                      </td>

                      <td className="px-3 py-3 text-right font-medium text-text">
                        {formatMeanStd(det?.auroc, { isPercent: false, decimals: 3 })}
                      </td>

                      <td className="px-3 py-3 text-right text-muted">
                        {formatMeanStd(det?.detection_delay_hours, { isPercent: false, decimals: 1, unit: "h" })}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Macro Average Footer */}
          <tfoot>
            <tr className="bg-surface-raised/90 border-t-2 border-border font-mono text-xs">
              <td className="px-4 py-3 font-sans font-bold text-text">
                <div className="flex items-center gap-2">
                  <span className="text-verified">■</span>
                  <span>Macro Average ({filteredAttacks.length} attacks across 5 splits)</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right text-muted">—</td>

              {comparisonMode ? (
                <>
                  <td className="px-3 py-3 text-right font-bold text-verified">
                    {formatMeanStd(summary.overall_macro_average.proposed?.recall)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-info">
                    {formatMeanStd(summary.overall_macro_average.baseline_2_physics?.recall)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-[#A78BFA]">
                    {formatMeanStd(summary.overall_macro_average.autoencoder_only?.recall)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-muted">
                    {formatMeanStd(summary.overall_macro_average.baseline_1_static?.recall)}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-3 text-right font-bold text-verified">
                    {formatMeanStd(macroMetrics?.recall)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-text">
                    {formatMeanStd(macroMetrics?.precision)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-muted">
                    {formatMeanStd(macroMetrics?.fpr)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-text">
                    {formatMeanStd(macroMetrics?.auroc, { isPercent: false, decimals: 3 })}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-muted">
                    {formatMeanStd(macroMetrics?.detection_delay_hours, { isPercent: false, decimals: 1, unit: "h" })}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-[11px] text-muted flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1">
        <span>
          Showing {filteredAttacks.length} of {attacksList.length} attack configurations. Evaluated on held-out test facilities.
        </span>
        <span className="font-mono text-xs">
          Active detector: <strong className="text-text">{DETECTOR_METADATA[selectedDetector].label}</strong>
        </span>
      </div>
    </div>
  );
};
