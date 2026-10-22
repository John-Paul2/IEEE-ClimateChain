import React, { useState } from "react";
import { Database, Cpu, AlertCircle, FileCode, Server } from "lucide-react";
import type { RunManifest } from "../lib/benchmarkData";
import { TELEMETRY_CHANNELS_PROVENANCE } from "../lib/benchmarkData";
import { Badge } from "./Badge";

interface DataProvenancePanelProps {
  manifest: RunManifest;
}

export const DataProvenancePanel: React.FC<DataProvenancePanelProps> = ({ manifest }) => {
  const [activeTab, setActiveTab] = useState<"channels" | "manifest" | "hashes">("channels");

  return (
    <div className="space-y-4">
      {/* Top Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Facilities</span>
          <span className="text-xl font-bold font-mono text-text">{manifest.n_facilities_total}</span>
          <span className="text-[10px] text-muted block mt-0.5">30 raw / 29 processed</span>
        </div>

        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Splits</span>
          <span className="text-xl font-bold font-mono text-verified">{manifest.n_splits}</span>
          <span className="text-[10px] text-muted block mt-0.5">GroupShuffleSplit</span>
        </div>

        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Base Seed</span>
          <span className="text-xl font-bold font-mono text-info">{manifest.base_seed}</span>
          <span className="text-[10px] text-muted block mt-0.5">Seeds 42..46</span>
        </div>

        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Git Commit</span>
          <span className="text-sm font-bold font-mono text-text truncate block mt-1" title={manifest.git_commit_hash}>
            {manifest.git_commit_hash}
          </span>
          <span className="text-[10px] text-muted block mt-0.5">run_manifest.json</span>
        </div>

        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Target FPR</span>
          <span className="text-xl font-bold font-mono text-warning">
            {(manifest.parameters.target_fpr * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-muted block mt-0.5">Validation bound</span>
        </div>

        <div className="bg-surface-raised p-3 rounded-xl border border-border">
          <span className="text-[11px] uppercase font-mono text-muted block">Runtime</span>
          <span className="text-xl font-bold font-mono text-text">
            {(manifest.runtime_seconds / 60).toFixed(1)}m
          </span>
          <span className="text-[10px] text-muted block mt-0.5">{manifest.runtime_seconds.toFixed(0)}s total</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-surface-raised p-1 rounded-xl border border-border w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("channels")}
          className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
            activeTab === "channels"
              ? "bg-surface text-text border border-border shadow-sm font-bold"
              : "text-muted hover:text-text"
          }`}
        >
          Real vs Synthetic Channels ({TELEMETRY_CHANNELS_PROVENANCE.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("manifest")}
          className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
            activeTab === "manifest"
              ? "bg-surface text-text border border-border shadow-sm font-bold"
              : "text-muted hover:text-text"
          }`}
        >
          Model & Hyperparameters
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("hashes")}
          className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all ${
            activeTab === "hashes"
              ? "bg-surface text-text border border-border shadow-sm font-bold"
              : "text-muted hover:text-text"
          }`}
        >
          Data & ONNX Hashes
        </button>
      </div>

      {/* Tab 1: Real vs Synthetic Channels */}
      {activeTab === "channels" && (
        <div className="space-y-4">
          {/* Circularity disclosure notice */}
          <div className="p-3.5 bg-surface-raised border border-border rounded-xl text-xs space-y-1.5 text-muted leading-relaxed">
            <div className="flex items-center gap-2 font-semibold text-text">
              <AlertCircle className="w-4 h-4 text-warning" aria-hidden="true" />
              <span>Part 75 CO₂ Circularity & The Need for Synthetic Channels</span>
            </div>
            <p>
              In primary US EPA CAMPD bulk files, stack O₂, flue temperature, and stack flow rate are absent from the hourly CSVs. Furthermore, Part 75 CO₂ Mass and Heat Input are mathematically co-derived (Pearson r ≥ 0.9998). To simulate realistic multi-sensor telemetry and break circularity, 4 channels are explicitly generated and labelled <strong className="text-warning">synthetic</strong>.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface-card shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-raised border-b border-border text-muted uppercase text-[11px] font-mono tracking-wider">
                  <th className="px-3.5 py-2.5 font-semibold">Channel</th>
                  <th className="px-3 py-2.5 font-semibold">Source</th>
                  <th className="px-3 py-2.5 font-semibold">Unit</th>
                  <th className="px-3 py-2.5 font-semibold">EPA CAMPD Field</th>
                  <th className="px-4 py-2.5 font-semibold">Provenance Rationale & Physical Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {TELEMETRY_CHANNELS_PROVENANCE.map((ch, idx) => (
                  <tr
                    key={ch.name}
                    className={`hover:bg-surface-raised/40 transition-colors ${
                      idx % 2 === 0 ? "bg-surface/20" : "bg-transparent"
                    }`}
                  >
                    <td className="px-3.5 py-2.5 font-bold text-text font-mono">
                      {ch.name}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={ch.source === "real" ? "verified" : "warning"}
                        label={ch.source === "real" ? "REAL" : "SYNTHETIC"}
                        className="text-[10px]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-muted">{ch.unit}</td>
                    <td className="px-3 py-2.5 text-text font-sans">
                      {ch.epaField || <span className="text-muted italic">None (synthetic)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted font-sans leading-relaxed text-xs">
                      {ch.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Model & Hyperparameters */}
      {activeTab === "manifest" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-surface-card border border-border rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-muted flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-info" aria-hidden="true" />
              <span>Autoencoder Hyperparameters</span>
            </h4>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Hidden Dimension:</span>
                <span className="text-text font-bold">{manifest.parameters.autoencoder_hidden_dim}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Latent Dimension:</span>
                <span className="text-text font-bold">{manifest.parameters.autoencoder_latent_dim}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Max Epochs:</span>
                <span className="text-text font-bold">{manifest.parameters.autoencoder_max_epochs}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Physics Penalty Weight:</span>
                <span className="text-text font-bold">{manifest.parameters.autoencoder_physics_penalty_weight}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Fuel Ledger Noise Std:</span>
                <span className="text-text font-bold">
                  {(manifest.parameters.fuel_ledger_synthetic_noise_std_fraction * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted">Rolling Window Hours:</span>
                <span className="text-text font-bold">{manifest.parameters.rolling_window_hours}h</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Series Hours / Unit:</span>
                <span className="text-text font-bold">{manifest.parameters.series_hours_per_unit}h</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface-card border border-border rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-muted flex items-center gap-1.5">
              <Server className="w-4 h-4 text-verified" aria-hidden="true" />
              <span>Pinned Runtime Environment</span>
            </h4>
            <div className="space-y-2 font-mono text-xs">
              {Object.entries(manifest.library_versions).map(([lib, ver]) => (
                <div key={lib} className="flex justify-between py-1 border-b border-border/40 last:border-none">
                  <span className="text-muted">{lib}:</span>
                  <span className="text-verified font-bold">{ver}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Data & ONNX Hashes */}
      {activeTab === "hashes" && (
        <div className="space-y-4">
          <div className="p-4 bg-surface-card border border-border rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-muted flex items-center gap-1.5">
              <Database className="w-4 h-4 text-info" aria-hidden="true" />
              <span>Input Data Preprocessing SHA256 Hashes</span>
            </h4>
            <div className="space-y-2 font-mono text-xs">
              {Object.entries(manifest.data_hashes).map(([dataset, hash]) => (
                <div key={dataset} className="p-2 bg-surface-sunken rounded border border-border space-y-1">
                  <span className="text-muted block text-[11px]">{dataset}</span>
                  <span className="text-text block text-[11px] break-all">{hash}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-surface-card border border-border rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-muted flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-verified" aria-hidden="true" />
              <span>ONNX Model Split Hashes (Deterministic CPU Inference)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
              {Object.entries(manifest.split_onnx_model_hashes).map(([splitName, hash]) => (
                <div key={splitName} className="p-2.5 bg-surface-sunken rounded border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-info font-bold">{splitName}</span>
                    <Badge variant="verified" label="ONNX CPU" className="text-[9px]" />
                  </div>
                  <span className="text-muted block text-[10px] break-all">{hash}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
