import React from "react";
import { CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";
import type { VerifierNodeStatus } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface VoteCardProps {
  verifier?: VerifierNodeStatus;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const VoteCard: React.FC<VoteCardProps> = ({
  verifier,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card space-y-3 shadow-card ${className}`}>
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-chip" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title="Verifier Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !verifier) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card text-center text-muted-strong shadow-card ${className}`}>
        <CircleSlash className="w-5 h-5 mx-auto mb-1 text-muted" aria-hidden="true" />
        <p className="text-xs">No verifier data</p>
      </div>
    );
  }

  const isClean = verifier.last_verdict === "clean";
  const isFraud = verifier.last_verdict === "fraud";
  const hasRevealed = isClean || isFraud;

  // Staked ETH formatting (from wei)
  const stakeEth = (Number(BigInt(verifier.staked_amount_wei || "0")) / 1e18).toFixed(2);

  // Short avatar label like "V1" from "VERIFIER-01"
  const avatarLabel =
    verifier.verifier_id?.replace(/^VERIFIER-0?/, "V") || "V";

  const scorePct =
    verifier.last_score_bp !== undefined
      ? Math.round(verifier.last_score_bp / 100)
      : 98;

  // Check if a lazy-verifier mode is active
  const isLazyMode = (verifier as any).mode === "lazy";

  return (
    <div
      role="region"
      aria-label={`Verifier Node ${verifier.verifier_id}`}
      data-testid={`verifier-card-${verifier.verifier_id}`}
      className={`p-4 bg-surface border border-hairline rounded-card shadow-card flex flex-col justify-between space-y-3 transition-all min-w-[190px] ${className}`}
    >
      {/* Row 1: "V1" avatar circle, status chip (CLEAN or FRAUD with icon) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            title={verifier.verifier_id}
            data-testid={`verifier-avatar-${avatarLabel}`}
            className="w-8 h-8 rounded-full bg-surface-soft border border-hairline flex items-center justify-center font-heading font-bold text-xs text-ink shrink-0 shadow-sm"
          >
            {avatarLabel}
          </div>
          <span className="sr-only">{verifier.verifier_id}</span>
        </div>

        {/* Status chip: CLEAN, FRAUD, or LAZY mode */}
        {hasRevealed ? (
          isClean ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-chip text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CLEAN</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-chip text-xs font-semibold bg-[#FDECEC] border border-red-300 text-[#9B1C1C]">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>FRAUD</span>
            </span>
          )
        ) : isLazyMode ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-chip text-[11px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-600">
            LAZY
          </span>
        ) : (
          <span className="text-[11px] font-mono text-muted-strong bg-surface-soft px-2 py-0.5 rounded-chip border border-hairline">
            PENDING
          </span>
        )}
      </div>

      {/* Row 2: big verdict score as a number with a small bar underneath */}
      <div>
        <div className="text-2xl font-heading font-bold text-ink leading-tight">
          {verifier.last_score_bp !== undefined ? `${scorePct}%` : "--"}
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-soft overflow-hidden mt-1.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isFraud ? "bg-brand" : "bg-emerald-600"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, scorePct))}%` }}
          />
        </div>
      </div>

      {/* Row 3: address chip (short, copy, explorer link) */}
      <div className="pt-1">
        <HashChip hash={verifier.address} type="address" truncateLen={4} />
      </div>

      {/* Row 4: stake in small muted text */}
      <div className="pt-1 border-t border-hairline flex items-center justify-between text-xs text-muted-strong font-mono">
        <span className="text-[11px]">Stake</span>
        <span className="font-semibold text-ink">{stakeEth} ETH</span>
      </div>
    </div>
  );
};
