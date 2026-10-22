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
      <div className={`p-4 bg-surface border border-border rounded-xl space-y-2 ${className}`}>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title={title} message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || !expiresAtEpoch) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl text-center text-muted ${className}`}>
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
      className={`p-4 bg-surface border border-border rounded-xl shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-muted mb-2">
        <div className="flex items-center gap-1.5 font-medium text-text">
          <Clock className="w-4 h-4 text-warning" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <span className="font-mono">{isExpired ? "EXPIRED" : "ACTIVE"}</span>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-bold font-mono tracking-tight text-text">
          {formatted}
        </span>
        {isExpired ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-verified">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready to Settle
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
            <AlertTriangle className="w-3.5 h-3.5" />
            Dispute Permitted
          </span>
        )}
      </div>

      {/* Accessible visual progress bar */}
      <div
        className="w-full bg-surface-sunken h-2 rounded-full overflow-hidden border border-border"
        role="progressbar"
        aria-valuenow={secondsRemaining}
        aria-valuemin={0}
        aria-valuemax={totalDurationSeconds}
      >
        <div
          className={`h-full transition-all duration-1000 ${
            isExpired ? "bg-verified" : secondsRemaining < 30 ? "bg-flagged" : "bg-warning"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
};
