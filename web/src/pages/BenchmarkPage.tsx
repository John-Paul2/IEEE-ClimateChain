import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Zap,
} from "lucide-react";
import {
  getBenchmarkSummary,
  type BenchmarkSummary,
} from "../lib/benchmarkData";
import { BenchmarkTable } from "../components/BenchmarkTable";
import { BenchmarkCharts } from "../components/BenchmarkCharts";
import { Popover } from "../components/Popover";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { HashChip } from "../components/HashChip";
import { PageHint } from "../components/GuideLayer";
import { useData } from "../data/DataContext";
import { useNavigate } from "react-router-dom";

export const BenchmarkPage: React.FC = () => {
  const { resetScenario } = useData();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const handleReplayStory = async () => {
    await resetScenario();
    navigate("/operator");
  };

  useEffect(() => {
    try {
      const s = getBenchmarkSummary();
      setSummary(s);
    } catch (err) {
      console.error("Error loading benchmark artifacts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
              Test results
            </h1>
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

        <PageHint
          what="How well the checker works on real EPA data, including what it misses."
          nextLabel="Replay the story"
          onNext={handleReplayStory}
        />
      </div>

      {/* 2. Three Summary Tiles on Top (Caught well / Partly caught / Missed) */}
      <section aria-label="Benchmark summary tiles" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-surface border border-hairline rounded-card space-y-1">
          <span className="text-[13px] text-muted-strong font-medium block">
            Caught well (≥90%)
          </span>
          <div className="text-4xl font-heading font-bold text-ink">
            8 <span className="text-xs font-normal text-muted-strong">of 14 attacks</span>
          </div>
          <p className="text-[11px] text-muted-strong">
            Instant detection for constant scaling, flatlines, and replayed packets.
          </p>
        </div>

        <div className="p-4 bg-surface border border-hairline rounded-card space-y-1">
          <span className="text-[13px] text-muted-strong font-medium block">
            Partly caught (50%–90%)
          </span>
          <div className="text-4xl font-heading font-bold text-ink">
            3 <span className="text-xs font-normal text-muted-strong">of 14 attacks</span>
          </div>
          <p className="text-[11px] text-muted-strong">
            Moderate drift and single-source spoofing caught via fuel ledger checks.
          </p>
        </div>

        <div className="p-4 bg-surface border border-hairline rounded-card space-y-1">
          <span className="text-[13px] text-[#9B1C1C] dark:text-[#FF6B6B] font-medium block">
            Missed (&lt;50%)
          </span>
          <div className="text-4xl font-heading font-bold text-[#9B1C1C] dark:text-[#FF6B6B]">
            3 <span className="text-xs font-normal text-muted-strong">of 14 attacks</span>
          </div>
          <p className="text-[11px] text-muted-strong">
            Subtle drift (0.1%/day) and multi-meter insider collusion stay within natural variance.
          </p>
        </div>
      </section>

      {/* 3. Attack Table */}
      <section aria-labelledby="section-attack-table" className="space-y-2">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-card" />
        ) : summary ? (
          <BenchmarkTable summary={summary} />
        ) : (
          <EmptyState
            title="Benchmark data missing"
            description="Summary results could not be loaded."
          />
        )}
      </section>

      {/* 4. ROC and Adaptive Attacker Charts */}
      <section aria-labelledby="section-curves" className="space-y-2">
        {loading ? (
          <Skeleton className="h-72 w-full rounded-card" />
        ) : summary ? (
          <BenchmarkCharts summary={summary} />
        ) : null}
      </section>

      {/* 5. What Still Gets Through: 3 short bullets + Details */}
      <section aria-labelledby="section-what-still-gets-through">
        <div className="bg-surface border border-hairline rounded-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-brand" aria-hidden="true" />
              <h2
                id="section-what-still-gets-through"
                className="text-base font-heading font-bold text-ink"
              >
                What still gets through
              </h2>
            </div>
            <span className="text-xs font-mono text-[#9B1C1C] dark:text-[#FF6B6B] font-semibold">
              3 attacks under 50%
            </span>
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline cursor-pointer"
            >
              <span>{showDetails ? "Hide details" : "Details"}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
            </button>
            {showDetails && (
              <div className="mt-3 p-3 bg-surface-soft rounded-lg border border-hairline space-y-1.5 text-xs text-muted-strong">
                <p>
                  Attacks inside natural boiler variance and validation tolerance evade statistical thresholds to prevent false alarms.
                </p>
                <p>
                  Coordinated insider compromises stack and fuel meters simultaneously; stopping it requires an independent fiscal meter outside the plant domain.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. On-Chain Measured Gas Panel */}
      <section aria-labelledby="section-gas-benchmark" className="space-y-3">
        <div className="bg-surface border border-hairline rounded-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand" aria-hidden="true" />
              <div>
                <h2
                  id="section-gas-benchmark"
                  className="text-base font-heading font-bold text-ink"
                >
                  On-chain gas benchmark
                </h2>
                <p className="text-xs text-muted-strong font-sans">
                  Measured execution gas on Arbitrum Sepolia.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-pill text-[11px] font-mono text-muted-strong bg-surface-soft border border-hairline">
              Arbitrum Sepolia
            </span>
          </div>

          {/* Measured Operations Table */}
          <div className="border border-hairline rounded-lg overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[500px]">
              <thead className="bg-surface-soft border-b border-hairline text-muted-strong text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Operation</th>
                  <th className="py-2.5 px-3">Contract</th>
                  <th className="py-2.5 px-3 text-right">Measured gas</th>
                  <th className="py-2.5 px-3 text-right">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface font-mono">
                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Register device</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">DeviceRegistry</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">238,041</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Deposit operator bond</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">BondVault</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">117,845</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Anchor batch (Merkle root)</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">BatchAnchor</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">179,843</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Commit vote</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">103,410</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Reveal vote</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">177,505</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Finalize quorum</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">VerifierQuorum</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">127,850</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Resolve and slash</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">Challenge</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-[#9B1C1C] dark:text-[#FF6B6B]">318,914</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540" type="tx" truncateLen={4} />
                  </td>
                </tr>

                <tr className="hover:bg-surface-soft/60 transition-colors">
                  <td className="py-2.5 px-3 text-ink font-sans">
                    <div>Record attestation</div>
                  </td>
                  <td className="py-2.5 px-3 text-muted">Attestation</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-ink">281,626</td>
                  <td className="py-2.5 px-3 text-right">
                    <HashChip hash="0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd" type="tx" truncateLen={4} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
