import React from "react";
import {
  Menu,
  Server,
  Database,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { useToast } from "../components/Toast";

export interface TopBarProps {
  onToggleSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar }) => {
  const { isMock, setIsMock, network, runBatchScenario, refresh } = useData();
  const { showToast } = useToast();

  const handleStepDemo = async () => {
    try {
      await runBatchScenario();
      showToast("success", "Demo Step Executed", "Next batch sealed and submitted to verifiers.");
    } catch {
      showToast("error", "Demo Step Failed", "Could not advance scenario.");
    }
  };

  const handleRefresh = async () => {
    await refresh();
    showToast("info", "State Synchronized", "Refreshed blockchain and telemetry state.");
  };

  const networkColors = {
    LOCAL: {
      bg: "bg-info/10",
      border: "border-info/30",
      text: "text-info",
      icon: Server,
    },
    TESTNET: {
      bg: "bg-verified/10",
      border: "border-verified/30",
      text: "text-verified",
      icon: CheckCircle2,
    },
    "OFFLINE SNAPSHOT": {
      bg: "bg-warning/10",
      border: "border-warning/30",
      text: "text-warning",
      icon: AlertTriangle,
    },
  }[network.networkType];

  const NetIcon = networkColors.icon;

  return (
    <header className="h-16 px-4 lg:px-6 bg-surface border-b border-border flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Mobile menu hamburger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          className="p-2 rounded-lg bg-surface-raised border border-border text-muted hover:text-text lg:hidden focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Network Badge */}
        <div
          role="status"
          aria-label={`Network status: ${network.networkType}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${networkColors.bg} ${networkColors.border} ${networkColors.text}`}
        >
          <NetIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{network.networkType}</span>
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
              className="ml-1 p-0.5 rounded hover:bg-verified/20 focus-visible:ring-1 focus-visible:ring-verified text-verified hover:underline flex items-center gap-0.5"
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-warning/10 border border-warning/40 text-warning"
          >
            <Database className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>MOCK DATA</span>
          </div>
        )}
      </div>

      {/* Top right control actions */}
      <div className="flex items-center gap-2">
        {/* Demo Mode Control Placeholder */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-xs">
          <Sliders className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
          <span className="text-muted font-medium hidden sm:inline">Demo Mode:</span>
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
            className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] transition-colors ${
              isMock
                ? "bg-warning/20 text-warning hover:bg-warning/30"
                : "bg-verified/20 text-verified hover:bg-verified/30"
            }`}
            aria-label={`Toggle mock/live provider, currently ${isMock ? "Mock" : "Live"}`}
          >
            {isMock ? "SYNTHETIC" : "LIVE"}
          </button>
        </div>

        {/* Step Demo Scenario */}
        <button
          type="button"
          onClick={handleStepDemo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-info/10 text-info border border-info/30 hover:bg-info/20 transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
          title="Advance demo scenario by sealing a batch"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Step Scenario</span>
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh telemetry data"
          className="p-1.5 rounded-lg bg-surface-raised border border-border text-muted hover:text-text transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
