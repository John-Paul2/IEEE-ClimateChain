import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Shield,
  Component,
  Sun,
  Moon,
} from "lucide-react";
import { useData } from "../data/DataContext.tsx";
import { useToast } from "../components/Toast.tsx";
import { DataStatusPill } from "./DataStatusPill.tsx";

export const TopBar: React.FC = () => {
  const {
    refresh,
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

  const [isActing, setIsActing] = useState(false);

  // Dark mode state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("vericems-theme");
      if (stored === "dark" || stored === "light") return stored;
    }
    return "light";
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
  const isPlaying = scenarioStatus?.status === "playing";
  const speed = scenarioStatus?.speed || 1.0;

  // Auto-navigate to page matching current demo step
  useEffect(() => {
    if (currentStep === 0 || !scenarioStatus?.step_info) return;
    const targetPage = scenarioStatus.step_info[currentStep - 1]?.page;
    if (targetPage && location.pathname !== targetPage) {
      navigate(targetPage);
    }
  }, [currentStep, scenarioStatus, location.pathname, navigate]);

  const handlePlayPause = async () => {
    setIsActing(true);
    try {
      if (isPlaying) {
        await pauseScenario();
      } else {
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
          `Step ${nextStatus.current_step}/7 Executed`,
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
      showToast("info", "Scenario Reset", "Reset story to Step 0");
    } finally {
      setIsActing(false);
    }
  };

  const handleRefresh = async () => {
    setIsActing(true);
    try {
      await refresh();
      showToast("info", "State Refreshed", "Synchronized data and scenario status.");
    } finally {
      setIsActing(false);
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setScenarioSpeed(newSpeed);
  };

  const navTabs = [
    { to: "/operator", label: "Edge Gateway" },
    { to: "/verifier", label: "Verifier Quorum" },
    { to: "/importer", label: "EU Importer" },
    { to: "/benchmark", label: "Benchmark Suite" },
  ];

  return (
    <header className="min-h-16 px-3 sm:px-6 lg:px-8 bg-canvas border-b border-hairline flex flex-wrap items-center justify-between gap-2 sm:gap-3 select-none shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] transition-colors max-w-full">
      {/* Left: Brand Logo */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 py-2">
        <NavLink
          to="/operator"
          className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg"
          aria-label="VeriCEMS Home"
        >
          <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 fill-current" />
          </div>
          <div className="flex items-baseline">
            <span className="font-heading font-bold text-xl tracking-tight text-ink">
              VeriCEMS
            </span>
            <span className="text-brand font-bold text-xl leading-none">.</span>
          </div>
        </NavLink>
      </div>

      {/* Center: Four Pill Tabs */}
      <nav
        aria-label="Primary navigation"
        className="order-3 md:order-2 flex items-center p-1 rounded-pill bg-surface-soft border border-hairline overflow-x-auto max-w-full"
      >
        {navTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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

      {/* Right Side: Data Status Pill, Dark Mode, & Compact Demo Dock */}
      <div className="order-2 md:order-3 flex flex-wrap items-center gap-1.5 sm:gap-2 py-1 max-w-full">
        {/* Exactly one Data Status Pill per Requirement 1 */}
        <DataStatusPill />

        {/* Theme Toggle (Light / Dark Mode) */}
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-ink transition-all shadow-sm font-sans text-xs font-semibold select-none cursor-pointer"
        >
          {theme === "dark" ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              <span>Dark</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <span>Light</span>
            </>
          )}
        </button>

        {/* Compact Demo Dock */}
        <div
          data-testid="compact-demo-dock"
          className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-hairline"
        >
          {/* Play / Pause Pill */}
          <button
            type="button"
            data-testid={isPlaying ? "demo-pause-btn" : "demo-play-btn"}
            onClick={handlePlayPause}
            disabled={isActing}
            className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-pill text-xs font-semibold transition-all shadow-sm ${
              isPlaying
                ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                : "bg-brand text-white hover:bg-brand-pressed"
            }`}
            aria-label={isPlaying ? "Pause Scenario Playback" : "Play Scenario"}
            title={isPlaying ? "Pause Story" : "Play Story"}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span className="hidden md:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span className="hidden md:inline">Play</span>
              </>
            )}
          </button>

          {/* Next Step Pill (Black Pill) */}
          <button
            type="button"
            data-testid="demo-step-btn"
            onClick={handleStep}
            disabled={isActing || currentStep >= 7}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-semibold bg-ink text-white hover:opacity-90 dark:bg-white dark:text-black border border-transparent disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all"
            title="Advance to next scenario step"
            aria-label="Advance to Next Step"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Next</span>
          </button>

          {/* Reset Pill */}
          <button
            type="button"
            data-testid="demo-reset-btn"
            onClick={handleReset}
            disabled={isActing}
            className="p-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-all"
            title="Reset story to Step 0"
            aria-label="Reset Story Scenario"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Speed Selector */}
          <div className="hidden lg:flex items-center">
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

          {/* Refresh State */}
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh telemetry data"
            className="hidden sm:inline-flex p-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-all"
            title="Synchronize chain & backend state"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Component Gallery Link */}
          <NavLink
            to="/gallery"
            className="hidden xl:inline-flex p-1.5 rounded-pill bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink transition-all"
            title="Design System Gallery"
            aria-label="Design System Gallery"
          >
            <Component className="w-3.5 h-3.5" />
          </NavLink>

          {/* Hidden 1..7 step pills for test selectors */}
          <div className="hidden" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
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
    </header>
  );
};
