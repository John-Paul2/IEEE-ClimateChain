import React, { useState, useMemo } from "react";
import { NumberTicker } from "../components/ui/number-ticker";
import {
  Radio,
  Hash,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Lock,
  Gauge,
  Sliders,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { Popover } from "../components/Popover";
import { HashChainStrip } from "../components/HashChainStrip";
import { TelemetryCharts } from "../components/TelemetryCharts";
import { MerkleTreeViz } from "../components/MerkleTreeViz";
import { PageHint } from "../components/GuideLayer";

const ATTACK_BUTTONS = [
  {
    id: "constant_scaling",
    label: "Constant scaling (-20% CO₂)",
    name: "Constant scaling",
    detector: "Caught by Physics Mass-Balance Check (CO₂ vs. Heat input divergence)",
    effect: "Scales reported CO₂ down by 20% on the chart while fuel heat & O₂ remain high.",
  },
  {
    id: "flatline",
    label: "Flatline injection",
    name: "Flatline",
    detector: "Caught by Spectral Flatline Detector (zero sensor variance)",
    effect: "Freezes CO₂ (18.2 T) and O₂ (4.50%) into a flat horizontal line on the chart.",
  },
  {
    id: "replay",
    label: "Historical packet replay",
    name: "Replay",
    detector: "Caught by Autocorrelation & Sequence Replay Detector",
    effect: "Replays packets #1–#4 in a repeating loop across the second half of the chart.",
  },
  {
    id: "tamper_after_signing",
    label: "Tamper after signing",
    name: "Tamper",
    detector: "Caught by SHA-256 Hash-Chain & On-Chain Merkle Root Verification",
    effect: "Alters Packet #2 CO₂ after signing—breaking the Hash Chain link and Merkle root.",
  },
];

export const OperatorPage: React.FC = () => {
  const {
    dataState,
    batches,
    events,
    state,
    scenarioStatus,
    isLoading,
    error,
    refresh,
    setAttack,
    runBatchScenario,
  } = useData();

  const [isSubmittingAttack, setIsSubmittingAttack] = useState(false);
  const [isRunningLiveBatch, setIsRunningLiveBatch] = useState(false);
  const [hidePercent, setHidePercent] = useState<number>(0);
  const [selectedPacketIndex, setSelectedPacketIndex] = useState<number | null>(null);
  const [tamperedLeafIndex, setTamperedLeafIndex] = useState<number | null>(null);
  const [tamperedLeafHash, setTamperedLeafHash] = useState<string | null>(null);

  const currentAttack = state?.attack || "none";
  const currentStoryStep = scenarioStatus?.current_step || 0;
  const isStoryFraudStep = currentStoryStep >= 5 && currentStoryStep <= 7;

  const cleanBatch = batches.find((b) => b.batch_id === 1) || batches[0];
  const fraudBatch =
    batches.find((b) => b.status === "Quarantined" || b.status === "Slashed") ||
    batches[batches.length - 1] ||
    cleanBatch;

  const isAttackOrTamperActive =
    currentAttack !== "none" ||
    tamperedLeafIndex !== null ||
    isStoryFraudStep;

  const latestBatch = isAttackOrTamperActive ? fraudBatch : cleanBatch;

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

  // Base clean packets (use Batch 1 clean readings as clean baseline when attack === "none")
  const rawAllPackets = batchPackets.length > 0 ? batchPackets : eventPackets;
  const cleanBaselinePackets = useMemo(() => {
    const first8 = rawAllPackets.slice(0, 8);
    if (rawAllPackets.length >= 16) {
      // Reconstruct clean 16-packet baseline so attack === "none" is genuinely clean
      return rawAllPackets.slice(0, 16).map((p, idx) => {
        if (idx < 8) return p;
        const ref = first8[idx - 8] || p;
        const refVals = ref.values || {};
        return {
          ...p,
          values: {
            ...(p.values || {}),
            co2_mass_short_tons: Number(((refVals.co2_mass_short_tons ?? 26.5) * 1.02).toFixed(2)),
            heat_input_mmbtu: Number(((refVals.heat_input_mmbtu ?? 320.0) * 1.02).toFixed(2)),
            synthetic_stack_o2_pct: Number((refVals.synthetic_stack_o2_pct ?? 5.1).toFixed(2)),
          },
        };
      });
    }
    return rawAllPackets;
  }, [rawAllPackets]);

  // Dynamically transform packets for TelemetryCharts & HashChainStrip based on active attack
  const allPackets = useMemo(() => {
    const base = cleanBaselinePackets;
    if (base.length === 0 || currentAttack === "none") {
      return base;
    }

    const halfIdx = Math.max(1, Math.floor(base.length / 2));

    if (currentAttack === "constant_scaling") {
      return base.map((p, idx) => {
        if (idx < halfIdx) return p;
        const vals = p.values || {};
        const origCo2 = Number(vals.co2_mass_short_tons ?? 26.6);
        return {
          ...p,
          values: {
            ...vals,
            co2_mass_short_tons: Number((origCo2 * 0.8).toFixed(2)),
          },
        };
      });
    }

    if (currentAttack === "flatline") {
      return base.map((p, idx) => {
        if (idx < halfIdx) return p;
        const vals = p.values || {};
        return {
          ...p,
          values: {
            ...vals,
            co2_mass_short_tons: 18.2,
            synthetic_stack_o2_pct: 4.5,
            heat_input_mmbtu: 310.0,
          },
        };
      });
    }

    if (currentAttack === "replay") {
      return base.map((p, idx) => {
        if (idx < halfIdx) return p;
        const replaySource = base[(idx - halfIdx) % Math.min(4, halfIdx)] || p;
        const srcVals = replaySource.values || {};
        return {
          ...p,
          values: {
            ...(p.values || {}),
            co2_mass_short_tons: Number(((srcVals.co2_mass_short_tons ?? 25.0) * 0.72).toFixed(2)),
            synthetic_stack_o2_pct: Number(((srcVals.synthetic_stack_o2_pct ?? 5.0) * 1.25).toFixed(2)),
          },
        };
      });
    }

    if (currentAttack === "tamper_after_signing") {
      const targetIdx = Math.min(1, base.length - 1);
      return base.map((p, idx) => {
        if (idx !== targetIdx) return p;
        const vals = p.values || {};
        return {
          ...p,
          packet_hash: "0xdeadbeef99887766554433221100aabbccddeeff00112233445566778899tampered",
          values: {
            ...vals,
            co2_mass_short_tons: 14.2,
          },
        };
      });
    }

    return base;
  }, [cleanBaselinePackets, currentAttack]);

  // Compute physics ratio (CO2 / heat_input) stats from clean baseline packets
  const physicsStats = useMemo(() => {
    const ratios: number[] = [];
    cleanBaselinePackets.forEach((p: any) => {
      const vals = p.values || p.data?.values || p.data || p || {};
      const co2 = Number(vals.co2_mass_short_tons ?? vals.co2_mass ?? vals.co2);
      const heat = Number(vals.heat_input_mmbtu ?? vals.heat_input ?? vals.heat);
      if (!isNaN(co2) && !isNaN(heat) && heat > 0 && co2 > 0) {
        ratios.push(co2 / heat);
      }
    });

    if (ratios.length === 0) {
      return { mean: 0.1, std: 0.005, lower: 0.085, upper: 0.115, tipPercent: 15 };
    }

    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance =
      ratios.reduce((acc, r) => acc + (r - mean) ** 2, 0) / ratios.length;
    const std = Math.sqrt(variance);
    const lower = Math.max(0, mean - 3 * std);
    const upper = mean + 3 * std;
    const tipPercent = Math.max(
      1,
      Math.min(40, Math.round(((3 * std) / (mean || 1)) * 100))
    );

    return { mean, std, lower, upper, tipPercent };
  }, [cleanBaselinePackets]);

  const effectiveHidePercent =
    hidePercent > 0 ? hidePercent : currentAttack === "constant_scaling" ? 20 : 0;
  const currentScaledRatio = physicsStats.mean * (1 - effectiveHidePercent / 100);
  const isPhysicsCaught = currentScaledRatio < physicsStats.lower;

  //Latest verdict & Bond status react immediately to active attack / physics check / tamper
  const latestVerdict =
    isAttackOrTamperActive || isPhysicsCaught ? "fraud" : "clean";

  const isSlashed =
    latestVerdict === "fraud" || Number(state?.vault?.slashed_wei || "0") > 0 && isAttackOrTamperActive;
  const bondStakedEth = isSlashed ? "0.50" : "1.00";

  const activeAttackInfo = ATTACK_BUTTONS.find((a) => a.id === currentAttack);

  const handleSelectAttack = async (attackType: string) => {
    setIsSubmittingAttack(true);
    try {
      await setAttack(attackType);
      if (attackType === "tamper_after_signing") {
        setTamperedLeafIndex(1);
        setTamperedLeafHash("0xdeadbeef99887766554433221100aabbccddeeff00112233445566778899tampered");
      } else if (attackType === "none") {
        setTamperedLeafIndex(null);
        setTamperedLeafHash(null);
        setHidePercent(0);
      } else {
        setTamperedLeafIndex(null);
        setTamperedLeafHash(null);
      }
    } finally {
      setIsSubmittingAttack(false);
    }
  };

  const handleRunLiveBatch = async () => {
    setIsRunningLiveBatch(true);
    try {
      await runBatchScenario();
    } finally {
      setIsRunningLiveBatch(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-3xl sm:text-page-title text-ink font-heading font-bold">
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
            <span className="text-xs font-mono text-muted-strong bg-surface-soft px-3 py-1.5 rounded-pill border border-hairline">
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
        <div className="p-5 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Packets</span>
          <div className="text-4xl font-heading font-bold text-ink my-1.5">
            <NumberTicker value={allPackets.length} className="text-ink" />
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            <Radio className="w-3 h-3 text-muted" /> Hourly readings
          </span>
        </div>

        <div className="p-5 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Batches anchored</span>
          <div className="text-4xl font-heading font-bold text-ink my-1.5">
            <NumberTicker value={batches.length} className="text-ink" />
          </div>
          <span className="text-[11px] text-muted-strong font-mono flex items-center gap-1">
            <Hash className="w-3 h-3 text-muted" /> On-chain roots
          </span>
        </div>

        <div className="sm:col-span-2 p-5 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Latest verdict</span>
          <div className="flex items-baseline gap-3 my-1.5">
            <span
              className={`text-4xl sm:text-5xl font-heading font-bold ${
                latestVerdict === "fraud"
                  ? "text-flagged-ink"
                  : "text-verified"
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
              <ShieldCheck className="w-3 h-3 text-verified" />
            )}
            {latestVerdict === "fraud"
              ? "Quarantined by quorum consensus"
              : "Consensus reached"}
          </span>
        </div>

        <div className="p-5 bg-surface border border-hairline rounded-card flex flex-col justify-between">
          <span className="text-[13px] text-muted-strong font-medium">Operator bond</span>
          <div className="my-1.5">
            <div className="text-3xl font-heading font-bold text-ink">
              {bondStakedEth} ETH
            </div>
            <div className="w-full h-1.5 bg-surface-soft border border-hairline rounded-full overflow-hidden mt-2">
              <div
                className={`h-full ${
                  isSlashed ? "bg-brand w-1/2" : "bg-verified w-full"
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

      {/* 3. Main Row: Telemetry Chart Wide (Left 8 cols) | Attack Buttons (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <TelemetryCharts
            packets={allPackets}
            co2Scale={1 - hidePercent / 100}
            isLoading={isLoading}
            isEmpty={allPackets.length === 0}
            error={error}
            onRetry={refresh}
          />

          {/* Hide-CO2 Slider & Physics Gauge */}
          <div className="p-5 bg-surface border border-hairline rounded-card space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-heading font-bold text-ink">
                  Hide X% of CO₂
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-brand/10 text-brand font-semibold">
                  Browser demo
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-ink">
                {hidePercent}% hidden
              </span>
            </div>

            <div className="space-y-1">
              <input
                data-guide="hide-slider"
                type="range"
                min="0"
                max="40"
                step="1"
                value={hidePercent}
                onChange={(e) => setHidePercent(Number(e.target.value))}
                className="w-full accent-brand cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-strong font-mono">
                <span>0% (real clean)</span>
                <span>20%</span>
                <span>40%</span>
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border transition-colors space-y-2 ${
                isPhysicsCaught
                  ? "bg-flagged-bg border-brand/50"
                  : "bg-surface-soft border-hairline"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Gauge className="w-3.5 h-3.5 text-muted-strong" />
                  <span className="text-muted-strong font-medium">CO₂ / Heat ratio:</span>
                  <span className={`font-mono font-semibold ${isPhysicsCaught ? "text-flagged-ink font-bold" : "text-ink"}`}>
                    {currentScaledRatio.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-muted-strong font-mono">
                    (band: {physicsStats.lower.toFixed(4)} – {physicsStats.upper.toFixed(4)})
                  </span>
                </div>

                {isPhysicsCaught && (
                  <span className="px-2.5 py-0.5 rounded-pill text-[11px] font-mono font-bold bg-brand/20 text-flagged-ink border border-brand/40 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-brand" />
                    Physics check: caught (at {physicsStats.tipPercent}%)
                  </span>
                )}
              </div>

              <div className="w-full h-2 bg-surface border border-hairline rounded-full overflow-hidden relative">
                <div
                  className={`h-full transition-all duration-150 ${
                    isPhysicsCaught ? "bg-brand" : "bg-verified"
                  }`}
                  style={{
                    width: `${Math.max(4, Math.min(100, (currentScaledRatio / (physicsStats.upper * 1.15 || 1)) * 100))}%`,
                  }}
                />
              </div>

              <p className="text-[11px] text-muted-strong">
                Simplified browser demo. The real detector is on Test results.
              </p>
            </div>
          </div>
        </div>

        {/* Attack Simulation Panel Right */}
        <div className="lg:col-span-4">
          <section
            role="region"
            aria-label="Attack simulation panel"
            className="p-5 bg-surface border border-hairline rounded-card space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-brand" aria-hidden="true" />
                <h2 className="text-sm font-heading font-bold text-ink">
                  Attack simulation
                </h2>
              </div>
              <span className="text-[10px] text-brand font-mono font-semibold px-2 py-0.5 rounded-pill bg-brand/10">
                Browser demo
              </span>
            </div>

            <p className="text-xs text-muted-strong font-sans">
              Select any attack vector below to see how it alters the telemetry graph and how VeriCEMS catches it.
            </p>

            <div className="space-y-2">
              {ATTACK_BUTTONS.map((atk) => {
                const isSelected = currentAttack === atk.id;
                return (
                  <button
                    key={atk.id}
                    type="button"
                    data-testid={`attack-btn-${atk.id}`}
                    onClick={() => handleSelectAttack(isSelected ? "none" : atk.id)}
                    disabled={isSubmittingAttack}
                    title={atk.effect}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium text-left transition-colors border flex items-center justify-between cursor-pointer disabled:opacity-50 ${
                      isSelected
                        ? "bg-brand text-white border-brand shadow-xs"
                        : "bg-surface-soft border-hairline text-ink hover:border-brand/50"
                    }`}
                  >
                    <span>{atk.label}</span>
                    <span className="text-[10px] uppercase font-mono font-bold">
                      {isSelected ? "Active" : "Test →"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Attack Explanation & Clean Reset */}
            {activeAttackInfo ? (
              <div className="p-3 rounded-xl bg-flagged-bg border border-brand/40 text-xs space-y-2">
                <div className="font-mono font-bold text-flagged-ink flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span>{activeAttackInfo.name} injected</span>
                </div>
                <p className="text-[11px] text-ink leading-snug">
                  {activeAttackInfo.effect}
                </p>
                <p className="text-[10px] font-mono text-flagged-ink">
                  {activeAttackInfo.detector}
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectAttack("none")}
                  className="w-full mt-1 py-1.5 px-3 rounded-lg bg-surface border border-hairline text-xs font-semibold text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  Reset to Clean Baseline
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-surface-soft border border-hairline text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-verified font-mono font-semibold text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Clean baseline active (0 attacks)</span>
                </div>
              </div>
            )}

            {/* Live Mode Real-Time Batch Trigger */}
            {dataState === "LIVE" && (
              <div className="pt-2 border-t border-hairline space-y-1.5">
                <button
                  type="button"
                  onClick={handleRunLiveBatch}
                  disabled={isRunningLiveBatch}
                  className="w-full py-2 px-3.5 rounded-pill bg-ink text-canvas font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isRunningLiveBatch ? "Anchoring Live Batch..." : "Run New Live Batch on Backend"}
                </button>
                <p className="text-[10px] text-muted-strong font-mono text-center">
                  Streams 8 new signed packets through the 5 verifiers & Anvil chain
                </p>
              </div>
            )}
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
          batchRoot={latestBatch?.merkle_root}
          selectedPacketIndex={selectedPacketIndex}
          onSelectPacket={(idx) => setSelectedPacketIndex(idx)}
          onTamperPacket={(idx, newHash) => {
            setTamperedLeafIndex(idx);
            setTamperedLeafHash(newHash);
          }}
        />
      </section>

      {/* 5. Merkle Tree (Always expanded so proof paths and tamper propagation are immediately visible) */}
      <section data-story="merkle-tree">
        <MerkleTreeViz
          batchId={latestBatch?.batch_id || 1}
          rootHash={latestBatch?.merkle_root}
          batchStatus={latestBatch?.status}
          isCollapsible={true}
          defaultOpen={true}
          selectedLeafIndex={selectedPacketIndex}
          tamperedLeafIndex={tamperedLeafIndex}
          tamperedLeafHash={tamperedLeafHash}
          onClearSelectedLeaf={() => {
            setSelectedPacketIndex(null);
            setTamperedLeafIndex(null);
            setTamperedLeafHash(null);
          }}
        />
      </section>
    </div>
  );
};
