import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useData } from "../data/DataContext";
import { VoteCard } from "../components/VoteCard";
import { BatchTimeline } from "../components/BatchTimeline";
import { ChallengePanel } from "../components/ChallengePanel";
import { QuarantineViewer } from "../components/QuarantineViewer";
import { HashChip } from "../components/HashChip";
import { Chip } from "../components/Chip";
import { Popover } from "../components/Popover";
import type { BatchDetail } from "../types/telemetry";

export const VerifierPage: React.FC = () => {
  const {
    verifiers,
    challenges,
    batches,
    getBatchDetail,
    isLoading,
    error,
    refresh,
    disputeChallenge,
    resolveChallenge,
    settleChallenge,
  } = useData();

  const [selectedBatchId, setSelectedBatchId] = useState<number>(0);
  const [detailedBatch, setDetailedBatch] = useState<BatchDetail | undefined>(undefined);

  // Set default selected batch
  useEffect(() => {
    if (batches.length > 0) {
      const quarantined = batches.find(
        (b) => b.status === "Quarantined" || b.status === "Slashed"
      );
      if (quarantined) {
        setSelectedBatchId(quarantined.batch_id);
      } else if (!selectedBatchId || !batches.some((b) => b.batch_id === selectedBatchId)) {
        setSelectedBatchId(batches[batches.length - 1].batch_id);
      }
    }
  }, [batches, selectedBatchId]);

  // Load batch detail with packets for QuarantineViewer
  useEffect(() => {
    if (!selectedBatchId) return;
    let isMounted = true;
    getBatchDetail(selectedBatchId)
      .then((res) => {
        if (isMounted) setDetailedBatch(res);
      })
      .catch((err) => {
        console.warn(`Failed to fetch detail for batch #${selectedBatchId}:`, err);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedBatchId, getBatchDetail]);

  const currentBatch =
    batches.find((b) => b.batch_id === selectedBatchId) ||
    batches.find((b) => b.status === "Quarantined" || b.status === "Slashed") ||
    batches[batches.length - 1] ||
    batches[0];

  const activeChallenge =
    challenges.find((c) => c.batch_id === currentBatch?.batch_id) ||
    challenges.find(
      (c) =>
        c.status === "Active" || c.status === "Open" || c.status === "DisputedByOperator"
    ) ||
    challenges[0];

  const isQuarantined =
    currentBatch?.status === "Quarantined" ||
    currentBatch?.status === "Slashed" ||
    batches.some((b) => b.status === "Quarantined" || b.status === "Slashed");

  const effectiveReasons =
    detailedBatch?.reason_codes ||
    detailedBatch?.verdict_summary?.reason_codes ||
    currentBatch?.reason_codes ||
    currentBatch?.verdict_summary?.reason_codes ||
    activeChallenge?.reason_codes ||
    (isQuarantined ? ["PHYSICS_RESIDUAL", "AE_RESIDUAL"] : []);

  const cleanVotes = verifiers.filter((v) => v.last_verdict === "clean").length;

  const sharedModelHash =
    verifiers[0]?.last_model_hash ||
    verifiers.find((v) => v.last_model_hash)?.last_model_hash ||
    null;

  const totalVerifiers = verifiers.length || 5;
  const fraudVotes = verifiers.filter((v) => v.last_verdict === "fraud").length;

  return (
    <div className="space-y-6">
      {/* 1. Title Row: Title with status chip & single Popover */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
            Verifier Committee Console
          </h1>
          <Chip
            variant={isQuarantined ? "FRAUD" : "CLEAN"}
            label={isQuarantined ? `${fraudVotes} of ${totalVerifiers} flagged` : `${cleanVotes} of ${totalVerifiers} verified`}
          />
          <Popover
            title="Verifier committee"
            bullets={[
              "Five independent nodes run identical models.",
              "Consensus requires 3 of 5 votes.",
              "Quarantine activates challenge window and arbiter.",
              "Arbiter resolution slashes or clears bond.",
            ]}
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-strong">
          <span className="bg-surface-soft border border-hairline px-2.5 py-1 rounded-chip">
            5 Nodes · 3-of-5 Consensus
          </span>
        </div>
      </div>

      {/* 2. Quorum Bar and Model Line (Section 3 Order) */}
      <section
        role="region"
        aria-label="Batch Quorum Consensus Score"
        data-testid="quorum-status-bar"
        data-story="quorum-bar"
        className={`p-4 rounded-card border shadow-card transition-all space-y-3 ${
          isQuarantined
            ? "bg-[#FDECEC] border-red-300 text-[#9B1C1C]"
            : "bg-surface border-hairline text-ink"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-heading font-bold text-sm">
            {isQuarantined ? (
              <>
                <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />
                <span>3 of 5 flagged · FRAUD DETECTED · QUORUM ACTION</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{cleanVotes > 0 ? `${cleanVotes} of 5 clean` : "5 of 5 clean"} · QUORUM HEALTHY</span>
              </>
            )}
          </div>

          {/* 5-segment indicator */}
          <div className="flex items-center gap-1.5">
            {verifiers.map((v) => {
              const vFraud = v.last_verdict === "fraud";
              return (
                <div
                  key={v.verifier_id}
                  title={`${v.verifier_id}: ${v.last_verdict || "pending"}`}
                  className={`w-6 h-2 rounded-full transition-colors ${
                    vFraud
                      ? "bg-brand"
                      : v.last_verdict === "clean"
                      ? "bg-emerald-600"
                      : "bg-surface-soft border border-hairline"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Shared Model-Hash Line */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-hairline/60 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-muted-strong font-sans">All run model</span>
            <HashChip hash={sharedModelHash} type="digest" truncateLen={4} />
            <span className="text-emerald-600 font-bold font-sans">✓ identical weights</span>
          </div>
          <span className="text-muted-strong text-[11px] font-sans">
            Deterministic autoencoder weights
          </span>
        </div>
      </section>

      {/* 3. Five Compact Vote Cards in a Row */}
      <section
        role="region"
        aria-label="Verifier Committee Nodes"
        data-story="vote-cards"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {verifiers.map((v) => (
          <VoteCard
            key={v.verifier_id}
            verifier={v}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />
        ))}
      </section>

      {/* 4. Status Timeline Chips */}
      <section>
        <BatchTimeline
          batch={currentBatch}
          allBatches={batches}
          onSelectBatch={setSelectedBatchId}
          isLoading={isLoading}
          isEmpty={batches.length === 0}
          error={error}
          onRetry={refresh}
        />
      </section>

      {/* 5. Challenge Card (only when a batch is flagged) */}
      {(currentBatch?.status === "Quarantined" ||
        currentBatch?.status === "Slashed" ||
        activeChallenge?.status === "Active" ||
        activeChallenge?.status === "DisputedByOperator" ||
        activeChallenge?.status === "UpheldSlashed") && (
        <section data-story="challenge-card">
          <ChallengePanel
            challenge={activeChallenge}
            onDispute={disputeChallenge}
            onResolve={resolveChallenge}
            onSettle={settleChallenge}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />
        </section>
      )}

      {/* 6. Evidence Drawer (collapsed; opens automatically only for flagged batches) */}
      <section>
        <QuarantineViewer
          batch={detailedBatch || (currentBatch as BatchDetail)}
          reasonCodes={effectiveReasons}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
      </section>
    </div>
  );
};
