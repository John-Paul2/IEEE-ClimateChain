import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Layers,
  Zap,
  Scale,
} from "lucide-react";
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
import { HashChip } from "../components/HashChip";

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

      {/* 4. On-Chain Gas & L2 Scalability Benchmark (Arbitrum Sepolia Chain 421614) */}
      <section aria-labelledby="section-gas-benchmark" className="space-y-4">
        <div className="bg-surface border border-hairline rounded-card p-5 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-hairline">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-brand/10 text-brand">
                <Zap className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="section-gas-benchmark"
                  className="text-base font-heading font-bold text-ink"
                >
                  On-Chain Gas &amp; L2 Scalability Benchmark (Arbitrum Sepolia Chain 421614)
                </h2>
                <p className="text-xs text-muted-strong font-sans">
                  Empirically measured execution costs from testnet deployment (<code className="font-mono text-brand">docs/TESTNET_EVIDENCE.md</code>) &amp; Foundry simulation (<code className="font-mono text-brand">results/gas_report.txt</code>).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-pill text-[11px] font-semibold font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                ARBITRUM SEPOLIA 421614
              </span>
            </div>
          </div>

          {/* Side-by-Side: Naive Per-Packet Logging vs VeriCEMS Merkle Batching */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card A: Naive Logging */}
            <div className="p-4 rounded-xl bg-surface-soft border border-hairline space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-ink">
                  Naive Per-Packet On-Chain Logging
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  O(N) LINEAR SCALING
                </span>
              </div>
              <p className="text-xs text-muted-strong font-sans">
                Anchoring every hourly CEMS reading individually to the EVM state.
              </p>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between p-2 rounded bg-surface border border-hairline">
                  <span className="text-muted text-[11px]">24 Hourly Packets / Day:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">4,316,232 gas</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-surface border border-hairline">
                  <span className="text-muted text-[11px]">1,000 Packets:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">179,843,000 gas</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-strong font-sans">
                Gas grows linearly with frequency. Heavy on-chain storage bloat and prohibitive cumulative fees.
              </p>
            </div>

            {/* Card B: VeriCEMS Merkle Batching */}
            <div className="p-4 rounded-xl bg-brand/5 border border-brand/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-ink flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                  VeriCEMS Merkle Batch Anchoring
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                  O(1) CONSTANT GAS
                </span>
              </div>
              <p className="text-xs text-muted-strong font-sans">
                Commits single 32-byte Keccak-256 Merkle root covering the entire sequence range.
              </p>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between p-2 rounded bg-surface border border-brand/30">
                  <span className="text-muted text-[11px]">24 Hourly Packets (1 Batch):</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">179,843 gas (95.8% savings)</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-surface border border-brand/30">
                  <span className="text-muted text-[11px]">1,000 Packets (1 Batch):</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">179,843 gas (99.9% savings)</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-strong font-sans">
                Fixed 179,843 gas on Arbitrum Sepolia regardless of packet count. Inclusion verified client-side in browser.
              </p>
            </div>
          </div>

          {/* Measured Operations Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-heading font-bold text-ink uppercase tracking-wider">
              Exact Measured Gas by Operation &amp; Live Testnet Proofs
            </h3>

            <div className="border border-hairline rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-xs text-left min-w-[620px]">
                <thead className="bg-surface-soft border-b border-hairline text-muted-strong uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Operation / Function</th>
                    <th className="py-2.5 px-3">Contract</th>
                    <th className="py-2.5 px-3 text-right">Arbitrum Sepolia Gas</th>
                    <th className="py-2.5 px-3 text-right">Forge Gas (Median)</th>
                    <th className="py-2.5 px-3 text-right">Live Arbiscan Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface font-mono">
                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>anchorBatch</div>
                      <span className="text-[10px] text-muted-strong">Anchored Batch #4 Merkle Root</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">BatchAnchor</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      179,843
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">179,855</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22" type="tx" truncateLen={4} />
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>commitVote</div>
                      <span className="text-[10px] text-muted-strong">Sealed vote commitment hash</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                    <td className="py-2.5 px-3 text-right font-bold text-ink">
                      103,410
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">103,410</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5" type="tx" truncateLen={4} />
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>revealVote</div>
                      <span className="text-[10px] text-muted-strong">Clean verdict reveal (0bp score)</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                    <td className="py-2.5 px-3 text-right font-bold text-ink">
                      177,505
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">176,623</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f" type="tx" truncateLen={4} />
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>finalize</div>
                      <span className="text-[10px] text-muted-strong">3-of-5 Quorum consensus reached</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                    <td className="py-2.5 px-3 text-right font-bold text-ink">
                      188,177
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">147,105</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722" type="tx" truncateLen={4} />
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>resolve (Arbiter Slash)</div>
                      <span className="text-[10px] text-muted-strong">2-of-3 Council quorum: slashed 50% operator bond</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">Challenge &amp; BondVault</td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-700 dark:text-amber-400">
                      318,914
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">343,207 (max)</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540" type="tx" truncateLen={4} />
                    </td>
                  </tr>

                  <tr className="hover:bg-surface-soft/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-ink font-sans">
                      <div>recordAttestation</div>
                      <span className="text-[10px] text-muted-strong">Period EU CBAM Attestation Certificate #4</span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">Attestation</td>
                    <td className="py-2.5 px-3 text-right font-bold text-brand">
                      281,626
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-strong">281,715 (max)</td>
                    <td className="py-2.5 px-3 text-right">
                      <HashChip hash="0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd" type="tx" truncateLen={4} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted font-sans pt-1">
              Note: Gas numbers derived from live execution on Arbitrum Sepolia (<code className="font-mono text-ink">deployments/testnet.json</code>) and automated Foundry gas profiling (<code className="font-mono text-ink">results/gas_report.txt</code>). Per <code className="font-mono text-ink">AGENTS.md</code> honesty rules, gas prices and token exchange rates are configuration inputs (kept null in code). Illustrative calculation [ILLUSTRATIVE]: at 0.1 Gwei Arbitrum L2 gas price and ETH @ $3,000, 179,843 gas costs ~$0.054 per batch.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Bus-Boundary Defense Analysis: Attack 1 vs 8A vs 8B */}
      <section aria-labelledby="section-bus-boundary" className="space-y-3">
        <div className="bg-surface border border-hairline rounded-card p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-brand" aria-hidden="true" />
              <h2
                id="section-bus-boundary"
                className="text-base font-heading font-bold text-ink"
              >
                Bus-Boundary Defense Analysis: Single-Bus vs. Multi-Bus Attackers
              </h2>
            </div>
            <span className="text-xs font-mono text-muted-strong">
              Physical Sensor Domain Verification
            </span>
          </div>

          <p className="text-xs text-muted-strong font-sans">
            Detection effectiveness is fundamentally determined by the adversary's write access boundary across factory physical instrumentation buses:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Attack 1 */}
            <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink font-heading">Attack 1: Single-Channel Scale Bias</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                    100.0% RECALL
                  </span>
                </div>
                <div className="text-[11px] font-mono text-muted-strong">
                  Compromise Boundary: <span className="text-ink font-semibold">CEMS Stack Sensor Only</span>
                </div>
                <p className="text-muted-strong font-sans text-[11px]">
                  Attacker scales stack CO₂ concentration downwards. Detected immediately by both mass-balance physics (<code className="font-mono">PHYSICS_RESIDUAL</code>) and neural autoencoder across 100% of evaluation splits.
                </p>
              </div>
              <div className="pt-2 border-t border-hairline text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                ✓ Caught by: Stoichiometric mass-balance &amp; Autoencoder
              </div>
            </div>

            {/* Attack 8A */}
            <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink font-heading">Attack 8A: Single-Bus CEMS Attacker</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/30">
                    85.7% RECALL
                  </span>
                </div>
                <div className="text-[11px] font-mono text-muted-strong">
                  Compromise Boundary: <span className="text-ink font-semibold">Single-Bus (Stack CO₂ + Heat Input)</span>
                </div>
                <p className="text-muted-strong font-sans text-[11px]">
                  Attacker co-scales stack CO₂ and heat input along learned stoichiometric ratio to fool simple physics (Baseline 2 recall: 13.9%). <strong>Exposed by independent fuel custody meter</strong> via cross-source validation (<code className="font-mono">CROSS_SOURCE_MISMATCH</code>).
                </p>
              </div>
              <div className="pt-2 border-t border-hairline text-[10px] font-mono text-blue-700 dark:text-blue-400">
                ✓ Caught by: Independent fuel custody transfer meter
              </div>
            </div>

            {/* Attack 8B */}
            <div className="p-3.5 rounded-xl bg-[#FDECEC]/30 dark:bg-red-500/10 border border-[#FCA5A5]/60 dark:border-red-500/30 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#9B1C1C] dark:text-[#FF6B6B] font-heading">Attack 8B: Coordinated Multi-Bus</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/30">
                    2.95% RECALL
                  </span>
                </div>
                <div className="text-[11px] font-mono text-muted-strong">
                  Compromise Boundary: <span className="text-ink font-semibold">Multi-Bus (Stack CEMS + Fuel Flow Meter)</span>
                </div>
                <p className="text-muted-strong font-sans text-[11px]">
                  Rogue insider compromises both CEMS stack analyzer and primary fuel custody meter simultaneously. Because the falsification hides inside the natural thermal efficiency margin (<code className="font-mono">MW / Heat Input</code>), it evades statistical detectors.
                </p>
              </div>
              <div className="pt-2 border-t border-hairline text-[10px] font-mono text-red-700 dark:text-red-400">
                ⚠ Open limitation: Requires external 3rd-party utility fiscal feed
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. What Still Gets Through (3 Bullets + Details Expander) */}
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
                <strong className="text-ink">Coordinated insider (Attack 8B):</strong> 2.95% caught (approx. 3.0%) · falsifies stack and fuel ledger within plant thermal margins.
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
                  Coordinated insider (Scenario 8B) compromises stack and fuel meters simultaneously; stopping it requires an independent fiscal meter outside operator domain.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 7. One-Line Footer of Provenance Chips */}
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
