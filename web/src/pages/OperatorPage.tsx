import React, { useState } from "react";
import {
  Radio,
  Hash,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Lock,
  Play,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useData } from "../data/DataContext";
import { StatTile } from "../components/StatTile";
import { Chip } from "../components/Chip";
import { Popover } from "../components/Popover";
import { HashChainStrip } from "../components/HashChainStrip";
import { TelemetryCharts } from "../components/TelemetryCharts";
import { MerkleTreeViz } from "../components/MerkleTreeViz";

const ATTACK_BUTTONS = [
  { id: "constant_scaling", label: "Constant scaling", name: "Constant Scaling" },
  { id: "flatline", label: "Flatline", name: "Flatline Injection" },
  { id: "replay", label: "Replay", name: "Historical Packet Replay" },
  { id: "tamper_after_signing", label: "Tamper", name: "Tamper After Signing" },
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

  // Compute Bond Status from chain / API state
  const bondStakedWei = state?.vault?.operator_bond_wei || "0";
  const bondLockedWei = state?.vault?.total_locked_wei || "0";
  const bondSlashedWei = state?.vault?.slashed_wei || "0";

  const bondStakedEth = (Number(BigInt(bondStakedWei)) / 1e18).toFixed(2);
  const bondLockedEth = (Number(BigInt(bondLockedWei)) / 1e18).toFixed(2);
  const bondSlashedEth = (Number(BigInt(bondSlashedWei)) / 1e18).toFixed(2);

  // Latest batch verdict
  const latestVerdict =
    latestBatch?.status === "Quarantined" || latestBatch?.status === "Slashed"
      ? "fraud"
      : latestBatch?.status === "Verified"
      ? "clean"
      : "pending";

  const currentAttack = state?.attack || "none";
  const isAttacking = currentAttack !== "none";
  const activeAttackMeta =
    ATTACK_BUTTONS.find((a) => a.id === currentAttack) || {
      id: currentAttack,
      label: currentAttack,
      name: currentAttack,
    };

  const handleSelectAttack = async (attackId: string) => {
    setIsSubmittingAttack(true);
    try {
      await setAttack(attackId);
    } finally {
      setIsSubmittingAttack(false);
    }
  };

  const handleSealBatch = async () => {
    setIsSealingBatch(true);
    try {
      await runBatchScenario();
    } finally {
      setIsSealingBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Title Row: Title with REAL chip & Popover */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
            {dataState === "LIVE" ? "Live telemetry" : "Telemetry (recorded replay)"}
          </h1>
          <Chip variant="REAL" label="EPA replay" />
          <Popover
            title="Operator telemetry"
            bullets={[
              "Signed sensor packets hash-chained at plant edge.",
              "Batches anchored on Ethereum testnet.",
              "Simulate attacks to test committee detection.",
              "Operator bond slashed upon fraud quorum.",
            ]}
          />
        </div>

        {latestBatch && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-strong">
            <span
              data-testid="latest-batch-status"
              className="bg-surface-soft border border-hairline px-2.5 py-1 rounded-chip"
            >
              Batch #{latestBatch.batch_id} · {latestBatch.status.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* 2. Three Stat Tiles on Pale Blush Band */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-card bg-band">
        <StatTile
          label="Packets"
          value={allPackets.length}
          icon={Radio}
          onBand={true}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <StatTile
          label="Batches anchored"
          value={batches.length}
          icon={Hash}
          onBand={true}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <StatTile
          label="Latest verdict"
          value={latestVerdict === "fraud" ? "Fraud" : "Clean"}
          subtext="5 of 5 verifiers"
          variant={latestVerdict === "fraud" ? "flagged" : "verified"}
          icon={latestVerdict === "fraud" ? ShieldAlert : ShieldCheck}
          onBand={true}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
      </section>

      {/* 3. One Telemetry Chart Card */}
      <section>
        <TelemetryCharts
          packets={allPackets}
          isLoading={isLoading}
          isEmpty={allPackets.length === 0}
          error={error}
          onRetry={refresh}
        />
      </section>

      {/* 4. Tamper-Evident Hash-Chain Strip */}
      <section>
        <HashChainStrip
          packets={allPackets}
          isLoading={isLoading}
          isEmpty={allPackets.length === 0}
          error={error}
          onRetry={refresh}
        />
      </section>

      {/* Merkle Tree and Root Chip (Anchored Batches) */}
      <section data-story="merkle-tree">
        <MerkleTreeViz
          batchId={latestBatch?.batch_id || 1}
          rootHash={latestBatch?.merkle_root}
          batchStatus={latestBatch?.status}
        />
      </section>

      {/* 5. Four Black Pill Attack Buttons & Seal Action */}
      <section
        role="region"
        aria-label="Attack Injection Panel"
        className="p-4 sm:p-5 rounded-card bg-surface border border-hairline shadow-card space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-brand" aria-hidden="true" />
            <h2 className="font-heading font-semibold text-sm text-ink">
              Attacks
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {isAttacking ? (
              <span
                data-testid="active-attack-badge"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-chip text-xs font-mono font-bold bg-[#FDECEC] text-[#9B1C1C] border border-red-300"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#9B1C1C]" />
                <span>ATTACK ACTIVE: {activeAttackMeta.name}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Four black pill buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {ATTACK_BUTTONS.map((atk) => {
              const isSelected = currentAttack === atk.id;
              return (
                <button
                  key={atk.id}
                  type="button"
                  data-testid={`attack-btn-${atk.id}`}
                  onClick={() => handleSelectAttack(isSelected ? "none" : atk.id)}
                  disabled={isSubmittingAttack || isSealingBatch}
                  className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all shadow-sm ${
                    isSelected
                      ? "bg-brand text-white border border-brand ring-2 ring-brand/30"
                      : "bg-[#0A0A0A] text-white hover:bg-neutral-800 border border-neutral-800 dark:bg-black dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-900"
                  }`}
                >
                  {atk.label}
                </button>
              );
            })}

            {isAttacking && (
              <button
                type="button"
                data-testid="attack-reset-btn"
                onClick={() => handleSelectAttack("none")}
                disabled={isSubmittingAttack || isSealingBatch}
                className="px-3.5 py-1.5 rounded-pill text-xs font-semibold bg-surface-soft hover:bg-hairline text-ink border border-hairline transition-all shadow-sm"
              >
                Reset
              </button>
            )}
          </div>

          {/* Seal & anchor batch CTA */}
          <button
            type="button"
            data-testid="seal-batch-btn"
            onClick={handleSealBatch}
            disabled={isSubmittingAttack || isSealingBatch}
            className="px-5 py-2 rounded-pill text-xs font-semibold bg-brand text-white hover:bg-brand-pressed transition-all shadow-sm flex items-center gap-1.5 shrink-0"
          >
            {isSealingBatch ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sealing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Seal batch</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 6. On-Chain Bond Card */}
      <section
        role="region"
        aria-label="Operator Bond"
        data-story="bond-card"
        className="p-4 sm:p-5 rounded-card bg-surface border border-hairline shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-sm text-ink">Operator bond</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono">
          <div className="px-3 py-1 rounded-chip bg-surface-soft border border-hairline flex items-center gap-1.5">
            <span className="text-muted-strong font-sans">Available:</span>
            <span className="font-semibold text-ink">{bondStakedEth} ETH</span>
          </div>
          <div className="px-3 py-1 rounded-chip bg-surface-soft border border-hairline flex items-center gap-1.5">
            <span className="text-muted-strong font-sans">Locked:</span>
            <span className="font-semibold text-amber-600">{bondLockedEth} ETH</span>
          </div>
          <div className="px-3 py-1 rounded-chip bg-surface-soft border border-hairline flex items-center gap-1.5">
            <span className="text-muted-strong font-sans">Slashed:</span>
            <span
              data-testid="operator-slashed-bond"
              className={`font-semibold ${
                Number(bondSlashedEth) > 0 ? "text-brand" : "text-muted-strong"
              }`}
            >
              {bondSlashedEth} ETH
            </span>
          </div>
          <span className="text-[11px] text-muted-strong font-sans">Delay 180s</span>
        </div>
      </section>
    </div>
  );
};
