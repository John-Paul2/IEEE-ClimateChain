import React from "react";
import { Cpu, ShieldCheck, ShieldAlert, CircleSlash, Coins } from "lucide-react";
import type { VerifierNodeStatus } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Badge } from "./Badge";
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
      <div className={`p-4 bg-surface border border-border rounded-xl space-y-3 ${className}`}>
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title="Verifier Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !verifier) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl text-center text-muted ${className}`}>
        <CircleSlash className="w-6 h-6 mx-auto mb-2 text-muted" aria-hidden="true" />
        <p className="text-xs">No verifier data available</p>
      </div>
    );
  }

  const isClean = verifier.last_verdict === "clean";
  const isFraud = verifier.last_verdict === "fraud";
  const hasRevealed = isClean || isFraud;

  // Staked ETH formatting (from wei)
  const stakeEth = (Number(BigInt(verifier.staked_amount_wei || "0")) / 1e18).toFixed(2);

  return (
    <div
      role="region"
      aria-label={`Verifier Node ${verifier.verifier_id}`}
      className="p-4 bg-surface border border-border rounded-xl shadow-sm flex flex-col justify-between transition-all hover:border-info/40"
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-info" aria-hidden="true" />
            <span className="font-mono font-bold text-sm text-text">{verifier.verifier_id}</span>
          </div>

          <Badge
            variant={
              verifier.mode === "honest"
                ? "info"
                : verifier.mode === "adversarial_clean"
                ? "warning"
                : verifier.mode === "adversarial_fraud"
                ? "flagged"
                : "muted"
            }
            label={verifier.mode.replace("_", " ").toUpperCase()}
            size="sm"
          />
        </div>

        {/* Address and Model */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Node Addr:</span>
            <HashChip hash={verifier.address} type="address" truncateLen={3} />
          </div>
          {verifier.last_model_hash && (
            <div className="flex items-center justify-between">
              <span className="text-muted">Model H:</span>
              <HashChip hash={verifier.last_model_hash} type="digest" truncateLen={3} />
            </div>
          )}
        </div>

        {/* Vote Verdict and Quantized Score */}
        <div className="mt-3 p-2.5 rounded-lg bg-surface-raised border border-border/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted font-medium">Last Vote:</span>
            {hasRevealed ? (
              isClean ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-verified">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  CLEAN
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-flagged">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  FRAUD
                </span>
              )
            ) : (
              <span className="text-xs text-muted italic">Awaiting reveal</span>
            )}
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">Quantized Score:</span>
            <span className="font-mono font-bold text-sm text-text">
              {verifier.last_score_bp !== undefined
                ? `${verifier.last_score_bp} bp (${(verifier.last_score_bp / 100).toFixed(1)}%)`
                : "--"}
            </span>
          </div>
        </div>
      </div>

      {/* Bond & Stake Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted font-mono">
        <span className="inline-flex items-center gap-1">
          <Coins className="w-3 h-3 text-warning" />
          <span>Bond Vault Stake:</span>
        </span>
        <span className="text-text font-semibold">{stakeEth} ETH</span>
      </div>
    </div>
  );
};
