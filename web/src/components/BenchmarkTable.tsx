import React, { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { BenchmarkSummary, AttackSummaryEntry } from "../lib/benchmarkData";
import { formatMeanStd } from "../lib/benchmarkData";
import { Chip } from "./Chip";

interface BenchmarkTableProps {
  summary: BenchmarkSummary;
}

const WHY_GETS_THROUGH: Record<string, string> = {
  slow_drift_0_1pct_day:
    "Drift stays inside natural boiler variance and validation tolerance (1.2% over 12 days).",
  slow_drift_0_3pct_day:
    "Cumulative drift stays below threshold for first 9 to 11 operating days.",
  slow_drift_0_5pct_day:
    "Drift magnitude crosses stoichiometric residual threshold after 4 days.",
  adaptive_whitebox_b_coordinated_insider:
    "Compromised fuel ledger and stack analyzer hide within electrical thermal efficiency margins.",
  adaptive_whitebox_a_single_source:
    "Cross-source mismatch against fuel ledger catches single-source stack tampering.",
  constant_scaling_5pct:
    "Caught by stoichiometric mass-balance residual against gross load envelope.",
  constant_scaling_10pct:
    "Caught immediately by mass-balance residual check on gross electrical load.",
  constant_scaling_20pct:
    "Large stoichiometric residual triggers immediate mass-balance physics alert.",
  constant_scaling_30pct:
    "Severe stoichiometric divergence triggers instant mass-balance detection.",
  flatline_injection:
    "Zero-variance and spectral repeat detector flag unvarying sensor telemetry.",
  naive_replay:
    "Historical packet sequence number and cryptographic signature checks fail.",
  time_shifted_replay:
    "Re-signed timestamps fail cross-source correlation with gross power meter.",
  synthetic_noise_on_flatline:
    "Added noise fails autoencoder reconstruction and correlation checks.",
  selective_packet_dropping:
    "Sequence gap check immediately flags missing hourly sequence intervals.",
};

export const BenchmarkTable: React.FC<BenchmarkTableProps> = ({ summary }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const attacksList: AttackSummaryEntry[] = useMemo(() => {
    if (!summary?.attacks) return [];
    const list = Object.values(summary.attacks);
    // Sort deterministically by scenario number / name
    list.sort((a, b) => a.attack_name.localeCompare(b.attack_name));
    return list;
  }, [summary]);

  const toggleRow = (attackId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(attackId)) {
        next.delete(attackId);
      } else {
        next.add(attackId);
      }
      return next;
    });
  };

  return (
    <div className="bg-surface border border-hairline rounded-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50 text-xs font-heading font-semibold text-muted-strong">
              <th className="px-4 py-3">Attack</th>
              <th className="px-4 py-3">Caught</th>
              <th className="px-4 py-3">Delay</th>
              <th className="px-4 py-3 text-right">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline text-xs font-sans">
            {attacksList.map((atk, idx) => {
              const det = atk.detectors?.proposed;
              const recallMean = det?.recall?.mean ?? 0;
              const isBelowFifty = recallMean < 0.5;
              const isExpanded = expandedRows.has(atk.attack_id);
              const whyText =
                WHY_GETS_THROUGH[atk.attack_id] ||
                "Evaluated across five facility splits against proposed multi-layer detector union.";

              return (
                <React.Fragment key={atk.attack_id}>
                  <tr
                    className={`hover:bg-surface-soft/40 transition-colors ${
                      idx % 2 === 1 ? "bg-surface-soft/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">
                          {atk.attack_name}
                        </span>
                        {isBelowFifty && (
                          <Chip variant="FRAUD" label="Below 50%" size="sm" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-20 sm:w-28 bg-surface-soft h-2 rounded-full overflow-hidden border border-hairline">
                          <div
                            className={`h-full rounded-full transition-all ${
                              recallMean >= 0.8
                                ? "bg-verified"
                                : isBelowFifty
                                ? "bg-brand"
                                : "bg-warning"
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, recallMean * 100)
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs text-ink font-semibold">
                          {formatMeanStd(det?.recall)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-strong">
                        {det?.detection_delay_hours?.mean !== undefined
                          ? `${det.detection_delay_hours.mean.toFixed(1)} h`
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleRow(atk.attack_id)}
                        aria-label={`Why ${atk.attack_name}`}
                        aria-expanded={isExpanded}
                        className="inline-flex items-center justify-center p-1 rounded-pill hover:bg-surface-soft text-muted-strong hover:text-ink transition-colors"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-surface-soft/60">
                      <td colSpan={4} className="px-4 py-2.5 border-t border-hairline">
                        <p className="text-xs text-muted-strong font-sans">
                          {whyText}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
