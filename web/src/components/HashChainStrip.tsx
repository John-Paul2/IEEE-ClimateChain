import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link2, ShieldAlert } from "lucide-react";
import type { TelemetryPacket } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export interface HashChainStripProps {
  packets?: TelemetryPacket[];
  maxPackets?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

// Build snapshot fallback map to guarantee real SHA-256 hashes for recorded runs
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
}) => {
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card space-y-3 w-full overflow-hidden ${className}`}>
        <Skeleton className="h-4 w-32 rounded-md" />
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-24 min-w-[130px] rounded-lg flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card ${className}`}>
        <ErrorState title="Hash chain error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  // Sort packets ascending by sequence
  const sortedPackets = [...packets].sort((a, b) => a.seq - b.seq);
  const displayPackets = sortedPackets.slice(-maxPackets);

  if (isEmpty || displayPackets.length === 0) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card ${className}`}>
        <EmptyState
          icon={Link2}
          title="No chained packets"
          description="Packets will chain sequentially as they arrive."
        />
      </div>
    );
  }

  return (
    <div
      role="region"
      data-story="hash-chain-strip"
      aria-label="Tamper-evident hash chain timeline"
      className={`p-4 bg-surface border border-hairline rounded-card w-full overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
          <h2 className="text-xs font-semibold text-ink">Hash chain</h2>
          <span className="text-[11px] text-muted-strong">
            Each packet commits the SHA-256 hash of the previous packet.
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted-strong">
          Latest #{displayPackets[displayPackets.length - 1].seq}
        </span>
      </div>

      {/* Horizontal timeline of packet nodes */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin w-full">
        {displayPackets.map((packet, index) => {
          const snap = snapshotHashes.get(packet.seq);
          const currentHash =
            packet.packet_hash ||
            (packet as any).hash ||
            snap?.hash ||
            "";
          const prevHash =
            packet.prev_hash ||
            snap?.prev_hash ||
            "";

          const nextPacket = displayPackets[index + 1];
          const nextSnap = nextPacket ? snapshotHashes.get(nextPacket.seq) : undefined;
          const nextPrevHash = nextPacket
            ? nextPacket.prev_hash || nextSnap?.prev_hash || ""
            : "";

          // Show BREAK only if next packet prev_hash does not equal this packet hash
          const isBreak = Boolean(
            nextPacket &&
              currentHash &&
              nextPrevHash &&
              nextPrevHash.toLowerCase() !== currentHash.toLowerCase()
          );

          const co2 =
            packet.values?.co2_mass_short_tons !== undefined
              ? Number(packet.values.co2_mass_short_tons).toFixed(1)
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
          const loadStr =
            rawLoad === undefined || rawLoad === null || Number(rawLoad) === 0
              ? "-"
              : `${Number(rawLoad).toFixed(1)} MW`;

          const isHovered = activeSeq === packet.seq;

          return (
            <React.Fragment key={packet.seq}>
              {/* Compact Packet Node */}
              <motion.div
                data-testid={`hash-chain-packet-${packet.seq}`}
                initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
                onMouseEnter={() => setActiveSeq(packet.seq)}
                onMouseLeave={() => setActiveSeq(null)}
                onClick={() => setActiveSeq((prev) => (prev === packet.seq ? null : packet.seq))}
                className="relative min-w-[124px] p-2.5 bg-surface-soft border border-hairline rounded-lg flex-shrink-0 cursor-pointer hover:border-ink transition-colors"
              >
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-hairline">
                  <span className="font-mono font-semibold text-xs text-ink">
                    #{packet.seq}
                  </span>
                  <span className="text-[10px] font-mono text-muted-strong">
                    {co2} T
                  </span>
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

                {/* Prev and Hash Chips shown on hover or click */}
                {isHovered && (
                  <div className="absolute left-0 bottom-full mb-1 z-30 p-2 bg-surface border border-hairline rounded-lg shadow-lg text-[10px] font-mono space-y-1 min-w-[210px] animate-in fade-in duration-100">
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

              {/* Connecting line that draws in */}
              {index < displayPackets.length - 1 && (
                <div className="flex items-center justify-center px-0.5 flex-shrink-0 relative">
                  {isBreak && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-red-500/15 text-[#FF6B6B] border border-red-500/30 flex items-center gap-0.5 z-10">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      BREAK
                    </span>
                  )}
                  <svg width="24" height="12" viewBox="0 0 24 12" className="overflow-visible">
                    <motion.path
                      d="M 0 6 L 24 6"
                      fill="none"
                      stroke={isBreak ? "#FF6B6B" : "currentColor"}
                      className={isBreak ? "" : "text-muted/40"}
                      strokeWidth="1.5"
                      strokeDasharray="24"
                      initial={{ strokeDashoffset: 24 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
                    />
                  </svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
