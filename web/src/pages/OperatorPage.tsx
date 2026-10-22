import React from "react";
import { Activity, ShieldCheck, Flame, Cpu, Hash, Lock, ShieldAlert } from "lucide-react";
import { useData } from "../data/DataContext";
import { StatTile } from "../components/StatTile";
import { Card } from "../components/Card";
import { HashChainStrip } from "../components/HashChainStrip";
import { DataTable, type Column } from "../components/DataTable";
import { Badge } from "../components/Badge";
import { HashChip } from "../components/HashChip";
import { TelemetryCharts } from "../components/TelemetryCharts";
import { AttackPanel } from "../components/AttackPanel";
import { MerkleTreeViz } from "../components/MerkleTreeViz";
import { TrustGauge } from "../components/TrustGauge";
import type { BatchSummary } from "../types/telemetry";

export const OperatorPage: React.FC = () => {
  const {
    batches,
    state,
    isLoading,
    error,
    refresh,
    runBatchScenario,
    setAttack,
  } = useData();

  const latestBatch = batches[0];
  const allPackets = batches.flatMap((b: any) => b.packets || []);

  // Compute Bond Status from chain / API state
  const bondStakedWei = state?.vault?.operator_bond_wei || "0";
  const bondLockedWei = state?.vault?.total_locked_wei || "0";
  const bondSlashedWei = state?.vault?.slashed_wei || "0";

  const bondStakedEth = (Number(BigInt(bondStakedWei)) / 1e18).toFixed(2);
  const bondLockedEth = (Number(BigInt(bondLockedWei)) / 1e18).toFixed(2);
  const bondSlashedEth = (Number(BigInt(bondSlashedWei)) / 1e18).toFixed(2);

  // Latest packet reading for active rate
  const latestPacket = allPackets[allPackets.length - 1];
  const activeCo2Rate = latestPacket?.values?.co2_mass_short_tons !== undefined
    ? Number(latestPacket.values.co2_mass_short_tons).toFixed(1)
    : "295.4";

  // Latest batch verdict and reason codes
  const latestVerdict = latestBatch?.status === "Quarantined" || latestBatch?.status === "Slashed"
    ? "fraud"
    : latestBatch?.status === "Verified"
    ? "clean"
    : "pending";

  const latestReasons = latestBatch?.reason_codes || latestBatch?.verdict_summary?.reason_codes || [];

  const batchColumns: Column<BatchSummary>[] = [
    {
      key: "batch_id",
      header: "Batch ID",
      sortable: true,
      render: (row) => <span className="font-mono font-bold">#{row.batch_id}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <Badge
          variant={
            row.status === "Verified"
              ? "verified"
              : row.status === "Quarantined" || row.status === "Slashed"
              ? "flagged"
              : "info"
          }
          label={row.status.toUpperCase()}
          size="sm"
        />
      ),
    },
    {
      key: "count",
      header: "Packets",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs">
          Seq {row.first_seq}–{row.last_seq} ({row.count})
        </span>
      ),
    },
    {
      key: "merkle_root",
      header: "Merkle Root",
      render: (row) => <HashChip hash={row.merkle_root} type="root" truncateLen={4} />,
    },
    {
      key: "mean_score_bp",
      header: "Score",
      sortable: true,
      render: (row) => (
        <span className="font-mono font-semibold">
          {row.mean_score_bp !== undefined ? `${row.mean_score_bp} bp` : "--"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Operator Telemetry View</h1>
          <p className="text-sm text-muted mt-1">
            Plant-edge sensor acquisition, ECDSA P-256 signing, SHA-256 hash chaining, and Merkle root anchoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="verified" label="GATEWAY ACTIVE" />
          <span className="text-xs font-mono text-muted">DEV-STEEL-001</span>
        </div>
      </div>

      {/* Bond Status & Metrics Row (Read directly from chain / state) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total Batches"
          value={batches.length}
          icon={Hash}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <StatTile
          label="Last Verdict Score"
          value={latestBatch?.mean_score_bp ?? 9820}
          unit="bp"
          variant={latestVerdict === "fraud" ? "flagged" : "verified"}
          icon={latestVerdict === "fraud" ? ShieldAlert : ShieldCheck}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <StatTile
          label="Active CO₂ Mass"
          value={activeCo2Rate}
          unit="short T/hr"
          icon={Flame}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <StatTile
          label="Operator Bond Staked"
          value={bondStakedEth}
          unit="ETH"
          variant={Number(bondSlashedEth) > 0 ? "flagged" : "default"}
          icon={Cpu}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
      </div>

      {/* Chain Bond Status Detailed Strip */}
      <div className="p-4 rounded-xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-info" />
          <div>
            <span className="font-semibold text-text">On-Chain BondVault Status:</span>
            <span className="text-muted ml-2">Operator stake protecting optimistic verification</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Available Stake:</span>
            <span className="font-bold text-text">{bondStakedEth} ETH</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Total Locked:</span>
            <span className="font-bold text-info">{bondLockedEth} ETH</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Total Slashed:</span>
            <span
              data-testid="operator-slashed-bond"
              className={`font-bold ${
                Number(bondSlashedEth) > 0 ? "text-flagged" : "text-muted"
              }`}
            >
              {bondSlashedEth} ETH
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-surface-raised border border-border text-[11px] text-muted">
            Pull-Payment Delay: 180s
          </span>
        </div>
      </div>

      {/* Adversarial Attack Injection Panel */}
      <AttackPanel
        currentAttack={state?.attack || "none"}
        onSelectAttack={setAttack}
        onRunBatch={runBatchScenario}
        isLoading={isLoading}
        error={error}
        onRetry={refresh}
      />

      {/* Live Telemetry Charts (Recharts) */}
      <TelemetryCharts
        packets={allPackets}
        isLoading={isLoading}
        isEmpty={allPackets.length === 0}
        error={error}
        onRetry={refresh}
      />

      {/* Two Column Grid: Hash Chain Strip + Merkle Tree & Trust Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Tamper-Evident Hash Chain Telemetry Strip */}
          <HashChainStrip
            packets={allPackets}
            isLoading={isLoading}
            isEmpty={allPackets.length === 0}
            error={error}
            onRetry={refresh}
          />

          {/* Batches Table */}
          <Card
            title="Anchored Batches History"
            subtitle="On-chain batch roots anchored to BatchAnchor contract"
            icon={Activity}
          >
            <DataTable
              columns={batchColumns}
              data={batches}
              keyField="batch_id"
              isLoading={isLoading}
              isEmpty={batches.length === 0}
              error={error}
              onRetry={refresh}
            />
          </Card>
        </div>

        <div className="space-y-6">
          {/* Latest Verdict Score TrustGauge */}
          <TrustGauge
            scoreBp={latestBatch?.mean_score_bp ?? 9820}
            thresholdBp={5000}
            verdict={latestVerdict}
            reasonCodes={latestReasons}
            title="Latest Batch Trust Score"
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />

          {/* Merkle Tree Inclusion Visualizer */}
          <MerkleTreeViz
            batchId={latestBatch?.batch_id ?? 1}
            rootHash={latestBatch?.merkle_root}
            txHash={latestBatch?.tx_hash || latestBatch?.anchor_tx_hash}
            packetsCount={latestBatch?.count ?? 8}
            totalExpected={8}
            batchStatus={latestBatch?.status ?? "Anchored"}
            isLoading={isLoading}
            error={error}
            onRetry={refresh}
          />
        </div>
      </div>
    </div>
  );
};
