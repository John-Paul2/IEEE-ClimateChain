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
} from "lucide-react";
import { useData } from "../data/DataContext.tsx";
import { useToast } from "../components/Toast.tsx";
import { DataStatusPill } from "./DataStatusPill.tsx";
import { ArbitrumSepoliaModal } from "../components/ArbitrumSepoliaModal.tsx";
import { IntroModal } from "../components/IntroModal.tsx";

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

  const handleStartStory = async () => {
    handleCloseIntro();
    setIsManualMode(false);
    navigate("/operator");
    await playScenario();
  };

  // Dark mode state (defaults to dark)
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

  const prevStepRef = useRef<number>(currentStep);

  // Auto-navigation between tabs happens ONLY when the story moves to a new step, never on every render.
  // If the user clicks a tab during playback, manual mode stops auto-navigation until Play is clicked again.
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
        // Exiting manual mode when user explicitly presses Play
        setIsManualMode(false);
        await playScenario();
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleStep = async () => {
    setIsActing(true);
    try {
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
    // If the user clicks a tab during playback, switch to manual mode: pause the story
    // and stop auto-navigating until they press Play again.
    if (isPlaying) {
      pauseScenario();
    }
    setIsManualMode(true);
  };

  const navTabs = [
    { to: "/operator", label: "Factory" },
    { to: "/verifier", label: "Verifiers" },
    { to: "/importer", label: "Buyer" },
    { to: "/benchmark", label: "Test results" },
  ];

  return (
    <header className="min-h-16 px-3 sm:px-6 bg-canvas border-b border-hairline flex flex-wrap md:flex-nowrap items-center justify-between gap-2 sm:gap-3 select-none shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] transition-colors w-full">
      {/* Left: Brand Logo + Nav Tabs together */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0 py-2">
        <NavLink
          to="/operator"
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg shrink-0"
          aria-label="VeriCEMS Home"
        >
          <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center shadow-sm shrink-0">
            <Shield className="w-4 h-4 fill-current" />
          </div>
          <div className="flex items-baseline">
            <span className="font-heading font-bold text-xl tracking-tight text-ink">
              VeriCEMS
            </span>
            <span className="text-brand font-bold text-xl leading-none">.</span>
          </div>
        </NavLink>

        {/* Primary Nav Tabs */}
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
                `px-3 sm:px-4 py-1.5 rounded-pill text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted-strong hover:text-ink hover:bg-canvas"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Right Side: Data Status Pill, Dark Mode, & Compact Demo Dock */}
      <div className="flex items-center gap-1.5 sm:gap-2 py-1 shrink-0 max-w-full">
        {/* Exactly one Data Status Pill */}
        <DataStatusPill />

        {/* Unified Data Provenance Popover Button */}
        <div className="relative inline-block text-left shrink-0">
          <button
            type="button"
            data-testid="data-provenance-btn"
            onClick={() => setDataPopoverOpen((prev) => !prev)}
            aria-label="View data provenance"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all text-xs font-semibold cursor-pointer shrink-0"
          >
            <Database className="w-3.5 h-3.5 text-muted-strong" />
            <span className="hidden xl:inline">Data</span>
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
                className="absolute right-0 mt-1.5 w-72 p-3 bg-surface border border-hairline rounded-xl shadow-lg z-50 text-xs space-y-2 animate-in fade-in duration-100"
              >
                <div className="flex items-center justify-between pb-1 border-b border-hairline">
                  <span className="font-heading font-bold text-ink">Data provenance</span>
                  <button
                    type="button"
                    onClick={() => setDataPopoverOpen(false)}
                    className="text-muted hover:text-ink text-[11px]"
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
              </div>
            </>
          )}
        </div>

        {/* Arbitrum Sepolia Live Testnet Link */}
        <a
          href="https://sepolia.arbiscan.io"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="testnet-evidence-topbar-btn"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand dark:text-brand-soft transition-all text-xs font-semibold cursor-pointer select-none shrink-0"
          title="Open Arbitrum Sepolia Block Explorer (Chain 421614)"
          aria-label="Arbitrum Sepolia Block Explorer (Chain 421614)"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden="true" />
          <span className="hidden 2xl:inline">Arbitrum Sepolia</span>
          <span className="2xl:hidden">Sepolia</span>
          <ExternalLink className="w-3 h-3 opacity-70 shrink-0" aria-hidden="true" />
        </a>

        {/* Theme Toggle (Light / Dark Mode Icon) */}
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="inline-flex items-center justify-center w-7 h-7 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all shadow-sm select-none cursor-pointer shrink-0"
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 shrink-0" aria-hidden="true" />
          )}
        </button>

        {/* Help & Intro Modal Button */}
        <button
          type="button"
          data-testid="help-intro-btn"
          onClick={() => setIsIntroOpen(true)}
          aria-label="Help and introduction"
          title="Help & Intro (?)"
          className="inline-flex items-center justify-center w-7 h-7 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all text-xs font-bold select-none cursor-pointer shrink-0"
        >
          ?
        </button>

        {/* Compact Demo Dock */}
        <div
          data-testid="compact-demo-dock"
          className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-hairline shrink-0"
        >
          {/* Narration Toggle (captions) */}
          <button
            type="button"
            data-testid="narration-toggle-btn"
            onClick={() => setNarrationEnabled((prev) => !prev)}
            aria-pressed={narrationEnabled}
            title={narrationEnabled ? "Captions on" : "Captions off"}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-pill text-xs font-semibold border transition-all shrink-0 ${
              narrationEnabled
                ? "bg-brand/10 text-brand border-brand/30"
                : "bg-surface-soft text-muted-strong border-hairline opacity-60"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">Captions</span>
          </button>

          {/* Play / Pause Pill */}
          <button
            type="button"
            data-testid={isPlaying ? "demo-pause-btn" : "demo-play-btn"}
            onClick={handlePlayPause}
            disabled={isActing}
            className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-pill text-xs font-semibold transition-all shadow-sm shrink-0 ${
              isPlaying
                ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                : "bg-brand text-white hover:bg-brand-pressed"
            }`}
            aria-label={isPlaying ? "Pause Scenario Playback" : "Play Scenario"}
            title={isPlaying ? "Pause Story" : "Play Story"}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current shrink-0" />
                <span className="hidden md:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span className="hidden md:inline">Play</span>
              </>
            )}
          </button>

          {/* Next Step Pill (Black Pill) */}
          <button
            type="button"
            data-testid="demo-step-btn"
            onClick={handleStep}
            disabled={isActing || currentStep >= totalSteps}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-semibold bg-ink text-white hover:opacity-90 dark:bg-white dark:text-black border border-transparent disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all shrink-0"
            title="Advance to next scenario step"
            aria-label="Advance to Next Step"
          >
            <SkipForward className="w-3.5 h-3.5 shrink-0" />
            <span>Next</span>
          </button>

          {/* Single Reset Pill */}
          <button
            type="button"
            data-testid="demo-reset-btn"
            onClick={handleReset}
            disabled={isActing}
            className="p-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-all shrink-0"
            title="Reset story to start"
            aria-label="Reset Story Scenario"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center shrink-0">
            <select
              data-testid="demo-speed-select"
              value={speed}
              onChange={handleSpeedChange}
              aria-label="Playback speed selector"
              className="bg-surface-soft border border-hairline text-ink rounded-pill px-2 py-1 text-[11px] font-mono cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="2">2.0x</option>
              <option value="4">4.0x</option>
              <option value="20">20x</option>
            </select>
          </div>

          {/* Hidden 1..totalSteps step pills for test selectors */}
          <div className="hidden" aria-hidden="true">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((num) => (
              <span
                key={num}
                data-testid={`demo-step-pill-${num}`}
                className={num === currentStep ? "active" : "inactive"}
              >
                {num}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Live Arbitrum Sepolia Deployment Evidence Modal */}
      <ArbitrumSepoliaModal
        isOpen={isTestnetModalOpen}
        onClose={() => setIsTestnetModalOpen(false)}
      />

      {/* Intro Modal (opens on first visit or via ? button) */}
      <IntroModal
        isOpen={isIntroOpen}
        onClose={handleCloseIntro}
        onStartStory={handleStartStory}
      />
    </header>
  );
};
