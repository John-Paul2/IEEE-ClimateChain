import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link2, ShieldAlert, RotateCcw, Edit2, Check } from "lucide-react";
import type { TelemetryPacket } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { computePacketSha256 } from "../lib/packetHash";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export interface HashChainStripProps {
  packets?: TelemetryPacket[];
  maxPackets?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  batchRoot?: string | null;
  selectedPacketIndex?: number | null;
  onSelectPacket?: (index: number, packet: TelemetryPacket) => void;
  onTamperPacket?: (index: number | null, newHash: string | null) => void;
}

// Build snapshot fallback map to provide real SHA-256 hashes for recorded runs
const snapshotHashes = new Map<number, { hash: string; prev_hash: string }>();
(realRunSnapshot.batches as any[])?.forEach((b: any) => {
  b.packets?.forEach((p: any) => {
    snapshotHashes.set(p.seq, {
      hash: p.packet_hash || p.hash,
      prev_hash: p.prev_hash,
    });
  });
});
(realRunSnapshot.events as any[])?.forEach((e: any) => {
  if (e.type === "packet" && e.seq !== undefined) {
    const h = e.packet_hash || e.hash || e.data?.packet_hash || e.data?.hash;
    const prev = e.prev_hash || e.data?.prev_hash;
    if (h) snapshotHashes.set(e.seq, { hash: h, prev_hash: prev });
  }
});

export const HashChainStrip: React.FC<HashChainStripProps> = ({
  packets = [],
  maxPackets = 8,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
  batchRoot = null,
  selectedPacketIndex = null,
  onSelectPacket,
  onTamperPacket,
}) => {
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const [editingSeq, setEditingSeq] = useState<number | null>(null);
  const [editCo2Text, setEditCo2Text] = useState<string>("");
  const [tamperedCo2, setTamperedCo2] = useState<Record<number, number>>({});
  const [tamperedHashes, setTamperedHashes] = useState<Record<number, string>>({});

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sortedPackets = [...packets].sort((a, b) => a.seq - b.seq);
  const displayPackets = sortedPackets.slice(-maxPackets);

  const isTampered = Object.keys(tamperedHashes).length > 0;

  const scrollToMerkleTree = (delayMs = 250) => {
    window.setTimeout(() => {
      const merkleEl = document.querySelector<HTMLElement>('[data-story="merkle-tree"]');
      if (merkleEl) {
        merkleEl.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
      }
    }, prefersReducedMotion ? 0 : delayMs);
  };

  const handleReset = () => {
    setEditingSeq(null);
    setEditCo2Text("");
    setTamperedCo2({});
    setTamperedHashes({});
    onTamperPacket?.(null, null);
  };

  const handleStartEdit = (seq: number, currentCo2: string | number) => {
    setEditingSeq(seq);
    setEditCo2Text(String(currentCo2));
  };

  const handleCommitEdit = async (seq: number, originalPacket: TelemetryPacket, index: number) => {
    const newCo2 = parseFloat(editCo2Text);
    setEditingSeq(null);
    if (isNaN(newCo2)) return;

    setTamperedCo2((prev) => ({ ...prev, [seq]: newCo2 }));

    const valuesClone = { ...(originalPacket.values || {}), co2_mass_short_tons: newCo2 };
    const hash = await computePacketSha256({
      device_id: originalPacket.device_id,
      prev_hash: originalPacket.prev_hash,
      seq: originalPacket.seq,
      timestamp_utc: originalPacket.timestamp_utc,
      values: valuesClone,
    });

    setTamperedHashes((prev) => ({ ...prev, [seq]: hash }));
    onSelectPacket?.(index, originalPacket);
    onTamperPacket?.(index, hash);

    // Pause briefly so user sees the chain break shake, then smoothly reveal the Merkle tree below
    scrollToMerkleTree(450);
  };

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card space-y-3 w-full overflow-hidden ${className}`}>
        <Skeleton className="h-4 w-32 rounded-md" />
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-24 min-w-[130px] rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card ${className}`}>
        <ErrorState title="Hash chain error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || displayPackets.length === 0) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card ${className}`}>
        <EmptyState
          icon={Link2}
          title="No chained packets"
          description="Packets will chain sequentially as they arrive."
        />
      </div>
    );
  }

  const defaultRoot = batchRoot || (realRunSnapshot.batches as any[])?.[0]?.merkle_root || "";

  return (
    <div
      role="region"
      data-guide="seal-strip"
      data-story="hash-chain-strip"
      aria-label="Tamper-evident hash chain timeline"
      className={`p-5 bg-surface border border-hairline rounded-card w-full overflow-hidden space-y-4 ${className}`}
    >
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-hairline gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link2 className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="text-sm font-heading font-bold text-ink">Hash chain</h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-brand/10 text-brand font-semibold">
            Browser demo
          </span>
          <span className="text-xs text-muted-strong hidden md:inline">
            Click any packet to trace its Merkle proof, or click a CO₂ value to test tampering.
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Root chip turning red when tampered */}
          <div
            data-guide="root-chip"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-mono transition-colors border ${
              isTampered
                ? "bg-flagged-bg border-brand text-flagged-ink font-bold"
                : "bg-surface-soft border-hairline text-muted-strong"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isTampered ? "bg-brand animate-pulse" : "bg-verified"
              }`}
            />
            {isTampered ? (
              <span>no longer matches the blockchain</span>
            ) : (
              <span>Root: {defaultRoot.slice(0, 8)}…{defaultRoot.slice(-4)}</span>
            )}
          </div>

          {/* Reset button */}
          {isTampered && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-pill bg-surface-soft border border-hairline text-ink hover:bg-hairline transition-colors cursor-pointer"
              title="Reset tampered telemetry to original values"
            >
              <RotateCcw className="w-3 h-3 text-muted-strong" />
              <span>Reset</span>
            </button>
          )}

          <span className="text-xs font-mono text-muted-strong hidden sm:inline">
            Latest #{displayPackets[displayPackets.length - 1].seq}
          </span>
        </div>
      </div>

      {/* Horizontal timeline of packet nodes */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin w-full pt-2">
        {displayPackets.map((packet, index) => {
          const snap = snapshotHashes.get(packet.seq);
          const originalHash =
            packet.packet_hash ||
            (packet as any).hash ||
            snap?.hash ||
            "";
          const currentHash = tamperedHashes[packet.seq] || originalHash;

          const prevHash =
            packet.prev_hash ||
            snap?.prev_hash ||
            "";

          const nextPacket = displayPackets[index + 1];
          const nextSnap = nextPacket ? snapshotHashes.get(nextPacket.seq) : undefined;
          const nextPrevHash = nextPacket
            ? nextPacket.prev_hash || nextSnap?.prev_hash || ""
            : "";

          const isBreak = Boolean(
            nextPacket &&
              currentHash &&
              nextPrevHash &&
              nextPrevHash.toLowerCase() !== currentHash.toLowerCase()
          );

          const rawCo2Val =
            tamperedCo2[packet.seq] !== undefined
              ? tamperedCo2[packet.seq]
              : packet.values?.co2_mass_short_tons;

          const co2 =
            rawCo2Val !== undefined && rawCo2Val !== null
              ? Number(rawCo2Val).toFixed(1)
              : "--";
          const heat =
            packet.values?.heat_input_mmbtu !== undefined
              ? Number(packet.values.heat_input_mmbtu).toFixed(1)
              : "--";
          const o2 =
            packet.values?.synthetic_stack_o2_pct !== undefined
              ? Number(packet.values.synthetic_stack_o2_pct).toFixed(2)
              : null;
          const rawLoad = packet.values?.gross_load_mw;
          const steamLoad = (packet.values as any)?.steam_load_1000_lb_hr;
          const loadStr =
            rawLoad !== undefined && rawLoad !== null && Number(rawLoad) > 0
              ? `${Number(rawLoad).toFixed(1)} MW`
              : steamLoad !== undefined && steamLoad !== null && Number(steamLoad) > 0
              ? `${Number(steamLoad).toFixed(0)} klb/h`
              : rawLoad !== undefined && rawLoad !== null
              ? `${Number(rawLoad).toFixed(1)} MW`
              : "-";

          const isHovered = activeSeq === packet.seq;
          const isSelected = selectedPacketIndex === index;
          const isEditing = editingSeq === packet.seq;
          const isThisTampered = tamperedCo2[packet.seq] !== undefined;

          return (
            <React.Fragment key={packet.seq}>
              {/* Compact Packet Node */}
              <motion.div
                data-guide={index === 0 ? "packet-0" : undefined}
                data-testid={`hash-chain-packet-${packet.seq}`}
                initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
                onMouseEnter={() => setActiveSeq(packet.seq)}
                onMouseLeave={() => setActiveSeq(null)}
                onClick={() => {
                  onSelectPacket?.(index, packet);
                  setActiveSeq((prev) => (prev === packet.seq ? null : packet.seq));
                  scrollToMerkleTree(150);
                }}
                className={`relative min-w-[136px] p-3 rounded-xl flex-shrink-0 cursor-pointer transition-all border ${
                  isSelected
                    ? "bg-surface border-brand shadow-md ring-2 ring-brand/25"
                    : isThisTampered
                    ? "bg-flagged-bg border-brand"
                    : "bg-surface-soft border-hairline hover:border-ink"
                }`}
              >
                {/* Header: seq & CO2 editable inline */}
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-hairline">
                  <span className="font-mono font-semibold text-xs text-ink flex items-center gap-1">
                    #{packet.seq}
                    {isThisTampered && (
                      <span className="text-[9px] text-flagged-ink font-bold uppercase">edited</span>
                    )}
                  </span>

                  {/* Inline CO2 editor */}
                  <div
                    data-guide={index === 0 ? "co2-edit" : undefined}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleCommitEdit(packet.seq, packet, index);
                        }}
                        className="flex items-center gap-0.5"
                      >
                        <input
                          type="number"
                          step="0.1"
                          autoFocus
                          value={editCo2Text}
                          onChange={(e) => setEditCo2Text(e.target.value)}
                          onBlur={() => handleCommitEdit(packet.seq, packet, index)}
                          className="w-14 px-1 py-0.5 text-[10px] font-mono font-bold bg-surface border border-brand rounded text-ink outline-none"
                        />
                        <button
                          type="submit"
                          className="p-0.5 rounded text-verified hover:bg-surface-soft"
                          title="Save CO2 edit"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(packet.seq, co2)}
                        title="Click to edit CO2 inline (Tamper toy)"
                        className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md hover:bg-surface border transition-colors cursor-pointer ${
                          isThisTampered
                            ? "text-flagged-ink font-bold border-brand/50"
                            : "text-ink border-hairline/60 hover:border-brand"
                        }`}
                      >
                        <span>{co2} T</span>
                        <Edit2 className="w-2.5 h-2.5 text-muted opacity-70 hover:opacity-100" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5 text-[11px] font-mono text-muted-strong">
                  <div className="flex justify-between">
                    <span className="text-muted">Heat:</span>
                    <span className="text-ink">{heat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Load:</span>
                    <span className="text-ink">{loadStr}</span>
                  </div>
                  {o2 !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted">O₂:</span>
                      <span className="text-ink">{o2}%</span>
                    </div>
                  )}
                </div>

                {/* Prev and Hash Chips shown on hover */}
                {isHovered && (
                  <div className="absolute left-0 bottom-full mb-1.5 z-30 p-2.5 bg-surface border border-hairline rounded-xl shadow-lg text-[10px] font-mono space-y-1 min-w-[210px] animate-in fade-in duration-100">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted">Prev:</span>
                      <HashChip hash={prevHash} truncateLen={4} />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted">Hash:</span>
                      <HashChip hash={currentHash} truncateLen={4} />
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Connecting line that breaks when tampered */}
              {index < displayPackets.length - 1 && (
                <div className="flex items-center justify-center px-0.5 flex-shrink-0 relative">
                  {isBreak && (
                    <motion.span
                      initial={prefersReducedMotion ? false : { x: -4 }}
                      animate={prefersReducedMotion ? false : { x: [-4, 4, -4, 4, 0] }}
                      transition={{ duration: 0.2 }}
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-flagged-bg text-flagged-ink border border-brand/40 flex items-center gap-0.5 z-10 whitespace-nowrap shadow-sm"
                    >
                      <ShieldAlert className="w-2.5 h-2.5 text-brand" />
                      chain broken here
                    </motion.span>
                  )}
                  <motion.svg
                    width="24"
                    height="12"
                    viewBox="0 0 24 12"
                    className="overflow-visible"
                    animate={isBreak && !prefersReducedMotion ? { x: [-3, 3, -3, 3, 0] } : {}}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.path
                      d="M 0 6 L 24 6"
                      fill="none"
                      stroke={isBreak ? "var(--brand, #E5383B)" : "currentColor"}
                      className={isBreak ? "" : "text-muted/40"}
                      strokeWidth={isBreak ? "2.5" : "1.5"}
                      strokeDasharray={isBreak ? "4 2" : "24"}
                      initial={{ strokeDashoffset: 24 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
                    />
                  </motion.svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
