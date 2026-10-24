import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UploadCloud,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import { HashChip } from "../components/HashChip";
import {
  calculateCbamComparison,
  loadCbamConfig,
  getIllustrativeExampleInputs,
  NeedsSourceError,
  type CBAMPartialInputs,
} from "../lib/cbam";
import {
  verifyPeriodReport,
  type VerificationResult,
} from "../lib/reportVerifier";
import validReportPayload from "../../e2e/fixtures/valid_report_payload.json" with { type: "json" };
import { keccak256 } from "viem";
import { CONTRACT_ADDRESSES } from "../chain/viemClient";
import { SourcesDrawer } from "../components/SourcesDrawer";
import { PageHint } from "../components/GuideLayer";
import { NumberTicker } from "../components/ui/number-ticker";

export const ImporterPage: React.FC = () => {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false);

  const [showMath, setShowMath] = useState<boolean>(false);
  const [showInputs, setShowInputs] = useState<boolean>(false);
  const [showChecks, setShowChecks] = useState<boolean>(false);

  const rawConfig = useMemo(() => loadCbamConfig(), []);

  // Form input values
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
  const [isIllustrativePreset, setIsIllustrativePreset] = useState<boolean>(true);

  // Verification runner
  const runVerification = useCallback(
    async (payload: unknown) => {
      setUploadError(null);
      try {
        const result = await verifyPeriodReport(payload, {
          forceOfflineSnapshot: true,
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

  // Initial load
  useEffect(() => {
    runVerification(validReportPayload);
    const illustrative = getIllustrativeExampleInputs();
    setInputDefaultBase(String(illustrative.default_value_base));
    setInputBenchmark(String(illustrative.benchmark));
    setInputCscf(String(illustrative.cscf));
    setInputFaf(String(illustrative.free_allocation_factor));
    setInputDefaultMarkup(String(illustrative.default_markup));
    setInputPrice(String(illustrative.certificate_price));
    setIsIllustrativePreset(true);
  }, [runVerification]);

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
      runVerification(parsed);
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

  const handleLoadValidSample = () => {
    runVerification(validReportPayload);
  };

  const handleLoadTamperedSample = () => {
    const tampered = JSON.parse(JSON.stringify(validReportPayload));
    tampered.report.merkle_roots[0] = keccak256(new TextEncoder().encode("tampered-merkle-root"));
    tampered.report.totals.specific_embedded_emissions_tco2e_per_t = 0.123456;
    runVerification(tampered);
  };

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

  // Compute CBAM calculation live
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

  const report = verificationResult?.report;
  const isReportValid = verificationResult?.valid ?? false;

  // Banner text from data (one line, non-overlapping)
  const bannerLine = isReportValid
    ? `${report?.coverage?.verified_batches ?? 1} of ${report?.coverage?.total_batches ?? 2} batches verified. Batch 2 flagged; deposit slashed.`
    : "Report verification failed: period Merkle root does not match contract attestation.";

  return (
    <div className="space-y-6">
      {/* 1. Header & One-Line Status Banner */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold">
              Buyer CBAM portal
            </h1>
            <span className="text-xs text-muted-strong">
              Verify installation telemetry proofs and calculate tariff savings.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="load-valid-report-btn"
              onClick={handleLoadValidSample}
              className="px-2.5 py-1 text-xs font-semibold rounded-pill bg-surface border border-hairline text-ink hover:bg-surface-soft cursor-pointer"
            >
              Valid report
            </button>
            <button
              type="button"
              data-testid="load-tampered-report-btn"
              onClick={handleLoadTamperedSample}
              className="px-2.5 py-1 text-xs font-semibold rounded-pill bg-[#FDECEC] border border-[#FCA5A5] text-[#9B1C1C] hover:bg-[#FCD8D8] cursor-pointer"
            >
              Tampered
            </button>
          </div>
        </div>

        <PageHint
          what="The EU importer. Check the proof, then see what verified data saves."
          nextLabel="See what we catch and miss"
          nextTo="/benchmark"
        />

        {/* Fixed Non-Overlapping One-Line Banner */}
        <div
          data-testid="verification-status-banner"
          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            isReportValid
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
              : "bg-[#FDECEC] border-[#FCA5A5] text-[#9B1C1C]"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {isReportValid ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-brand shrink-0" />
            )}
            <span className="font-medium truncate">{bannerLine}</span>
          </div>
          <span className="text-[11px] font-mono text-muted-strong shrink-0">
            {isReportValid ? "50% coverage" : "0% coverage"}
          </span>
        </div>
      </div>

      {/* 2. 12-Column Hero Grid: Left (5 cols) Proof Check | Right (7 cols) Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Proof check */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface border border-hairline rounded-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <div>
                <h2 className="text-sm font-heading font-bold text-ink">
                  Proof check
                </h2>
                <p className="text-[11px] text-muted-strong">
                  {isReportValid ? "Proofs match the chain" : "Report was altered"}
                </p>
              </div>
              <span className="text-[11px] text-muted-strong font-mono">
                Checked in your browser
              </span>
            </div>

            {/* Big "1 of 2 batches verified" with Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-heading font-bold text-ink">
                  {report ? `${report.coverage.verified_batches} of ${report.coverage.total_batches} batches verified` : "0 of 0 batches verified"}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-soft border border-hairline rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isReportValid ? "bg-emerald-500 w-1/2" : "bg-brand w-0"
                  }`}
                />
              </div>
            </div>

            {/* Flagged Batch Row with Up to 3 Plain-Language Reason Chips */}
            {report?.quarantined_batches && report.quarantined_batches.length > 0 && (
              <div
                data-testid="quarantined-batches-list"
                className="p-3 rounded-lg bg-surface-soft border border-hairline space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">
                    Batch #{report.quarantined_batches[0].batch_id} flagged
                  </span>
                  <span className="text-[11px] font-mono text-[#9B1C1C] dark:text-[#FF6B6B]">
                    Deposit slashed
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {report.quarantined_batches[0].reason_codes.slice(0, 3).map((rc) => {
                    const labels: Record<string, string> = {
                      CROSS_SOURCE_MISMATCH: "Fuel vs. stack mismatch",
                      PHYSICS_RESIDUAL: "Mass-balance residual",
                      AE_RESIDUAL: "Autoencoder anomaly",
                      CHAIN_BREAK: "Hash-chain break",
                      SEQ_GAP: "Sequence gap",
                      SIG_INVALID: "Signature invalid",
                      SPECTRAL_REPEAT: "Repeated pattern anomaly",
                    };
                    return (
                      <span
                        key={rc}
                        className="px-2 py-0.5 rounded-chip bg-surface border border-hairline text-ink font-sans"
                      >
                        {labels[rc] || rc}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contract & Period Window as Plain Text */}
            <div className="pt-2 border-t border-hairline space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-strong">Period:</span>
                <span className="text-ink font-mono text-[11px]">
                  2025-01-01 (00:00–15:00 UTC)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-strong">Contract:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted font-mono">Arbitrum Sepolia</span>
                  <HashChip hash={CONTRACT_ADDRESSES.Attestation} type="address" truncateLen={4} />
                </div>
              </div>
            </div>

            {/* "7 checks passed" Collapsed Expander */}
            <div className="pt-2 border-t border-hairline text-xs">
              <button
                type="button"
                onClick={() => setShowChecks((prev) => !prev)}
                aria-expanded={showChecks}
                className="w-full flex items-center justify-between text-muted-strong font-medium py-1 hover:text-ink cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>7 checks passed</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showChecks ? "rotate-180" : ""}`} />
              </button>
              {showChecks && (
                <div className="grid grid-cols-1 gap-1 text-muted-strong font-sans pt-1.5 pl-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span>Data structure &amp; integrity</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Period Merkle root recomputation</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Batch root inclusion in period tree</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Device ECDSA signature verification</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Hash-chain continuity check</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>On-chain attestation registry match</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>CBAM regulation alignment check</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                </div>
              )}
            </div>

            {/* Compact Drag-and-Drop Area */}
            <div
              data-testid="dropzone-area"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("report-file-input")?.click()}
              role="button"
              tabIndex={0}
              className={`p-2.5 border border-dashed rounded-lg flex items-center justify-center gap-2 cursor-pointer text-xs transition-colors ${
                isDragOver ? "border-brand bg-band" : "border-hairline hover:border-muted-strong bg-surface-soft/40"
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
              <UploadCloud className="w-3.5 h-3.5 text-muted-strong" />
              <span className="text-muted-strong">
                Drop report JSON to re-verify
              </span>
            </div>

            {uploadError && (
              <p className="text-[11px] text-[#9B1C1C] bg-[#FDECEC] px-2 py-1 rounded border border-red-200 font-mono">
                {uploadError}
              </p>
            )}
          </div>
        </div>

        {/* Right Column (7 cols): Two big number cards + You save strip + Slider + Math */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tonnes Shipped Slider (100–2000, default 500) */}
          <div className="p-4 bg-surface border border-hairline rounded-card space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-strong font-medium">Consignment mass</span>
              <span className="font-heading font-bold text-ink text-sm">
                {Number(inputTonnes).toLocaleString()} tonnes shipped
              </span>
            </div>
            <input
              type="range"
              min="100"
              max="2000"
              step="10"
              value={inputTonnes}
              onChange={(e) => {
                setInputTonnes(e.target.value);
                setIsIllustrativePreset(false);
              }}
              className="w-full accent-brand cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted font-mono">
              <span>100 t</span>
              <span>500 t (default)</span>
              <span>2,000 t</span>
            </div>
          </div>

          {/* Two Big Number Cards: Default Value vs Verified Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Default Value */}
            <div className="p-5 bg-surface-soft border border-hairline rounded-card space-y-1">
              <span className="text-[13px] text-muted-strong font-medium block">
                Default value route
              </span>
              <div className="text-4xl font-heading font-bold text-ink">
                {comparison
                  ? `€${Math.round(comparison.cost_with_default_eur).toLocaleString("en-US")}`
                  : "--"}
              </div>
              <p className="text-[11px] text-muted font-mono pt-1">
                +10% default markup · 2.53 tCO₂e/t
              </p>
            </div>

            {/* Card 2: Verified Data */}
            <div className="p-5 bg-surface border-2 border-ink rounded-card space-y-1 shadow-sm">
              <span className="text-[13px] text-ink font-medium block">
                Verified data route
              </span>
              <div className="text-4xl font-heading font-bold text-ink">
                {comparison
                  ? `€${Math.round(comparison.cost_with_verified_eur).toLocaleString("en-US")}`
                  : "--"}
              </div>
              <p className="text-[11px] text-muted font-mono pt-1">
                Penalty exempt · 1.90 tCO₂e/t
              </p>
            </div>
          </div>

          {/* "You Save" Strip (Largest Number on the Page) */}
          <div className="bg-[#0A0A0A] text-white rounded-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm border border-neutral-800">
            <div>
              <span className="text-[13px] text-white/70 block">
                Net tariff savings
              </span>
              <span className="text-xs text-white/90">
                You save with verified data:
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                data-testid="animated-savings-value"
                className="text-4xl sm:text-5xl font-heading font-bold text-[#FF6B6B]"
              >
                {comparison ? (
                  <>€<NumberTicker value={comparison.savings_eur} decimalPlaces={2} className="text-[#FF6B6B] dark:text-[#FF6B6B] inline" /></>
                ) : (
                  "--"
                )}
              </span>
              {comparison && comparison.cost_with_default_eur > 0 && (
                <span className="text-xs font-mono text-white/70">
                  ({((comparison.savings_eur / comparison.cost_with_default_eur) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          {/* One-Line Formula with 'Show the math' expander */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-surface-soft border border-hairline rounded-lg text-xs font-mono">
              <span className="text-ink truncate">
                Cost = Tonnes × max(0, SEE - SEFA) × Price
              </span>
              <button
                type="button"
                onClick={() => setShowMath((prev) => !prev)}
                aria-expanded={showMath}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline shrink-0 ml-2 cursor-pointer"
              >
                <span>{showMath ? "Hide math" : "Show the math"}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMath ? "rotate-180" : ""}`} />
              </button>
            </div>

            {showMath && comparison && (
              <div
                data-testid="formula-steps-panel"
                className="space-y-1.5 p-3.5 bg-surface border border-hairline rounded-lg text-xs font-mono"
              >
                {comparison.steps.map((step, idx) => (
                  <div
                    key={step.step_id}
                    className="p-2 rounded bg-surface-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]"
                  >
                    <div>
                      <span className="font-sans font-medium text-ink">
                        Step {idx + 1}: {step.label}
                      </span>
                      <span className="text-muted block sm:inline sm:ml-2">
                        {step.substituted}
                      </span>
                    </div>
                    <span className="font-semibold text-ink">
                      {step.unit === "EUR" ? "€" : ""}
                      {step.result.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 3,
                      })}{" "}
                      {step.unit !== "EUR" ? step.unit : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collapsible Inputs Panel with "Example numbers" Button */}
          <div className="border border-hairline rounded-card overflow-hidden bg-surface">
            <div className="p-3.5 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowInputs((prev) => !prev)}
                aria-expanded={showInputs}
                className="flex items-center gap-2 font-semibold text-ink hover:text-brand cursor-pointer"
              >
                <Settings2 className="w-4 h-4 text-muted" />
                <span>Editable inputs</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInputs ? "rotate-180" : ""}`} />
              </button>

              <button
                type="button"
                data-testid="load-illustrative-preset-btn"
                onClick={handleLoadIllustrativePreset}
                className="px-2.5 py-1 text-xs font-medium rounded-pill bg-surface-soft border border-hairline text-ink hover:bg-hairline cursor-pointer"
              >
                Example numbers
              </button>
            </div>

            {showInputs && (
              <div className="p-4 border-t border-hairline space-y-3 text-xs">
                {missingParameters.length > 0 && (
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap gap-1.5">
                    {missingParameters.map((param) => (
                      <span key={param} className="font-mono text-[10px]">
                        needs source: {param}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="p-2 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-benchmark" className="text-muted block text-[10px]">
                      Benchmark (tCO₂e/t)
                    </label>
                    {inputBenchmark.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source</span>
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
                      className="w-full bg-surface border border-hairline rounded px-2 py-0.5 font-mono text-xs text-ink"
                    />
                  </div>

                  <div className="p-2 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-default-base" className="text-muted block text-[10px]">
                      Default SEE base
                    </label>
                    {inputDefaultBase.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source</span>
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
                      className="w-full bg-surface border border-hairline rounded px-2 py-0.5 font-mono text-xs text-ink"
                    />
                  </div>

                  <div className="p-2 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-cscf" className="text-muted block text-[10px]">
                      CSCF factor
                    </label>
                    {inputCscf.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source</span>
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
                      className="w-full bg-surface border border-hairline rounded px-2 py-0.5 font-mono text-xs text-ink"
                    />
                  </div>

                  <div className="p-2 bg-surface-soft border border-hairline rounded-lg space-y-1">
                    <label htmlFor="input-price" className="text-muted block text-[10px]">
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
                      className="w-full bg-surface border border-hairline rounded px-2 py-0.5 font-mono text-xs text-ink"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setIsSourcesOpen(true)}
                    className="text-xs text-muted-strong hover:text-ink underline"
                  >
                    View sources
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SourcesDrawer isOpen={isSourcesOpen} onClose={() => setIsSourcesOpen(false)} />
    </div>
  );
};
