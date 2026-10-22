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
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-36 min-w-[220px] rounded-lg flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState
          title="Hash Chain Error"
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }

  const displayPackets = packets.slice(0, maxPackets);

  if (isEmpty || displayPackets.length === 0) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl ${className}`}>
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
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-border/50 gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-info" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text">Tamper-Evident Hash Chain</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-verified/10 text-verified font-medium border border-verified/30">
            SHA-256 Link Verified
          </span>
        </div>
        <div className="flex items-center gap-3">
          {displayPackets.length > 0 && (
            <span
              data-testid="latest-sequence-badge"
              className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-info/10 text-info border border-info/30"
            >
              Latest Sequence: #{displayPackets[displayPackets.length - 1].seq}
            </span>
          )}
          <span className="text-xs font-mono text-muted">
            Showing {displayPackets.length} of {packets.length} packets
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-thin">
        {displayPackets.map((packet, index) => {
          const isGenesis = packet.seq === 0;
          const nextPacket = displayPackets[index + 1];
          const isLinkValid = nextPacket
            ? nextPacket.prev_hash === packet.packet_hash
            : true;

          return (
            <React.Fragment key={packet.seq}>
              {/* Packet Node Card */}
              <div
                data-testid={`hash-chain-packet-${packet.seq}`}
                className="min-w-[230px] p-3.5 bg-surface-raised border border-border rounded-lg flex flex-col justify-between flex-shrink-0 transition-all hover:border-info/40"
              >
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-info" aria-hidden="true" />
                    <span className="font-mono font-bold text-xs text-text">Seq #{packet.seq}</span>
                  </div>
                  {isGenesis ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-info/10 text-info border border-info/30">
                      GENESIS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono bg-verified/10 text-verified border border-verified/30">
                      <ShieldCheck className="w-3 h-3" />
                      LINKED
                    </span>
                  )}
                </div>

                {/* Packet Measurements */}
                <div className="space-y-1 mb-3 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-muted">CO₂:</span>
                    <span className="text-text font-semibold">
                      {packet.values.co2_mass_short_tons ?? "--"} T
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-muted">Heat:</span>
                    <span className="text-text">
                      {packet.values.heat_input_mmbtu ?? "--"} mmBtu
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-muted">Load:</span>
                    <span className="text-text">
                      {packet.values.gross_load_mw ?? "--"} MW
                    </span>
                  </div>
                  {packet.values.synthetic_stack_o2_pct !== undefined && (
                    <div className="flex justify-between font-mono text-[11px] text-muted">
                      <span className="italic">O₂ (synth):</span>
                      <span>{packet.values.synthetic_stack_o2_pct}%</span>
                    </div>
                  )}
                </div>

                {/* Packet Cryptographic Hashes */}
                <div className="pt-2 border-t border-border/50 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted font-mono">prev:</span>
                    <HashChip hash={packet.prev_hash} truncateLen={3} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted font-mono">hash:</span>
                    <HashChip hash={packet.packet_hash} truncateLen={3} />
                  </div>
                </div>
              </div>

              {/* Animated Drawing Connecting Link Showing Previous-Hash Relation */}
              {index < displayPackets.length - 1 && (
                <div className="flex flex-col items-center justify-center px-1 flex-shrink-0" aria-hidden="true">
                  <span className={`text-[9px] font-mono px-1 rounded ${isLinkValid ? "text-verified bg-verified/10" : "text-flagged bg-flagged/10"}`}>
                    {isLinkValid ? "prev == H" : "BREAK"}
                  </span>
                  <svg width="40" height="24" viewBox="0 0 40 24" className="overflow-visible">
                    <motion.path
                      d="M 2 12 L 34 12"
                      fill="none"
                      stroke={isLinkValid ? "#2DD4BF" : "#F43F5E"}
                      strokeWidth="2"
                      strokeDasharray="40"
                      initial={{ strokeDashoffset: 40 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 0.6, ease: "easeInOut", delay: index * 0.1 }}
                    />
                  </svg>
                  <ArrowRight className={`w-3.5 h-3.5 -ml-2 -mt-2.5 ${isLinkValid ? "text-verified" : "text-flagged"}`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
