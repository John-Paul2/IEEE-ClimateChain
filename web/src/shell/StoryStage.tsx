import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, X, Play, Check, ArrowRight } from "lucide-react";
import { useData } from "../data/DataContext";

const REASON_LABELS: Record<string, string> = {
  CROSS_SOURCE_MISMATCH: "Fuel vs. stack mismatch",
  PHYSICS_RESIDUAL: "Mass-balance physics residual",
  SPECTRAL_REPEAT: "Repeated pattern anomaly",
  AE_RESIDUAL: "Autoencoder anomaly",
  CHAIN_BREAK: "Hash-chain break",
  SEQ_GAP: "Sequence gap",
  SIG_INVALID: "Signature invalid",
  SPECTRAL_FLAT: "Flatline sensor signal",
};

interface RouteNode {
  id: string;
  stepNum: number;
  label: string;
  page: string;
}

const NODES: RouteNode[] = [
  { id: "plant", stepNum: 1, label: "Plant", page: "/operator" },
  { id: "chain", stepNum: 2, label: "Hash Chain", page: "/operator" },
  { id: "blockchain", stepNum: 3, label: "Blockchain", page: "/operator" },
  { id: "verifiers", stepNum: 4, label: "Verifiers", page: "/verifier" },
  { id: "buyer", stepNum: 5, label: "Buyer", page: "/importer" },
];

export const StoryStage: React.FC = () => {
  const { scenarioStatus, pauseScenario, playScenario, batches } = useData();
  const navigate = useNavigate();

  const [showEvidence, setShowEvidence] = useState(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const hasAutoPausedRef = useRef(false);

  const currentStep = scenarioStatus?.current_step || 0;
  const isPlaying = scenarioStatus?.status === "playing";

  // Automatically show ONLY when user actively starts playing the story, or explicitly toggles it
  useEffect(() => {
    if (isPlaying) {
      setIsVisible(true);
    }
  }, [isPlaying]);

  useEffect(() => {
    const handleToggle = (e: Event) => {
      const show = (e as CustomEvent)?.detail?.show;
      if (typeof show === "boolean") {
        setIsVisible(show);
      } else {
        setIsVisible((prev) => !prev);
      }
    };
    window.addEventListener("vericems-toggle-story-stage", handleToggle);
    return () => window.removeEventListener("vericems-toggle-story-stage", handleToggle);
  }, []);

  // Determine active node index (0..4)
  let activeNodeIndex = 0;
  if (currentStep <= 0) {
    activeNodeIndex = 0;
  } else if (currentStep === 1) {
    activeNodeIndex = 1;
  } else if (currentStep === 2) {
    activeNodeIndex = 2;
  } else if (currentStep >= 3 && currentStep <= 7) {
    activeNodeIndex = 3;
  } else if (currentStep >= 8) {
    activeNodeIndex = 4;
  }

  // At the attack batch (step 5), pause once with button "See why it was caught"
  useEffect(() => {
    if (currentStep === 5 && isPlaying && !hasAutoPausedRef.current) {
      hasAutoPausedRef.current = true;
      pauseScenario();
    }
    if (currentStep === 0) {
      hasAutoPausedRef.current = false;
    }
  }, [currentStep, isPlaying, pauseScenario]);

  let stageCaption = "Telemetry route from stack sensor to buyer.";
  if (currentStep === 1) {
    stageCaption = "Reading sealed into tamper-evident hash chain.";
  } else if (currentStep === 2) {
    stageCaption = "Fingerprint anchored on Arbitrum Sepolia.";
  } else if (currentStep === 3) {
    stageCaption = "Five independent verifiers vote on batch.";
  } else if (currentStep === 4) {
    stageCaption = "Consensus clean. Batch verified on chain.";
  } else if (currentStep === 5) {
    stageCaption = "Fraud consensus. Batch quarantined pending dispute.";
  } else if (currentStep === 6) {
    stageCaption = "Challenge window opened for operator appeal.";
  } else if (currentStep === 7) {
    stageCaption = "Quarantine upheld. Operator deposit is slashed.";
  } else if (currentStep >= 8) {
    stageCaption = "Buyer independently re-verified report in browser.";
  }

  const batch2 = batches.find((b) => b.batch_id === 2);
  const rawReasons: string[] =
    batch2?.reason_codes ||
    (batch2 as any)?.verdict_summary?.reason_codes ||
    ["CROSS_SOURCE_MISMATCH", "PHYSICS_RESIDUAL", "SPECTRAL_REPEAT"];

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Sleek Single-Line Story Stage Bar (Never blocks content, no overlapping squares) */}
      <div
        role="region"
        aria-label="Story Stage Route Map"
        className="w-full bg-[#0A0A0A] border-b border-[#262626] text-white select-none"
      >
        <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Story Stage Label + 5 Clean Stepper Pills */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#A3A3A3] shrink-0">
              Story Route
            </span>

            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {NODES.map((node, idx) => {
                const isActive = idx === activeNodeIndex;
                const isPassed = idx < activeNodeIndex;

                return (
                  <React.Fragment key={node.id}>
                    <button
                      type="button"
                      onClick={() => navigate(node.page)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-mono transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#E5383B] text-white font-bold shadow-xs"
                          : isPassed
                          ? "bg-[#1F1F22] text-emerald-400 border border-emerald-500/30"
                          : "bg-[#161618] text-[#8E8E93] hover:text-white border border-[#262629]"
                      }`}
                      title={`Go to ${node.label}`}
                    >
                      {isPassed ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="text-[10px] opacity-80">{node.stepNum}.</span>
                      )}
                      <span>{node.label}</span>
                    </button>
                    {idx < NODES.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-[#52525B] hidden sm:inline shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Right: Caption + Evidence Trigger + Close Button */}
          <div className="flex items-center gap-2.5 ml-auto">
            <span className="text-xs text-[#D4D4D8] hidden lg:inline font-sans">
              {stageCaption}
            </span>

            {currentStep === 5 && (
              <button
                type="button"
                onClick={() => setShowEvidence(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[11px] font-mono font-bold bg-[#E5383B] text-white hover:bg-[#BA1F22] transition-colors cursor-pointer shrink-0"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>See why it was caught</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                pauseScenario();
                setIsVisible(false);
              }}
              aria-label="Close story stage strip"
              className="text-[#8E8E93] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="Close story bar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Forensic Evidence Dialog for Flagged Attack Batch */}
      {showEvidence && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Forensic Evidence Breakdown"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEvidence(false);
          }}
        >
          <div className="w-full max-w-md bg-surface border border-hairline rounded-card shadow-2xl p-5 space-y-4 text-ink">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand" />
                <h3 className="font-heading font-bold text-base text-ink">
                  Why Batch #2 Was Caught
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEvidence(false)}
                className="text-muted hover:text-ink p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-strong">
              Verifiers detected non-physical anomalies in telemetry readings:
            </p>

            <div className="flex flex-wrap gap-2">
              {rawReasons.map((code) => (
                <span
                  key={code}
                  className="px-2.5 py-1 rounded-pill text-xs font-mono font-semibold bg-brand/15 text-flagged-ink border border-brand/30"
                >
                  {REASON_LABELS[code] || code}
                </span>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-surface-soft border border-hairline text-xs font-mono text-muted-strong space-y-1">
              <div>
                <strong className="text-ink">Attack Type:</strong> Synthetic constant scaling
              </div>
              <div>
                <strong className="text-ink">Consensus:</strong> 5 of 5 verifiers voted fraud
              </div>
              <div>
                <strong className="text-ink">Action:</strong> Quarantined pending challenge window
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setShowEvidence(false)}
                className="px-3.5 py-1.5 rounded-pill border border-hairline text-xs font-semibold text-muted-strong hover:text-ink hover:bg-surface-soft cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEvidence(false);
                  playScenario();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-pill bg-brand text-white text-xs font-semibold hover:bg-brand-pressed cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Resume story</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
