import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Shield, AlertCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface ReasonInfo {
  label: string;
  desc: string;
  layer: "Cryptographic" | "Physics" | "ML" | "Signal";
}

export const REASON_EXPLANATIONS: Record<string, ReasonInfo> = {
  CHAIN_BREAK: {
    label: "Hash Chain Break",
    desc: "Previous packet hash does not match prior record (indicates record deletion or reordering).",
    layer: "Cryptographic",
  },
  SEQ_GAP: {
    label: "Sequence Number Gap",
    desc: "Packet sequence number is not strictly sequential (packet dropped, skipped, or duplicated).",
    layer: "Cryptographic",
  },
  SIG_INVALID: {
    label: "ECDSA Signature Invalid",
    desc: "P-256 cryptographic signature verification failed against registered gateway public key.",
    layer: "Cryptographic",
  },
  PHYSICS_RESIDUAL: {
    label: "Mass-Balance Residual Violation",
    desc: "Reported CO₂ mass departs from heat input and fuel emission factor stoichiometric bounds.",
    layer: "Physics",
  },
  AE_RESIDUAL: {
    label: "Autoencoder Reconstruction Anomaly",
    desc: "Physics-informed neural network reconstruction error exceeds calibrated anomaly threshold.",
    layer: "ML",
  },
  SPECTRAL_FLAT: {
    label: "Sensor Flatline Anomaly",
    desc: "Abnormal loss of natural sensor variance; constant frozen reading detected.",
    layer: "Signal",
  },
  SPECTRAL_REPEAT: {
    label: "Spectral Periodicity Anomaly",
    desc: "Autocorrelation spike detected indicating replayed historical data window.",
    layer: "Signal",
  },
  CROSS_SOURCE_MISMATCH: {
    label: "Cross-Source Meter Discrepancy",
    desc: "Discrepancy detected between stack flow and independent fuel flow measurements.",
    layer: "Physics",
  },
};

export interface TrustGaugeProps {
  scoreBp?: number | null; // 0..10000 basis points
  thresholdBp?: number; // default 5000 bp (50%)
  verdict?: "clean" | "fraud" | "pending";
  reasonCodes?: string[];
  title?: string;
  size?: number;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const TrustGauge: React.FC<TrustGaugeProps> = ({
  scoreBp,
  thresholdBp = 5000,
  verdict,
  reasonCodes = [],
  title = "Verification Trust Score",
  size = 200,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  if (isLoading) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 bg-surface border border-border rounded-xl ${className}`}
        style={{ minHeight: size + 40 }}
      >
        <Skeleton variant="circular" width={size * 0.7} height={size * 0.7} className="mb-4" />
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title={title} message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || scoreBp === null || scoreBp === undefined) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 bg-surface border border-border rounded-xl text-center ${className}`}
        style={{ minHeight: size + 40 }}
      >
        <div className="p-3 bg-surface-raised border border-border rounded-full text-muted mb-3">
          <AlertCircle className="w-8 h-8" aria-hidden="true" />
        </div>
        <h4 className="text-sm font-medium text-text">{title}</h4>
        <p className="text-xs text-muted mt-1">No trust score calculated yet</p>
      </div>
    );
  }

  const safeScore = Math.max(0, Math.min(10000, scoreBp));
  const pct = safeScore / 10000;
  const isAboveThreshold = safeScore >= thresholdBp;

  // Visual parameters for semi-circular arc (180 degrees)
  const radius = 70;
  const strokeWidth = 12;
  const arcLength = Math.PI * radius; // length of 180 deg semicircle
  const strokeDashoffset = arcLength * (1 - pct);

  const gaugeColor =
    verdict === "fraud" || !isAboveThreshold
      ? "#F43F5E"
      : verdict === "clean" || isAboveThreshold
      ? "#2DD4BF"
      : "#F59E0B";

  const derivedVerdict = verdict || (isAboveThreshold ? "clean" : "fraud");

  return (
    <div
      role="region"
      aria-label={`${title}: ${(pct * 100).toFixed(2)} percent (${safeScore} basis points)`}
      className={`flex flex-col items-center justify-center p-6 bg-surface border border-border rounded-xl shadow-sm ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
        {title}
      </span>

      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.65 }}>
        <svg
          viewBox="0 0 180 110"
          className="w-full h-full overflow-visible"
          role="img"
          aria-hidden="true"
        >
          {/* Background Track Arc */}
          <path
            d="M 20 100 A 70 70 0 0 1 160 100"
            fill="none"
            stroke="#1F2A44"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Threshold Marker at thresholdBp */}
          {(() => {
            const threshAngle = Math.PI * (1 - thresholdBp / 10000);
            const tx = 90 - radius * Math.cos(threshAngle);
            const ty = 100 - radius * Math.sin(threshAngle);
            return (
              <circle
                cx={tx}
                cy={ty}
                r="3"
                fill="#8FA0BF"
              >
                <title>{`Quorum threshold: ${thresholdBp} bp`}</title>
              </circle>
            );
          })()}

          {/* Animated Gauge Arc (Motion with purpose) */}
          <motion.path
            d="M 20 100 A 70 70 0 0 1 160 100"
            fill="none"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold font-mono tracking-tight text-text">
            {(pct * 100).toFixed(1)}%
          </span>
          <span className="text-xs font-mono text-muted">{safeScore} bp</span>
        </div>
      </div>

      {/* Accessible verdict label with icon */}
      <div className="mt-4 flex items-center gap-2">
        {derivedVerdict === "clean" ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-verified/10 border border-verified/30 text-verified">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>CLEAN (Passes Quorum)</span>
          </span>
        ) : derivedVerdict === "fraud" ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-flagged/10 border border-flagged/30 text-flagged">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>FRAUD (Flagged by Quorum)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-warning/10 border border-warning/30 text-warning">
            <Shield className="w-4 h-4" aria-hidden="true" />
            <span>PENDING CONSENSUS</span>
          </span>
        )}
      </div>

      {/* Flagged Reason Codes with Plain-Language Explanations */}
      {derivedVerdict === "fraud" && reasonCodes.length > 0 && (
        <div className="mt-4 w-full pt-4 border-t border-border/60 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-flagged">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Flagged Reason Codes ({reasonCodes.length})</span>
          </div>
          <div className="space-y-2">
            {reasonCodes.map((code) => {
              const info = REASON_EXPLANATIONS[code] || {
                label: code,
                desc: "Anomaly detected by verifier committee checks.",
                layer: "ML",
              };
              const layerBg =
                info.layer === "Cryptographic"
                  ? "bg-info/10 text-info border-info/30"
                  : info.layer === "Physics"
                  ? "bg-warning/10 text-warning border-warning/30"
                  : info.layer === "Signal"
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                  : "bg-flagged/10 text-flagged border-flagged/30";

              return (
                <div
                  key={code}
                  className="p-2.5 rounded-lg bg-surface-raised border border-flagged/30 text-left space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-xs text-text">
                      {info.label} ({code})
                    </span>
                    <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${layerBg}`}>
                      {info.layer}
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{info.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
