import React, { useState } from "react";
import {
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Check,
  Key,
  Flame,
  Cpu,
} from "lucide-react";
import type { BatchDetail } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { MerkleTreeViz } from "./MerkleTreeViz";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface QuarantineViewerProps {
  batch?: BatchDetail;
  reasonCodes?: string[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const QuarantineViewer: React.FC<QuarantineViewerProps> = ({
  batch,
  reasonCodes,
  isLoading = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedPacketIdx, setSelectedPacketIdx] = useState<number>(0);
  const [proofVerified, setProofVerified] = useState<boolean>(false);

  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card space-y-3 ${className}`}>
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title="Evidence Drawer Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  const isQuarantined = batch?.status === "Quarantined" || batch?.status === "Slashed";
  const packets = batch?.packets || [];
  const selectedPacket = packets[selectedPacketIdx] || packets[0];

  const reasons =
    (reasonCodes && reasonCodes.length > 0)
      ? reasonCodes
      : batch?.reason_codes || batch?.verdict_summary?.reason_codes || [];

  const cryptoReasons = reasons.filter((r) =>
    ["CHAIN_BREAK", "SEQ_GAP", "SIG_INVALID"].includes(r)
  );
  const physicsReasons = reasons.filter((r) =>
    ["PHYSICS_RESIDUAL", "CROSS_SOURCE_MISMATCH"].includes(r)
  );
  const aiReasons = reasons.filter((r) =>
    ["AE_RESIDUAL", "SPECTRAL_FLAT", "SPECTRAL_REPEAT"].includes(r)
  );

  return (
    <div
      role="region"
      aria-label="Quarantine Forensic Evidence Viewer"
      className={`rounded-card bg-surface border border-hairline shadow-card overflow-hidden ${className}`}
    >
      {/* Drawer Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-soft/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-brand" />
          <h2 className="font-heading font-semibold text-sm text-ink">
            Quarantine evidence drawer
          </h2>
          {batch && (
            <span className="font-mono text-[11px] text-muted-strong bg-surface-soft px-2 py-0.5 rounded-chip border border-hairline">
              Batch #{batch.batch_id}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {reasons.length > 0 && (
            <span className="px-2 py-0.5 rounded-chip text-[11px] font-mono font-semibold bg-[#FDECEC] text-[#9B1C1C] border border-red-300">
              {reasons.length} flagged
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-strong" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-strong" />
          )}
        </div>
      </button>

      {/* Drawer Body */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-4 border-t border-hairline">
          {/* Multi-layer Detection Status Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
            {/* Cryptographic Layer */}
            <div className="p-3 rounded-card bg-surface-soft border border-hairline text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-ink flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-muted-strong" />
                  Crypto checks
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-chip font-semibold ${
                    cryptoReasons.length > 0
                      ? "bg-[#FDECEC] text-[#9B1C1C]"
                      : "bg-emerald-500/15 text-emerald-600"
                  }`}
                >
                  {cryptoReasons.length > 0 ? "FAILED" : "PASSED"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {cryptoReasons.length > 0 ? (
                  cryptoReasons.map((r) => (
                    <span key={r} className="text-[#9B1C1C] bg-red-500/10 px-1.5 py-0.5 rounded">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-strong font-sans">Signatures & chain intact</span>
                )}
              </div>
            </div>

            {/* Physics Mass-Balance Layer */}
            <div className="p-3 rounded-card bg-surface-soft border border-hairline text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-ink flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-muted-strong" />
                  Physics checks
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-chip font-semibold ${
                    physicsReasons.length > 0
                      ? "bg-[#FDECEC] text-[#9B1C1C]"
                      : "bg-emerald-500/15 text-emerald-600"
                  }`}
                >
                  {physicsReasons.length > 0 ? "FAILED" : "PASSED"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {physicsReasons.length > 0 ? (
                  physicsReasons.map((r) => (
                    <span key={r} className="text-[#9B1C1C] bg-red-500/10 px-1.5 py-0.5 rounded">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-strong font-sans">Stoichiometry aligned</span>
                )}
              </div>
            </div>

            {/* ML Autoencoder Layer */}
            <div className="p-3 rounded-card bg-surface-soft border border-hairline text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-ink flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-muted-strong" />
                  ML autoencoder
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-chip font-semibold ${
                    aiReasons.length > 0
                      ? "bg-[#FDECEC] text-[#9B1C1C]"
                      : "bg-emerald-500/15 text-emerald-600"
                  }`}
                >
                  {aiReasons.length > 0 ? "FAILED" : "PASSED"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {aiReasons.length > 0 ? (
                  aiReasons.map((r) => (
                    <span key={r} className="text-[#9B1C1C] bg-red-500/10 px-1.5 py-0.5 rounded">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-strong font-sans">Residuals in bounds</span>
                )}
              </div>
            </div>
          </div>

          {/* Custom SVG Merkle Tree Visualization */}
          <div className="pt-2">
            <MerkleTreeViz
              batchId={batch?.batch_id ?? 1}
              rootHash={batch?.merkle_root}
              txHash={batch?.tx_hash || batch?.anchor_tx_hash}
              batchStatus={batch?.status ?? "Anchored"}
              flaggedLeafIndex={isQuarantined ? 3 : null}
            />
          </div>

          {/* Packets selection and proof verification */}
          {packets.length > 0 && (
            <div className="p-3.5 rounded-card bg-surface-soft border border-hairline space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <span className="font-heading font-semibold text-ink">
                  Batch #{batch?.batch_id} Packets
                </span>
                <span className="font-mono text-muted-strong text-[11px]">
                  {packets.length} packets
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {packets.map((pkt, idx) => (
                  <button
                    key={pkt.seq}
                    type="button"
                    data-testid={`quarantine-packet-${pkt.seq}`}
                    onClick={() => {
                      setSelectedPacketIdx(idx);
                      setProofVerified(false);
                    }}
                    className={`px-2.5 py-1 rounded-chip text-xs font-mono font-semibold border transition-all ${
                      selectedPacketIdx === idx
                        ? "bg-[#0A0A0A] text-white border-neutral-800 dark:bg-white dark:text-black dark:border-white"
                        : "bg-surface border-hairline text-ink hover:bg-hairline"
                    }`}
                  >
                    Seq #{pkt.seq}
                  </button>
                ))}
              </div>

              {selectedPacket && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-hairline">
                  <div className="font-mono text-[11px] text-muted-strong flex items-center gap-3">
                    <span>CO₂: {selectedPacket.values?.co2_mass_short_tons ?? "--"} T</span>
                    <span>Heat: {selectedPacket.values?.heat_input_mmbtu ?? "--"} mmBtu</span>
                    {selectedPacket.packet_hash && (
                      <HashChip hash={selectedPacket.packet_hash} type="digest" truncateLen={4} />
                    )}
                  </div>

                  {proofVerified ? (
                    <div
                      data-testid="merkle-proof-verified-badge"
                      className="px-3 py-1 rounded-chip bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 font-mono text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Proof verified against root</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="verify-merkle-proof-btn"
                      onClick={() => setProofVerified(true)}
                      className="px-4 py-1.5 rounded-pill text-xs font-semibold bg-[#0A0A0A] text-white hover:bg-neutral-800 border border-neutral-800 dark:bg-black dark:text-white dark:border-neutral-700 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3 h-3" />
                      <span>Verify Merkle proof</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
