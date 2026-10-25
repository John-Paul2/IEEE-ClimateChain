import React, { useReducer, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Check,
  X,
  Sparkles,
  ExternalLink,
  Github,
  Video,
  Layers,
  ArrowRight,
  ArrowLeft,
  Minimize2,
  Maximize2,
} from "lucide-react";
import {
  GUIDE_MISSIONS,
  FREE_PLAY_ITEMS,
  type GuideMissionStep,
} from "./missions";
import { GhostCursor } from "./GhostCursor";
import { deploymentConfig, arbitrumSepoliaDeployment } from "../chain/deploymentConfig";
import { useData } from "../data/DataContext";

export type GuidePhase = "demo" | "yourTurn" | "done";
export type GuideMode = "showMe" | "illTry";

export interface GuideState {
  isActive: boolean;
  missionIndex: number;
  phase: GuidePhase;
  mode: GuideMode;
  cursorPos: { x: number; y: number } | null;
  cursorVisible: boolean;
  isRippling: boolean;
  showDoItForMe: boolean;
  freePlayChecks: Record<string, boolean>;
  showFinishSummary: boolean;
  isMinimized: boolean;
  dockSide: "right" | "left";
}

export type GuideAction =
  | { type: "START_MISSION"; missionIndex: number; mode?: GuideMode }
  | { type: "SET_PHASE"; phase: GuidePhase }
  | { type: "SET_MODE"; mode: GuideMode }
  | { type: "SET_CURSOR"; pos: { x: number; y: number } | null; visible?: boolean }
  | { type: "SET_RIPPLE"; isRippling: boolean }
  | { type: "SHOW_DO_IT_FOR_ME" }
  | { type: "COMPLETE_FREE_PLAY"; itemId: string }
  | { type: "TOGGLE_FINISH_SUMMARY"; show: boolean }
  | { type: "TOGGLE_MINIMIZE" }
  | { type: "TOGGLE_DOCK_SIDE" }
  | { type: "NEXT_MISSION" }
  | { type: "PREV_MISSION" }
  | { type: "CLOSE_GUIDE" };

const initialState: GuideState = {
  isActive: false,
  missionIndex: 0,
  phase: "demo",
  mode: "showMe",
  cursorPos: null,
  cursorVisible: false,
  isRippling: false,
  showDoItForMe: false,
  freePlayChecks: {},
  showFinishSummary: false,
  isMinimized: false,
  dockSide: "right",
};

function guideReducer(state: GuideState, action: GuideAction): GuideState {
  switch (action.type) {
    case "START_MISSION": {
      const idx = Math.max(0, Math.min(GUIDE_MISSIONS.length - 1, action.missionIndex));
      const effectiveMode = action.mode || state.mode;
      return {
        ...state,
        isActive: true,
        missionIndex: idx,
        phase: effectiveMode === "illTry" ? "yourTurn" : "demo",
        mode: effectiveMode,
        showDoItForMe: false,
        cursorVisible: false,
        isMinimized: false,
      };
    }
    case "SET_PHASE":
      return {
        ...state,
        phase: action.phase,
        showDoItForMe: action.phase === "yourTurn" ? state.showDoItForMe : false,
      };
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        phase: action.mode === "illTry" ? "yourTurn" : "demo",
        showDoItForMe: false,
        cursorVisible: false,
      };
    case "SET_CURSOR":
      return {
        ...state,
        cursorPos: action.pos,
        cursorVisible: action.visible ?? state.cursorVisible,
      };
    case "SET_RIPPLE":
      return {
        ...state,
        isRippling: action.isRippling,
      };
    case "SHOW_DO_IT_FOR_ME":
      return {
        ...state,
        showDoItForMe: true,
      };
    case "COMPLETE_FREE_PLAY":
      return {
        ...state,
        freePlayChecks: {
          ...state.freePlayChecks,
          [action.itemId]: true,
        },
      };
    case "TOGGLE_FINISH_SUMMARY":
      return {
        ...state,
        showFinishSummary: action.show,
      };
    case "TOGGLE_MINIMIZE":
      return {
        ...state,
        isMinimized: !state.isMinimized,
      };
    case "TOGGLE_DOCK_SIDE":
      return {
        ...state,
        dockSide: state.dockSide === "right" ? "left" : "right",
      };
    case "NEXT_MISSION": {
      const nextIdx = state.missionIndex + 1;
      if (nextIdx >= GUIDE_MISSIONS.length) {
        return {
          ...state,
          missionIndex: GUIDE_MISSIONS.length - 1,
          phase: "yourTurn",
        };
      }
      return {
        ...state,
        missionIndex: nextIdx,
        phase: state.mode === "illTry" ? "yourTurn" : "demo",
        showDoItForMe: false,
        cursorVisible: false,
      };
    }
    case "PREV_MISSION": {
      const prevIdx = Math.max(0, state.missionIndex - 1);
      return {
        ...state,
        missionIndex: prevIdx,
        phase: state.mode === "illTry" ? "yourTurn" : "demo",
        showDoItForMe: false,
        cursorVisible: false,
      };
    }
    case "CLOSE_GUIDE":
      return {
        ...state,
        isActive: false,
        cursorVisible: false,
        showDoItForMe: false,
      };
    default:
      return state;
  }
}

/** Global starter event dispatch helper */
export function startGuideMission(missionIndex = 0) {
  window.dispatchEvent(
    new CustomEvent("vericems-start-mission", { detail: { missionIndex } })
  );
}

export const GuideEngine: React.FC = () => {
  const [state, dispatch] = useReducer(guideReducer, initialState);
  const timerRef = useRef<number | null>(null);
  const lastNavigatedMissionRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { pauseScenario } = useData();

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const currentMission: GuideMissionStep = GUIDE_MISSIONS[state.missionIndex];

  // Single timer scheduler
  const scheduleTimeout = useCallback(
    (fn: () => void, ms: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fn, prefersReducedMotion ? 0 : ms);
    },
    [prefersReducedMotion]
  );

  // Clear all native DOM highlights helper
  const clearAllHighlights = useCallback(() => {
    document
      .querySelectorAll('[data-guide-highlight="true"]')
      .forEach((el) => el.removeAttribute("data-guide-highlight"));
  }, []);

  // Clean timer and highlights on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      clearAllHighlights();
    };
  }, [clearAllHighlights]);

  // Listen for global custom event to start mission
  useEffect(() => {
    const handleStartEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const idx = typeof detail?.missionIndex === "number" ? detail.missionIndex : 0;
      // Pause background Story playback and hide StoryStage so they never conflict
      pauseScenario();
      window.dispatchEvent(
        new CustomEvent("vericems-toggle-story-stage", { detail: { show: false } })
      );
      lastNavigatedMissionRef.current = null;
      dispatch({ type: "START_MISSION", missionIndex: idx });
    };
    window.addEventListener("vericems-start-mission", handleStartEvent);
    return () => window.removeEventListener("vericems-start-mission", handleStartEvent);
  }, [pauseScenario]);

  // Esc key exits guide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isActive) {
        clearAllHighlights();
        dispatch({ type: "CLOSE_GUIDE" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isActive, clearAllHighlights]);

  // Free play passive listener
  useEffect(() => {
    if (!state.isActive) return;

    const handleGlobalInteraction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('[data-guide="co2-edit"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "edit_reading" });
      }
      if (target.closest('[data-guide="hide-slider"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "hide_co2" });
      }
      if (target.closest('[data-guide="quorum-sim"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "flip_quorum" });
      }
      if (target.closest('[data-guide="valid-toggle"]') || target.closest('[data-testid*="report-btn"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "tamper_report" });
      }
      if (target.closest('[data-guide="tonnes-slider"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "drag_tonnes" });
      }
      if (target.closest('[data-guide="cut-slider"]')) {
        dispatch({ type: "COMPLETE_FREE_PLAY", itemId: "cut_emissions" });
      }
    };

    document.addEventListener("click", handleGlobalInteraction, { capture: true, passive: true });
    document.addEventListener("input", handleGlobalInteraction, { capture: true, passive: true });

    return () => {
      document.removeEventListener("click", handleGlobalInteraction, { capture: true });
      document.removeEventListener("input", handleGlobalInteraction, { capture: true });
    };
  }, [state.isActive]);

  // Navigate & scroll ONLY when missionIndex changes (never fight manual user scrolling or tab switches)
  useEffect(() => {
    if (!state.isActive) {
      clearAllHighlights();
      lastNavigatedMissionRef.current = null;
      return;
    }

    if (lastNavigatedMissionRef.current !== state.missionIndex) {
      lastNavigatedMissionRef.current = state.missionIndex;
      if (currentMission.actionType !== "free_play" && location.pathname !== currentMission.page) {
        navigate(currentMission.page);
      }
    }
  }, [state.isActive, state.missionIndex, currentMission, location.pathname, navigate, clearAllHighlights]);

  // Apply native DOM highlight & run phase logic (Zero JS scroll listeners = Zero scroll lag)
  useEffect(() => {
    clearAllHighlights();

    if (!state.isActive) return;

    const isCurrentPage =
      location.pathname === currentMission.page || currentMission.actionType === "free_play";
    if (!isCurrentPage) return;

    // Wait briefly for route transition DOM mount if needed
    const initTimer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(currentMission.targetSelector);
      const ghostEl =
        document.querySelector<HTMLElement>(currentMission.ghostTargetSelector) || el;
      if (!el || !ghostEl) return;

      // Highlight the container directly via native CSS attribute
      if (currentMission.actionType !== "free_play") {
        el.setAttribute("data-guide-highlight", "true");
      }

      // Scroll target into comfortable center view if needed
      const rect = ghostEl.getBoundingClientRect();
      const needsScroll = rect.top < 110 || rect.bottom > window.innerHeight - 110;
      if (needsScroll) {
        ghostEl.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
        });
      }

      // DEMO PHASE: Ghost cursor glides directly to the exact button/icon and acts
      if (state.phase === "demo" && state.mode === "showMe" && currentMission.actionType !== "free_play") {
        const scrollWaitMs = needsScroll && !prefersReducedMotion ? 550 : 120;

        scheduleTimeout(() => {
          const liveGhostEl =
            document.querySelector<HTMLElement>(currentMission.ghostTargetSelector) || el;
          const freshRect = liveGhostEl.getBoundingClientRect();
          const targetCenter = {
            x: Math.max(24, Math.min(window.innerWidth - 24, freshRect.left + freshRect.width / 2)),
            y: Math.max(76, Math.min(window.innerHeight - 24, freshRect.top + freshRect.height / 2)),
          };

          // Start cursor ~130px down-right from the button so the glide is clear and never starts at (0,0)
          const startPos = {
            x: Math.min(window.innerWidth - 40, targetCenter.x + 130),
            y: Math.min(window.innerHeight - 40, targetCenter.y + 85),
          };
          dispatch({ type: "SET_CURSOR", pos: startPos, visible: true });

          scheduleTimeout(() => {
            const clickEl =
              document.querySelector<HTMLElement>(currentMission.ghostTargetSelector) || el;
            const clickRect = clickEl.getBoundingClientRect();
            const exactCenter = {
              x: Math.max(24, Math.min(window.innerWidth - 24, clickRect.left + clickRect.width / 2)),
              y: Math.max(76, Math.min(window.innerHeight - 24, clickRect.top + clickRect.height / 2)),
            };
            dispatch({ type: "SET_CURSOR", pos: exactCenter, visible: true });

            scheduleTimeout(async () => {
              dispatch({ type: "SET_RIPPLE", isRippling: true });
              window.setTimeout(() => {
                dispatch({ type: "SET_RIPPLE", isRippling: false });
              }, 400);

              try {
                await currentMission.performGhostAction();
              } catch {
                // ignore
              }

              scheduleTimeout(() => {
                dispatch({ type: "SET_CURSOR", pos: null, visible: false });
                dispatch({ type: "SET_PHASE", phase: "yourTurn" });
              }, 1600);
            }, 850);
          }, 120);
        }, scrollWaitMs);
      }
    }, 150);

    return () => {
      window.clearTimeout(initTimer);
    };
  }, [
    state.isActive,
    state.missionIndex,
    state.phase,
    state.mode,
    location.pathname,
    currentMission,
    clearAllHighlights,
    scheduleTimeout,
    prefersReducedMotion,
  ]);

  // Separate effect for yourTurn user action detection & done phase
  useEffect(() => {
    if (!state.isActive) return;

    const isCurrentPage =
      location.pathname === currentMission.page || currentMission.actionType === "free_play";
    if (!isCurrentPage) return;

    if (state.phase === "yourTurn" && currentMission.actionType !== "free_play") {
      const el = document.querySelector<HTMLElement>(currentMission.targetSelector);
      if (!el) return;

      el.setAttribute("data-guide-highlight", "true");

      const doItTimer = window.setTimeout(() => {
        dispatch({ type: "SHOW_DO_IT_FOR_ME" });
      }, 5000);

      const cleanupDetection = currentMission.detectUserAction(el, () => {
        dispatch({ type: "SET_PHASE", phase: "done" });
      });

      return () => {
        window.clearTimeout(doItTimer);
        cleanupDetection();
      };
    }

    if (state.phase === "done") {
      // Wait comfortably or let user click Next Mission
      scheduleTimeout(() => {
        dispatch({ type: "NEXT_MISSION" });
      }, 4000);
    }
  }, [
    state.isActive,
    state.missionIndex,
    state.phase,
    location.pathname,
    currentMission,
    scheduleTimeout,
  ]);

  if (!state.isActive) return null;

  const handleDoItForMe = async () => {
    try {
      await currentMission.performGhostAction();
    } catch {
      // ignore
    }
    dispatch({ type: "SET_PHASE", phase: "done" });
  };

  const handleClose = () => {
    clearAllHighlights();
    dispatch({ type: "CLOSE_GUIDE" });
  };

  const isCurrentPage =
    location.pathname === currentMission.page || currentMission.actionType === "free_play";

  const githubUrl = (import.meta as any).env?.VITE_GITHUB_URL || "";
  const contractsUrl =
    arbitrumSepoliaDeployment?.explorerBaseUrl ||
    deploymentConfig.explorerBaseUrl ||
    "";
  const videoUrl = (import.meta as any).env?.VITE_VIDEO_URL || "";

  const completedFreePlayCount = Object.keys(state.freePlayChecks).length;

  return (
    <>
      {/* Ghost Cursor */}
      {state.cursorPos && (
        <GhostCursor
          x={state.cursorPos.x}
          y={state.cursorPos.y}
          visible={state.cursorVisible}
          isRippling={state.isRippling}
        />
      )}

      {/* Minimized Pill View */}
      {state.isMinimized ? (
        <div
          role="dialog"
          aria-label="Guide minimized"
          className="fixed sm:bottom-4 sm:right-4 bottom-2 right-2 z-40 bg-surface border-2 border-brand/50 rounded-pill py-2 px-3.5 shadow-2xl flex items-center gap-2 text-xs font-sans"
        >
          <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center font-mono font-bold text-[10px]">
            {currentMission.missionNumber}
          </span>
          <span className="font-semibold text-ink">
            {currentMission.missionTitle}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_MINIMIZE" })}
            className="p-1 rounded-full hover:bg-surface-soft text-ink cursor-pointer"
            title="Expand guide"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
            title="Close guide"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Bottom-Right Docked / Mobile Bottom-Sheet Coach HUD */
        <div
          ref={cardRef}
          role="dialog"
          aria-label={`Guide: ${currentMission.missionTitle}`}
          className="fixed z-40 sm:bottom-4 sm:right-4 sm:left-auto sm:top-auto sm:w-[320px] sm:max-w-[320px] sm:rounded-2xl inset-x-0 bottom-0 w-full max-sm:rounded-t-2xl max-sm:rounded-b-none p-3.5 bg-surface border-2 border-brand/50 shadow-2xl space-y-2.5 font-sans max-h-[85vh] overflow-y-auto"
        >
          {/* Compact Header Row */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-hairline">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                {currentMission.missionNumber}
              </span>
              <div className="min-w-0">
                <h3 className="font-heading font-bold text-sm text-ink leading-tight truncate">
                  {currentMission.missionTitle}
                </h3>
                <span className="text-[10px] font-mono text-muted-strong block truncate">
                  Step {currentMission.missionNumber} of {GUIDE_MISSIONS.length} · {currentMission.missionSubtitle}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => dispatch({ type: "TOGGLE_MINIMIZE" })}
                className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft cursor-pointer"
                title="Minimize guide"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft cursor-pointer"
                title="Exit guide (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Page Switch Prompt if User Navigated Away */}
          {!isCurrentPage && (
            <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/30 text-ink text-xs flex items-center justify-between gap-2">
              <span className="font-medium text-[11px]">
                Step is on <strong className="font-bold">{currentMission.page.replace("/", "")}</strong>
              </span>
              <button
                type="button"
                onClick={() => navigate(currentMission.page)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill bg-brand text-white font-semibold text-[11px] cursor-pointer hover:bg-brand-pressed transition-colors shrink-0"
              >
                <span>Go there</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Collapsed "Why?" toggle */}
          {currentMission.concept && currentMission.actionType !== "free_play" && (
            <details className="text-xs group">
              <summary className="cursor-pointer text-[11px] font-semibold text-brand hover:underline inline-flex items-center gap-1 select-none">
                <span>Why?</span>
              </summary>
              <p className="mt-1 text-[11px] text-muted-strong bg-surface-soft p-2 rounded-lg border border-hairline leading-snug">
                {currentMission.concept}
              </p>
            </details>
          )}

          {/* Free Play View (Mission 6) */}
          {currentMission.actionType === "free_play" ? (
            <div className="space-y-2 text-xs">
              <p className="text-muted-strong text-[11px] leading-snug">
                {currentMission.concept}
              </p>

              <div className="space-y-1 text-[11px] font-mono max-h-36 overflow-y-auto pr-1">
                {FREE_PLAY_ITEMS.map((item) => {
                  const checked = Boolean(state.freePlayChecks[item.id]);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (location.pathname !== item.page) {
                          navigate(item.page);
                        }
                        window.setTimeout(() => {
                          const target = document.querySelector<HTMLElement>(`[data-guide="${item.guideId}"]`);
                          target?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 150);
                      }}
                      className="w-full text-left flex items-center justify-between p-1.5 rounded-lg bg-surface-soft hover:bg-hairline/60 border border-hairline transition-colors cursor-pointer"
                    >
                      <span className="text-ink font-sans font-medium">{item.label}</span>
                      {checked ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[10px]">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      ) : (
                        <span className="text-brand text-[10px] font-semibold">Jump →</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 flex justify-between items-center border-t border-hairline">
                <span className="text-[11px] text-muted-strong font-mono">
                  {completedFreePlayCount}/6 tried
                </span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "TOGGLE_FINISH_SUMMARY", show: true })}
                  className="px-3 py-1 rounded-pill bg-brand text-white text-xs font-semibold hover:bg-brand-pressed transition-colors cursor-pointer shadow-sm"
                >
                  Finish
                </button>
              </div>
            </div>
          ) : (
            /* Standard Interactive Mission View: Only Action Line & Buttons */
            <div className="space-y-2 text-xs">
              {/* Action Line & Mode Buttons */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono font-bold text-brand">
                    {state.phase === "demo" ? "1. Watch Demo" : "2. Your Turn"}
                  </span>
                  <div className="inline-flex rounded-pill border border-hairline p-0.5 bg-surface-soft text-[10px]">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "SET_MODE", mode: "showMe" })}
                      className={`px-2 py-0.5 rounded-pill font-medium transition-colors cursor-pointer ${
                        state.mode === "showMe"
                          ? "bg-surface text-ink font-bold shadow-xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      Show me
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "SET_MODE", mode: "illTry" })}
                      className={`px-2 py-0.5 rounded-pill font-medium transition-colors cursor-pointer ${
                        state.mode === "illTry"
                          ? "bg-surface text-ink font-bold shadow-xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      I'll try
                    </button>
                  </div>
                </div>

                <p className="text-ink font-semibold text-xs leading-snug">
                  {state.phase === "demo" ? currentMission.demoCaption : currentMission.yourTurnCaption}
                </p>
              </div>

              {/* Status & Quick Action Bar */}
              <div className="flex items-center justify-between pt-1.5 border-t border-hairline">
                <div className="flex items-center gap-1.5">
                  {state.phase === "demo" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold bg-brand/15 text-brand">
                      <Sparkles className="w-2.5 h-2.5 animate-spin" /> Showing...
                    </span>
                  )}
                  {state.phase === "yourTurn" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Try on highlighted box
                    </span>
                  )}
                  {state.phase === "done" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      <Check className="w-3 h-3" /> Done!
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {state.phase === "yourTurn" && state.showDoItForMe && (
                    <button
                      type="button"
                      onClick={handleDoItForMe}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-pill bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 transition-colors cursor-pointer"
                    >
                      Do it for me
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => dispatch({ type: "NEXT_MISSION" })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-pill bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <span>{state.phase === "done" ? "Next" : "Skip"}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Navigation Dots */}
          <div className="flex items-center justify-between pt-1.5 border-t border-hairline text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => dispatch({ type: "PREV_MISSION" })}
                disabled={state.missionIndex === 0}
                className="p-1 rounded hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Previous mission"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 px-1" aria-label="Mission progress dots">
                {GUIDE_MISSIONS.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => dispatch({ type: "START_MISSION", missionIndex: i })}
                    aria-label={`Mission ${i + 1}: ${m.missionTitle}`}
                    title={`Mission ${i + 1}: ${m.missionTitle}`}
                    className={`transition-all rounded-pill cursor-pointer ${
                      i === state.missionIndex
                        ? "w-4 h-1.5 bg-brand"
                        : "w-1.5 h-1.5 bg-muted/40 hover:bg-muted"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => dispatch({ type: "NEXT_MISSION" })}
                disabled={state.missionIndex === GUIDE_MISSIONS.length - 1}
                className="p-1 rounded hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Next mission"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="text-[10px] font-mono text-muted">
              Esc to close
            </span>
          </div>
        </div>
      )}

      {/* Finish Summary Modal (Mission 6) */}
      {state.showFinishSummary && (
        <div
          role="dialog"
          aria-label="What you tried summary"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
        >
          <div className="max-w-md w-full bg-surface border border-hairline rounded-card p-6 shadow-2xl space-y-4 font-sans text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand" />
                <h3 className="font-heading font-bold text-base text-ink">
                  What you learned & tried
                </h3>
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: "TOGGLE_FINISH_SUMMARY", show: false })}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-muted-strong leading-relaxed text-xs">
              You verified cryptographic hash-chaining, tested combustion stoichiometry physics checks, simulated quorum consensus, and calculated EU CBAM tax receipts.
            </p>

            <div className="p-3 bg-surface-soft border border-hairline rounded-xl space-y-1.5 font-mono text-[11px]">
              <span className="text-muted block text-[10px] uppercase font-sans font-bold">
                Checklist Results ({completedFreePlayCount} of 6)
              </span>
              {FREE_PLAY_ITEMS.map((item) => (
                <div key={item.id} className="flex justify-between items-center">
                  <span>{item.label}</span>
                  <span className={state.freePlayChecks[item.id] ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-muted"}>
                    {state.freePlayChecks[item.id] ? "✓ Verified" : "–"}
                  </span>
                </div>
              ))}
            </div>

            {(githubUrl || contractsUrl || videoUrl) && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-mono uppercase text-muted font-bold block">
                  Resources & Evidence
                </span>
                <div className="flex flex-wrap gap-2">
                  {githubUrl && (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink font-medium transition-colors"
                    >
                      <Github className="w-3.5 h-3.5" />
                      <span>Repository</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}
                  {contractsUrl && (
                    <a
                      href={contractsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink font-medium transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5 text-brand" />
                      <span>Contracts (Arbitrum Sepolia)</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}
                  {videoUrl && (
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink font-medium transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Demo Video</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "TOGGLE_FINISH_SUMMARY", show: false });
                  handleClose();
                }}
                className="px-4 py-1.5 rounded-pill bg-brand text-white font-semibold hover:bg-brand-pressed transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
