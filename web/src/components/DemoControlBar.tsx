import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Gauge,
  Compass,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  FileCheck2,
  BarChart3,
  Cpu,
  Layers,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { useToast } from "./Toast";

export const DemoControlBar: React.FC = () => {
  const {
    scenarioStatus,
    playScenario,
    pauseScenario,
    stepScenario,
    resetScenario,
    setScenarioSpeed,
  } = useData();

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [autoNavigate, setAutoNavigate] = useState<boolean>(true);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);

  const currentStep = scenarioStatus?.current_step || 0;
  const isPlaying = scenarioStatus?.status === "playing";
  const speed = scenarioStatus?.speed || 1.0;
  const caption =
    scenarioStatus?.current_caption ||
    "Demo Ready · Press Play or Next Step to begin the VeriCEMS story.";

  // Auto-navigate to page matching current step if enabled
  useEffect(() => {
    if (!autoNavigate || currentStep === 0 || !scenarioStatus?.step_info) return;
    const targetPage = scenarioStatus.step_info[currentStep - 1]?.page;
    if (targetPage && location.pathname !== targetPage) {
      navigate(targetPage);
    }
  }, [currentStep, autoNavigate, scenarioStatus, location.pathname, navigate]);

  const handlePlayPause = async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      if (isPlaying) {
        await pauseScenario();
        showToast("info", "Scenario Paused", "Automatic playback paused.");
      } else {
        await playScenario(speed);
        showToast("success", "Scenario Playing", `Playing story at ${speed}x speed.`);
      }
    } catch {
      showToast("error", "Action Failed", "Could not toggle scenario playback.");
    } finally {
      setIsActing(false);
    }
  };

  const handleStep = async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      const nextStatus = await stepScenario();
      if (nextStatus) {
        showToast(
          "success",
          `Step ${nextStatus.current_step}/7 Executed`,
          nextStatus.current_caption
        );
      }
    } catch {
      showToast("error", "Step Failed", "Could not advance scenario step.");
    } finally {
      setIsActing(false);
    }
  };

  const handleReset = async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await resetScenario();
      navigate("/operator");
      showToast("info", "Scenario Reset", "Blockchain, database, and telemetry reset to Step 0.");
    } catch {
      showToast("error", "Reset Failed", "Could not reset scenario state.");
    } finally {
      setIsActing(false);
    }
  };

  const handleSpeedChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseFloat(e.target.value);
    try {
      await setScenarioSpeed(val);
      showToast("info", "Speed Updated", `Playback speed set to ${val}x.`);
    } catch {
      // ignore
    }
  };

  const stepIcons: Record<number, React.FC<{ className?: string }>> = {
    1: Layers,
    2: Sparkles,
    3: ShieldAlert,
    4: Cpu,
    5: FileCheck2,
    6: ShieldCheck,
    7: BarChart3,
  };

  const StepIcon = stepIcons[currentStep] || Sparkles;

  if (isCollapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-raised/95 backdrop-blur-md border border-border shadow-2xl text-xs font-mono font-semibold text-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info transition-all"
          title="Expand Demo Control Bar"
          aria-label="Expand Demo Control Bar"
        >
          <Play className="w-3.5 h-3.5 text-info" aria-hidden="true" />
          <span>Demo Bar ({currentStep}/7)</span>
          <ChevronUp className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="demo-control-bar"
      role="region"
      aria-label="Interactive Story Demo Control Bar"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-4xl w-[calc(100%-2rem)] px-2 pointer-events-none"
    >
      {/* On-Screen Caption Area (Single Line per Step) */}
      <div
        data-testid="demo-caption-area"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-3xl rounded-xl border border-info/30 bg-surface/95 backdrop-blur-md px-4 py-2 shadow-2xl flex items-center justify-between gap-3 text-xs sm:text-sm text-text transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 p-1 rounded-lg bg-info/10 text-info border border-info/20">
            <StepIcon className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {currentStep > 0 && (
              <span className="flex-shrink-0 font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-info/20 text-info border border-info/40">
                STEP {currentStep}/7
              </span>
            )}
            <p className="truncate font-medium text-text leading-tight">{caption}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-md text-muted hover:text-text hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info"
          title="Minimize Demo Control Bar"
          aria-label="Minimize Demo Control Bar"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Control Bar Actions */}
      <div className="pointer-events-auto flex items-center flex-wrap justify-between sm:justify-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 rounded-2xl bg-surface-raised/95 backdrop-blur-md border border-border/80 shadow-2xl">
        {/* Play / Pause Button */}
        <button
          type="button"
          data-testid={isPlaying ? "demo-pause-btn" : "demo-play-btn"}
          onClick={handlePlayPause}
          disabled={isActing}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${
            isPlaying
              ? "bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30"
              : "bg-info/20 text-info border border-info/40 hover:bg-info/30"
          }`}
          aria-label={isPlaying ? "Pause Scenario Playback" : "Play Scenario"}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{currentStep === 0 ? "Play Story" : "Resume"}</span>
            </>
          )}
        </button>

        {/* Step Forward Button */}
        <button
          type="button"
          data-testid="demo-step-btn"
          onClick={handleStep}
          disabled={isActing || currentStep >= 7}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-text hover:bg-surface-card hover:border-info/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          title="Advance to next scenario step"
          aria-label="Advance to Next Step"
        >
          <SkipForward className="w-3.5 h-3.5" />
          <span>Next Step</span>
        </button>

        {/* Step Indicators 1..7 */}
        <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border/60">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => {
            const isDone = num < currentStep;
            const isCurrent = num === currentStep;
            return (
              <span
                key={num}
                data-testid={`demo-step-pill-${num}`}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                  isCurrent
                    ? "bg-info text-surface shadow-sm ring-2 ring-info/50 scale-105"
                    : isDone
                    ? "bg-verified/20 text-verified border border-verified/40"
                    : "bg-surface-raised text-muted border border-border/40"
                }`}
                title={`Step ${num}: ${scenarioStatus?.step_info?.[num - 1]?.name || ""}`}
              >
                {num}
              </span>
            );
          })}
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 text-xs text-muted">
          <Gauge className="w-3.5 h-3.5 hidden sm:inline" />
          <select
            data-testid="demo-speed-select"
            value={speed}
            onChange={handleSpeedChange}
            aria-label="Playback speed selector"
            className="bg-surface border border-border text-text rounded-md px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info cursor-pointer"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x (Demo)</option>
            <option value="2">2.0x</option>
            <option value="4">4.0x (Fast)</option>
            <option value="20">20x (Max)</option>
          </select>
        </div>

        {/* Auto Navigate Toggle */}
        <button
          type="button"
          onClick={() => setAutoNavigate(!autoNavigate)}
          className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info ${
            autoNavigate
              ? "bg-info/10 text-info border-info/30"
              : "bg-surface text-muted border-border hover:text-text"
          }`}
          title="Automatically change tabs/routes to follow the story"
          aria-label={`Toggle auto route navigation, currently ${autoNavigate ? "On" : "Off"}`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Auto-Nav</span>
        </button>

        {/* Reset Button */}
        <button
          type="button"
          data-testid="demo-reset-btn"
          onClick={handleReset}
          disabled={isActing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          title="Reset entire story back to Step 0"
          aria-label="Reset Story Scenario"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
    </div>
  );
};
