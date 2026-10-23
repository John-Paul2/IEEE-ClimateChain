import React from "react";
import { motion } from "framer-motion";
import { Link2, ArrowRight, ShieldCheck, Activity } from "lucide-react";
import type { TelemetryPacket } from "../types/telemetry";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface HashChainStripProps {
  packets?: TelemetryPacket[];
  maxPackets?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const HashChainStrip: React.FC<HashChainStripProps> = ({
  packets = [],
  maxPackets = 6,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  if (isLoading) {
    return (
      <div className={`p-6 bg-surface border border-hairline rounded-card shadow-card space-y-4 w-full max-w-full min-w-0 overflow-hidden ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-chip" />
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-2 w-full max-w-full min-w-0">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-36 min-w-[220px] rounded-card flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title="Hash Chain Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  const displayPackets = packets.slice(0, maxPackets);

  if (isEmpty || displayPackets.length === 0) {
    return (
      <div className={`p-6 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <EmptyState
          icon={Link2}
          title="No chained packets"
          description="Hash chain sequence will appear here once telemetry packets are signed and anchored."
        />
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Tamper-Evident Hash Chain Telemetry Strip"
      className={`p-6 bg-surface border border-hairline rounded-card shadow-card w-full max-w-full min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-hairline gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-sm text-ink">Hash chain</h2>
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-chip bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            SHA-256 verified
          </span>
        </div>
        <div className="flex items-center gap-2">
          {displayPackets.length > 0 && (
            <span
              data-testid="latest-sequence-badge"
              className="text-xs font-mono font-bold px-2.5 py-1 rounded-chip bg-surface-soft text-ink border border-hairline"
            >
              Latest Sequence: #{displayPackets[displayPackets.length - 1].seq}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto pb-4 scrollbar-thin w-full max-w-full min-w-0">
        {displayPackets.map((packet, index) => {
          const isGenesis = packet.seq === 0;
          const nextPacket = displayPackets[index + 1];
          const isLinkValid = nextPacket ? nextPacket.prev_hash === packet.packet_hash : true;

          return (
            <React.Fragment key={packet.seq}>
              {/* Packet Node Card */}
              <div
                data-testid={`hash-chain-packet-${packet.seq}`}
                className="min-w-[230px] p-4 bg-surface-soft border border-hairline rounded-card flex flex-col justify-between flex-shrink-0 transition-all hover:border-hairline-strong shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-hairline">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                    <span className="font-mono font-bold text-xs text-ink">Seq #{packet.seq}</span>
                  </div>
                  {isGenesis ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-chip font-mono font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      GENESIS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-chip font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3" />
                      LINKED
                    </span>
                  )}
                </div>

                {/* Packet Measurements */}
                <div className="space-y-1 mb-3 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-muted-strong">CO₂:</span>
                    <span className="text-ink font-semibold">
                      {packet.values.co2_mass_short_tons ?? "--"} T
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-muted-strong">Heat:</span>
                    <span className="text-ink">{packet.values.heat_input_mmbtu ?? "--"} mmBtu</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-muted-strong">Load:</span>
                    <span className="text-ink">{packet.values.gross_load_mw ?? "--"} MW</span>
                  </div>
                  {packet.values.synthetic_stack_o2_pct !== undefined && (
                    <div className="flex justify-between font-mono text-[11px] text-muted-strong">
                      <span className="italic">O₂ (synth):</span>
                      <span>{packet.values.synthetic_stack_o2_pct}%</span>
                    </div>
                  )}
                </div>

                {/* Packet Cryptographic Hashes */}
                <div className="pt-2 border-t border-hairline space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-strong font-mono">prev:</span>
                    <HashChip hash={packet.prev_hash} truncateLen={3} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-strong font-mono">hash:</span>
                    <HashChip hash={packet.packet_hash} truncateLen={3} />
                  </div>
                </div>
              </div>

              {/* Animated Drawing Connecting Link */}
              {index < displayPackets.length - 1 && (
                <div
                  className="flex flex-col items-center justify-center px-1 flex-shrink-0"
                  aria-hidden="true"
                >
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded-chip border ${
                      isLinkValid
                        ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                        : "text-[#FF6B6B] bg-red-500/15 border-red-500/30"
                    }`}
                  >
                    {isLinkValid ? "prev == H" : "BREAK"}
                  </span>
                  <svg width="40" height="24" viewBox="0 0 40 24" className="overflow-visible">
                    <motion.path
                      d="M 2 12 L 34 12"
                      fill="none"
                      stroke={isLinkValid ? "#0E9F6E" : "#FF6B6B"}
                      strokeWidth="2"
                      strokeDasharray="40"
                      initial={{ strokeDashoffset: 40 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 0.6, ease: "easeInOut", delay: index * 0.1 }}
                    />
                  </svg>
                  <ArrowRight
                    className={`w-3.5 h-3.5 -ml-2 -mt-2.5 ${
                      isLinkValid ? "text-[#0E9F6E]" : "text-[#9B1C1C]"
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
