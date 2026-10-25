import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { BorderBeam } from "../components/ui/border-beam";
import { X, ShieldAlert, Play } from "lucide-react";
import { useData } from "../data/DataContext";
import { STORY_STEPS, type StoryStep } from "./steps";

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

export const StorySpotlight: React.FC = () => {
  const { scenarioStatus, narrationEnabled, playScenario } = useData();
  const [dismissedForStep, setDismissedForStep] = useState<number | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const currentStepNum = scenarioStatus?.current_step || 0;
  const isPlaying = scenarioStatus?.status === "playing";
  const isPaused = scenarioStatus?.status === "paused";

  // Captions show when narration is enabled (or active step is playing/paused)
  const active =
    narrationEnabled &&
    currentStepNum > 0 &&
    (isPlaying || isPaused) &&
    dismissedForStep !== currentStepNum;

  const currentStep: StoryStep | undefined = STORY_STEPS.find(
    (s) => s.stepNumber === currentStepNum
  );

  const highlightedElRef = useRef<HTMLElement | null>(null);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const userInteractingRef = useRef<boolean>(false);
  const userInteractionTimeoutRef = useRef<number | null>(null);

  // Esc key exits spotlight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDismissedForStep(currentStepNum);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStepNum]);

  // Pause auto-scroll for 3s on wheel, touch, or keydown (user is scrolling)
  useEffect(() => {
    const handleInteraction = (e: Event) => {
      if (e.type === "keydown") {
        const key = (e as KeyboardEvent).key;
        if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", " ", "Home", "End"].includes(key)) {
          return;
        }
      }
      userInteractingRef.current = true;
      if (userInteractionTimeoutRef.current !== null) {
        window.clearTimeout(userInteractionTimeoutRef.current);
      }
      userInteractionTimeoutRef.current = window.setTimeout(() => {
        userInteractingRef.current = false;
        userInteractionTimeoutRef.current = null;
      }, 3000);
    };

    window.addEventListener("wheel", handleInteraction, { passive: true });
    window.addEventListener("touchmove", handleInteraction, { passive: true });
    window.addEventListener("keydown", handleInteraction, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleInteraction);
      window.removeEventListener("touchmove", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      if (userInteractionTimeoutRef.current !== null) {
        window.clearTimeout(userInteractionTimeoutRef.current);
      }
    };
  }, []);

  // Manage target highlight ring only on step change or active state change
  useEffect(() => {
    // Clear previous highlight
    if (highlightedElRef.current) {
      highlightedElRef.current.classList.remove("story-target-highlight");
      highlightedElRef.current = null;
    }

    if (!active || !currentStep) {
      setTargetElement(null);
      return;
    }

    const timer = setTimeout(() => {
      const targetEl = document.querySelector<HTMLElement>(
        `[data-story="${currentStep.target}"]`
      );

      if (targetEl) {
        targetEl.classList.add("story-target-highlight", "relative", "overflow-hidden");
        highlightedElRef.current = targetEl;
        setTargetElement(targetEl);

        // Never auto-scroll while the user is actively scrolling
        if (!userInteractingRef.current) {
          const prefersReducedMotion =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

          const isMobile = window.innerWidth <= 640;

          targetEl.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: isMobile ? "start" : "center",
            inline: "nearest",
          });
        }
      }
    }, 60);

    return () => {
      clearTimeout(timer);
      setTargetElement(null);
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove("story-target-highlight");
        highlightedElRef.current = null;
      }
    };
  }, [currentStepNum, active]);

  // Recalculate spotlight positioning on resize using ResizeObserver
  useEffect(() => {
    if (!targetElement || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (highlightedElRef.current && !highlightedElRef.current.classList.contains("story-target-highlight")) {
        highlightedElRef.current.classList.add("story-target-highlight");
      }
    });

    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [targetElement]);

  if (!active || !currentStep) {
    return null;
  }

  return (
    <>
      {targetElement &&
        createPortal(
          <BorderBeam size={140} duration={6} colorFrom="#E5383B" colorTo="#FF6B6B" />,
          targetElement
        )}
      {/* Visual dim overlay without intercepting any user clicks or focus */}
      <div
        data-testid="story-dim-overlay"
        className="fixed inset-0 bg-black/20 dark:bg-black/35 pointer-events-none z-30 transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* Caption card at bottom-left with polite live region */}
      <div
        role="region"
        aria-live="polite"
        aria-atomic="true"
        data-testid="story-caption-card"
        className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-50 w-[calc(100%-1.5rem)] sm:w-auto max-w-[340px] sm:max-w-sm p-4 rounded-card bg-surface border border-hairline shadow-2xl transition-all duration-200"
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-hairline">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand">
            Step {currentStep.stepNumber} of {STORY_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => setDismissedForStep(currentStepNum)}
            className="text-muted hover:text-ink text-xs p-1 rounded-md transition-colors cursor-pointer"
            aria-label="Exit spotlight"
            title="Press Esc to exit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <h3 className="font-heading font-bold text-sm text-ink mb-1">
          {currentStep.title}
        </h3>
        <p className="text-xs text-muted-strong leading-relaxed">
          {currentStep.sentence}
        </p>
        {currentStep.stepNumber === 5 && (
          <div className="mt-2.5 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-pressed transition-colors cursor-pointer shadow-sm"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>See why it was caught</span>
            </button>
          </div>
        )}
      </div>

      {evidenceOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Forensic Evidence Breakdown"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEvidenceOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-surface border border-hairline rounded-card shadow-2xl p-5 space-y-4 text-ink">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand" />
                <h3 className="font-heading font-bold text-sm text-ink">
                  Why Batch #2 Was Caught
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceOpen(false)}
                className="text-muted hover:text-ink p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-strong">
              Verifiers detected non-physical anomalies in telemetry readings:
            </p>

            <div className="flex flex-wrap gap-2">
              {[
                "CROSS_SOURCE_MISMATCH",
                "PHYSICS_RESIDUAL",
                "SPECTRAL_REPEAT",
              ].map((code) => (
                <span
                  key={code}
                  className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-brand/10 text-brand border border-brand/30"
                >
                  {REASON_LABELS[code] || code}
                </span>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-surface-soft border border-hairline text-xs font-mono text-muted-strong space-y-1">
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
                onClick={() => setEvidenceOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-hairline text-xs font-semibold text-muted-strong hover:text-ink hover:bg-surface-soft"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setEvidenceOpen(false);
                  playScenario();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-pressed"
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
