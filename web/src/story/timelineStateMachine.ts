/**
 * timelineStateMachine.ts
 *
 * Single source of truth scene-timeline state machine for VeriCEMS story playback.
 * Coordinates play/pause/next/back/speed/restart, scene progression,
 * captions, and deterministic visual playback timing.
 * Speech synthesis is completely removed to prevent unwanted audio playback.
 */

import { STORY_STEPS, type StoryStep } from "./steps";

export type TimelineStatus = "idle" | "playing" | "paused" | "ended" | "completed";

export interface TimelineState {
  step: number;
  status: TimelineStatus;
  speed: number;
  narrationEnabled: boolean;
  totalSteps: number;
  currentCaption: string;
}

export type TimelineAction =
  | { type: "PLAY"; speed?: number }
  | { type: "PAUSE" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "RESTART" }
  | { type: "SET_SPEED"; speed: number }
  | { type: "SET_STEP"; step: number }
  | { type: "SET_NARRATION"; enabled: boolean }
  | { type: "TOGGLE_NARRATION" }
  | { type: "END" }
  | { type: "COMPLETE" };

export function getCaptionForStep(step: number): string {
  if (step <= 0) return "Ready to play story walkthrough";
  const found = STORY_STEPS.find((s) => s.stepNumber === step);
  return found ? found.sentence : "Live telemetry connected";
}

export function createInitialTimelineState(narrationEnabled = true, initialSpeed = 1.0): TimelineState {
  return {
    step: 0,
    status: "idle",
    speed: initialSpeed,
    narrationEnabled,
    totalSteps: STORY_STEPS.length,
    currentCaption: getCaptionForStep(0),
  };
}

export function timelineReducer(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case "PLAY": {
      const spd = action.speed ?? state.speed;
      const nextStep = state.step === 0 || state.step >= state.totalSteps ? 1 : state.step;
      return {
        ...state,
        status: "playing",
        speed: spd,
        step: nextStep,
        currentCaption: getCaptionForStep(nextStep),
      };
    }

    case "PAUSE": {
      return {
        ...state,
        status: "paused",
      };
    }

    case "NEXT": {
      const nextStep = state.step + 1;
      if (nextStep > state.totalSteps) {
        return {
          ...state,
          status: "ended",
          step: state.totalSteps,
          currentCaption: getCaptionForStep(state.totalSteps),
        };
      }
      return {
        ...state,
        step: nextStep,
        currentCaption: getCaptionForStep(nextStep),
      };
    }

    case "BACK": {
      const prevStep = Math.max(0, state.step - 1);
      return {
        ...state,
        step: prevStep,
        status: prevStep === 0 ? "idle" : state.status === "ended" || state.status === "completed" ? "paused" : state.status,
        currentCaption: getCaptionForStep(prevStep),
      };
    }

    case "RESTART": {
      return {
        ...state,
        step: 0,
        status: "idle",
        currentCaption: getCaptionForStep(0),
      };
    }

    case "SET_SPEED": {
      return {
        ...state,
        speed: Math.max(0.5, Math.min(20.0, action.speed)),
      };
    }

    case "SET_STEP": {
      const clamped = Math.max(0, Math.min(state.totalSteps, action.step));
      return {
        ...state,
        step: clamped,
        status: clamped >= state.totalSteps ? "ended" : clamped === 0 ? "idle" : state.status,
        currentCaption: getCaptionForStep(clamped),
      };
    }

    case "SET_NARRATION": {
      return {
        ...state,
        narrationEnabled: action.enabled,
      };
    }

    case "TOGGLE_NARRATION": {
      return {
        ...state,
        narrationEnabled: !state.narrationEnabled,
      };
    }

    case "END":
    case "COMPLETE": {
      return {
        ...state,
        status: "ended",
        step: state.totalSteps,
        currentCaption: getCaptionForStep(state.totalSteps),
      };
    }

    default:
      return state;
  }
}

/**
 * Scene Audio Manager: strictly driven BY the timeline state machine.
 * Captions-only fallback mode: deterministic, silent scene progression based on minSceneDurationMs.
 * Speech synthesis is completely disabled to prevent robotic browser speech.
 */
class SceneAudioManager {
  private currentTimer: number | null = null;

  public cancelCurrentAudio(): void {
    if (this.currentTimer !== null) {
      window.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
  }

  /**
   * Advances the scene after the target duration.
   * Speed-adjusted: 1x = 2800ms, 2x = 1400ms, 4x = 700ms, etc.
   */
  public playSceneAudio(
    _step: StoryStep,
    speed: number,
    _narrationEnabled: boolean,
    onDone: () => void
  ): () => void {
    this.cancelCurrentAudio();

    // Minimum scene display time (at 1x: 2800ms, clamped between 500ms and 6000ms)
    const durationMs = Math.max(500, Math.round(2800 / speed));

    this.currentTimer = window.setTimeout(() => {
      this.currentTimer = null;
      onDone();
    }, durationMs);

    return () => {
      this.cancelCurrentAudio();
    };
  }
}

export const sceneAudioManager = new SceneAudioManager();
