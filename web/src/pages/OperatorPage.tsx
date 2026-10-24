import React, { useState } from "react";
import { NumberTicker } from "../components/ui/number-ticker";
import {
  Radio,
  Hash,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Lock,
  Play,
  Loader2,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { Popover } from "../components/Popover";
import { HashChainStrip } from "../components/HashChainStrip";
import { TelemetryCharts } from "../components/TelemetryCharts";
import { MerkleTreeViz } from "../components/MerkleTreeViz";
import { PageHint } from "../components/GuideLayer";

const ATTACK_BUTTONS = [
  { id: "constant_scaling", label: "Constant scaling (-20% CO₂)", name: "Constant scaling" },
  { id: "flatline", label: "Flatline injection", name: "Flatline" },
  { id: "replay", label: "Historical packet replay", name: "Replay" },
  { id: "tamper_after_signing", label: "Tamper after signing", name: "Tamper" },
];

export const OperatorPage: React.FC = () => {
  const {
    dataState,
    batches,
    events,
    state,
    isLoading,
    error,
    refresh,
    runBatchScenario,
    setAttack,
    stepScenario,
  } = useData();

  const [isSubmittingAttack, setIsSubmittingAttack] = useState(false);
  const [isSealingBatch, setIsSealingBatch] = useState(false);

  const latestBatch =
    batches.find((b) => b.status === "Quarantined" || b.status === "Slashed") ||
    batches[batches.length - 1] ||
    batches[0];

  const batchPackets: any[] = batches.flatMap((b: any) => b.packets || []);
  const eventPackets: any[] = (events || [])
    .filter((e) => e.type === "packet" && (e.seq !== undefined || (e.data as any)?.seq !== undefined))
    .map((e) => {
      const d = (e.data || {}) as Record<string, any>;
      return {
        device_id: String(e.device_id || d.device_id || "DEV-CAMPD-1073-3"),
        seq: Number(e.seq ?? d.seq ?? 0),
        timestamp_utc: String(e.timestamp_utc || e.timestamp || d.timestamp_utc || d.timestamp || ""),
        values: (e.values || d.values || {}) as any,
        prev_hash: String(e.prev_hash || d.prev_hash || ""),
        signature: String(e.signature || d.signature || ""),
        packet_hash: String(e.hash || e.packet_hash || d.hash || d.packet_hash || ""),
      };
    });
  const allPackets = batchPackets.length > 0 ? batchPackets : eventPackets;

  // Bond status
  const bondStakedWei = state?.vault?.operator_bond_wei || "0";
  const bondSlashedWei = state?.vault?.slashed_wei || "0";

  const bondStakedEth = (Number(BigInt(bondStakedWei)) / 1e18).toFixed(2);
  const isSlashed = Number(bondSlashedWei) > 0;

  // Latest verdict
  const latestVerdict =
    latestBatch?.status === "Quarantined" || latestBatch?.status === "Slashed"
      ? "fraud"
      : "clean";

  const currentAttack = state?.attack || "none";

  const handleSelectAttack = async (attackType: string) => {
    setIsSubmittingAttack(true);
    try {
      await setAttack(attackType);
    } finally {
      setIsSubmittingAttack(false);
    }
  };

  const handleSealBatch = async () => {
    setIsSealingBatch(true);
    try {
      if (dataState === "RECORDED REAL RUN") {
        await stepScenario();
      } else {
        await runBatchScenario();
      }
    } finally {
      setIsSealingBatch(false);
    }
  };

  const isRecordedMode = dataState === "RECORDED REAL RUN";

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
              Factory emissions telemetry
            </h1>
            <Popover
              title="Factory operator guide"
              bullets={[
                "Every hourly combustion reading is signed by the secure element.",
                "Readings are hash-chained in sequence to detect deletion or reordering.",
                "Batches of 8 readings are Merkle-anchored to Arbitrum Sepolia.",
                "Select an attack below to simulate how verifiers catch tampering.",
              ]}
            />
          </div>

          {latestBatch && (
            <span className="text-xs font-mono text-muted-strong bg-surface-soft px-2.5 py-1 rounded-pill border border-hairline">
              Batch #{latestBatch.batch_id} · {latestBatch.status}
            </span>
          )}
        </div>

        <PageHint
          what="The plant. Each reading is sealed and chained, then one fingerprint of the batch goes on the blockchain."
          nextLabel="See who checks it"
          nextTo="/verifier"
        />
      </div>

      {/* 2. Stat Tiles Bento Row */}
      <section aria-label="Factory statistics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tile 1: Packets Anchored (Animated Count) */}
        <div className="p-4 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Packets</span>
          <div className="text-4xl font-heading font-bold text-ink my-1">
            <NumberTicker value={allPackets.length} className="text-ink" />
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            <Radio className="w-3 h-3 text-muted" /> Hourly readings
          </span>
        </div>

        {/* Tile 2: Batches Anchored (Animated Count) */}
        <div className="p-4 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Batches anchored</span>
          <div className="text-4xl font-heading font-bold text-ink my-1">
            <NumberTicker value={batches.length} className="text-ink" />
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            <Hash className="w-3 h-3 text-muted" /> On-chain roots
          </span>
        </div>

        {/* Tile 3: Wide Tile for Latest Verdict (Span 2) */}
        <div className="sm:col-span-2 p-4 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Latest verdict</span>
          <div className="flex items-baseline gap-3 my-1">
            <span
              className={`text-4xl sm:text-5xl font-heading font-bold ${
                latestVerdict === "fraud"
                  ? "text-[#9B1C1C] dark:text-[#FF6B6B]"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {latestVerdict === "fraud" ? "Fraud" : "Clean"}
            </span>
            <span className="text-xs text-muted-strong font-mono">
              5 of 5 verifiers
            </span>
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            {latestVerdict === "fraud" ? (
              <ShieldAlert className="w-3 h-3 text-brand" />
            ) : (
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
            )}
            {latestVerdict === "fraud"
              ? "Quarantined by quorum consensus"
              : "Consensus reached"}
          </span>
        </div>

        {/* Tile 4: Operator Bond (Number + Thin Bar) */}
        <div className="p-4 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Operator bond</span>
          <div className="my-1">
            <div className="text-3xl font-heading font-bold text-ink">
              {bondStakedEth} ETH
            </div>
            {/* Thin status bar */}
            <div className="w-full h-1.5 bg-surface-soft border border-hairline rounded-full overflow-hidden mt-2">
              <div
                className={`h-full ${
                  isSlashed ? "bg-brand w-1/2" : "bg-emerald-500 w-full"
                }`}
              />
            </div>
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            <Lock className="w-3 h-3 text-muted" />
            {isSlashed ? "50% bond slashed" : "Collateral active"}
          </span>
        </div>
      </section>

      {/* 3. Main Row: Telemetry Chart Wide (Left 8 cols) | Attack Buttons in Plain List (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Wide Chart Left */}
        <div className="lg:col-span-8">
          <TelemetryCharts
            packets={allPackets}
            isLoading={isLoading}
            isEmpty={allPackets.length === 0}
            error={error}
            onRetry={refresh}
          />
        </div>

        {/* Plain List of Attack Buttons Right */}
        <div className="lg:col-span-4">
          <section
            role="region"
            aria-label="Attack simulation panel"
            className="p-4 bg-surface border border-hairline rounded-card space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-xs font-semibold text-ink">
                  Attack simulation
                </h2>
              </div>
              {isRecordedMode && (
                <span className="text-[10px] text-muted-strong font-mono">
                  Recorded mode
                </span>
              )}
            </div>

            <p className="text-xs text-muted-strong font-sans">
              Test how verifiers detect physical and cryptographic manipulation.
            </p>

            {/* Plain List of Attack Buttons */}
            <div className="space-y-1.5">
              {ATTACK_BUTTONS.map((atk) => {
                const isSelected = currentAttack === atk.id;
                return (
                  <button
                    key={atk.id}
                    type="button"
                    data-testid={`attack-btn-${atk.id}`}
                    onClick={() => handleSelectAttack(isSelected ? "none" : atk.id)}
                    disabled={isRecordedMode || isSubmittingAttack || isSealingBatch}
                    title={isRecordedMode ? "Live mode only" : atk.name}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors border flex items-center justify-between cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-brand text-white border-brand"
                        : "bg-surface-soft border-hairline text-ink hover:border-ink"
                    }`}
                  >
                    <span>{atk.label}</span>
                    {isSelected && (
                      <span className="text-[10px] uppercase font-mono font-bold">Active</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-hairline">
              <button
                type="button"
                data-testid="seal-batch-btn"
                onClick={handleSealBatch}
                disabled={isSubmittingAttack || isSealingBatch}
                className={`w-full px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  isSubmittingAttack || isSealingBatch
                    ? "bg-surface-soft text-muted border border-hairline cursor-not-allowed opacity-60"
                    : "bg-brand text-white hover:bg-brand-pressed active:scale-[0.99] shadow-sm cursor-pointer"
                }`}
              >
                {isSealingBatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sealing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Anchor batch root</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* 4. Compact Hash-Chain Timeline */}
      <section>
        <HashChainStrip
          packets={allPackets}
          isLoading={isLoading}
          isEmpty={allPackets.length === 0}
          error={error}
          onRetry={refresh}
        />
      </section>

      {/* 5. Merkle Tree (Collapsed after first batch) */}
      <section data-story="merkle-tree">
        <MerkleTreeViz
          batchId={latestBatch?.batch_id || 1}
          rootHash={latestBatch?.merkle_root}
          batchStatus={latestBatch?.status}
          isCollapsible={true}
          defaultOpen={batches.length <= 1}
        />
      </section>
    </div>
  );
};
