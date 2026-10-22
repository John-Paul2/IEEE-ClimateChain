import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Clock,
  FileText,
  UserCheck,
  Scale,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type { ChallengeRecord } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
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
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || actionError) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState
          title="Challenge Panel Error"
          message={error || actionError || undefined}
          onRetry={onRetry || (() => setActionError(null))}
        />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl ${className}`}>
        <EmptyState
          icon={Scale}
          title="No active quarantine challenge"
          description="When a batch is quarantined by a 3-of-5 fraud quorum, the optimistic challenge window, arbiter approvals, and bond settlement will appear here."
        />
      </div>
    );
  }

  const closesAt = challenge.window_closes_at || challenge.expires_at_epoch || (now + 120);
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
    challenge.status === "OverturnedCleared" ||
    challenge.status === "ResolvedCleared";

  const isSettled = isUpheld || isCleared || challenge.status === "Settled";

  const bondEth = (Number(BigInt(challenge.operator_bond_wei || "1000000000000000000")) / 1e18).toFixed(2);
  const slashedAmountRaw =
    challenge.slashed_amount_wei && challenge.slashed_amount_wei !== "0"
      ? challenge.slashed_amount_wei
      : isUpheld
      ? "1000000000000000000"
      : "0";
  const slashedEth = (Number(BigInt(slashedAmountRaw)) / 1e18).toFixed(2);

  // Default arbiters list (3 arbiters, 2 required)
  const arbiters = challenge.arbiter_votes && challenge.arbiter_votes.length > 0
    ? challenge.arbiter_votes
    : [
        {
          arbiter_id: "ARBITER-01 (Lead)",
          arbiter_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          approved: isUpheld,
          tx_hash: challenge.tx_hashes?.arbiter_1,
        },
        {
          arbiter_id: "ARBITER-02 (Technical)",
          arbiter_address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          approved: isUpheld,
          tx_hash: challenge.tx_hashes?.arbiter_2,
        },
        {
          arbiter_id: "ARBITER-03 (Audit)",
          arbiter_address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
          approved: false,
        },
      ];

  const approvedCount = arbiters.filter((a) => a.approved).length;

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

  const handleApproveUphold = async () => {
    if (!onResolve) return;
    setIsActing(true);
    setActionError(null);
    try {
      await onResolve(challenge.batch_id, true, "2-of-3 Arbiter Quorum upheld fraud verdict");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Arbiter resolution failed");
    } finally {
      setIsActing(false);
    }
  };

  const handleOverturn = async () => {
    if (!onResolve) return;
    setIsActing(true);
    setActionError(null);
    try {
      await onResolve(challenge.batch_id, false, "Arbiter cleared operator dispute");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Arbiter resolution failed");
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Optimistic Quarantine Challenge Panel"
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm space-y-5 ${className}`}
    >
      {/* Header and Countdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-flagged" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text">
              Optimistic Challenge Window & Dispute Resolution
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Batch #{challenge.batch_id} quarantined by 3-of-5 fraud quorum · 2-of-3 arbiter multisig settlement
          </p>
        </div>

        {/* Live Countdown Display */}
        <div
          data-testid="challenge-countdown"
          className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
            isSettled
              ? "bg-surface-raised border-border text-muted"
              : isExpired
              ? "bg-warning/15 border-warning text-warning"
              : "bg-flagged/10 border-flagged/40 text-flagged animate-pulse"
          }`}
        >
          <Clock className="w-4 h-4" />
          <div className="text-left font-mono">
            <div className="text-[10px] uppercase font-semibold text-muted">
              {isSettled ? "Window Closed" : isExpired ? "Window Elapsed" : "Challenge Timer"}
            </div>
            <div className="text-base font-bold text-text">
              {isSettled
                ? "SETTLED"
                : `${Math.floor(secondsLeft / 60)}m ${(secondsLeft % 60).toString().padStart(2, "0")}s`}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Evidence Summary + Operator Dispute */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Evidence Summary Card */}
        <div className="p-4 rounded-lg bg-surface-raised border border-border text-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="font-semibold text-text flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-info" />
              Evidence Summary
            </span>
            <span className="font-mono text-muted">Batch #{challenge.batch_id}</span>
          </div>

          <div className="space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-muted font-sans">Evidence Digest:</span>
              <HashChip hash={challenge.evidence_hash} type="digest" truncateLen={4} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted font-sans">Operator Bond at Risk:</span>
              <span className="font-bold text-flagged">{bondEth} ETH</span>
            </div>
            {challenge.reason_codes && challenge.reason_codes.length > 0 && (
              <div className="pt-1">
                <span className="text-muted font-sans block mb-1">Flagged Violations:</span>
                <div className="flex flex-wrap gap-1 font-sans">
                  {challenge.reason_codes.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-flagged/15 text-flagged border border-flagged/30"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {challenge.tx_hashes?.challenge_open && (
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <span className="text-muted font-sans">Challenge Open Tx:</span>
                <HashChip hash={challenge.tx_hashes.challenge_open} type="tx" truncateLen={4} />
              </div>
            )}
          </div>
        </div>

        {/* Operator Dispute Card */}
        <div className="p-4 rounded-lg bg-surface-raised border border-border text-xs space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="font-semibold text-text flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-warning" />
                Operator Dispute Submission
              </span>
              <Badge
                variant={isDisputed ? "info" : "muted"}
                label={isDisputed ? "DISPUTED" : "UNDISPUTED"}
                size="sm"
              />
            </div>

            <div className="mt-2 text-muted leading-relaxed space-y-2">
              {isDisputed ? (
                <>
                  <p className="text-text font-medium">
                    Operator submitted cryptographic dispute attaching Packet #0 Merkle inclusion proof.
                  </p>
                  {challenge.operator_dispute_hash && (
                    <div className="font-mono flex items-center justify-between pt-1">
                      <span>Dispute Hash:</span>
                      <HashChip hash={challenge.operator_dispute_hash} type="digest" truncateLen={4} />
                    </div>
                  )}
                  {challenge.tx_hashes?.dispute && (
                    <div className="font-mono flex items-center justify-between">
                      <span>Dispute Tx:</span>
                      <HashChip hash={challenge.tx_hashes.dispute} type="tx" truncateLen={4} />
                    </div>
                  )}
                </>
              ) : (
                <p>
                  The plant operator may dispute the quarantine flag before the window expires by attaching
                  raw edge logs and cryptographic Merkle proof.
                </p>
              )}
            </div>
          </div>

          {!isSettled && !isDisputed && onDispute && (
            <button
              type="button"
              data-testid="submit-dispute-btn"
              onClick={handleDispute}
              disabled={isActing}
              className="mt-3 w-full py-2 px-3 rounded-lg text-xs font-mono font-bold bg-warning/15 hover:bg-warning/25 border border-warning/40 text-warning transition-all flex items-center justify-center gap-2"
            >
              {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Submit Operator Dispute (with Merkle Proof)</span>
            </button>
          )}
        </div>
      </div>

      {/* Arbiter Approvals (2 of 3 Multisig) */}
      <div className="p-4 rounded-lg bg-surface-sunken border border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/50">
          <div>
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-info" />
              Multisig Arbiter Council Approvals (2 of 3 Required)
            </span>
            <span className="text-[11px] text-muted">
              Threshold requires 2 matching arbiter signatures to execute slash or clear bond
            </span>
          </div>
          <span
            data-testid="arbiter-approvals-count"
            className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface border border-border text-info"
          >
            {approvedCount} / 2 Approvals Confirmed
          </span>
        </div>

        {/* Arbiter Council Members */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {arbiters.map((arb) => (
            <div
              key={arb.arbiter_id}
              className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                arb.approved
                  ? "bg-verified/10 border-verified/40 text-text"
                  : "bg-surface border-border text-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono font-bold text-[11px] text-text">{arb.arbiter_id}</span>
                {arb.approved ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-verified">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    APPROVED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-muted">PENDING</span>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted">Addr:</span>
                <HashChip hash={arb.arbiter_address} type="address" truncateLen={3} />
              </div>
              {arb.tx_hash && (
                <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-border/40">
                  <span className="text-muted">tx:</span>
                  <HashChip hash={arb.tx_hash} type="tx" truncateLen={3} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Arbiter Actions if Not Yet Settled */}
        {!isSettled && (
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
            {isExpired && onSettle && (
              <button
                type="button"
                data-testid="settle-expired-btn"
                onClick={async () => {
                  setIsActing(true);
                  try {
                    await onSettle(challenge.batch_id);
                  } finally {
                    setIsActing(false);
                  }
                }}
                disabled={isActing}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-mono font-bold bg-warning text-surface-sunken hover:bg-warning/90 transition-all flex items-center justify-center gap-2"
              >
                <span>Settle Expired Window (Slash)</span>
              </button>
            )}
            {onResolve && (
              <>
                <button
                  type="button"
                  data-testid="uphold-slash-btn"
                  onClick={handleApproveUphold}
                  disabled={isActing}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-mono font-bold bg-flagged text-white hover:bg-flagged/90 transition-all flex items-center justify-center gap-2"
                >
                  {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>Arbiter Vote: Uphold Fraud & Slash Bond</span>
                </button>
                <button
                  type="button"
                  data-testid="overturn-clear-btn"
                  onClick={handleOverturn}
                  disabled={isActing}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-mono font-medium bg-surface-raised hover:bg-surface-raised/80 border border-border text-text transition-all flex items-center justify-center gap-2"
                >
                  <span>Arbiter Vote: Overturn & Clear</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Outcome Section with Transaction Links */}
      <div
        data-testid="challenge-outcome-banner"
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isUpheld
            ? "bg-flagged/15 border-flagged/50 text-text"
            : isCleared
            ? "bg-verified/15 border-verified/50 text-text"
            : "bg-surface-raised border-border text-muted"
        }`}
      >
        <div className="flex items-center gap-3">
          {isUpheld ? (
            <XCircle className="w-6 h-6 text-flagged flex-shrink-0" />
          ) : isCleared ? (
            <CheckCircle2 className="w-6 h-6 text-verified flex-shrink-0" />
          ) : (
            <Scale className="w-6 h-6 text-warning flex-shrink-0" />
          )}
          <div>
            <span className="font-bold text-sm block">
              {isUpheld
                ? "OUTCOME: FRAUD UPHELD & OPERATOR BOND SLASHED"
                : isCleared
                ? "OUTCOME: DISPUTE OVERTURNED & BATCH CLEARED"
                : "OUTCOME: ARBITRATION IN PROGRESS"}
            </span>
            <p className="text-xs text-muted mt-0.5">
              {isUpheld
                ? `${slashedEth} ETH operator bond permanently slashed and redistributed to honest verifiers & treasury.`
                : isCleared
                ? "Dispute substantiated. Batch restored to Cleared status for CBAM attestation."
                : "Awaiting 2-of-3 arbiter votes or challenge window expiration settlement."}
            </p>
          </div>
        </div>

        {/* Resolution Tx Links */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {challenge.tx_hashes?.arbiter_1 && (
            <div className="flex items-center gap-1 bg-surface px-2.5 py-1 rounded border border-border">
              <span className="text-muted">Settlement Tx:</span>
              <HashChip hash={challenge.tx_hashes.arbiter_1} type="tx" truncateLen={4} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
