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
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { Popover } from "../components/Popover";
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
import { deploymentConfig } from "../chain/deploymentConfig.ts";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export const GalleryPage: React.FC = () => {
  const { showToast } = useToast();
  const samplePackets = realRunSnapshot.batch_details?.["1"]?.packets?.slice(0, 4) || [];

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
    <div className="space-y-8 max-w-full overflow-x-hidden">
      {/* Header - Blush Band */}
      <section className="bg-band border border-hairline rounded-card p-6 sm:p-8 shadow-card transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand mb-1.5">
            <Component className="w-6 h-6" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              Design System Reference
            </span>
          </div>
          <Popover
            title="Design System Notes"
            bullets={[
              "Tokens follow Section 2 spec",
              "Light theme default with dark toggle",
              "Hairline borders and 24px cards",
              "All chips pair icon with text",
            ]}
          />
        </div>
        <h1 className="text-page-title font-heading font-bold tracking-tight text-ink">
          Component Library & Token Gallery
        </h1>
        <p className="text-body text-muted-strong mt-1.5 max-w-3xl">
          Showcase of design tokens, pill buttons, chips, and 14 base components in both light and dark systems.
        </p>
      </section>

      {/* 1. Design Tokens */}
      <section className="space-y-3">
        <h2 className="text-section-title font-heading font-bold text-ink flex items-center gap-2">
          <span>1. Design Tokens</span>
          <span className="text-xs font-normal text-muted-strong font-mono">(Section 2 CSS & Tailwind)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { name: "brand", hex: "#E5383B", bg: "bg-brand", text: "text-white" },
            { name: "brand-pressed", hex: "#BA1F22", bg: "bg-[#BA1F22]", text: "text-white" },
            { name: "brand-on-black", hex: "#FF6B6B", bg: "bg-[#0A0A0A]", text: "text-[#FF6B6B]" },
            { name: "canvas", hex: "#FFFFFF", bg: "bg-canvas", border: "border-hairline", text: "text-ink" },
            { name: "band (blush)", hex: "#FFF0F0", bg: "bg-band", border: "border-hairline", text: "text-ink" },
            { name: "surface-soft", hex: "#F2F4F5", bg: "bg-surface-soft", border: "border-hairline", text: "text-ink" },
            { name: "hairline", hex: "#E5E7EB", bg: "bg-hairline", text: "text-ink" },
            { name: "ink", hex: "#0A0A0A", bg: "bg-ink", text: "text-white dark:text-black" },
            { name: "muted", hex: "#86909C", bg: "bg-muted", text: "text-white" },
            { name: "muted-strong", hex: "#5B6573", bg: "bg-[#5B6573]", text: "text-white" },
            { name: "verified", hex: "#0E9F6E", bg: "bg-verified", text: "text-white" },
            { name: "warning", hex: "#D97706", bg: "bg-warning", text: "text-white" },
          ].map((token) => (
            <div
              key={token.name}
              className={`p-3.5 rounded-card border ${token.border || "border-transparent"} ${
                token.bg
              } ${token.text || "text-ink"} flex flex-col justify-between h-24 shadow-sm`}
            >
              <span className="font-semibold text-xs">{token.name}</span>
              <span className="font-mono text-[11px] opacity-90">{token.hex}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Badge & Chip & Button */}
      <section className="space-y-4">
        <h2 className="text-section-title font-heading font-bold text-ink">
          2. Badge & Chip & Pill Buttons
        </h2>
        <div className="space-y-3 p-5 bg-surface border border-hairline rounded-card shadow-card">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs font-semibold text-muted-strong uppercase">Chips:</span>
            <Chip variant="REAL" />
            <Chip variant="SYNTHETIC" />
            <Chip variant="ILLUSTRATIVE" />
            <Chip variant="MOCK" />
            <Chip variant="CLEAN" />
            <Chip variant="FRAUD" />
            <Badge variant="verified" label="VERIFIED" />
            <Badge variant="flagged" label="FLAGGED" />
            <Badge variant="warning" label="WARNING" />
            <Badge variant="info" label="INFO" />
          </div>
          <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-hairline">
            <span className="text-xs font-semibold text-muted-strong uppercase">Buttons:</span>
            <Button variant="black">Black Pill (Primary)</Button>
            <Button variant="red">Red Pill (Brand)</Button>
            <Button variant="ghost">Ghost Pill</Button>
            <Button variant="black" size="sm">Small Black</Button>
            <Button variant="red" size="sm">Small Red</Button>
          </div>
        </div>
      </section>

      {/* 3. HashChip */}
      <section className="space-y-3">
        <h2 className="text-section-title font-heading font-bold text-ink">
          3. HashChip (Copy + Explorer Link)
        </h2>
        <div className="flex flex-wrap gap-4 items-center p-5 bg-surface border border-hairline rounded-card shadow-card">
          <HashChip
            hash={deploymentConfig.contracts.BatchAnchor}
            type="root"
          />
          <HashChip
            hash={deploymentConfig.contracts.Attestation}
            type="address"
          />
          <HashChip
            hash={realRunSnapshot.tx_hashes?.[0]?.tx_hash || deploymentConfig.contracts.BondVault}
            type="tx"
          />
          <HashChip isLoading />
          <HashChip isEmpty />
          <HashChip error="Invalid byte length" />
        </div>
      </section>

      {/* 4. StatTile */}
      <section className="space-y-3">
        <h2 className="text-section-title font-heading font-bold text-ink">
          4. StatTile (Section 7.2)
        </h2>
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
        <h2 className="text-section-title font-heading font-bold text-ink">5. TrustGauge</h2>
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
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">6. HashChainStrip</h2>
        <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
          <HashChainStrip packets={samplePackets} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full min-w-0 overflow-hidden">
            <HashChainStrip isLoading />
            <HashChainStrip isEmpty />
          </div>
        </div>
      </section>

      {/* 7. MerkleTreeViz */}
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">7. MerkleTreeViz</h2>
        <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
          <MerkleTreeViz batchId={1} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full min-w-0 overflow-hidden">
            <MerkleTreeViz isLoading />
            <MerkleTreeViz isEmpty />
          </div>
        </div>
      </section>

      {/* 8. VoteCard */}
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">8. VoteCard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <VoteCard
            verifier={{
              verifier_id: "VERIFIER-01",
              address: deploymentConfig.verifiers?.[0] || deploymentConfig.contracts.VerifierQuorum,
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
              address: deploymentConfig.verifiers?.[1] || deploymentConfig.contracts.VerifierQuorum,
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
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">9. Countdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full min-w-0">
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
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">10. DataTable</h2>
        <div className="space-y-4 w-full min-w-0 overflow-x-auto">
          <DataTable
            columns={sampleColumns}
            data={sampleData}
            keyField="id"
          />
        </div>
      </section>

      {/* 11. Card */}
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">11. Card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full min-w-0">
          <Card title="Standard Card" subtitle="Ready for content" icon={Activity}>
            <p className="text-xs text-muted-strong">Standard content container.</p>
          </Card>
          <Card title="Loading Card" isLoading icon={Clock}>
            <p>Skeleton state</p>
          </Card>
          <Card title="Empty Card" isEmpty icon={AlertTriangle}>
            <p>Empty state</p>
          </Card>
          <Card
            title="Error Card"
            error="Contract execution reverted"
            onRetry={() => {}}
            icon={Sparkles}
          >
            <p>Error state</p>
          </Card>
        </div>
      </section>

      {/* 12. Toast System */}
      <section className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
        <h2 className="text-section-title font-heading font-bold text-ink">12. Toast System</h2>
        <div className="flex flex-wrap gap-3 p-4 bg-surface border border-hairline rounded-card shadow-card w-full min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => showToast("success", "Batch Verified", "Clean quorum reached.")}
          >
            Trigger Success Toast
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => showToast("error", "Fraud Quorum Reached", "Quarantined.")}
          >
            Trigger Error Toast
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => showToast("warning", "Dispute Expiring", "15 seconds.")}
          >
            Trigger Warning Toast
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => showToast("info", "Sync Complete", "Chain synchronized.")}
          >
            Trigger Info Toast
          </Button>
        </div>
      </section>

      {/* 13. Fallback Panels */}
      <section className="space-y-3">
        <h2 className="text-section-title font-heading font-bold text-ink">13. Standalone Fallback Panels</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmptyState
            title="Standalone Empty State"
            description="Clear placeholder with recovery action."
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

export default GalleryPage;
