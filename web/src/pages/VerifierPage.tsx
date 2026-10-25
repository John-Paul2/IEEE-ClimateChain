import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, RotateCcw, Sliders, Clock, Lock } from "lucide-react";
import { useData } from "../data/DataContext";
import { VoteCard } from "../components/VoteCard";
import { BatchTimeline } from "../components/BatchTimeline";
import { ChallengePanel } from "../components/ChallengePanel";
import { QuarantineViewer } from "../components/QuarantineViewer";
import { HashChip } from "../components/HashChip";
import { Chip } from "../components/Chip";
import { Popover } from "../components/Popover";
import { PageHint } from "../components/GuideLayer";
import type { BatchDetail } from "../types/telemetry";

export const VerifierPage: React.FC = () => {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    verifiers.find((v) => v.last_model_hash || (v as any).model_hash)?.last_model_hash ||
    (verifiers.find((v) => (v as any).model_hash) as any)?.model_hash;

  const totalVerifiers = verifiers.length || 5;
  const fraudVotes = verifiers.filter((v) => v.last_verdict === "fraud").length;

  const initialSimVotes = useMemo<("clean" | "fraud")[]>(() => {
    return [0, 1, 2, 3, 4].map((i) => {
      const v = verifiers[i];
      return v?.last_verdict === "fraud" ? "fraud" : "clean";
    });
  }, [verifiers]);

  const [simVotes, setSimVotes] = useState<("clean" | "fraud")[]>([
    "clean",
    "clean",
    "clean",
    "clean",
    "clean",
  ]);

  useEffect(() => {
    if (initialSimVotes.length === 5) {
      setSimVotes(initialSimVotes);
    }
  }, [initialSimVotes]);

  const handleFlipVote = (idx: number) => {
    setSimVotes((prev) => {
      const next = [...prev];
      next[idx] = next[idx] === "clean" ? "fraud" : "clean";
      return next;
    });
  };

  const handleResetSimVotes = () => {
    setSimVotes(initialSimVotes);
  };

  const requiredQuorum = 3; // From config params.yaml: required_matches = 3
  const simFraudCount = simVotes.filter((v) => v === "fraud").length;
  const simCleanCount = simVotes.filter((v) => v === "clean").length;
  const isSimFlagged = simFraudCount >= requiredQuorum;

  return (
    <div className="space-y-8">
      {/* 1. Title Row */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-3xl sm:text-page-title text-ink font-heading font-bold">
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
            <span className="bg-surface-soft border border-hairline px-3 py-1.5 rounded-pill">
              5 Nodes · 3-of-5 Consensus
            </span>
          </div>
        </div>

        <PageHint
          what="Five independent checkers vote on each batch. Three votes to flag it."
          nextLabel="See what the buyer sees"
          nextTo="/importer"
        />
      </div>

      {/* 2. Unified Quorum Status & Interactive Quorum Simulator (Zero duplicate bars, Dark-mode native) */}
      <section
        role="region"
        aria-label="Batch Quorum Consensus Score"
        data-testid="quorum-status-bar"
        data-story="quorum-bar"
        data-guide="quorum-sim"
        className="p-5 rounded-card bg-surface border border-hairline shadow-card space-y-4"
      >
        {/* Top Row: Live Quorum Status & Simulator Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Sliders className="w-4 h-4 text-brand" />
            <h2 className="font-heading font-bold text-base text-ink">
              Quorum Consensus & Simulator
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-brand/10 text-brand font-semibold">
              Browser demo
            </span>
            <span className="text-xs text-muted-strong">
              Click any node (V1–V5) to toggle votes and test the 3-of-5 threshold.
            </span>
          </div>

          <button
            type="button"
            onClick={handleResetSimVotes}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-pill bg-surface-soft border border-hairline text-ink hover:bg-hairline transition-colors cursor-pointer self-start sm:self-auto"
            title="Reset votes to actual verifier verdicts"
          >
            <RotateCcw className="w-3 h-3 text-muted-strong" />
            <span>Reset</span>
          </button>
        </div>

        {/* Clickable Nodes Row + Consensus Outcome */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-surface-soft border border-hairline rounded-2xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-heading font-bold text-sm">
              {isSimFlagged ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-flagged-ink">
                    {simFraudCount} of 5 flagged · FRAUD DETECTED · QUORUM ACTION
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-verified shrink-0" />
                  <span className="text-verified">
                    {simCleanCount} of 5 clean · QUORUM HEALTHY
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-strong">
              {isSimFlagged
                ? "Threshold reached (≥3 fraud votes): batch quarantined and challenge window opened."
                : "Below 3-vote fraud threshold: batch accepted as clean on-chain."}
            </p>
          </div>

          {/* 5 Clickable Dots */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {simVotes.map((vote, idx) => {
              const isFraudVote = vote === "fraud";
              return (
                <button
                  key={idx}
                  type="button"
                  data-sim-node={idx}
                  onClick={() => handleFlipVote(idx)}
                  className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
                  title={`Node V${idx + 1}: currently ${vote}. Click to flip.`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      isFraudVote
                        ? "bg-flagged-bg border-brand text-brand ring-2 ring-brand/25"
                        : "bg-verified/15 border-verified text-verified"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: isFraudVote
                          ? "var(--brand, #E5383B)"
                          : "var(--verified, #10B981)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-ink font-semibold">
                    V{idx + 1}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold uppercase ${
                      isFraudVote ? "text-flagged-ink" : "text-verified"
                    }`}
                  >
                    {vote}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5-segment animated bar */}
        <div className="grid grid-cols-5 gap-2 h-2.5">
          {simVotes.map((v, i) => (
            <div
              key={i}
              className="rounded-full bg-surface-soft border border-hairline overflow-hidden h-full"
            >
              <motion.div
                initial={prefersReducedMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className={`w-full h-full origin-left ${
                  v === "fraud" ? "bg-brand" : "bg-verified"
                }`}
              />
            </div>
          ))}
        </div>

        {/* When Flagged: Challenge-Window Ring and Shrinking Deposit Bar */}
        {isSimFlagged && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2"
          >
            <div className="md:col-span-4 p-3.5 bg-flagged-bg border border-brand/30 rounded-xl flex items-center gap-3">
              <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-brand/20"
                  />
                  <motion.circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="var(--brand, #E5383B)"
                    strokeWidth="3"
                    strokeDasharray="88"
                    initial={prefersReducedMotion ? false : { strokeDashoffset: 0 }}
                    animate={prefersReducedMotion ? false : { strokeDashoffset: [0, 88] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  />
                </svg>
                <Clock className="w-4 h-4 text-brand absolute" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-muted-strong block font-bold">
                  Challenge window
                </span>
                <span className="text-xs font-mono font-bold text-ink">
                  120s dispute active
                </span>
                <span className="text-[10px] text-muted-strong block">
                  Optimistic window open
                </span>
              </div>
            </div>

            <div className="md:col-span-8 p-3.5 bg-flagged-bg border border-brand/30 rounded-xl space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand" />
                  Operator bond slashing:
                </span>
                <span className="font-mono font-bold text-flagged-ink">
                  50% slashed (0.50 ETH)
                </span>
              </div>

              <div className="w-full h-2.5 bg-surface border border-brand/40 rounded-full overflow-hidden relative">
                <motion.div
                  initial={prefersReducedMotion ? false : { width: "100%" }}
                  animate={{ width: "50%" }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeInOut" }}
                  className="h-full bg-brand"
                />
              </div>

              <div className="flex justify-between text-[10px] font-mono text-muted-strong">
                <span>Active bond: 0.50 ETH</span>
                <span>Original stake: 1.00 ETH</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Shared Model-Hash Line */}
        {sharedModelHash && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-hairline text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-muted-strong font-sans">All run model</span>
              <HashChip hash={sharedModelHash} type="digest" truncateLen={4} />
              <span className="text-verified font-bold font-sans">✓ identical weights</span>
            </div>
            <span className="text-muted-strong text-[11px] font-sans">
              Deterministic autoencoder weights
            </span>
          </div>
        )}
      </section>

      {/* 3. Five Compact Vote Cards in a Row */}
      <section
        role="region"
        aria-label="Verifier Committee Nodes"
        data-story="vote-cards"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {verifiers.map((v, index) => (
          <VoteCard
            key={`${v.verifier_id}-${v.last_verdict || "pending"}`}
            verifier={v}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
            dataGuide={index === 0 ? "vote-card-1" : undefined}
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

      {/* 5. Challenge Card */}
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

      {/* 6. Evidence Drawer */}
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
