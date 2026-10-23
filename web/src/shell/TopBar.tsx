import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Server,
  Database,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Shield,
  Component,
  Sun,
  Moon,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { useToast } from "../components/Toast";

export const TopBar: React.FC = () => {
  const {
    isMock,
    setIsMock,
    network,
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
    if (typeof document !== "undefined") {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("vericems-theme", theme);
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
      showToast("info", "Scenario Reset", "Reset to Step 0.");
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

  const handleRefresh = async () => {
    await refresh();
    showToast("info", "State Synchronized", "Refreshed telemetry and chain state.");
  };

  const navTabs = [
    { to: "/operator", label: "Operator" },
    { to: "/verifier", label: "Verifier" },
    { to: "/importer", label: "Importer" },
    { to: "/benchmark", label: "Benchmark" },
  ];

  const networkColors = {
    LOCAL: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-600 dark:text-blue-400",
      icon: Server,
    },
    TESTNET: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-400",
      icon: CheckCircle2,
    },
    "OFFLINE SNAPSHOT": {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-700 dark:text-amber-400",
      icon: AlertTriangle,
    },
  }[network.networkType];

  const NetIcon = networkColors.icon;

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

      {/* Right Side: Network Badge, Dark Mode, & Compact Demo Dock */}
      <div className="order-2 md:order-3 flex flex-wrap items-center gap-1.5 sm:gap-2 py-1 max-w-full">
        {/* Network Badge */}
        <div
          role="status"
          aria-label={`Network status: ${network.networkType}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip text-xs font-mono font-semibold border ${networkColors.bg} ${networkColors.border} ${networkColors.text}`}
        >
          <NetIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{network.networkType}</span>
          <span className="sm:hidden">{network.networkType === "OFFLINE SNAPSHOT" ? "OFFLINE" : network.networkType}</span>
          {network.chainId && (
            <span className="opacity-70 text-[10px]">({network.chainId})</span>
          )}
          {network.networkType === "TESTNET" && (
            <a
              href={import.meta.env?.VITE_EXPLORER_BASE_URL || "https://sepolia.arbiscan.io"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on Arbitrum Sepolia Block Explorer"
              title="Open Arbiscan Sepolia Explorer"
              className="ml-0.5 p-0.5 rounded hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* MOCK DATA Badge */}
        {isMock && (
          <div
            role="status"
            aria-label="Mock Data Provider is active"
            className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-chip text-xs font-mono font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400"
          >
            <Database className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">MOCK DATA</span>
            <span className="sm:hidden">MOCK</span>
          </div>
        )}

        {/* Mode Toggle (SYNTHETIC / LIVE) */}
        <button
          type="button"
          onClick={() => {
            setIsMock(!isMock);
            showToast(
              "info",
              isMock ? "Switched to Live Provider" : "Switched to Mock Provider",
              isMock
                ? "Connecting to local backend and chain."
                : "Rendering offline synthetic test scenarios."
            );
          }}
          className={`font-mono font-bold px-2.5 py-1 rounded-pill text-[11px] border transition-colors ${
            isMock
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
          }`}
          aria-label={`Toggle mock/live provider, currently ${isMock ? "Mock" : "Live"}`}
        >
          {isMock ? "SYNTHETIC" : "LIVE"}
        </button>

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
              <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
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
