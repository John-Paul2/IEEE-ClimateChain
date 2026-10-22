import React, { useState } from "react";
import {
  ShieldAlert,
  Flame,
  Radio,
  Repeat,
  FileCode,
  ShieldCheck,
  Play,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";

export interface AttackOption {
  id: string;
  name: string;
  category: "Insider" | "MITM Wire" | "Clean";
  violatedLayer: "Physics & ML" | "Spectral FFT" | "Cryptographic" | "None";
  description: string;
  expectedFlag: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const BENCHMARK_ATTACKS: AttackOption[] = [
  {
    id: "none",
    name: "Honest Operation",
    category: "Clean",
    violatedLayer: "None",
    description: "Authentic sensor telemetry signed by edge gateway; clean quorum pass across all honest verifiers.",
    expectedFlag: "CLEAN (Passes Quorum)",
    icon: ShieldCheck,
  },
  {
    id: "constant_scaling",
    name: "Constant Scaling (-30% CO₂)",
    category: "Insider",
    violatedLayer: "Physics & ML",
    description: "Insider scales down CO₂ reading prior to signing to artificially minimize CBAM levy.",
    expectedFlag: "PHYSICS_RESIDUAL + AE_RESIDUAL",
    icon: Flame,
  },
  {
    id: "flatline",
    name: "Flatline Injection",
    category: "Insider",
    violatedLayer: "Spectral FFT",
    description: "Sensor signal frozen at constant low level; eliminates natural combustion variance.",
    expectedFlag: "SPECTRAL_FLAT + PHYSICS_RESIDUAL",
    icon: Radio,
  },
  {
    id: "replay",
    name: "Historical Packet Replay",
    category: "MITM Wire",
    violatedLayer: "Cryptographic",
    description: "Replays past signed telemetry packet; breaks SHA-256 hash chain and monotonic seq.",
    expectedFlag: "CHAIN_BREAK + SEQ_GAP",
    icon: Repeat,
  },
  {
    id: "tamper_after_signing",
    name: "Tamper After Signing (MITM)",
    category: "MITM Wire",
    violatedLayer: "Cryptographic",
    description: "Man-in-the-middle alters payload values on wire without secure-element private key.",
    expectedFlag: "SIG_INVALID + CHAIN_BREAK",
    icon: FileCode,
  },
];

export interface AttackPanelProps {
  currentAttack: string;
  onSelectAttack: (kind: string) => Promise<void>;
  onRunBatch: () => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const AttackPanel: React.FC<AttackPanelProps> = ({
  currentAttack = "none",
  onSelectAttack,
  onRunBatch,
  isLoading = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const handleSelect = async (kind: string) => {
    setIsSubmitting(true);
    setPanelError(null);
    try {
      await onSelectAttack(kind);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : "Failed to inject attack");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunBatch = async () => {
    setIsRunningBatch(true);
    setPanelError(null);
    try {
      await onRunBatch();
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : "Failed to execute batch");
    } finally {
      setIsRunningBatch(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || panelError) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState
          title="Attack Injection Error"
          message={error || panelError || undefined}
          onRetry={onRetry || (() => setPanelError(null))}
        />
      </div>
    );
  }

  const isAttacking = currentAttack !== "none";
  const activeAttackMeta = BENCHMARK_ATTACKS.find((a) => a.id === currentAttack) || BENCHMARK_ATTACKS[0];

  return (
    <div
      role="region"
      aria-label="Adversarial Attack Injection Panel"
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm space-y-4 ${className}`}
    >
      {/* Title & Live Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-flagged" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text">Adversarial Attack Injection Panel</h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Evaluate VeriCEMS multi-tier detection (Cryptographic, Mass-Balance Physics, Autoencoder)
          </p>
        </div>

        {/* Live Attack State Pill */}
        <div className="flex items-center gap-2">
          {isAttacking ? (
            <span
              data-testid="active-attack-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-flagged/15 text-flagged border border-flagged/40 animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ATTACK ACTIVE: {activeAttackMeta.name}</span>
            </span>
          ) : (
            <span
              data-testid="honest-mode-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-verified/10 text-verified border border-verified/30"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>HONEST MODE (No Attack Active)</span>
            </span>
          )}
        </div>
      </div>

      {/* Attack Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {BENCHMARK_ATTACKS.map((atk) => {
          const isSelected = currentAttack === atk.id;
          const Icon = atk.icon;

          return (
            <button
              key={atk.id}
              type="button"
              data-testid={`attack-btn-${atk.id}`}
              onClick={() => handleSelect(atk.id)}
              disabled={isSubmitting || isRunningBatch}
              className={`p-3.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                isSelected
                  ? atk.id === "none"
                    ? "bg-verified/10 border-verified text-text shadow-sm ring-1 ring-verified/50"
                    : "bg-flagged/10 border-flagged text-text shadow-sm ring-1 ring-flagged/50"
                  : "bg-surface-raised border-border text-muted hover:text-text hover:border-info/40 hover:bg-surface-raised/80"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={`w-4 h-4 ${
                        isSelected
                          ? atk.id === "none"
                            ? "text-verified"
                            : "text-flagged"
                          : "text-info"
                      }`}
                    />
                    <span className="font-mono font-bold text-xs text-text">{atk.name}</span>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                      atk.category === "Clean"
                        ? "bg-verified/10 text-verified border-verified/30"
                        : atk.category === "Insider"
                        ? "bg-warning/10 text-warning border-warning/30"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    }`}
                  >
                    {atk.category}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{atk.description}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                <span className="text-muted font-mono">Catch: {atk.violatedLayer}</span>
                <span
                  className={`font-mono font-semibold ${
                    isSelected ? (atk.id === "none" ? "text-verified" : "text-flagged") : "text-muted"
                  }`}
                >
                  {isSelected ? "Selected" : "Click to inject"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Strip: Run Next Batch */}
      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-sunken p-3 rounded-lg border border-border">
        <div className="text-xs text-muted flex items-center gap-2">
          <span className="font-medium text-text">Next Action:</span>
          <span>
            {isAttacking
              ? `Seal next batch under ${activeAttackMeta.name} to test on-chain quorum verdict`
              : "Seal next batch under honest operation"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isAttacking && (
            <button
              type="button"
              onClick={() => handleSelect("none")}
              disabled={isSubmitting || isRunningBatch}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-surface-raised hover:bg-surface-raised/80 border border-border text-muted hover:text-text transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Honest</span>
            </button>
          )}

          <button
            type="button"
            data-testid="seal-batch-btn"
            onClick={handleRunBatch}
            disabled={isSubmitting || isRunningBatch}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${
              isAttacking
                ? "bg-flagged text-white hover:bg-flagged/90 ring-1 ring-flagged/60"
                : "bg-info text-surface-sunken hover:bg-info/90"
            }`}
          >
            {isRunningBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sealing & Anchoring...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Seal & Anchor Next Batch</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
