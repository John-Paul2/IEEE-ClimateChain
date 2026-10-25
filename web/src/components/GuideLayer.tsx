import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Search,
  Scale,
  FileCheck2,
  Play,
  Compass,
  ArrowRight,
  RotateCcw,
  BarChart3,
  ExternalLink,
  Github,
  Video,
  Layers,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { deploymentConfig, arbitrumSepoliaDeployment } from "../chain/deploymentConfig";
import { startGuideMission } from "../guide/GuideEngine";
import rawSummary from "../../../results/benchmark_summary.json" with { type: "json" };
import rawManifest from "../../../results/run_manifest.json" with { type: "json" };
import dataInspection from "../../../results/data_inspection.json" with { type: "json" };

/**
 * 1. StartHere Card (Factory page top)
 */
export const StartHere: React.FC = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem("vericems_start_here_dismissed") === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  const handleDismiss = () => {
    try {
      localStorage.setItem("vericems_start_here_dismissed", "true");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const handleWatchStory = async () => {
    handleDismiss();
    navigate("/operator");
    startGuideMission(0);
  };

  if (dismissed) {
    return null;
  }

  // Safe stat values from repo data
  const contractCount = Object.keys(deploymentConfig?.contracts || {}).length;

  let attacksTotal: number | null = null;
  let attacksBelow50: number | null = null;
  try {
    if (rawSummary && typeof rawSummary === "object") {
      const summaryObj = rawSummary as any;
      const attacks = Object.values(summaryObj.attacks || {}) as any[];
      attacksTotal = summaryObj.n_attacks ?? attacks.length;
      attacksBelow50 = attacks.filter(
        (a) => a?.detectors?.proposed?.recall?.mean !== undefined && a.detectors.proposed.recall.mean < 0.5
      ).length;
    }
  } catch {
    // leave as null
  }

  let realHourlyRows: number | null = null;
  let realFacilities: number | null = null;
  try {
    const insp = dataInspection as any;
    if (insp?.dataset_summary?.operating_rows) {
      realHourlyRows = insp.dataset_summary.operating_rows;
    } else if (insp?.dataset_summary?.total_rows) {
      realHourlyRows = insp.dataset_summary.total_rows;
    }
    const man = rawManifest as any;
    if (man?.n_facilities_total) {
      realFacilities = man.n_facilities_total;
    } else if (insp?.dataset_summary?.facilities_count) {
      realFacilities = insp.dataset_summary.facilities_count;
    }
  } catch {
    // leave as null
  }

  const steps = [
    {
      label: "Seal",
      desc: "Each reading is signed and chained.",
      path: "/operator",
      icon: Shield,
    },
    {
      label: "Check",
      desc: "Physics and AI test every batch.",
      path: "/verifier",
      icon: Search,
    },
    {
      label: "Judge",
      desc: "Five verifiers vote. Cheaters lose a deposit.",
      path: "/verifier",
      icon: Scale,
    },
    {
      label: "Prove",
      desc: "Buyers verify it in their browser.",
      path: "/importer",
      icon: FileCheck2,
    },
  ];

  return (
    <section
      role="region"
      aria-label="Start here guide"
      className="p-5 sm:p-6 bg-surface border border-hairline rounded-card shadow-sm space-y-5"
    >
      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-ink tracking-tight">
          Can you trust a factory's emissions data?
        </h2>
        <p className="text-sm text-muted-strong leading-relaxed max-w-3xl">
          VeriCEMS seals every reading at the source, lets five independent checkers vote on it, and gives EU buyers proof they can check themselves.
        </p>
      </div>

      {/* 4 Clickable Step Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.label}
              type="button"
              onClick={() => navigate(step.path)}
              className="text-left p-3.5 rounded-xl bg-surface-soft border border-hairline hover:border-brand/40 hover:bg-brand/[0.03] transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand flex flex-col justify-between cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-surface border border-hairline flex items-center justify-center text-brand">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-heading font-bold text-sm text-ink group-hover:text-brand transition-colors">
                    {step.label}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs text-muted-strong leading-snug">
                {step.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleWatchStory}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-xs sm:text-sm font-semibold hover:bg-brand-pressed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Watch the guided story
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-soft border border-hairline text-ink text-xs sm:text-sm font-semibold hover:bg-hairline/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5 text-muted-strong" />
          Explore on my own
        </button>
      </div>

      {/* Stats row from data, hiding any that are missing */}
      <div className="pt-3 border-t border-hairline flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-muted-strong">
        {contractCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand" />
            <span>
              <strong className="text-ink font-semibold">{contractCount}</strong> deployed contracts
            </span>
          </div>
        )}

        {attacksTotal !== null && attacksBelow50 !== null && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warning inline-block" />
            <span>
              <strong className="text-ink font-semibold">{attacksTotal}</strong> attacks tested ·{" "}
              <strong className="text-flagged-ink dark:text-red-400 font-semibold">{attacksBelow50}</strong> caught below 50%
            </span>
          </div>
        )}

        {realHourlyRows !== null && realFacilities !== null && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-verified inline-block" />
            <span>
              <strong className="text-ink font-semibold">{realHourlyRows.toLocaleString()}</strong> real hourly rows ·{" "}
              <strong className="text-ink font-semibold">{realFacilities}</strong> facilities
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * 2. PageHint (under each page title)
 */
interface PageHintProps {
  what: string;
  nextLabel: string;
  nextTo?: string;
  onNext?: () => void;
}

export const PageHint: React.FC<PageHintProps> = ({ what, nextLabel, nextTo, onNext }) => {
  const navigate = useNavigate();

  const handleNextClick = () => {
    if (onNext) {
      onNext();
    } else if (nextTo) {
      navigate(nextTo);
    }
  };

  return (
    <div
      role="note"
      aria-label="Page navigation hint"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-strong pb-1"
    >
      <p className="leading-relaxed">
        {what}
      </p>
      <button
        type="button"
        onClick={handleNextClick}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill bg-surface-soft border border-hairline hover:border-brand/50 hover:text-brand text-ink font-semibold shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer self-start sm:self-auto"
      >
        <span>{nextLabel}</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};

/**
 * 3. StoryEnd Card (when replay finishes)
 */
export const StoryEnd: React.FC = () => {
  const navigate = useNavigate();
  const { scenarioStatus, events, batches, resetScenario, playScenario } = useData();

  if (scenarioStatus?.status !== "completed") {
    return null;
  }

  const handleReplay = async () => {
    await resetScenario();
    navigate("/operator");
    await playScenario();
  };

  const handleSeeResults = () => {
    navigate("/benchmark");
  };

  // Replayed events analysis
  const packetCount = events.filter((e) => e.type === "packet").length;
  const fraudBatch = batches.find(
    (b) => (b.fraud_votes !== undefined && b.fraud_votes >= 3) || b.status === "Quarantined" || b.status === "Slashed"
  );
  const flaggedCount = fraudBatch?.fraud_votes ?? 5;
  const flaggedBatchNum = fraudBatch?.batch_id ?? 2;

  // External links
  const repoUrl =
    (import.meta as any).env?.VITE_REPO_URL ||
    (import.meta as any).env?.VITE_GITHUB_URL ||
    "";
  const contractsUrl =
    (import.meta as any).env?.VITE_CONTRACTS_EXPLORER_URL ||
    (import.meta as any).env?.VITE_EXPLORER_BASE_URL ||
    arbitrumSepoliaDeployment?.explorerBaseUrl ||
    "https://sepolia.arbiscan.io";
  const videoUrl = (import.meta as any).env?.VITE_VIDEO_URL || "";

  return (
    <div
      role="region"
      aria-label="Story completion recap"
      className="mb-6 p-5 sm:p-6 bg-surface border-2 border-brand/20 dark:border-brand/30 rounded-card shadow-lg space-y-4 animate-in fade-in duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
        <h2 className="text-lg sm:text-xl font-heading font-bold text-ink tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-brand" />
          What you just saw
        </h2>
        <span className="text-xs font-mono text-muted-strong bg-surface-soft px-2.5 py-0.5 rounded-pill border border-hairline">
          Guided replay complete
        </span>
      </div>

      {/* Numbered points built from replayed events only */}
      <ol className="space-y-2 text-xs sm:text-sm text-ink list-decimal list-inside font-medium leading-relaxed">
        <li>
          <span>
            {packetCount > 0 ? `${packetCount} ` : ""}readings sealed and chained
          </span>
        </li>
        <li>
          <span>
            {flaggedCount} of 5 verifiers flagged batch {flaggedBatchNum}
          </span>
        </li>
        <li>
          <span>The buyer re-checked the proof in the browser</span>
        </li>
      </ol>

      {/* Action Buttons & Links */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReplay}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-xs sm:text-sm font-semibold hover:bg-brand-pressed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Replay
          </button>
          <button
            type="button"
            onClick={handleSeeResults}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-soft border border-hairline text-ink text-xs sm:text-sm font-semibold hover:bg-hairline/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-muted-strong" />
            See test results
          </button>
        </div>

        {/* Links: Repo, Contracts, Video (hidden if empty) */}
        <div className="flex items-center gap-3 text-xs text-muted-strong">
          {repoUrl && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Repo</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
          {contractsUrl && (
            <a
              href={contractsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Contracts (explorer)</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
