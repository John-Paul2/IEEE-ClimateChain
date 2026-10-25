import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { BorderBeam } from "../components/ui/border-beam";
import { X } from "lucide-react";
import { useData } from "../data/DataContext";
import { STORY_STEPS, type StoryStep } from "./steps";

export const StorySpotlight: React.FC = () => {
  const { scenarioStatus, narrationEnabled } = useData();
  const [dismissedForStep, setDismissedForStep] = useState<number | null>(null);

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

  // Manage target highlight ring and scroll into view
  useEffect(() => {
    // Clear previous highlight
    if (highlightedElRef.current) {
      highlightedElRef.current.classList.remove("story-target-highlight");
      highlightedElRef.current = null;
    }

    if (!active || !currentStep) return;

    const timer = setTimeout(() => {
      const targetEl = document.querySelector<HTMLElement>(
        `[data-story="${currentStep.target}"]`
      );

      if (targetEl) {
        targetEl.classList.add("story-target-highlight", "relative", "overflow-hidden");
        highlightedElRef.current = targetEl;
        setTargetElement(targetEl);

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
    }, 60);

    return () => {
      clearTimeout(timer);
      setTargetElement(null);
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove("story-target-highlight");
        highlightedElRef.current = null;
      }
    };
  }, [active, currentStep, currentStepNum]);

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
      </div>
    </>
  );
};
