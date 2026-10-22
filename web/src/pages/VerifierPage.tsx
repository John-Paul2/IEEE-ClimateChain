import React, { useState, useEffect } from "react";
import { Cpu } from "lucide-react";
import { useData } from "../data/DataContext";
import { TrustGauge } from "../components/TrustGauge";
import { VoteCard } from "../components/VoteCard";
import { MerkleTreeViz } from "../components/MerkleTreeViz";
import { BatchTimeline } from "../components/BatchTimeline";
import { ChallengePanel } from "../components/ChallengePanel";
import { QuarantineViewer } from "../components/QuarantineViewer";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
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
      const quarantined = batches.find((b) => b.status === "Quarantined" || b.status === "Slashed");
      if (quarantined) {
        setSelectedBatchId(quarantined.batch_id);
      } else if (!selectedBatchId || !batches.some((b) => b.batch_id === selectedBatchId)) {
        setSelectedBatchId(batches[batches.length - 1].batch_id);
      }
    }
  }, [batches, selectedBatchId]);

  // Load batch detail with packets for QuarantineViewer and MerkleTree
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
    challenges.find((c) => c.status === "Active" || c.status === "Open" || c.status === "DisputedByOperator") ||
    challenges[0];

  const isQuarantined =
    currentBatch?.status === "Quarantined" ||
    currentBatch?.status === "Slashed" ||
    batches.some((b) => b.status === "Quarantined" || b.status === "Slashed");
  const reasons =
    currentBatch?.reason_codes ||
    currentBatch?.verdict_summary?.reason_codes ||
    detailedBatch?.reason_codes ||
    detailedBatch?.verdict_summary?.reason_codes ||
    [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Verifier Committee Console</h1>
          <p className="text-sm text-muted mt-1">
            Independent 3-of-5 commit-reveal quorum with combustion physics and physics-informed autoencoder checks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isQuarantined ? "flagged" : "verified"}
            label={isQuarantined ? "FRAUD DETECTED · QUORUM ACTION" : "QUORUM HEALTHY"}
          />
          <span className="text-xs font-mono text-muted">5 Nodes Active · 3-of-5 Consensus</span>
        </div>
      </div>

      {/* Verifier Nodes Grid (5 VoteCards updating live) */}
      <Card
        title="Verifier Committee Nodes (5 Independent Processes)"
        subtitle="Individual commitments, model hashes, revealed verdicts, quantized scores, and staked bonds"
        icon={Cpu}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {verifiers.map((v) => (
            <VoteCard
              key={v.verifier_id}
              verifier={v}
              isLoading={isLoading}
              error={error}
              onRetry={refresh}
            />
          ))}
        </div>
      </Card>

      {/* Batch Consensus Lifecycle Timeline */}
      <BatchTimeline
        batch={currentBatch}
        allBatches={batches}
        onSelectBatch={setSelectedBatchId}
        isLoading={isLoading}
        isEmpty={batches.length === 0}
        error={error}
        onRetry={refresh}
      />

      {/* Top Split: Consensus Trust Score & Optimistic Challenge Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 space-y-6">
          <TrustGauge
            scoreBp={currentBatch?.mean_score_bp ?? 9820}
            thresholdBp={5000}
            verdict={isQuarantined ? "fraud" : "clean"}
            reasonCodes={reasons}
            title="Batch Quorum Consensus Score"
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />

          {/* Merkle Tree Inclusion Tree */}
          <MerkleTreeViz
            batchId={currentBatch?.batch_id ?? 1}
            rootHash={currentBatch?.merkle_root}
            txHash={currentBatch?.tx_hash || currentBatch?.anchor_tx_hash}
            packetsCount={currentBatch?.count ?? 8}
            totalExpected={8}
            batchStatus={currentBatch?.status ?? "Anchored"}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />
        </div>

        {/* Challenge Panel with Arbiter Resolution & Dispute */}
        <div className="lg:col-span-2 space-y-6">
          <ChallengePanel
            challenge={activeChallenge}
            onDispute={disputeChallenge}
            onResolve={resolveChallenge}
            onSettle={settleChallenge}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />

          {/* Quarantine Forensic Evidence Viewer */}
          <QuarantineViewer
            batch={detailedBatch}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />
        </div>
      </div>
    </div>
  );
};
