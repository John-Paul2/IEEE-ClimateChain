import React, { useState } from "react";
import { Radio, Database, Activity, ChevronDown } from "lucide-react";
import { useData, type DataState } from "../data/DataContext.tsx";

export const DataStatusPill: React.FC = () => {
  const { dataState, setDataState } = useData();
  const [open, setOpen] = useState(false);

  const availableStates: Array<{
    state: DataState;
    title: string;
    desc: string;
  }> = [
    {
      state: "RECORDED REAL RUN",
      title: "RECORDED REAL RUN",
      desc: "Offline snapshot of real US EPA CAMPD telemetry & Arbitrum Sepolia tx hashes. Works instantly without running local servers.",
    },
    {
      state: "LIVE",
      title: "LIVE",
      desc: "Real-time WebSocket & REST connection to local Python backend (port 8000) and live Arbitrum Sepolia / Anvil chain.",
    },
  ];

  const config = {
    "RECORDED REAL RUN": {
      label: "RECORDED REAL RUN",
      shortLabel: "RECORDED",
      color: "bg-surface-soft text-ink border-hairline",
      dot: "bg-brand",
      icon: Database,
    },
    LIVE: {
      label: "LIVE",
      shortLabel: "LIVE",
      color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-500",
      icon: Activity,
    },
    MOCK: {
      label: "MOCK",
      shortLabel: "MOCK",
      color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
      dot: "bg-amber-500",
      icon: Radio,
    },
  }[dataState] || {
    label: "RECORDED REAL RUN",
    shortLabel: "RECORDED",
    color: "bg-surface-soft text-ink border-hairline",
    dot: "bg-brand",
    icon: Database,
  };

  const Icon = config.icon;

  const handleSelect = (state: DataState) => {
    setDataState(state);
    setOpen(false);
  };

  return (
    <div
      className="relative inline-block shrink-0"
      role="status"
      aria-label="Network status and data source selector"
    >
      <button
        type="button"
        data-testid="data-status-pill"
        data-state={dataState}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Data status: ${dataState}. Click to switch between Recorded Real Run and Live mode.`}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-mono font-semibold border transition-all ${config.color} hover:border-ink cursor-pointer shrink-0`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} aria-hidden="true" />
        <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden xl:inline">{config.label}</span>
        <span className="xl:hidden">{config.shortLabel}</span>
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Select data source"
            className="absolute right-0 mt-1.5 w-72 rounded-2xl bg-surface border border-hairline-strong shadow-2xl p-2 z-50 text-xs space-y-1"
          >
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-muted font-bold border-b border-hairline">
              Data Source Mode
            </div>
            {availableStates.map((item) => {
              const active = item.state === dataState;
              return (
                <button
                  key={item.state}
                  role="menuitem"
                  type="button"
                  data-testid={`data-state-option-${item.state.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => handleSelect(item.state)}
                  className={`w-full text-left p-2.5 rounded-xl flex flex-col gap-1 transition-colors cursor-pointer ${
                    active
                      ? "bg-brand/10 border border-brand/30 text-ink"
                      : "hover:bg-surface-soft text-muted-strong hover:text-ink border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-xs">
                    <span className="text-ink">{item.title}</span>
                    {active && <span className="w-2 h-2 rounded-full bg-brand" />}
                  </div>
                  <p className="text-[11px] font-sans text-muted-strong leading-snug">
                    {item.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
