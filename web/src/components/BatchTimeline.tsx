import React from "react";
import { CheckCircle2, Clock, ShieldCheck, ShieldAlert } from "lucide-react";
import type { BatchSummary } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
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
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <Skeleton className="h-6 w-48" />
        <div className="flex justify-between">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-1/3 mx-2 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title="Batch Timeline Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !batch) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl ${className}`}>
        <EmptyState
          icon={Clock}
          title="No batch selected"
          description="Timeline lifecycle will appear when a batch is anchored."
        />
      </div>
    );
  }

  const isQuarantined = batch.status === "Quarantined" || batch.status === "Slashed";
  const isVerified = batch.status === "Verified" || batch.status === "Cleared";
  const isFinalised = isQuarantined || isVerified;

  const steps = [
    {
      id: "anchored",
      title: "1. Merkle Root Anchored",
      desc: "32-byte batch root submitted to BatchAnchor contract.",
      status: "complete",
      txHash: batch.tx_hash || batch.anchor_tx_hash,
      timestamp: batch.anchored_at ? new Date(batch.anchored_at * 1000).toLocaleTimeString() : undefined,
    },
    {
      id: "voting",
      title: "2. Committee Commit-Reveal",
      desc: `5 independent verifier nodes vote off-chain (${batch.clean_votes ?? 5} clean, ${batch.fraud_votes ?? 0} fraud).`,
      status: isFinalised ? "complete" : "active",
      badge: isFinalised ? "3-of-5 Quorum Met" : "Voting Window Open",
    },
    {
      id: "finalised",
      title: isQuarantined ? "3. Finalised (FLAGGED)" : "3. Finalised (CLEAN)",
      desc: isQuarantined
        ? "Quorum reached fraud verdict. Batch quarantined to evidence holding."
        : "Quorum verified authentic combustion telemetry. Batch approved for CBAM attestation.",
      status: isFinalised ? (isQuarantined ? "flagged" : "verified") : "pending",
      txHash: batch.finalize_tx_hash,
    },
  ];

  return (
    <div
      role="region"
      aria-label="Batch Consensus Status Timeline"
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm space-y-4 ${className}`}
    >
      {/* Header and Batch Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-info" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text">Batch Consensus Lifecycle Timeline</h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Stage progression from edge batch anchoring to 3-of-5 commit-reveal quorum finalization
          </p>
        </div>

        {/* Selected Batch Selector */}
        {allBatches.length > 0 && onSelectBatch && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Inspect:</span>
            <select
              value={batch.batch_id}
              onChange={(e) => onSelectBatch(Number(e.target.value))}
              aria-label="Select batch for timeline"
              className="text-xs font-mono bg-surface-raised border border-border text-text rounded px-2.5 py-1 focus:outline-none focus:border-info"
            >
              {allBatches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  Batch #{b.batch_id} ({b.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stepper Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step) => {
          const isComplete = step.status === "complete" || step.status === "verified" || step.status === "flagged";
          const isStepFlagged = step.status === "flagged";

          return (
            <div
              key={step.id}
              className={`p-4 rounded-lg border text-left flex flex-col justify-between transition-all ${
                isStepFlagged
                  ? "bg-flagged/10 border-flagged/40"
                  : isComplete
                  ? "bg-surface-raised border-border"
                  : "bg-surface-sunken border-border/60 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono font-bold text-xs text-text">{step.title}</span>
                  {isStepFlagged ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-flagged/20 text-flagged border border-flagged/40">
                      <ShieldAlert className="w-3 h-3" />
                      FLAGGED
                    </span>
                  ) : step.status === "verified" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-verified/20 text-verified border border-verified/40">
                      <ShieldCheck className="w-3 h-3" />
                      CLEAN
                    </span>
                  ) : isComplete ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/30">
                      <CheckCircle2 className="w-3 h-3" />
                      COMPLETE
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted">
                      PENDING
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted leading-relaxed">{step.desc}</p>
              </div>

              {/* Step Meta (Tx Link & Timestamp) */}
              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted">
                {step.timestamp && <span>{step.timestamp}</span>}
                {step.badge && <span className="text-info">{step.badge}</span>}
                {step.txHash ? (
                  <div className="flex items-center gap-1 text-info hover:underline">
                    <span className="text-muted">tx:</span>
                    <HashChip hash={step.txHash} type="tx" truncateLen={3} />
                  </div>
                ) : (
                  <span>--</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
