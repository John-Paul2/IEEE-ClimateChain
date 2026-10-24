/**
 * timelineStateMachine.ts
 *
 * Single source of truth scene-timeline state machine for VeriCEMS story playback.
 * Coordinates play/pause/next/back/speed/restart, scene progression,
 * captions, and audio drivers (pre-generated audio files with speech synthesis fallback).
 */

import { STORY_STEPS, type StoryStep } from "./steps";

export type TimelineStatus = "idle" | "playing" | "paused" | "completed";

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
      if (state.status !== "playing") return state;
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
          status: "completed",
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
        status: prevStep === 0 ? "idle" : state.status === "completed" ? "paused" : state.status,
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
        speed: Math.max(0.5, Math.min(3.0, action.speed)),
      };
    }

    case "SET_STEP": {
      const clamped = Math.max(0, Math.min(state.totalSteps, action.step));
      return {
        ...state,
        step: clamped,
        status: clamped >= state.totalSteps ? "completed" : clamped === 0 ? "idle" : state.status,
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

    case "COMPLETE": {
      return {
        ...state,
        status: "completed",
        step: state.totalSteps,
        currentCaption: getCaptionForStep(state.totalSteps),
      };
    }

    default:
      return state;
  }
}

/**
 * Scene Audio Manager: handles playback of scene audio with speech synthesis and captions-only fallback.
 * Strictly driven BY the timeline state machine:
 * - Cancels audio on every scene change
 * - Computes duration = max(audio end, min scene duration)
 * - Safe fallback timeout to prevent hangs
 */
class SceneAudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeStep = -1;

  public cancelCurrentAudio(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      this.currentUtterance = null;
    }
  }

  /**
   * Plays audio for a given step. Invokes onDone when max(audio end, min scene duration) is reached.
   */
  public playSceneAudio(
    step: StoryStep,
    speed: number,
    narrationEnabled: boolean,
    onDone: () => void
  ): () => void {
    this.cancelCurrentAudio();
    this.activeStep = step.stepNumber;

    let isDisposed = false;
    let audioEnded = false;
    let minTimePassed = false;

    // Minimum scene display time (at 1x: 2800ms)
    const minSceneDurationMs = Math.max(800, Math.round(2800 / speed));
    // Maximum safety timeout fallback (at 1x: 8000ms)
    const maxSafetyTimeoutMs = Math.max(2000, Math.round(8000 / speed));

    const checkAdvance = () => {
      if (isDisposed) return;
      if (audioEnded && minTimePassed) {
        onDone();
      }
    };

    const minTimer = window.setTimeout(() => {
      minTimePassed = true;
      checkAdvance();
    }, minSceneDurationMs);

    const safetyTimer = window.setTimeout(() => {
      if (!isDisposed) {
        onDone();
      }
    }, maxSafetyTimeoutMs);

    // If narration is disabled, audio is considered immediately ended (captions only fallback)
    if (!narrationEnabled) {
      audioEnded = true;
      checkAdvance();
      return () => {
        isDisposed = true;
        clearTimeout(minTimer);
        clearTimeout(safetyTimer);
      };
    }

    // Try pre-generated audio file first: e.g. /audio/scene-${stepNumber}.mp3
    const audioPath = `/audio/scene-${step.stepNumber}.mp3`;
    let triedFile = false;

    try {
      const audio = new Audio(audioPath);
      audio.playbackRate = speed;
      this.currentAudio = audio;

      audio.onended = () => {
        audioEnded = true;
        checkAdvance();
      };

      audio.onerror = () => {
        // Pre-generated audio not present on disk, fallback to Web SpeechSynthesis
        this.fallbackToSpeech(step.sentence, speed, () => {
          audioEnded = true;
          checkAdvance();
        });
      };

      const playPromise = audio.play();
      triedFile = true;
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Playback blocked or file 404: fallback to Web Speech
          this.fallbackToSpeech(step.sentence, speed, () => {
            audioEnded = true;
            checkAdvance();
          });
        });
      }
    } catch {
      // Audio tag failure: fallback to speech
      if (!triedFile) {
        this.fallbackToSpeech(step.sentence, speed, () => {
          audioEnded = true;
          checkAdvance();
        });
      }
    }

    return () => {
      isDisposed = true;
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
      this.cancelCurrentAudio();
    };
  }

  private fallbackToSpeech(text: string, speed: number, onEnd: () => void): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.8, Math.min(1.8, speed));
      utterance.pitch = 1.0;

      utterance.onend = () => {
        onEnd();
      };
      utterance.onerror = () => {
        onEnd();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch {
      onEnd();
    }
  }
}

export const sceneAudioManager = new SceneAudioManager();
