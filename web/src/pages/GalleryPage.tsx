import React from "react";
import {
  Component,
  Activity,
  ShieldCheck,
  Flame,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { Badge } from "../components/Badge";
import { HashChip } from "../components/HashChip";
import { TrustGauge } from "../components/TrustGauge";
import { HashChainStrip } from "../components/HashChainStrip";
import { MerkleTreeViz } from "../components/MerkleTreeViz";
import { VoteCard } from "../components/VoteCard";
import { Countdown } from "../components/Countdown";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { useToast } from "../components/Toast";
import { generateSyntheticPackets } from "../data/mockData";

export const GalleryPage: React.FC = () => {
  const { showToast } = useToast();
  const samplePackets = generateSyntheticPackets(0, 4);

  const sampleColumns: Column<{ id: number; name: string; score: number }>[] = [
    { key: "id", header: "ID", sortable: true },
    { key: "name", header: "Module", sortable: true },
    {
      key: "score",
      header: "Trust Score",
      sortable: true,
      render: (r) => <span className="font-mono text-verified">{r.score} bp</span>,
    },
  ];

  const sampleData = [
    { id: 1, name: "Gateway ECDSA Signer", score: 9980 },
    { id: 2, name: "Mass Balance Physics", score: 9850 },
    { id: 3, name: "PI-Autoencoder Latent", score: 9420 },
  ];

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2 text-info mb-1">
          <Component className="w-6 h-6" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider">
            Design System Reference
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-text">
          Component Library & Token Gallery
        </h1>
        <p className="text-sm text-muted mt-1">
          Exhibition of all 14 components across standard, loading, empty, and error states.
        </p>
      </div>

      {/* 1. Design Tokens */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <span>1. Design Tokens</span>
          <span className="text-xs font-normal text-muted">(Section 11.3 Theme Palette)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { name: "background", hex: "#0B1220", bg: "bg-[#0B1220]", border: "border-border" },
            { name: "surface", hex: "#111A2E", bg: "bg-[#111A2E]", border: "border-border" },
            { name: "border", hex: "#1F2A44", bg: "bg-[#1F2A44]", border: "border-border" },
            { name: "text", hex: "#E6EDF7", bg: "bg-[#E6EDF7]", text: "text-[#0B1220]" },
            { name: "muted", hex: "#8FA0BF", bg: "bg-[#8FA0BF]", text: "text-[#0B1220]" },
            { name: "verified", hex: "#2DD4BF", bg: "bg-verified", text: "text-[#0B1220]" },
            { name: "flagged", hex: "#F43F5E", bg: "bg-flagged", text: "text-white" },
            { name: "warning", hex: "#F59E0B", bg: "bg-warning", text: "text-[#0B1220]" },
            { name: "info", hex: "#60A5FA", bg: "bg-info", text: "text-[#0B1220]" },
          ].map((token) => (
            <div
              key={token.name}
              className={`p-3 rounded-lg border ${token.border || "border-transparent"} ${
                token.bg
              } ${token.text || "text-text"} flex flex-col justify-between h-20 shadow-sm`}
            >
              <span className="font-semibold text-xs capitalize">{token.name}</span>
              <span className="font-mono text-[11px] opacity-90">{token.hex}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Badges */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">2. Badge (Icon + Label, Never Colour Alone)</h2>
        <div className="flex flex-wrap gap-3 items-center p-4 bg-surface border border-border rounded-xl">
          <Badge variant="verified" label="VERIFIED" />
          <Badge variant="flagged" label="FLAGGED" />
          <Badge variant="warning" label="WARNING" />
          <Badge variant="info" label="INFO" />
          <Badge variant="muted" label="MUTED" />
          <Badge isLoading label="LOADING" />
          <Badge isEmpty label="" />
          <Badge error="Failed to verify" />
        </div>
      </section>

      {/* 3. HashChip */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">3. HashChip (Copy + Explorer Link)</h2>
        <div className="flex flex-wrap gap-4 items-center p-4 bg-surface border border-border rounded-xl">
          <HashChip
            hash="0x789a42f8c5b9671144177cd390de2ef830026e6d1c815ec6ba9d2424fa75d9e1"
            type="root"
          />
          <HashChip
            hash="0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
            type="address"
          />
          <HashChip
            hash="0x89ab12cd34ef567890abcdef1234567890abcdef1234567890abcdef12345678"
            type="tx"
          />
          <HashChip isLoading />
          <HashChip isEmpty />
          <HashChip error="Invalid byte length" />
        </div>
      </section>

      {/* 4. StatTiles */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">4. StatTile (Various States)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Verified Rate"
            value="98.2%"
            unit="bp"
            variant="verified"
            icon={ShieldCheck}
            delta={{ value: "+1.4%", isPositive: true }}
          />
          <StatTile
            label="Flagged Anomaly"
            value="21.5%"
            variant="flagged"
            icon={Flame}
            delta={{ value: "-76.7%", isPositive: false }}
          />
          <StatTile label="Loading State" value={0} isLoading />
          <StatTile label="Regulatory Benchmark" value={null} isEmpty />
        </div>
      </section>

      {/* 5. TrustGauge */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">5. TrustGauge (Motion with Purpose)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TrustGauge
            scoreBp={9820}
            thresholdBp={5000}
            verdict="clean"
            title="Clean Consensus"
          />
          <TrustGauge
            scoreBp={2150}
            thresholdBp={5000}
            verdict="fraud"
            title="Fraud Detected"
          />
          <TrustGauge title="Loading State" isLoading />
          <TrustGauge title="Empty State" isEmpty />
        </div>
      </section>

      {/* 6. HashChainStrip */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">6. HashChainStrip (Drawing Links)</h2>
        <div className="space-y-4">
          <HashChainStrip packets={samplePackets} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HashChainStrip isLoading />
            <HashChainStrip isEmpty />
          </div>
        </div>
      </section>

      {/* 7. MerkleTreeViz */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">7. MerkleTreeViz (React Flow Graph)</h2>
        <div className="space-y-4">
          <MerkleTreeViz batchId={1} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MerkleTreeViz isLoading />
            <MerkleTreeViz isEmpty />
          </div>
        </div>
      </section>

      {/* 8. VoteCard */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">8. VoteCard (Verifier Committee)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <VoteCard
            verifier={{
              verifier_id: "VERIFIER-01",
              address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
              mode: "honest",
              staked_amount_wei: "500000000000000000",
              is_active: true,
              last_verdict: "clean",
              last_score_bp: 9820,
            }}
          />
          <VoteCard
            verifier={{
              verifier_id: "VERIFIER-03",
              address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
              mode: "honest",
              staked_amount_wei: "500000000000000000",
              is_active: true,
              last_verdict: "fraud",
              last_score_bp: 2100,
            }}
          />
          <VoteCard isLoading />
          <VoteCard isEmpty />
        </div>
      </section>

      {/* 9. Countdown */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">9. Countdown (Challenge Window Timer)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Countdown
            expiresAtEpoch={Math.floor(Date.now() / 1000) + 75}
            totalDurationSeconds={120}
            title="Active 120s Window"
          />
          <Countdown
            expiresAtEpoch={Math.floor(Date.now() / 1000) - 10}
            totalDurationSeconds={120}
            title="Expired Window"
          />
          <Countdown isLoading />
          <Countdown isEmpty />
        </div>
      </section>

      {/* 10. DataTable */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">10. DataTable (Accessible & Sortable)</h2>
        <div className="space-y-4">
          <DataTable
            columns={sampleColumns}
            data={sampleData}
            keyField="id"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DataTable
              columns={sampleColumns}
              data={[]}
              keyField="id"
              isLoading
            />
            <DataTable
              columns={sampleColumns}
              data={[]}
              keyField="id"
              isEmpty
            />
          </div>
        </div>
      </section>

      {/* 11. Cards (All states) */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">11. Card (Container States)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card title="Standard Card" subtitle="Ready for content" icon={Activity}>
            <p className="text-xs text-muted">Normal interactive content panel.</p>
          </Card>
          <Card title="Loading Card" isLoading icon={Clock}>
            <p>Will be hidden by skeleton</p>
          </Card>
          <Card title="Empty Card" isEmpty icon={AlertTriangle}>
            <p>Hidden</p>
          </Card>
          <Card
            title="Error Card"
            error="Contract execution reverted"
            onRetry={() => {}}
            icon={Sparkles}
          >
            <p>Hidden</p>
          </Card>
        </div>
      </section>

      {/* 12. Toast Interactive Triggers */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">12. Toast System (Live Triggers)</h2>
        <div className="flex flex-wrap gap-3 p-4 bg-surface border border-border rounded-xl">
          <button
            type="button"
            onClick={() => showToast("success", "Batch Verified", "3-of-5 clean quorum achieved.")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-verified/10 text-verified border border-verified/30 hover:bg-verified/20"
          >
            Trigger Success Toast
          </button>
          <button
            type="button"
            onClick={() => showToast("error", "Fraud Quorum Reached", "Batch quarantined; challenge window opened.")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-flagged/10 text-flagged border border-flagged/30 hover:bg-flagged/20"
          >
            Trigger Error Toast
          </button>
          <button
            type="button"
            onClick={() => showToast("warning", "Dispute Window Expiring", "15 seconds remaining.")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20"
          >
            Trigger Warning Toast
          </button>
          <button
            type="button"
            onClick={() => showToast("info", "Sync Complete", "Blockchain block 421614 fetched.")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-info/10 text-info border border-info/30 hover:bg-info/20"
          >
            Trigger Info Toast
          </button>
        </div>
      </section>

      {/* 13. Skeleton, EmptyState & ErrorState standalone */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-text">13. Standalone Fallback Panels</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmptyState
            title="Standalone Empty State"
            description="Clear visual placeholder with optional recovery button."
            action={{ label: "Initialize Gateway", onClick: () => {} }}
          />
          <ErrorState
            title="Standalone Error State"
            message="EVM RPC provider returned code -32000."
            error="Resource temporarily unavailable"
            onRetry={() => {}}
          />
        </div>
      </section>
    </div>
  );
};
