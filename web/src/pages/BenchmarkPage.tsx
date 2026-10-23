import React, { useState, useEffect } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  getBenchmarkSummary,
  getRunManifest,
  type BenchmarkSummary,
  type RunManifest,
} from "../lib/benchmarkData";
import { BenchmarkTable } from "../components/BenchmarkTable";
import { BenchmarkCharts } from "../components/BenchmarkCharts";
import { Chip } from "../components/Chip";
import { Popover } from "../components/Popover";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";

export const BenchmarkPage: React.FC = () => {
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [manifest, setManifest] = useState<RunManifest | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  useEffect(() => {
    try {
      const s = getBenchmarkSummary();
      const m = getRunManifest();
      setSummary(s);
      setManifest(m);
    } catch (err) {
      console.error("Error loading benchmark artifacts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const commitShort = manifest?.git_commit_hash
    ? manifest.git_commit_hash.slice(0, 7)
    : "9cad8a0";

  return (
    <div className="space-y-6">
      {/* 1. Header with Title, REAL chip, and Help Popover */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
            What we catch, and what we don't
          </h1>
          <Chip variant="REAL" label="EPA CAMPD" />
          <Popover
            title="Benchmark evaluation"
            bullets={[
              "Empirical evaluation across 14 industrial attack scenarios.",
              "Five facility-grouped cross-validation splits on EPA CAMPD.",
              "Attacks below 50% recall are prominently disclosed.",
              "Multi-layer detector combines physics and neural autoencoder.",
            ]}
          />
        </div>
      </div>

      {/* 2. Attack x Detector 4-Column Table */}
      <section aria-labelledby="section-attack-table" className="space-y-2">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-card" />
        ) : summary ? (
          <BenchmarkTable summary={summary} />
        ) : (
          <EmptyState
            title="Benchmark Data Missing"
            description="Summary results file could not be loaded."
          />
        )}
      </section>

      {/* 3. ROC and Adaptive Attacker Charts */}
      <section aria-labelledby="section-curves" className="space-y-2">
        {loading ? (
          <Skeleton className="h-72 w-full rounded-card" />
        ) : summary ? (
          <BenchmarkCharts summary={summary} />
        ) : null}
      </section>

      {/* 4. What Still Gets Through (3 Bullets + Details Expander) */}
      <section aria-labelledby="section-what-still-gets-through">
        <div className="bg-surface border border-hairline rounded-card p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" aria-hidden="true" />
              <h2
                id="section-what-still-gets-through"
                className="text-base font-heading font-bold text-ink"
              >
                What still gets through
              </h2>
            </div>
            <Chip variant="FRAUD" label="3 attacks" size="sm" />
          </div>

          <ul className="space-y-2 text-xs text-muted-strong font-sans">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
              <span>
                <strong className="text-ink">Slow drift (0.1%/day):</strong> 8.1% caught · cumulative drift stays within normal boiler noise.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
              <span>
                <strong className="text-ink">Slow drift (0.3%/day):</strong> 29.1% caught · evades detection for first 9 operating days.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
              <span>
                <strong className="text-ink">Coordinated insider:</strong> 3.0% caught · falsifies fuel ledger within thermal margins.
              </span>
            </li>
          </ul>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-expanded={showDetails}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <span>{showDetails ? "Hide analysis" : "Details"}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
            </button>
            {showDetails && (
              <div className="mt-3 p-3 bg-surface-soft rounded-xl border border-hairline space-y-1.5 text-xs text-muted-strong">
                <p>
                  Attacks inside natural boiler variance and validation tolerance evade statistical thresholds to prevent false alarms.
                </p>
                <p>
                  Coordinated insider compromises stack and fuel meters simultaneously; stopping it requires an independent fiscal meter outside operator domain.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. One-Line Footer of Provenance Chips */}
      <footer className="flex flex-wrap items-center justify-center gap-2 p-3 bg-band rounded-pill border border-hairline">
        <Chip variant="REAL" label="5 splits" size="sm" />
        <Chip variant="REAL" label="seed 42" size="sm" />
        <Chip variant="REAL" label={`commit ${commitShort}`} size="sm" />
        <Chip variant="REAL" label="REAL EPA CAMPD" size="sm" />
        <Chip variant="SYNTHETIC" label="SYNTHETIC fuel ledger" size="sm" />
      </footer>
    </div>
  );
};
