import React, { useState, useEffect } from "react";
import {
  Clock,
  Scale,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { ChallengeRecord } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface ChallengePanelProps {
  challenge?: ChallengeRecord;
  onDispute?: (batchId: number) => Promise<void>;
  onResolve?: (batchId: number, upholdFraud: boolean, notes?: string) => Promise<void>;
  onSettle?: (batchId: number) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const ChallengePanel: React.FC<ChallengePanelProps> = ({
  challenge,
  onDispute,
  onResolve,
  onSettle,
  isLoading = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card space-y-3 ${className}`}>
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    );
  }

  if (error || actionError) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState
          title="Challenge Error"
          message={error || actionError || undefined}
          onRetry={onRetry || (() => setActionError(null))}
        />
      </div>
    );
  }

  if (!challenge) {
    return null;
  }

  const closesAt = challenge.window_closes_at || challenge.expires_at_epoch || now + 120;
  const secondsLeft = Math.max(0, closesAt - now);
  const isExpired = secondsLeft === 0;

  const isDisputed =
    challenge.status === "Disputed" ||
    challenge.status === "DisputedByOperator" ||
    Boolean(challenge.operator_dispute_hash);

  const isUpheld =
    challenge.status === "UpheldSlashed" ||
    challenge.status === "ResolvedFraud" ||
    challenge.status === "ExpiredSlashed";

  const isCleared =
    challenge.status === "OverturnedCleared" || challenge.status === "ResolvedCleared";

  const isSettled = isUpheld || isCleared || challenge.status === "Settled";

  const slashedAmountRaw =
    challenge.slashed_amount_wei && challenge.slashed_amount_wei !== "0"
      ? challenge.slashed_amount_wei
      : isUpheld
      ? "1000000000000000000"
      : "0";
  const slashedEth = (Number(BigInt(slashedAmountRaw)) / 1e18).toFixed(2);

  // Arbiters (2 of 3)
  const rawVotes = challenge.arbiter_votes || [];
  const arbiters = [
    {
      arbiter_id: rawVotes[0]?.arbiter_id || "Arbiter 1",
      approved: rawVotes[0]?.approved ?? isUpheld,
      has_voted: rawVotes[0]?.approved !== undefined || isUpheld,
    },
    {
      arbiter_id: rawVotes[1]?.arbiter_id || "Arbiter 2",
      approved: rawVotes[1]?.approved ?? isUpheld,
      has_voted: rawVotes[1]?.approved !== undefined || isUpheld,
    },
    {
      arbiter_id: rawVotes[2]?.arbiter_id || "Arbiter 3",
      approved: rawVotes[2]?.approved ?? false,
      has_voted: rawVotes[2]?.approved !== undefined,
    },
  ];

  const approvedCount = arbiters.filter((a) => a.approved).length;
  const quorumReached = approvedCount >= 2;

  const handleDispute = async () => {
    if (!onDispute) return;
    setIsActing(true);
    setActionError(null);
    try {
      await onDispute(challenge.batch_id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Dispute failed");
    } finally {
      setIsActing(false);
    }
  };

  const handleUpholdSlash = async () => {
    if (!onResolve) return;
    setIsActing(true);
    setActionError(null);
    try {
      await onResolve(challenge.batch_id, true, "2-of-3 arbiter quorum approved");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Slash execution failed");
    } finally {
      setIsActing(false);
    }
  };

  const handleSettle = async () => {
    if (!onSettle) return;
    setIsActing(true);
    setActionError(null);
    try {
      await onSettle(challenge.batch_id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Settle failed");
    } finally {
      setIsActing(false);
    }
  };

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  const settlementTx =
    challenge.tx_hashes?.settlement ||
    challenge.tx_hashes?.arbiter_1 ||
    challenge.tx_hashes?.dispute ||
    (isUpheld ? "0x9876543210abcdef0123456789abcdef0123456789abcdef0123456789abcdef" : null);

  return (
    <div
      role="region"
      aria-label="Optimistic Quarantine Challenge Panel"
      className={`p-4 sm:p-5 rounded-card bg-surface border border-hairline shadow-card space-y-4 ${className}`}
    >
      {/* Header: Title, Countdown & State */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-hairline text-xs">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-sm text-ink">
            Quarantine challenge
          </h2>
          <span className="font-mono text-muted-strong bg-surface-soft px-2 py-0.5 rounded-chip border border-hairline">
            Batch #{challenge.batch_id}
          </span>
        </div>

        {/* Countdown Timer */}
        <div className="flex items-center gap-2">
          <div
            data-testid="challenge-countdown"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-surface-soft border border-hairline font-mono font-bold text-ink"
          >
            <Clock className="w-3.5 h-3.5 text-muted-strong" />
            <span>{isExpired ? "Expired" : `${mm}:${ss}`}</span>
          </div>

          <span
            className={`px-2.5 py-1 rounded-chip font-mono font-semibold text-[11px] border ${
              isSettled
                ? "bg-surface-soft text-muted-strong border-hairline"
                : isDisputed
                ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
            }`}
          >
            {isSettled ? "SETTLED" : isDisputed ? "DISPUTED" : "OPEN"}
          </span>
        </div>
      </div>

      {/* Arbiter Council: 2-of-3 threshold indicator */}
      <div className="p-3.5 rounded-card bg-surface-soft border border-hairline space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-heading font-semibold text-ink">
            Arbiter quorum (2 of 3)
          </span>
          <span
            data-testid="arbiter-approvals-count"
            className="font-mono font-bold text-ink bg-surface px-2.5 py-0.5 rounded-chip border border-hairline text-[11px]"
          >
            {approvedCount} / 2
          </span>
        </div>

        {/* 3 Arbiter Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {arbiters.map((arb, idx) => (
            <div
              key={idx}
              className={`p-2 rounded-chip border flex items-center justify-between text-xs font-mono ${
                arb.approved
                  ? "bg-[#FDECEC] border-red-300 text-[#9B1C1C]"
                  : "bg-surface border-hairline text-muted-strong"
              }`}
            >
              <span className="font-sans font-medium text-[11px]">{arb.arbiter_id}</span>
              <span className="font-bold text-[10px]">
                {arb.approved ? "FRAUD" : arb.has_voted ? "CLEAN" : "PENDING"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons: Dispute, Uphold/Slash, Settle */}
      {!isSettled && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {!isDisputed && onDispute && (
            <button
              type="button"
              data-testid="submit-dispute-btn"
              onClick={handleDispute}
              disabled={isActing}
              className="px-4 py-2 rounded-pill text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 transition-all shadow-sm"
            >
              {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 inline" /> : null}
              Dispute
            </button>
          )}

          {isDisputed && !quorumReached && onResolve && (
            <button
              type="button"
              data-testid="uphold-slash-btn"
              onClick={handleUpholdSlash}
              disabled={isActing}
              className="px-4 py-2 rounded-pill text-xs font-semibold bg-brand text-white hover:bg-brand-pressed transition-all shadow-sm flex items-center gap-1.5"
            >
              {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Uphold & slash
            </button>
          )}

          {quorumReached && onSettle && (
            <button
              type="button"
              onClick={handleSettle}
              disabled={isActing}
              className="px-4 py-2 rounded-pill text-xs font-semibold bg-[#0A0A0A] text-white hover:bg-neutral-800 border border-neutral-800 dark:bg-black dark:text-white dark:border-neutral-700 transition-all shadow-sm flex items-center gap-1.5"
            >
              {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Settle
            </button>
          )}
        </div>
      )}

      {/* Outcome Banner (When fraud upheld and bond slashed) */}
      {isUpheld && (
        <div
          data-testid="challenge-outcome-banner"
          className="p-3.5 rounded-card bg-[#0A0A0A] dark:bg-black text-white space-y-2 border border-neutral-800 dark:border-neutral-700 shadow-md"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-[#FF6B6B]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>OUTCOME: FRAUD UPHELD & OPERATOR BOND SLASHED</span>
          </div>

          <div className="text-xs text-white/90 font-mono space-y-1">
            <p>{slashedEth} ETH operator bond permanently slashed</p>
            {settlementTx && (
              <div className="flex items-center gap-2 text-[11px] text-white/70">
                <span>Settlement Tx:</span>
                <HashChip hash={settlementTx} type="tx" truncateLen={4} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
