import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UploadCloud,
  AlertOctagon,
  Award,
  TrendingDown,
  ArrowDownRight,
  Calculator,
  Download,
  BookOpen,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { StatTile } from "../components/StatTile";
import { HashChip } from "../components/HashChip";
import { SourcesDrawer } from "../components/SourcesDrawer.tsx";
import { AnimatedSavings } from "../components/AnimatedSavings.tsx";
import { HowToReadExplainer } from "../components/HowToReadExplainer.tsx";
import {
  calculateCbamComparison,
  loadCbamConfig,
  loadCbamSources,
  getIllustrativeExampleInputs,
  type CBAMPartialInputs,
  NeedsSourceError,
} from "../lib/cbam.ts";
import {
  verifyPeriodReport,
  type VerificationResult,
} from "../lib/reportVerifier.ts";
import validReportPayload from "../../e2e/fixtures/valid_report_payload.json" with { type: "json" };
import { CONTRACT_ADDRESSES } from "../chain/viemClient.ts";

export const ImporterPage: React.FC = () => {
  // Mode: Offline Snapshot vs Online Chain
  const [isOfflineSnapshotMode, setIsOfflineSnapshotMode] = useState<boolean>(true);

  // Uploaded report & verification state
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Sources Drawer State
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false);

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

        // If report has valid totals, sync into calculator inputs
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
        setUploadError(`Verification failed unexpectedly: ${msg}`);
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
      setUploadError(`Failed to parse file as JSON: ${msg}`);
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
    // Tamper the Merkle root and emissions value
    tampered.report.merkle_roots[0] =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
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
    // Reset unverified variables to empty (null) to demonstrate NEEDS SOURCE state
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
      return { comparison: res, missingParameters: [], calcError: null };
    } catch (err) {
      if (err instanceof NeedsSourceError) {
        return {
          comparison: null,
          missingParameters: err.missing_parameters,
          calcError: err.message,
        };
      }
      return {
        comparison: null,
        missingParameters: [],
        calcError: err instanceof Error ? err.message : String(err),
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
      disclaimer:
        "VeriCEMS supporting evidence package for EU CBAM declaration. This evidence pack is CBAM-aligned supporting documentation and represents pre-verification telemetry assurance rather than statutory verification.",
      verification: {
        valid: verificationResult.valid,
        mode: verificationResult.mode,
        computed_period_merkle_root: verificationResult.computedPeriodMerkleRoot,
        checks: verificationResult.checks,
        on_chain_attestation: verificationResult.onChainAttestation,
        on_chain_batches: verificationResult.onChainBatches,
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
        formula_steps: comparison?.steps || [],
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Context Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              EU Importer CBAM Portal
            </h1>
            <Badge variant="verified" label="CBAM-ALIGNED" size="sm" />
          </div>
          <p className="text-sm text-muted mt-1">
            Browser-side Merkle proof verification, on-chain Attestation comparison, and net CBAM cost analytics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Offline Snapshot Mode Toggle */}
          <button
            type="button"
            data-testid="toggle-offline-snapshot-btn"
            onClick={handleToggleOfflineMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none ${
              isOfflineSnapshotMode
                ? "bg-warning/15 border-warning/40 text-warning"
                : "bg-surface-raised border-border text-text hover:bg-border"
            }`}
            title="Toggle between live EVM RPC and recorded offline snapshot"
          >
            {isOfflineSnapshotMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-warning" />
                <span>OFFLINE SNAPSHOT</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-verified" />
                <span>LIVE ANVIL RPC</span>
              </>
            )}
          </button>

          {/* Sources Drawer Button */}
          <button
            type="button"
            data-testid="open-sources-btn"
            onClick={() => setIsSourcesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-raised border border-border text-text hover:bg-border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
          >
            <BookOpen className="w-3.5 h-3.5 text-info" />
            <span>Sources</span>
          </button>

          {/* Export Evidence Pack Button */}
          <button
            type="button"
            data-testid="export-evidence-pack-btn"
            onClick={handleExportEvidencePack}
            disabled={!verificationResult}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-info/10 border border-info/30 text-info hover:bg-info/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Evidence Pack</span>
          </button>
        </div>
      </div>

      {/* Prominent Offline Mode Notice Banner (if active) */}
      {isOfflineSnapshotMode && (
        <div
          role="status"
          className="p-3.5 bg-warning/10 border border-warning/30 rounded-xl flex items-center justify-between gap-3 text-xs text-warning"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0 text-warning" />
            <span>
              <strong>OFFLINE SNAPSHOT MODE ACTIVE:</strong> Browser verification is evaluating
              against recorded on-chain Attestation and BatchAnchor snapshot data (Anvil Chain ID: 31337). No live RPC connection is required.
            </span>
          </div>
          <Badge variant="warning" label="SNAPSHOT MODE" size="sm" />
        </div>
      )}

      {/* Primary Financial Overview Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Verified Cost"
          value={
            comparison
              ? `€${comparison.cost_with_verified_eur.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "--"
          }
          variant="verified"
          icon={Award}
        />
        <StatTile
          label="Default Value Cost"
          value={
            comparison
              ? `€${comparison.cost_with_default_eur.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "--"
          }
          variant="flagged"
          icon={TrendingDown}
        />
        <StatTile
          label="CBAM Savings"
          value={
            comparison
              ? `€${comparison.savings_eur.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "--"
          }
          unit={
            comparison && comparison.cost_with_default_eur > 0
              ? `(${((comparison.savings_eur / comparison.cost_with_default_eur) * 100).toFixed(1)}%)`
              : ""
          }
          variant="verified"
          icon={ArrowDownRight}
        />
        <StatTile
          label="Verified Coverage"
          value={
            report?.coverage?.coverage_bp !== undefined
              ? `${(report.coverage.coverage_bp / 100).toFixed(1)}%`
              : "--"
          }
          unit={
            report?.coverage?.coverage_bp !== undefined
              ? `(${report.coverage.coverage_bp.toLocaleString()} bp)`
              : ""
          }
          icon={Calculator}
          variant={
            report?.coverage?.coverage_bp === 10000
              ? "verified"
              : report?.coverage?.coverage_bp && report.coverage.coverage_bp > 0
              ? "warning"
              : "default"
          }
        />
      </div>

      {/* Feature 1 & 2: Report Upload & Browser-Side Verification Section */}
      <Card
        title="Supplier Period Report Verification"
        subtitle="Upload CBAM period report JSON (schemas/report.schema.json). Browser verifies Merkle roots against Attestation.sol"
        icon={UploadCloud}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="load-valid-report-btn"
              onClick={handleLoadValidSample}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-sunken hover:bg-border text-text border border-border transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
            >
              Load Valid Report
            </button>
            <button
              type="button"
              data-testid="load-tampered-report-btn"
              onClick={handleLoadTamperedSample}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-flagged/10 hover:bg-flagged/20 text-flagged border border-flagged/30 transition-colors focus-visible:ring-1 focus-visible:ring-flagged focus-visible:outline-none"
            >
              Load Tampered Report
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Drag & Drop Upload Zone */}
          <div
            data-testid="dropzone-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
              isDragOver
                ? "border-info bg-info/10"
                : "border-border hover:border-border-strong bg-surface-sunken/40"
            }`}
            onClick={() => document.getElementById("report-file-input")?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                document.getElementById("report-file-input")?.click();
              }
            }}
          >
            <input
              id="report-file-input"
              data-testid="file-upload-input"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="p-3 bg-surface-raised border border-border rounded-xl text-muted mb-2">
              <UploadCloud className="w-6 h-6 text-info" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-text">
              Drop supplier period report JSON here, or{" "}
              <span className="text-info underline">browse files</span>
            </p>
            <p className="text-xs text-muted mt-1">
              Supports <code className="text-info font-mono">schemas/report.schema.json</code> and signed envelopes
            </p>
          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div
              role="alert"
              className="p-4 bg-flagged/10 border border-flagged/30 rounded-xl flex items-start gap-3 text-xs text-flagged"
            >
              <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Upload Validation Error:</strong>
                <p className="mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          {/* Verification Status Banner */}
          {verificationResult && (
            <div
              data-testid="verification-status-banner"
              role="status"
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                isReportValid
                  ? "bg-verified/10 border-verified/30 text-verified"
                  : "bg-flagged/10 border-flagged/30 text-flagged"
              }`}
            >
              <div className="flex items-center gap-3">
                {isReportValid ? (
                  <CheckCircle2 className="w-5 h-5 text-verified shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-flagged shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    {isReportValid
                      ? "CRYPTOGRAPHIC VERIFICATION SUCCESSFUL"
                      : "VERIFICATION FAILED: TAMPERED OR INVALID REPORT"}
                  </h4>
                  <p className="mt-0.5 opacity-90">
                    {isReportValid
                      ? "Period Merkle roots match on-chain Attestation. All verified batch roots match BatchAnchor records."
                      : "One or more cryptographic or on-chain consistency checks failed. See detailed check breakdown below."}
                  </p>
                </div>
              </div>
              <Badge
                variant={isReportValid ? "verified" : "flagged"}
                label={isReportValid ? "ATTESTED ON-CHAIN" : "INTEGRITY VIOLATION"}
              />
            </div>
          )}

          {/* Detailed Verification Checks Breakdown */}
          {verificationResult && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Cryptographic & On-Chain Check Results ({verificationResult.checks.length} checks)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {verificationResult.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className={`p-3 rounded-lg border flex items-start justify-between gap-2 ${
                      chk.passed
                        ? "bg-surface-sunken border-border text-text"
                        : "bg-flagged/10 border-flagged/40 text-flagged"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="font-medium block">{chk.title}</span>
                      <p className="text-[11px] text-muted">{chk.message}</p>
                    </div>
                    {chk.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-verified shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-flagged shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Feature 3: Evidence Summary Panel */}
      {report && (
        <Card
          title="Period-End Attestation Certificate & Evidence Summary"
          subtitle="Cryptographic audit trail recorded in Attestation.sol and BatchAnchor.sol"
          icon={Award}
        >
          <div data-testid="evidence-summary-panel" className="space-y-5">
            {/* Top Identity & On-Chain References */}
            <div className="p-4 bg-surface-sunken border border-border rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-muted block text-[11px]">Installation ID:</span>
                <span className="text-text font-bold block mt-0.5">{report.installation_id}</span>
                <span className="text-[10px] text-muted">Device: {report.device_id}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Attestation ID:</span>
                <span className="text-info font-bold text-sm block mt-0.5">
                  #{report.attestation_id}
                </span>
                <span className="text-[10px] text-muted">Period: {report.period.label}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Aggregated Period Root:</span>
                <div className="mt-0.5">
                  <HashChip
                    hash={verificationResult?.computedPeriodMerkleRoot || report.merkle_roots[0]}
                    type="root"
                    truncateLen={5}
                  />
                </div>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Attestation Contract:</span>
                <div className="mt-0.5">
                  <HashChip hash={CONTRACT_ADDRESSES.Attestation} type="address" truncateLen={4} />
                </div>
              </div>
            </div>

            {/* Emissions & Specific Embedded Emissions Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-surface-raised border border-border rounded-lg">
                <span className="text-muted block text-[11px]">Verified Emissions:</span>
                <span className="font-mono font-bold text-text text-sm">
                  {report.totals.verified_emissions_tco2e.toFixed(3)} tCO₂e
                </span>
              </div>
              <div className="p-3 bg-surface-raised border border-border rounded-lg">
                <span className="text-muted block text-[11px]">Production Mass:</span>
                <span className="font-mono font-bold text-text text-sm">
                  {report.totals.production_tonnes.toFixed(1)} tonnes
                </span>
              </div>
              <div className="p-3 bg-surface-raised border border-border rounded-lg">
                <span className="text-muted block text-[11px]">Verified Actual SEE:</span>
                <span className="font-mono font-bold text-verified text-sm">
                  {report.totals.specific_embedded_emissions_tco2e_per_t.toFixed(4)} tCO₂e/t
                </span>
              </div>
              <div className="p-3 bg-surface-raised border border-border rounded-lg">
                <span className="text-muted block text-[11px]">Period Coverage:</span>
                <span className="font-mono font-bold text-info text-sm">
                  {(report.coverage.coverage_bp / 100).toFixed(1)}% ({report.coverage.coverage_bp} bp)
                </span>
              </div>
            </div>

            {/* Quarantined / Flagged Batches & Hours */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Batch Audit & Quarantined Hours Breakdown
                </h4>
                <span className="text-xs font-mono text-muted">
                  Verified: {report.coverage.verified_batches} | Quarantined:{" "}
                  {report.coverage.quarantined_batches_count}
                </span>
              </div>

              {report.quarantined_batches && report.quarantined_batches.length > 0 ? (
                <div data-testid="quarantined-batches-list" className="space-y-2">
                  {report.quarantined_batches.map((qb) => (
                    <div
                      key={qb.batch_id}
                      className="p-3 bg-flagged/5 border border-flagged/30 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-flagged shrink-0" />
                          <span className="font-mono font-bold text-text">
                            Batch #{qb.batch_id} (Readings {qb.first_seq}..{qb.last_seq})
                          </span>
                          <Badge variant="flagged" label={qb.challenge_status} size="sm" />
                        </div>
                        <HashChip hash={qb.merkle_root} type="root" truncateLen={5} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-muted">Detection reasons:</span>
                        {qb.reason_codes.map((rc) => (
                          <span
                            key={rc}
                            className="px-2 py-0.5 rounded bg-flagged/20 border border-flagged/40 text-flagged font-mono font-semibold text-[10px]"
                          >
                            {rc}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-verified/5 border border-verified/20 rounded-xl flex items-center gap-2 text-xs text-verified">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>No quarantined or flagged hours in this reporting period. All batch hours passed quorum verification.</span>
                </div>
              )}
            </div>

            {/* Data Origin Labels (AGENTS.md Rule 3) */}
            <div className="p-3.5 bg-surface-sunken border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text uppercase tracking-wider">
                  Data Provenance & Origin Disclosures (AGENTS.md Rule 3)
                </span>
                <span className="text-[11px] font-mono text-muted">40 CFR Part 75 Proxy</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <span className="text-muted block text-[10px]">Stack Telemetry:</span>
                  <Badge variant="verified" label="REAL (CAMPD 1073-3)" size="sm" />
                </div>
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <span className="text-muted block text-[10px]">Flue Gas & Stack O₂:</span>
                  <Badge variant="warning" label="SYNTHETIC" size="sm" />
                </div>
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <span className="text-muted block text-[10px]">Gateway Signing:</span>
                  <Badge variant="warning" label="SYNTHETIC (Software SE)" size="sm" />
                </div>
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <span className="text-muted block text-[10px]">Production Output:</span>
                  <Badge variant="warning" label="SYNTHETIC (Reported)" size="sm" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Feature 4 & 5: CBAM Calculator Panel (Split View & Formula Steps) */}
      <Card
        title="CBAM Cost Comparison Calculator"
        subtitle="Implementing Regulation (EU) 2025/2620 & 2025/2621 net liability calculation"
        icon={Calculator}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="load-illustrative-preset-btn"
              onClick={handleLoadIllustrativePreset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-info/10 text-info border border-info/30 hover:bg-info/20 transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Illustrative Preset [FICTIONAL]</span>
            </button>
            <button
              type="button"
              data-testid="reset-raw-config-btn"
              onClick={handleResetToRawConfig}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-sunken text-muted hover:text-text border border-border hover:bg-border transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Raw Config</span>
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Missing Parameters Block Notice (if any required parameters are null) */}
          {missingParameters.length > 0 && (
            <div
              data-testid="needs-source-alert"
              role="alert"
              className="p-4 bg-warning/10 border border-warning/40 rounded-xl space-y-2 text-xs text-warning"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
                <h4 className="font-bold text-sm">
                  CALCULATION BLOCKED: MISSING VERIFIED REGULATORY SOURCES
                </h4>
              </div>
              <p>
                Per <strong className="text-text">AGENTS.md Honesty Rule 4</strong>, CBAM certificate
                liabilities cannot be guessed. The following parameter(s) have not been published with
                verified legal sources in <code className="font-mono text-text">cbam_config.json</code>:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {missingParameters.map((p) => (
                  <Badge key={p} variant="warning" label={`needs source: ${p}`} size="sm" />
                ))}
              </div>
              <p className="text-[11px] text-muted pt-1">
                Click <strong>"Load Illustrative Preset [FICTIONAL]"</strong> above to populate verified
                Guide Appendix A test inputs, or enter values manually in the editable fields below.
              </p>
            </div>
          )}

          {/* Illustrative Preset Tag Notice */}
          {isIllustrativePreset && (
            <div className="p-3 bg-info/10 border border-info/30 rounded-xl flex items-center justify-between gap-3 text-xs text-info">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 shrink-0" />
                <strong>FICTIONAL / ILLUSTRATIVE PRESET LOADED:</strong> Using Guide Section 14 Appendix A worked example parameters for steel production.
              </span>
              <Badge variant="info" label="[ILLUSTRATIVE]" size="sm" />
            </div>
          )}

          {/* Editable Parameters Form Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center justify-between">
              <span>Editable Regulatory & Production Parameters</span>
              <span className="text-[11px] font-mono lowercase">All fields editable</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Benchmark */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-benchmark" className="text-muted block text-[11px]">
                    Route Benchmark (tCO₂e/t)
                  </label>
                  {inputBenchmark.trim() === "" ? (
                    <Badge variant="warning" label="NEEDS SOURCE" size="sm" />
                  ) : (
                    <Badge variant="verified" label="INPUT" size="sm" />
                  )}
                </div>
                <input
                  id="input-benchmark"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1.40"
                  value={inputBenchmark}
                  onChange={(e) => {
                    setInputBenchmark(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">Reg 2025/2620</span>
              </div>

              {/* Default Value Base */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-default-base" className="text-muted block text-[11px]">
                    Default SEE Base (tCO₂e/t)
                  </label>
                  {inputDefaultBase.trim() === "" ? (
                    <Badge variant="warning" label="NEEDS SOURCE" size="sm" />
                  ) : (
                    <Badge variant="flagged" label="INPUT" size="sm" />
                  )}
                </div>
                <input
                  id="input-default-base"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 2.30"
                  value={inputDefaultBase}
                  onChange={(e) => {
                    setInputDefaultBase(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">Reg 2025/2621</span>
              </div>

              {/* Default Markup */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-default-markup" className="text-muted block text-[11px]">
                    Default Markup (2026)
                  </label>
                  <Badge variant="verified" label="VERIFIED" size="sm" />
                </div>
                <input
                  id="input-default-markup"
                  type="number"
                  step="0.01"
                  value={inputDefaultMarkup}
                  onChange={(e) => {
                    setInputDefaultMarkup(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">+10% markup in 2026</span>
              </div>

              {/* Free Allocation Factor */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-faf" className="text-muted block text-[11px]">
                    Free Allocation Factor (2026)
                  </label>
                  <Badge variant="verified" label="VERIFIED" size="sm" />
                </div>
                <input
                  id="input-faf"
                  type="number"
                  step="0.001"
                  max="1.0"
                  min="0"
                  value={inputFaf}
                  onChange={(e) => {
                    setInputFaf(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">97.5% free / 2.5% payable</span>
              </div>

              {/* CSCF */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-cscf" className="text-muted block text-[11px]">
                    CSCF Factor
                  </label>
                  {inputCscf.trim() === "" ? (
                    <Badge variant="warning" label="NEEDS SOURCE" size="sm" />
                  ) : (
                    <Badge variant="verified" label="INPUT" size="sm" />
                  )}
                </div>
                <input
                  id="input-cscf"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1.00"
                  value={inputCscf}
                  onChange={(e) => {
                    setInputCscf(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">Cross-Sectoral Factor</span>
              </div>

              {/* Certificate Price */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-price" className="text-muted block text-[11px]">
                    CBAM Price (€/tCO₂e)
                  </label>
                  <Badge variant="verified" label="2026-Q3" size="sm" />
                </div>
                <input
                  id="input-price"
                  type="number"
                  step="0.01"
                  value={inputPrice}
                  onChange={(e) => {
                    setInputPrice(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">Q3 2026 auction average</span>
              </div>

              {/* Production Tonnes */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-tonnes" className="text-muted block text-[11px]">
                    Tonnes Shipped
                  </label>
                  <Badge variant="warning" label="SYNTHETIC" size="sm" />
                </div>
                <input
                  id="input-tonnes"
                  type="number"
                  step="1"
                  value={inputTonnes}
                  onChange={(e) => {
                    setInputTonnes(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-text focus:outline-none focus:border-info"
                />
                <span className="text-[10px] text-muted block">From report or invoice</span>
              </div>

              {/* Verified Actual SEE */}
              <div className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-see" className="text-muted block text-[11px]">
                    Verified SEE (tCO₂e/t)
                  </label>
                  <Badge variant="verified" label="ATTESTED" size="sm" />
                </div>
                <input
                  id="input-see"
                  type="number"
                  step="0.0001"
                  value={inputVerifiedSee}
                  onChange={(e) => {
                    setInputVerifiedSee(e.target.value);
                    setIsIllustrativePreset(false);
                  }}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-sm text-verified focus:outline-none focus:border-verified"
                />
                <span className="text-[10px] text-muted block">From verified telemetry</span>
              </div>
            </div>
          </div>

          {/* Animated Savings Figure (Feature 5) */}
          {comparison && (
            <AnimatedSavings
              savingsEur={comparison.savings_eur}
              costWithDefaultEur={comparison.cost_with_default_eur}
              costWithVerifiedEur={comparison.cost_with_verified_eur}
              certificatePrice={comparison.certificate_price}
              priceQuarter={comparison.price_quarter}
              defaultMarkup={comparison.default_markup}
              freeAllocationFactor={comparison.free_allocation_factor}
            />
          )}

          {/* Feature 4: Split View Comparison Panel */}
          {comparison && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Default Value Column */}
              <div className="p-5 bg-surface-sunken border border-flagged/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-flagged" />
                    <h4 className="font-bold text-sm text-text">Default Value Route</h4>
                  </div>
                  <Badge variant="flagged" label="+10% MARKUP" size="sm" />
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Base Default SEE:</span>
                    <span className="text-text">{comparison.default_value_base.toFixed(3)} tCO₂e/t</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Markup (+10% in 2026):</span>
                    <span className="text-flagged">
                      +{((comparison.default_see_with_markup - comparison.default_value_base)).toFixed(3)} tCO₂e/t
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Marked-Up Default SEE:</span>
                    <span className="text-flagged font-bold">
                      {comparison.default_see_with_markup.toFixed(3)} tCO₂e/t
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">SEFA Benchmark Deduction:</span>
                    <span className="text-text">-{comparison.sefa_default.toFixed(3)} tCO₂e/t</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Net Payable per Tonne:</span>
                    <span className="text-flagged font-bold">
                      {comparison.payable_per_tonne_default.toFixed(3)} tCO₂e/t
                    </span>
                  </div>
                  <div className="pt-2 flex justify-between items-baseline text-sm">
                    <span className="text-muted font-sans font-semibold">Total Default Liability:</span>
                    <span className="text-flagged font-extrabold text-base">
                      €{comparison.cost_with_default_eur.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Verified Actual Column */}
              <div className="p-5 bg-surface-sunken border border-verified/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-verified" />
                    <h4 className="font-bold text-sm text-text">Verified Actual Route</h4>
                  </div>
                  <Badge variant="verified" label="VERICEMS ATTESTED" size="sm" />
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Actual Installation SEE:</span>
                    <span className="text-verified font-bold">
                      {comparison.verified_see.toFixed(4)} tCO₂e/t
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Default Value Penalty Surcharge:</span>
                    <span className="text-verified">€0.00 (Exempt)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Free Allocation (SEFA):</span>
                    <span className="text-text">-{comparison.sefa_verified.toFixed(3)} tCO₂e/t</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Net Payable per Tonne:</span>
                    <span className="text-verified font-bold">
                      {comparison.payable_per_tonne_verified.toFixed(3)} tCO₂e/t
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted">Payable Emissions for {comparison.tonnes_shipped} t:</span>
                    <span className="text-text">{comparison.total_payable_tonnes_verified.toFixed(2)} tCO₂e</span>
                  </div>
                  <div className="pt-2 flex justify-between items-baseline text-sm">
                    <span className="text-muted font-sans font-semibold">Total Verified Liability:</span>
                    <span className="text-verified font-extrabold text-base">
                      €{comparison.cost_with_verified_eur.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Transparent Step-by-Step Formula Substitution Breakdown */}
          {comparison && (
            <div data-testid="formula-steps-panel" className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-info" />
                Step-by-Step Formula Substitution Breakdown (All Calculation Steps Shown)
              </h4>

              <div className="space-y-2">
                {comparison.steps.map((step, idx) => (
                  <div
                    key={step.step_id}
                    className="p-3 bg-surface-sunken border border-border rounded-xl space-y-1 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between text-muted text-[11px]">
                      <span className="font-semibold text-text">
                        Step {idx + 1}: {step.label}
                      </span>
                      <span className="text-info">{step.formula}</span>
                    </div>
                    <div className="pt-1 text-text flex items-center justify-between">
                      <span className="text-xs text-text">{step.substituted}</span>
                      <span className="text-xs font-bold text-verified">
                        {step.unit === "EUR" ? "€" : ""}
                        {step.result.toLocaleString("en-US", {
                          minimumFractionDigits: step.unit === "EUR" ? 2 : 3,
                          maximumFractionDigits: step.unit === "EUR" ? 2 : 4,
                        })}{" "}
                        {step.unit !== "EUR" ? step.unit : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Feature 8: Plain-Language 'How to read this' Explainer */}
      <HowToReadExplainer />

      {/* Sources Drawer Component (Feature 4) */}
      <SourcesDrawer isOpen={isSourcesOpen} onClose={() => setIsSourcesOpen(false)} />
    </div>
  );
};
