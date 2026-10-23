import React from "react";
import { Clock, ShieldAlert, Check } from "lucide-react";
import type { BatchSummary } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface BatchTimelineProps {
  batch?: BatchSummary;
  allBatches?: BatchSummary[];
  onSelectBatch?: (batchId: number) => void;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const BatchTimeline: React.FC<BatchTimelineProps> = ({
  batch,
  allBatches = [],
  onSelectBatch,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card space-y-3 ${className}`}>
        <div className="flex gap-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14 flex-1 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title="Timeline Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !batch) {
    return null;
  }

  const isQuarantined = batch.status === "Quarantined" || batch.status === "Slashed";
  const isVerified = batch.status === "Verified" || batch.status === "Cleared";
  const isFinalised = isQuarantined || isVerified;

  const steps = [
    {
      id: "anchored",
      title: "1. Merkle Root Anchored",
      isDone: true,
      hash: batch.tx_hash || batch.anchor_tx_hash,
    },
    {
      id: "voting",
      title: "2. Committee Commit-Reveal",
      isDone: isFinalised,
      badge: `${batch.clean_votes ?? 5} clean · ${batch.fraud_votes ?? 0} fraud`,
    },
    {
      id: "finalised",
      title: isQuarantined ? "3. Finalised (FLAGGED)" : "3. Finalised (CLEAN)",
      isDone: isFinalised,
      isFlagged: isQuarantined,
      hash: batch.finalize_tx_hash,
    },
  ];

  return (
    <div
      role="region"
      aria-label="Batch Consensus Status Timeline"
      className={`p-4 rounded-card bg-surface border border-hairline shadow-card space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-hairline text-xs">
        <span className="font-heading font-semibold text-ink flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-brand" />
          Status timeline
        </span>

        {allBatches.length > 0 && onSelectBatch && (
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted-strong font-sans">Batch:</span>
            <select
              value={batch.batch_id}
              onChange={(e) => onSelectBatch(Number(e.target.value))}
              aria-label="Select batch for timeline"
              className="bg-surface-soft border border-hairline text-ink rounded-chip px-2 py-0.5 focus:outline-none"
            >
              {allBatches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  #{b.batch_id} ({b.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Three compact timeline chips in a row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((step) => {
          return (
            <div
              key={step.id}
              className={`p-3 rounded-card border transition-all text-xs flex flex-col justify-between ${
                step.isFlagged
                  ? "bg-[#FDECEC] border-red-300 text-[#9B1C1C]"
                  : step.isDone
                  ? "bg-surface-soft border-hairline text-ink"
                  : "bg-surface-soft/50 border-hairline/60 text-muted-strong"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-heading font-bold text-xs truncate">{step.title}</span>
                {step.isFlagged ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-[#9B1C1C] shrink-0" />
                ) : step.isDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-muted-strong shrink-0" />
                )}
              </div>

              <div className="font-mono text-[11px] truncate">
                {step.hash ? (
                  <HashChip hash={step.hash} type="tx" truncateLen={4} />
                ) : step.badge ? (
                  <span className="text-muted-strong">{step.badge}</span>
                ) : (
                  <span className="text-muted-strong">Pending</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
