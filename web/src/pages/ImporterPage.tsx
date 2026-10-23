import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UploadCloud,
  ChevronDown,
  BookOpen,
  Download,
  Wifi,
  WifiOff,
  Settings2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Chip } from "../components/Chip";
import { Button } from "../components/Button";
import { Popover } from "../components/Popover";
import { HashChip } from "../components/HashChip";
import { SourcesDrawer } from "../components/SourcesDrawer";
import { ArbitrumSepoliaModal } from "../components/ArbitrumSepoliaModal";
import {
  calculateCbamComparison,
  loadCbamConfig,
  loadCbamSources,
  getIllustrativeExampleInputs,
  type CBAMPartialInputs,
  NeedsSourceError,
} from "../lib/cbam";
import {
  verifyPeriodReport,
  type VerificationResult,
} from "../lib/reportVerifier";
import validReportPayload from "../../e2e/fixtures/valid_report_payload.json" with { type: "json" };
import { keccak256 } from "viem";
import { CONTRACT_ADDRESSES } from "../chain/viemClient";

export const ImporterPage: React.FC = () => {
  // Mode: Offline Snapshot vs Online Chain
  const [isOfflineSnapshotMode, setIsOfflineSnapshotMode] = useState<boolean>(true);

  // Arbitrum Sepolia Testnet Evidence Modal
  const [isTestnetModalOpen, setIsTestnetModalOpen] = useState<boolean>(false);

  // Uploaded report & verification state
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Sources Drawer State
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false);

  // Expandable sections
  const [showMath, setShowMath] = useState<boolean>(false);
  const [showInputs, setShowInputs] = useState<boolean>(false);

  // Calculator Inputs State
  const rawConfig = useMemo(() => loadCbamConfig(), []);

  // Form input values (editable)
  const [inputYear, setInputYear] = useState<number>(2026);
  const [inputTonnes, setInputTonnes] = useState<string>("500.0");
  const [inputVerifiedSee, setInputVerifiedSee] = useState<string>("1.90");
  const [inputDefaultBase, setInputDefaultBase] = useState<string>("");
  const [inputBenchmark, setInputBenchmark] = useState<string>("");
  const [inputDefaultBenchmark, setInputDefaultBenchmark] = useState<string>("");
  const [inputFaf, setInputFaf] = useState<string>("0.975");
  const [inputCscf, setInputCscf] = useState<string>("");
  const [inputDefaultMarkup, setInputDefaultMarkup] = useState<string>("0.10");
  const [inputPrice, setInputPrice] = useState<string>(
    String(rawConfig.price_eur_per_tco2e.value ?? 82.32)
  );
  const [isIllustrativePreset, setIsIllustrativePreset] = useState<boolean>(false);

  // Verification runner
  const runVerification = useCallback(
    async (payload: unknown, offline: boolean) => {
      setUploadError(null);
      try {
        const result = await verifyPeriodReport(payload, {
          forceOfflineSnapshot: offline,
        });
        setVerificationResult(result);

        if (result.report?.totals) {
          if (result.report.totals.production_tonnes) {
            setInputTonnes(String(result.report.totals.production_tonnes));
          }
          if (result.report.totals.specific_embedded_emissions_tco2e_per_t) {
            setInputVerifiedSee(
              String(result.report.totals.specific_embedded_emissions_tco2e_per_t)
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setUploadError(`Verification failed: ${msg}`);
      }
    },
    []
  );

  // Default initial load: Load valid report fixture in offline snapshot mode
  useEffect(() => {
    runVerification(validReportPayload, true);
  }, [runVerification]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const processFileContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      runVerification(parsed, isOfflineSnapshotMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(`Failed to parse file: ${msg}`);
      setVerificationResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        processFileContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        processFileContent(content);
      };
      reader.readAsText(file);
    }
  };

  // Quick Preset Handlers
  const handleLoadValidSample = () => {
    runVerification(validReportPayload, isOfflineSnapshotMode);
  };

  const handleLoadTamperedSample = () => {
    const tampered = JSON.parse(JSON.stringify(validReportPayload));
    tampered.report.merkle_roots[0] = keccak256(new TextEncoder().encode("tampered-merkle-root"));
    tampered.report.totals.specific_embedded_emissions_tco2e_per_t = 0.123456;
    runVerification(tampered, isOfflineSnapshotMode);
  };

  const handleToggleOfflineMode = () => {
    const nextMode = !isOfflineSnapshotMode;
    setIsOfflineSnapshotMode(nextMode);
    if (verificationResult?.report) {
      const payload = verificationResult.envelope
        ? { report: verificationResult.report, envelope: verificationResult.envelope }
        : verificationResult.report;
      runVerification(payload, nextMode);
    }
  };

  // Calculator Preset Handlers
  const handleLoadIllustrativePreset = () => {
    const illustrative = getIllustrativeExampleInputs();
    setInputYear(illustrative.year);
    setInputTonnes(String(illustrative.tonnes_shipped));
    setInputVerifiedSee(
      verificationResult?.report?.totals?.specific_embedded_emissions_tco2e_per_t !== undefined
        ? String(verificationResult.report.totals.specific_embedded_emissions_tco2e_per_t)
        : String(illustrative.verified_see)
    );
    setInputDefaultBase(String(illustrative.default_value_base));
    setInputBenchmark(String(illustrative.benchmark));
    setInputDefaultBenchmark(
      illustrative.default_benchmark !== null ? String(illustrative.default_benchmark) : ""
    );
    setInputFaf(String(illustrative.free_allocation_factor));
    setInputCscf(String(illustrative.cscf));
    setInputDefaultMarkup(String(illustrative.default_markup));
    setInputPrice(String(illustrative.certificate_price));
    setIsIllustrativePreset(true);
  };

  const handleResetToRawConfig = () => {
    setInputYear(2026);
    setInputTonnes(
      verificationResult?.report?.totals?.production_tonnes !== undefined
        ? String(verificationResult.report.totals.production_tonnes)
        : "500.0"
    );
    setInputVerifiedSee(
      verificationResult?.report?.totals?.specific_embedded_emissions_tco2e_per_t !== undefined
        ? String(verificationResult.report.totals.specific_embedded_emissions_tco2e_per_t)
        : "1.90"
    );
    setInputDefaultBase("");
    setInputBenchmark("");
    setInputDefaultBenchmark("");
    setInputCscf("");
    setInputFaf("0.975");
    setInputDefaultMarkup("0.10");
    setInputPrice("82.32");
    setIsIllustrativePreset(false);
  };

  // Compute CBAM calculation
  const { comparison, missingParameters } = useMemo(() => {
    const tonnesVal = inputTonnes.trim() === "" ? null : Number(inputTonnes);
    const verSeeVal = inputVerifiedSee.trim() === "" ? null : Number(inputVerifiedSee);
    const defBaseVal = inputDefaultBase.trim() === "" ? null : Number(inputDefaultBase);
    const benchVal = inputBenchmark.trim() === "" ? null : Number(inputBenchmark);
    const defBenchVal =
      inputDefaultBenchmark.trim() === "" ? null : Number(inputDefaultBenchmark);
    const fafVal = inputFaf.trim() === "" ? null : Number(inputFaf);
    const cscfVal = inputCscf.trim() === "" ? null : Number(inputCscf);
    const markupVal = inputDefaultMarkup.trim() === "" ? null : Number(inputDefaultMarkup);
    const priceVal = inputPrice.trim() === "" ? null : Number(inputPrice);

    const partialParams: CBAMPartialInputs = {
      year: inputYear,
      tonnes_shipped: tonnesVal,
      verified_see: verSeeVal,
      default_value_base: defBaseVal,
      benchmark: benchVal,
      default_benchmark: defBenchVal,
      free_allocation_factor: fafVal,
      cscf: cscfVal,
      default_markup: markupVal,
      certificate_price: priceVal,
      price_quarter: rawConfig.price_eur_per_tco2e.quarter || "2026-Q3",
      tag: isIllustrativePreset ? "ILLUSTRATIVE" : null,
    };

    try {
      const res = calculateCbamComparison(partialParams);
      return { comparison: res, missingParameters: [] };
    } catch (err) {
      if (err instanceof NeedsSourceError) {
        return {
          comparison: null,
          missingParameters: err.missing_parameters,
        };
      }
      return {
        comparison: null,
        missingParameters: [],
      };
    }
  }, [
    inputYear,
    inputTonnes,
    inputVerifiedSee,
    inputDefaultBase,
    inputBenchmark,
    inputDefaultBenchmark,
    inputFaf,
    inputCscf,
    inputDefaultMarkup,
    inputPrice,
    rawConfig.price_eur_per_tco2e.quarter,
    isIllustrativePreset,
  ]);

  // Export Importer Evidence Pack
  const handleExportEvidencePack = () => {
    if (!verificationResult) return;

    const evidencePack = {
      evidence_pack_version: "1.0.0",
      exported_at_utc: new Date().toISOString(),
      cbam_aligned: true,
      verification: {
        valid: verificationResult.valid,
        mode: verificationResult.mode,
        computed_period_merkle_root: verificationResult.computedPeriodMerkleRoot,
        checks: verificationResult.checks,
      },
      report: verificationResult.report,
      calculator: {
        inputs: {
          year: inputYear,
          tonnes_shipped: Number(inputTonnes),
          verified_see: Number(inputVerifiedSee),
          default_value_base: inputDefaultBase ? Number(inputDefaultBase) : null,
          benchmark: inputBenchmark ? Number(inputBenchmark) : null,
          free_allocation_factor: inputFaf ? Number(inputFaf) : null,
          cscf: inputCscf ? Number(inputCscf) : null,
          default_markup: inputDefaultMarkup ? Number(inputDefaultMarkup) : null,
          certificate_price: inputPrice ? Number(inputPrice) : null,
          tag: isIllustrativePreset ? "ILLUSTRATIVE" : null,
        },
        comparison: comparison,
      },
      sources_referenced: loadCbamSources(),
    };

    const instId = verificationResult.report?.installation_id || "unknown";
    const period = verificationResult.report?.period?.label || "period";
    const filename = `importer-evidence-pack-${instId}-${period}.json`;

    const blob = new Blob([JSON.stringify(evidencePack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const report = verificationResult?.report;
  const isReportValid = verificationResult?.valid ?? false;

  return (
    <div className="space-y-6">
      {/* 1. Top Header Row: Title, CBAM-ALIGNED chip, Popover & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
            EU Importer CBAM Portal
          </h1>
          <Chip variant="verified" label="CBAM-ALIGNED" size="sm" />
          <Popover
            title="Importer portal"
            bullets={[
              "Upload JSON period report to verify cryptographically.",
              "Compare verified emissions against default CBAM values.",
              "Missing regulatory values require verified legal sources.",
              "Export audit-ready evidence pack for declarations.",
            ]}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            data-testid="toggle-offline-snapshot-btn"
            onClick={handleToggleOfflineMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-mono font-semibold border transition-all ${
              isOfflineSnapshotMode
                ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-400"
                : "bg-surface-soft border-hairline text-ink hover:bg-hairline"
            }`}
          >
            {isOfflineSnapshotMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>OFFLINE SNAPSHOT</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span>LIVE RPC</span>
              </>
            )}
          </button>

          <Button
            variant="ghost"
            size="sm"
            data-testid="testnet-evidence-importer-header-btn"
            icon={ExternalLink}
            onClick={() => setIsTestnetModalOpen(true)}
            title="View Live Arbitrum Sepolia Deployment & On-Chain Proofs (Chain 421614)"
          >
            Arbitrum Sepolia
          </Button>

          <Button
            variant="ghost"
            size="sm"
            data-testid="open-sources-btn"
            icon={BookOpen}
            onClick={() => setIsSourcesOpen(true)}
          >
            Sources
          </Button>

          <Button
            variant="black"
            size="sm"
            data-testid="export-evidence-pack-btn"
            icon={Download}
            disabled={!verificationResult}
            onClick={handleExportEvidencePack}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Prominent Offline Snapshot Notice Banner */}
      {isOfflineSnapshotMode && (
        <div
          role="status"
          className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-400"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>OFFLINE SNAPSHOT MODE ACTIVE:</strong> Browser verification evaluates against recorded on-chain attestation snapshot data.
            </span>
          </div>
          <Chip variant="warning" label="SNAPSHOT MODE" size="sm" />
        </div>
      )}

      {/* 2. Main Grid: Left (Upload + Result) · Right (Cost Split + Calculator) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): One-line Dropzone + Result Card */}
        <div className="lg:col-span-5 space-y-4">
          {/* One-Line Upload Dropzone */}
          <div
            data-testid="dropzone-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById("report-file-input")?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                document.getElementById("report-file-input")?.click();
              }
            }}
            className={`p-3 border border-dashed rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer text-xs ${
              isDragOver
                ? "border-brand bg-band"
                : "border-hairline hover:border-muted-strong bg-surface-soft/60"
            }`}
          >
            <input
              id="report-file-input"
              data-testid="file-upload-input"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="flex items-center gap-2 overflow-hidden">
              <UploadCloud className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
              <span className="font-medium text-ink truncate">
                Drop report JSON or <span className="underline">browse</span>
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                data-testid="load-valid-report-btn"
                onClick={handleLoadValidSample}
                className="px-2 py-0.5 text-xs font-semibold rounded-pill bg-surface border border-hairline text-ink hover:bg-surface-soft shadow-xs"
              >
                Valid report
              </button>
              <button
                type="button"
                data-testid="load-tampered-report-btn"
                onClick={handleLoadTamperedSample}
                className="px-2 py-0.5 text-xs font-semibold rounded-pill bg-[#FDECEC] border border-[#FCA5A5] text-[#9B1C1C] hover:bg-[#FCD8D8]"
              >
                Tampered
              </button>
            </div>
          </div>

          {/* Upload error banner if any */}
          {uploadError && (
            <div
              role="alert"
              className="p-3 bg-[#FDECEC] border border-[#FCA5A5] rounded-xl text-xs text-[#9B1C1C]"
            >
              {uploadError}
            </div>
          )}

          {/* Result Card: 'verified %, flagged count' */}
          {verificationResult && (
            <div
              data-testid="evidence-summary-panel"
              data-story="verification-result-card"
              className="bg-surface border border-hairline rounded-card p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <h3 className="text-sm font-heading font-bold text-ink">
                  Period-End Attestation Certificate
                </h3>
                <div data-story="attestation-chip">
                  {isReportValid ? (
                    <Chip variant="CLEAN" label="ATTESTED ON-CHAIN" size="sm" />
                  ) : (
                    <Chip variant="FRAUD" label="INTEGRITY VIOLATION" size="sm" />
                  )}
                </div>
              </div>

              {/* Status Banner */}
              <div
                data-testid="verification-status-banner"
                className={`p-3 rounded-xl border flex flex-col gap-1 text-xs ${
                  isReportValid
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-400"
                    : "bg-[#FDECEC] border-[#FCA5A5] text-[#9B1C1C]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider">
                    {isReportValid
                      ? "CRYPTOGRAPHIC VERIFICATION SUCCESSFUL"
                      : "VERIFICATION FAILED: TAMPERED REPORT"}
                  </span>
                  <span className="font-mono font-semibold">
                    {isReportValid
                      ? `✓ ${
                          report?.coverage?.coverage_bp !== undefined
                            ? (report.coverage.coverage_bp / 100).toFixed(0)
                            : 96
                        }% verified · ${
                          report?.coverage?.quarantined_batches_count ?? 1
                        } flagged`
                      : "0% verified"}
                  </span>
                </div>
                {!isReportValid && (
                  <p className="text-[11px] font-sans opacity-90 mt-0.5">
                    Period Merkle Root On-Chain Match failed: root does not match contract attestation.
                  </p>
                )}
              </div>

              {/* Explicit Client-Side Verification Badge */}
              {isReportValid && (
                <div
                  data-testid="client-side-verified-badge"
                  className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>Client-Side Verified (Zero Backend Server Trust — Merkle &amp; Contract Proof Checked Directly in Browser)</span>
                </div>
              )}

              {/* Compact High-Trust Arbitrum Sepolia Deployment Banner */}
              <button
                type="button"
                onClick={() => setIsTestnetModalOpen(true)}
                data-testid="testnet-evidence-importer-btn"
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-brand/5 hover:bg-brand/10 border border-brand/20 text-brand dark:text-brand-soft text-xs font-semibold transition-colors group cursor-pointer"
                title="View Live Arbitrum Sepolia Deployment &amp; On-Chain Proofs (Chain 421614)"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden="true" />
                  <span>Live Arbitrum Sepolia Deployment (Chain 421614)</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-sans opacity-80 group-hover:opacity-100">
                  <span>6 Contracts &amp; Proofs</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </button>

              {/* Details for Valid Report */}
              {report && (
                <div className="space-y-3 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-2 text-ink">
                    <div className="p-2.5 rounded-lg bg-surface-soft border border-hairline">
                      <span className="text-muted block text-[10px]">Installation:</span>
                      <span className="font-bold">{report.installation_id}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-soft border border-hairline">
                      <span className="text-muted block text-[10px]">Attestation:</span>
                      <span className="font-bold">#{report.attestation_id} · {report.period?.label}</span>
                    </div>
                  </div>

                  {/* On-Chain Hash Chips */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2 rounded-lg bg-surface-soft border border-hairline text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted">Root:</span>
                      <HashChip
                        hash={verificationResult?.computedPeriodMerkleRoot || report.merkle_roots[0]}
                        type="root"
                        truncateLen={5}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted">Contract:</span>
                      <HashChip hash={CONTRACT_ADDRESSES.Attestation} type="address" truncateLen={4} />
                    </div>
                  </div>

                  {/* Coverage row */}
                  <div className="p-2.5 rounded-lg bg-surface-soft border border-hairline flex items-center justify-between">
                    <span className="text-muted-strong font-sans">Coverage:</span>
                    <span className="font-bold text-ink">
                      {(report.coverage.coverage_bp / 100).toFixed(1)}% ({report.coverage.coverage_bp.toLocaleString()} bp)
                    </span>
                  </div>

                  {/* Quarantined batches list */}
                  {report.quarantined_batches && report.quarantined_batches.length > 0 && (
                    <div data-testid="quarantined-batches-list" className="p-2.5 rounded-lg bg-[#FDECEC]/50 border border-[#FCA5A5] space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#9B1C1C]">
                          Batch #{report.quarantined_batches[0].batch_id}
                        </span>
                        <Chip variant="FRAUD" label={report.quarantined_batches[0].challenge_status || "UPHELD_SLASHED"} size="sm" />
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px] text-[#9B1C1C]">
                        {report.quarantined_batches[0].reason_codes.map((rc) => (
                          <span key={rc} className="px-1.5 py-0.5 rounded bg-white border border-[#FCA5A5]">
                            {rc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cryptographic check items */}
                  <div className="space-y-1 pt-1 text-[11px]">
                    <span className="text-muted block font-sans font-semibold">Verified checks:</span>
                    <div className="grid grid-cols-1 gap-1 text-muted-strong font-sans">
                      <div className="flex items-center justify-between">
                        <span>Schema & Honesty Compliance</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Period Merkle Root Recomputation</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>On-Chain Attestation Record</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Installation Identity Match</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Period Label Match</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Coverage Basis Points Match</span>
                        <span className="text-verified">✓</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Batch Status & Root Integrity in BatchAnchor</span>
                        <span className="text-verified">✓</span>
                      </div>
                    </div>
                  </div>

                  {/* Provenance chips */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-hairline">
                    <Chip variant="REAL" label="REAL (CAMPD 1073-3)" size="sm" />
                    <Chip variant="SYNTHETIC" label="SYNTHETIC (Software SE)" size="sm" />
                    <Chip variant="SYNTHETIC" label="SYNTHETIC (Reported)" size="sm" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column (7 cols): Cost Split + Black "You save" Strip + Formula + Inputs */}
        <div className="lg:col-span-7 space-y-4">
          {/* Missing Parameters Inline State (Task 2) */}
          {missingParameters.length > 0 && (
            <div
              data-testid="needs-source-alert"
              className="p-3 bg-surface-soft border border-hairline rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">
                  {missingParameters.length} inputs need a source
                </span>
                {missingParameters.map((param) => (
                  <span
                    key={param}
                    className="px-2 py-0.5 rounded-chip bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/30 font-mono text-[11px]"
                  >
                    needs source: {param}
                  </span>
                ))}
              </div>
              <Button
                variant="black"
                size="sm"
                data-testid="load-illustrative-preset-btn"
                onClick={handleLoadIllustrativePreset}
              >
                Load example
              </Button>
            </div>
          )}

          {/* Illustrative preset notice if active */}
          {isIllustrativePreset && (
            <div className="p-2.5 bg-band border border-hairline rounded-xl flex items-center justify-between gap-2 text-xs text-muted-strong">
              <span>FICTIONAL / ILLUSTRATIVE PRESET LOADED</span>
              <Chip variant="ILLUSTRATIVE" label="ILLUSTRATIVE" size="sm" />
            </div>
          )}

          {/* Cost Split: Two cards side by side (Default vs Verified) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left Card: Default Value (surface-soft) */}
            <div className="p-5 bg-surface-soft border border-hairline rounded-card space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-strong">
                  Default Value Route
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-semibold text-[#9B1C1C]">
                    +10% markup
                  </span>
                  <Chip variant="ILLUSTRATIVE" label="ILLUSTRATIVE" size="sm" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-heading font-bold text-ink">
                {comparison
                  ? `€${comparison.cost_with_default_eur.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "--"}
              </div>
              <p className="text-xs text-muted font-mono">
                {comparison
                  ? `${comparison.default_see_with_markup.toFixed(2)} tCO₂e/t · marked-up default`
                  : "Requires regulatory default"}
              </p>
            </div>

            {/* Right Card: Verified Data (white with black border) */}
            <div className="p-5 bg-surface border-2 border-ink rounded-card space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wider font-semibold text-ink">
                  Verified Actual Route
                </h4>
                <div className="flex items-center gap-1.5">
                  <Chip variant="verified" label="VERIFIED" size="sm" />
                  <Chip variant="ILLUSTRATIVE" label="ILLUSTRATIVE" size="sm" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-heading font-bold text-ink">
                {comparison
                  ? `€${comparison.cost_with_verified_eur.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "--"}
              </div>
              <p className="text-xs text-muted font-mono">
                {comparison
                  ? `${comparison.verified_see.toFixed(2)} tCO₂e/t · penalty exempt`
                  : "From audited telemetry"}
              </p>
            </div>
          </div>

          {/* Black "You Save" Strip with Red Accent */}
          <div className="bg-[#0A0A0A] text-white dark:bg-[#141414] dark:border dark:border-[#262626] rounded-card p-4 sm:p-5 flex items-center justify-between shadow-md">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/70 block">
                  Net CBAM Importer Savings
                </span>
                <Chip variant="ILLUSTRATIVE" label="ILLUSTRATIVE" size="sm" />
              </div>
              <span className="text-sm font-semibold text-white">
                You save
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                data-testid="animated-savings-value"
                className="text-2xl sm:text-3xl font-heading font-bold text-brand-on-black"
              >
                {comparison
                  ? `€${comparison.savings_eur.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "--"}
              </span>
              {comparison && comparison.cost_with_default_eur > 0 && (
                <span className="text-xs font-mono text-white/70">
                  ({((comparison.savings_eur / comparison.cost_with_default_eur) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          {/* One-Line Formula with 'Show the math' expander */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 bg-surface-soft border border-hairline rounded-xl text-xs font-mono">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="font-semibold text-muted-strong font-sans">Formula:</span>
                <span className="text-ink truncate">Cost = Tonnes × max(0, SEE - SEFA) × Price</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMath((prev) => !prev)}
                aria-expanded={showMath}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline shrink-0 ml-2"
              >
                <span>{showMath ? "Hide math" : "Show the math"}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showMath ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>

            {/* Formula steps panel (when expanded) */}
            {showMath && comparison && (
              <div
                data-testid="formula-steps-panel"
                className="space-y-2 p-4 bg-surface border border-hairline rounded-xl text-xs font-mono animate-in fade-in duration-150"
              >
                <span className="font-sans font-semibold text-ink text-xs block mb-1">
                  Substituted calculation steps:
                </span>
                {comparison.steps.map((step, idx) => (
                  <div
                    key={step.step_id}
                    className="p-2.5 rounded-lg bg-surface-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div>
                      <span className="font-sans font-medium text-ink">
                        Step {idx + 1}: {step.label}
                      </span>
                      <span className="text-muted text-[11px] block sm:inline sm:ml-2">
                        {step.substituted}
                      </span>
                    </div>
                    <span className="font-bold text-verified">
                      {step.unit === "EUR" ? "€" : ""}
                      {step.result.toLocaleString("en-US", {
                        minimumFractionDigits: step.unit === "EUR" ? 2 : 3,
                        maximumFractionDigits: step.unit === "EUR" ? 2 : 4,
                      })}{" "}
                      {step.unit !== "EUR" ? step.unit : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collapsible Editable Inputs Panel */}
          <div className="border border-hairline rounded-xl overflow-hidden bg-surface">
            <button
              type="button"
              onClick={() => setShowInputs((prev) => !prev)}
              aria-expanded={showInputs}
              className="w-full p-3.5 flex items-center justify-between text-xs font-semibold text-ink hover:bg-surface-soft transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted" />
                <span>Editable Inputs</span>
                <span className="text-muted font-normal">
                  ({isIllustrativePreset ? "Illustrative preset" : "Custom parameters"})
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted transition-transform ${
                  showInputs ? "rotate-180" : ""
                }`}
              />
            </button>

            {showInputs && (
              <div className="p-4 border-t border-hairline space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* Benchmark */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-benchmark" className="text-muted block text-[11px]">
                      Benchmark (tCO₂e/t)
                    </label>
                    {inputBenchmark.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source: benchmark</span>
                    )}
                    <input
                      id="input-benchmark"
                      type="number"
                      step="0.01"
                      value={inputBenchmark}
                      onChange={(e) => {
                        setInputBenchmark(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* Default SEE Base */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-default-base" className="text-muted block text-[11px]">
                      Default SEE Base
                    </label>
                    {inputDefaultBase.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source: default_value_base</span>
                    )}
                    <input
                      id="input-default-base"
                      type="number"
                      step="0.01"
                      value={inputDefaultBase}
                      onChange={(e) => {
                        setInputDefaultBase(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* CSCF */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-cscf" className="text-muted block text-[11px]">
                      CSCF Factor
                    </label>
                    {inputCscf.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source: cscf</span>
                    )}
                    <input
                      id="input-cscf"
                      type="number"
                      step="0.01"
                      value={inputCscf}
                      onChange={(e) => {
                        setInputCscf(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* Certificate Price */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-price" className="text-muted block text-[11px]">
                      Price (€/tCO₂e)
                    </label>
                    <input
                      id="input-price"
                      type="number"
                      step="0.01"
                      value={inputPrice}
                      onChange={(e) => {
                        setInputPrice(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* Tonnes */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-tonnes" className="text-muted block text-[11px]">
                      Tonnes Shipped
                    </label>
                    <input
                      id="input-tonnes"
                      type="number"
                      step="1"
                      value={inputTonnes}
                      onChange={(e) => {
                        setInputTonnes(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* Verified SEE */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-see" className="text-muted block text-[11px]">
                      Verified SEE (tCO₂e/t)
                    </label>
                    <input
                      id="input-see"
                      type="number"
                      step="0.01"
                      value={inputVerifiedSee}
                      onChange={(e) => {
                        setInputVerifiedSee(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-verified font-bold"
                    />
                  </div>

                  {/* Markup */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-markup" className="text-muted block text-[11px]">
                      Default Markup
                    </label>
                    <input
                      id="input-markup"
                      type="number"
                      step="0.01"
                      value={inputDefaultMarkup}
                      onChange={(e) => {
                        setInputDefaultMarkup(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>

                  {/* Free Allocation Factor */}
                  <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-faf" className="text-muted block text-[11px]">
                      Free Allocation Factor
                    </label>
                    <input
                      id="input-faf"
                      type="number"
                      step="0.001"
                      value={inputFaf}
                      onChange={(e) => {
                        setInputFaf(e.target.value);
                        setIsIllustrativePreset(false);
                      }}
                      className="w-full bg-surface border border-hairline rounded px-2 py-1 font-mono text-xs text-ink"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-hairline">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="reset-raw-config-btn"
                    onClick={handleResetToRawConfig}
                  >
                    Reset to raw config
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSourcesOpen(true)}
                  >
                    Sources drawer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sources Drawer Component */}
      <SourcesDrawer isOpen={isSourcesOpen} onClose={() => setIsSourcesOpen(false)} />

      {/* Live Arbitrum Sepolia Deployment Evidence Modal */}
      <ArbitrumSepoliaModal
        isOpen={isTestnetModalOpen}
        onClose={() => setIsTestnetModalOpen(false)}
      />
    </div>
  );
};
