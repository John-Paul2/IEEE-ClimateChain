import React, { useState } from "react";
import { Terminal, Copy, Check, Folder } from "lucide-react";
import { Badge } from "./Badge";

export const ReproduceBox: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const commands = [
    {
      title: "Makefile Target (Recommended)",
      cmd: "make benchmark",
      desc: "Executes python -m ml.benchmark.run_benchmark using the virtualenv (.venv).",
    },
    {
      title: "Direct Python Module Invocation",
      cmd: "python -m ml.benchmark.run_benchmark",
      desc: "Standard benchmark runner with default parameters (base seed 42, 5 splits, 720h series).",
    },
    {
      title: "Explicit Command with Full CLI Arguments",
      cmd: "python -m ml.benchmark.run_benchmark --processed-parquet data/processed/campd_hourly_processed.parquet --splits results/splits.json --params config/params.yaml --results-dir results --series-hours 720 --attack-fraction 0.40",
      desc: "Reproduces all raw logs, summary JSON, figures, and WHAT_STILL_GETS_THROUGH.md.",
    },
  ];

  const handleCopy = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="bg-surface-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-verified" aria-hidden="true" />
          <h3 className="text-base font-bold text-text">Reproduce Benchmark Results</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="verified" label="Deterministic CPU (Seed 42)" />
          <Badge variant="muted" label="~19.7m Runtime" />
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Every number, ROC curve coordinate, and figure in this dashboard is generated deterministically from real US EPA CAMPD facility splits by running the command below. No numbers are tuned, cherry-picked, or hardcoded.
      </p>

      <div className="space-y-3">
        {commands.map((item, idx) => (
          <div
            key={idx}
            className="p-3 bg-surface-sunken border border-border rounded-lg space-y-2 font-mono text-xs"
          >
            <div className="flex items-center justify-between text-muted text-[11px]">
              <span className="font-semibold text-text">{item.title}</span>
              <button
                type="button"
                onClick={() => handleCopy(item.cmd, idx)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-raised hover:bg-border text-text transition-colors text-[11px]"
                aria-label={`Copy ${item.title}`}
              >
                {copiedIndex === idx ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-verified" aria-hidden="true" />
                    <span className="text-verified">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-background/90 p-2.5 rounded border border-border/80 text-verified overflow-x-auto select-all">
              <code>$ {item.cmd}</code>
            </div>

            <p className="text-[11px] text-muted font-sans">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Artifacts Produced */}
      <div className="pt-2 border-t border-border/60">
        <span className="text-[11px] font-mono text-muted uppercase tracking-wider block mb-2">
          Outputs Produced in results/
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">benchmark_summary.json</span>
          </div>
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">WHAT_STILL_GETS_THROUGH.md</span>
          </div>
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">run_manifest.json</span>
          </div>
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">benchmark_raw.csv</span>
          </div>
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">figures/*.png (ROC & Adaptive)</span>
          </div>
          <div className="p-2 bg-surface-raised/40 rounded border border-border/60 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-info flex-shrink-0" aria-hidden="true" />
            <span className="text-text truncate">splits.json</span>
          </div>
        </div>
      </div>
    </div>
  );
};
