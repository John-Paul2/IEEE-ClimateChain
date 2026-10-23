import React, { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Search, AlertTriangle } from "lucide-react";
import type { ThreatModelEntry } from "../lib/benchmarkData";
import { EmptyState } from "./EmptyState";
import { Badge } from "./Badge";

interface ThreatModelTableProps {
  entries: ThreatModelEntry[] | null;
  onRefresh?: () => void;
}

export const ThreatModelTable: React.FC<ThreatModelTableProps> = ({ entries, onRefresh }) => {
  const [search, setSearch] = useState("");

  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Threat Model Document Not Found"
        description="The threat model document is not present in the workspace. When created with attacks, defensive controls, and remaining weaknesses, the threat matrix will render here automatically."
        action={
          onRefresh
            ? {
                label: "Check for threat model document",
                onClick: onRefresh,
              }
            : undefined
        }
      />
    );
  }

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const atk = (e.attack || "").toLowerCase();
    const def = (e.defence || (e as any).defense || "").toLowerCase();
    const weak = (e.remaining_weakness || (e as any).weakness || "").toLowerCase();
    return atk.includes(q) || def.includes(q) || weak.includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-raised p-3 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-verified" aria-hidden="true" />
          <span className="text-sm font-semibold text-text">Threat Matrix & Residual Weakness</span>
          <Badge variant="verified" label={`${entries.length} Threats Catalogued`} />
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search threat matrix..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-sunken border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-info"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-card shadow-sm">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-surface-raised border-b border-border text-muted uppercase text-[11px] font-mono tracking-wider">
              <th className="px-4 py-3 font-semibold w-1/4">Attack Vector</th>
              <th className="px-4 py-3 font-semibold w-1/3 text-info">Defensive Control</th>
              <th className="px-4 py-3 font-semibold w-5/12 text-warning">Remaining Weakness & Residual Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.map((item, idx) => {
              const defenceText = item.defence || (item as any).defense || "—";
              const weaknessText = item.remaining_weakness || (item as any).weakness || "—";

              return (
                <tr
                  key={idx}
                  className={`hover:bg-surface-raised/40 transition-colors ${
                    idx % 2 === 0 ? "bg-surface/20" : "bg-transparent"
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-text align-top">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-flagged flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{item.attack}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text align-top leading-relaxed font-sans">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-verified flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{defenceText}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted align-top leading-relaxed text-xs">
                    <span className="text-warning font-medium">⚠️ </span>
                    <span>{weaknessText}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
