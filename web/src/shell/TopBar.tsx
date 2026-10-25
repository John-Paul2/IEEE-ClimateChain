import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Shield,
  Sun,
  Moon,
  ExternalLink,
  Database,
  Volume2,
  Compass,
} from "lucide-react";
import { useData } from "../data/DataContext.tsx";
import { useToast } from "../components/Toast.tsx";
import { DataStatusPill } from "./DataStatusPill.tsx";
import { ArbitrumSepoliaModal } from "../components/ArbitrumSepoliaModal.tsx";
import { IntroModal } from "../components/IntroModal.tsx";
import { arbitrumSepoliaDeployment } from "../chain/deploymentConfig.ts";
import { startGuideMission } from "../guide/GuideEngine.tsx";
import { GUIDE_MISSIONS } from "../guide/missions.ts";

export const TopBar: React.FC = () => {
  const {
    scenarioStatus,
    playScenario,
    pauseScenario,
    stepScenario,
    resetScenario,
    setScenarioSpeed,
    narrationEnabled,
    setNarrationEnabled,
  } = useData();

  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [isActing, setIsActing] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [isTestnetModalOpen, setIsTestnetModalOpen] = useState(false);
  const [dataPopoverOpen, setDataPopoverOpen] = useState(false);
  const [guideMenuOpen, setGuideMenuOpen] = useState(false);
  const [isIntroOpen, setIsIntroOpen] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem("vericems_intro_modal_seen") !== "true";
      }
    } catch {
      // fallback
    }
    return true;
  });

  const handleCloseIntro = () => {
    try {
      localStorage.setItem("vericems_intro_modal_seen", "true");
    } catch {
      // ignore
    }
    setIsIntroOpen(false);
  };

  const handleStartStory = () => {
    handleCloseIntro();
    setIsManualMode(false);
    navigate("/operator");
    startGuideMission(0);
  };

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("vericems-theme");
      if (stored === "dark" || stored === "light") return stored;
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("vericems-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const currentStep = scenarioStatus?.current_step || 0;
  const totalSteps = scenarioStatus?.total_steps || 8;
  const isPlaying = scenarioStatus?.status === "playing";
  const speed = scenarioStatus?.speed || 1.0;
  const isStoryActive = isPlaying || currentStep > 0;

  const prevStepRef = useRef<number>(currentStep);

  useEffect(() => {
    if (currentStep === 0 || !isPlaying || isManualMode || !scenarioStatus?.step_info) {
      prevStepRef.current = currentStep;
      return;
    }

    if (currentStep !== prevStepRef.current) {
      prevStepRef.current = currentStep;
      const targetPage = scenarioStatus.step_info[currentStep - 1]?.page;
      if (targetPage && location.pathname !== targetPage) {
        navigate(targetPage);
      }
    }
  }, [currentStep, isPlaying, isManualMode, scenarioStatus, location.pathname, navigate]);

  const handlePlayPause = async () => {
    setIsActing(true);
    try {
      if (isPlaying) {
        await pauseScenario();
      } else {
        setIsManualMode(false);
        window.dispatchEvent(
          new CustomEvent("vericems-toggle-story-stage", { detail: { show: true } })
        );
        await playScenario();
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleStep = async () => {
    setIsActing(true);
    try {
      window.dispatchEvent(
        new CustomEvent("vericems-toggle-story-stage", { detail: { show: true } })
      );
      const nextStatus = await stepScenario();
      if (nextStatus) {
        showToast(
          "success",
          `Step ${nextStatus.current_step}/${totalSteps} Executed`,
          nextStatus.current_caption
        );
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleReset = async () => {
    setIsActing(true);
    try {
      await resetScenario();
      setIsManualMode(false);
      window.dispatchEvent(
        new CustomEvent("vericems-toggle-story-stage", { detail: { show: false } })
      );
      showToast("info", "Scenario Reset", "Reset story to Step 0");
    } finally {
      setIsActing(false);
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setScenarioSpeed(newSpeed);
  };

  const handleTabClick = () => {
    pauseScenario();
    setIsManualMode(true);
  };

  const navTabs = [
    { to: "/operator", label: "Factory" },
    { to: "/verifier", label: "Verifiers" },
    { to: "/importer", label: "Buyer" },
    { to: "/benchmark", label: "Test results" },
  ];

  return (
    <>
      <header className="min-h-16 px-4 sm:px-6 bg-canvas border-b border-hairline flex flex-wrap md:flex-nowrap items-center justify-between gap-3 select-none transition-colors w-full">
      {/* Left: Brand Logo + Pill Nav Tabs */}
      <div className="flex items-center gap-4 sm:gap-6 shrink-0 py-2">
        <NavLink
          to="/operator"
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg shrink-0"
          aria-label="VeriCEMS Home"
        >
          <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center shadow-xs shrink-0">
            <Shield className="w-4 h-4 fill-current" />
          </div>
          <div className="flex items-baseline">
            <span className="font-heading font-bold text-xl tracking-tight text-ink">
              VeriCEMS
            </span>
            <span className="text-brand font-bold text-xl leading-none">.</span>
          </div>
        </NavLink>

        {/* Primary Nav Tabs (Jobright Pill Nav Style) */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center p-1 rounded-pill bg-surface-soft border border-hairline overflow-x-auto shrink-0"
        >
          {navTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={handleTabClick}
              className={({ isActive }) =>
                `px-3.5 sm:px-4 py-1.5 rounded-pill text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? "bg-brand text-white shadow-xs"
                    : "text-muted-strong hover:text-ink hover:bg-canvas"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Right Side: Streamlined Controls */}
      <div className="flex items-center gap-2 py-1 shrink-0 max-w-full">
        {/* Data Source Mode Selector */}
        <DataStatusPill />

        {/* Visible Testnet Explorer Chip */}
        <button
          type="button"
          data-testid="testnet-chip-btn"
          onClick={() => setIsTestnetModalOpen(true)}
          aria-label="Chain details"
          title="Live network (421614)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill bg-sky-500/10 hover:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-500/30 text-xs font-mono font-medium transition-all cursor-pointer shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
          <span>{arbitrumSepoliaDeployment.chainName}</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </button>

        {/* Data Provenance Popover */}
        <div className="relative inline-block text-left shrink-0">
          <button
            type="button"
            data-testid="data-provenance-btn"
            onClick={() => setDataPopoverOpen((prev) => !prev)}
            aria-label="View data provenance"
            title="View data provenance"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all text-xs font-semibold cursor-pointer shrink-0"
          >
            <Database className="w-3.5 h-3.5 text-muted-strong" />
            <span className="hidden 2xl:inline">Provenance</span>
          </button>
          {dataPopoverOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDataPopoverOpen(false)}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-label="Data provenance"
                className="absolute right-0 mt-1.5 w-80 p-3.5 bg-surface border border-hairline-strong rounded-2xl shadow-xl z-50 text-xs space-y-2.5 animate-in fade-in duration-100"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-hairline">
                  <span className="font-heading font-bold text-ink">Data & Testnet Provenance</span>
                  <button
                    type="button"
                    onClick={() => setDataPopoverOpen(false)}
                    className="text-muted hover:text-ink text-[11px] cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <ul className="space-y-1.5 text-muted-strong text-[11px]">
                  <li>
                    <strong className="text-ink">Real:</strong> US EPA CAMPD unit DEV-CAMPD-1073-3 hourly emissions.
                  </li>
                  <li>
                    <strong className="text-ink">Synthetic:</strong> Stack O₂, temp, and independent fuel flow.
                  </li>
                  <li>
                    <strong className="text-ink">Illustrative:</strong> Section 14 worked example parameters.
                  </li>
                </ul>
                <div className="pt-2 border-t border-hairline flex items-center justify-between">
                  <span className="text-[11px] text-muted-strong">L2 Testnet (421614)</span>
                  <a
                    href="https://sepolia.arbiscan.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="testnet-evidence-topbar-btn"
                    className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
                  >
                    <span>Explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Unified Guide Menu: Merges Guide and Story */}
        <div className="relative inline-block text-left shrink-0">
          <button
            type="button"
            data-testid="header-guide-btn"
            onClick={() => setGuideMenuOpen((prev) => !prev)}
            aria-label="Guide menu"
            title="Guide and story options"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill bg-brand text-white hover:bg-brand-pressed text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Guide</span>
          </button>

          {guideMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setGuideMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                role="menu"
                aria-label="Guide and story options"
                className="absolute right-0 mt-1.5 w-64 p-2 bg-surface border border-hairline-strong rounded-2xl shadow-2xl z-50 text-xs space-y-1.5 animate-in fade-in duration-100 font-sans"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="header-watch-story-btn"
                  onClick={() => {
                    setGuideMenuOpen(false);
                    handlePlayPause();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-soft text-ink flex items-center justify-between group transition-colors cursor-pointer border border-hairline"
                >
                  <div className="flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-brand fill-current" />
                    <span className="font-semibold text-xs">Watch the story</span>
                  </div>
                  <span className="text-[10px] text-muted-strong font-mono">8 steps</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="header-try-yourself-btn"
                  onClick={() => {
                    setGuideMenuOpen(false);
                    startGuideMission(0);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-soft text-ink flex items-center justify-between group transition-colors cursor-pointer border border-hairline"
                >
                  <div className="flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-brand" />
                    <span className="font-semibold text-xs">Try it yourself</span>
                  </div>
                  <span className="text-[10px] text-muted-strong font-mono">Interactive</span>
                </button>

                <div className="pt-1.5 border-t border-hairline">
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-mono text-muted uppercase">
                    <span>Missions</span>
                    <button
                      type="button"
                      onClick={() => {
                        setGuideMenuOpen(false);
                        startGuideMission(0);
                      }}
                      className="text-brand hover:underline font-bold cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                  {GUIDE_MISSIONS.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setGuideMenuOpen(false);
                        startGuideMission(idx);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-soft text-ink flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="text-muted-strong hover:text-ink truncate text-[11px]">
                        {idx + 1}. {m.missionTitle}
                      </span>
                      <span className="text-[10px] text-muted font-mono shrink-0 ml-2">
                        {m.page.replace("/", "")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Story Playback Transport Controls (only visible when Story playback is active) */}
        {isStoryActive && (
          <div
            data-testid="compact-demo-dock"
            className="flex items-center gap-1.5 pl-2 border-l border-hairline shrink-0"
          >
            <button
              type="button"
              data-testid={isPlaying ? "demo-pause-btn" : "demo-play-btn"}
              onClick={handlePlayPause}
              disabled={isActing}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                isPlaying
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                  : "bg-ink text-canvas hover:opacity-90"
              }`}
              aria-label={isPlaying ? "Pause Scenario Playback" : "Play Scenario"}
              title={isPlaying ? "Pause Story" : "Resume Story"}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3 h-3 fill-current shrink-0" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current shrink-0" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="demo-step-btn"
              onClick={handleStep}
              disabled={isActing || currentStep >= totalSteps}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-pill text-xs font-semibold bg-surface-soft hover:bg-hairline border border-hairline text-ink disabled:opacity-30 cursor-pointer shrink-0"
              title="Advance to next step"
              aria-label="Advance to Next Step"
            >
              <SkipForward className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">Next</span>
            </button>

            <button
              type="button"
              data-testid="narration-toggle-btn"
              onClick={() => setNarrationEnabled((prev) => !prev)}
              aria-pressed={narrationEnabled}
              aria-label={narrationEnabled ? "Mute narration captions" : "Enable narration captions"}
              title={narrationEnabled ? "Captions on" : "Captions off"}
              className={`p-1.5 rounded-pill border transition-all cursor-pointer shrink-0 ${
                narrationEnabled
                  ? "bg-brand/10 text-brand border-brand/30"
                  : "bg-surface-soft text-muted-strong border-hairline opacity-60"
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
            </button>

            <select
              data-testid="demo-speed-select"
              value={speed}
              onChange={handleSpeedChange}
              aria-label="Playback speed"
              title="Playback speed"
              className="bg-surface-soft border border-hairline text-ink rounded-pill px-2 py-1 text-[11px] font-mono cursor-pointer"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="2">2.0x</option>
              <option value="4">4.0x</option>
              <option value="20">20x</option>
            </select>

            <button
              type="button"
              data-testid="demo-reset-btn"
              onClick={handleReset}
              disabled={isActing}
              className="p-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-all cursor-pointer shrink-0"
              title="Reset story to start"
              aria-label="Reset Story Scenario"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        )}

        {/* Theme & Help Icons */}
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all cursor-pointer shrink-0"
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-700 shrink-0" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          data-testid="help-intro-btn"
          onClick={() => setIsIntroOpen(true)}
          aria-label="Help and introduction"
          title="Help & Intro (?)"
          className="inline-flex items-center justify-center w-8 h-8 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all text-xs font-bold cursor-pointer shrink-0"
        >
          ?
        </button>
      </div>
      </header>

      <ArbitrumSepoliaModal
        isOpen={isTestnetModalOpen}
        onClose={() => setIsTestnetModalOpen(false)}
      />

      <IntroModal
        isOpen={isIntroOpen}
        onClose={handleCloseIntro}
        onStartStory={handleStartStory}
      />
    </>
  );
};
