import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface CountdownProps {
  expiresAtEpoch?: number; // target unix timestamp in seconds
  totalDurationSeconds?: number; // e.g. 120s or 86400s
  title?: string;
  onExpire?: () => void;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const Countdown: React.FC<CountdownProps> = ({
  expiresAtEpoch,
  totalDurationSeconds = 120,
  title = "Challenge Window Countdown",
  onExpire,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiresAtEpoch) return;

    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, (expiresAtEpoch || 0) - now);
      setSecondsRemaining(remaining);
      if (remaining === 0 && onExpire) {
        onExpire();
      }
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAtEpoch, onExpire]);

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card shadow-card space-y-2 ${className}`}>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-chip" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-2 w-full rounded-pill" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title={title} message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !expiresAtEpoch) {
    return (
      <div
        className={`p-5 bg-surface border border-hairline rounded-card shadow-card text-center text-muted ${className}`}
      >
        <Clock className="w-5 h-5 mx-auto mb-1 text-muted" aria-hidden="true" />
        <span className="text-xs">No active challenge window</span>
      </div>
    );
  }

  const isExpired = secondsRemaining <= 0;
  const progressPct = Math.min(
    100,
    Math.max(0, (secondsRemaining / (totalDurationSeconds || 120)) * 100)
  );

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`${title}: ${isExpired ? "Window expired" : `${formatted} remaining`}`}
      className={`p-5 bg-surface border border-hairline rounded-card shadow-card ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <Clock className="w-4 h-4 text-warning" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <span className="font-mono text-[11px] font-bold text-muted">
          {isExpired ? "EXPIRED" : "ACTIVE"}
        </span>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-2xl font-bold font-mono tracking-tight text-ink">{formatted}</span>
        {isExpired ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-chip bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready to Settle
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-chip bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Dispute Permitted
          </span>
        )}
      </div>

      {/* Accessible visual progress bar */}
      <div
        className="w-full bg-surface-soft h-2 rounded-pill overflow-hidden border border-hairline"
        role="progressbar"
        aria-valuenow={secondsRemaining}
        aria-valuemin={0}
        aria-valuemax={totalDurationSeconds}
      >
        <div
          className={`h-full transition-all duration-1000 ${
            isExpired ? "bg-[#0E9F6E]" : secondsRemaining < 30 ? "bg-brand" : "bg-warning"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
};
