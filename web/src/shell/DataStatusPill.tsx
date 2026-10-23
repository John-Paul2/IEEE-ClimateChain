import React, { useState } from "react";
import { Radio, Database, Activity, ChevronDown } from "lucide-react";
import { useData, type DataState } from "../data/DataContext.tsx";

const isProduction = Boolean(import.meta.env?.PROD);

export const DataStatusPill: React.FC = () => {
  const { dataState, setDataState } = useData();
  const [open, setOpen] = useState(false);

  const availableStates: DataState[] = isProduction
    ? ["RECORDED REAL RUN", "LIVE"]
    : ["RECORDED REAL RUN", "LIVE", "MOCK"];

  const config = {
    "RECORDED REAL RUN": {
      label: "RECORDED REAL RUN",
      shortLabel: "RECORDED",
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
      dot: "bg-blue-500",
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
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    dot: "bg-blue-500",
    icon: Database,
  };

  const Icon = config.icon;

  const handleSelect = (state: DataState) => {
    setDataState(state);
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="data-status-pill"
        data-state={dataState}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Data status: ${dataState}. Click to toggle data source.`}
        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-pill text-xs font-mono font-semibold border transition-all ${config.color} hover:opacity-90 shadow-sm cursor-pointer`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} aria-hidden="true" />
        <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{config.label}</span>
        <span className="sm:hidden">{config.shortLabel}</span>
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
            className="absolute right-0 mt-1.5 w-48 rounded-xl bg-surface border border-hairline shadow-lg py-1 z-50 text-xs font-mono"
          >
            {availableStates.map((st) => {
              const active = st === dataState;
              return (
                <button
                  key={st}
                  role="menuitem"
                  type="button"
                  data-testid={`data-state-option-${st.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => handleSelect(st)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-surface-soft transition-colors ${
                    active ? "font-bold text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <span>{st}</span>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
