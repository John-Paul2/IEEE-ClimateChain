import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UploadCloud,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Check,
  X,
  RotateCw,
} from "lucide-react";
import { motion } from "framer-motion";
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
import { SourcesDrawer } from "../components/SourcesDrawer";
import { PageHint } from "../components/GuideLayer";
import { NumberTicker } from "../components/ui/number-ticker";

export const ImporterPage: React.FC = () => {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [currentPayload, setCurrentPayload] = useState<unknown>(validReportPayload);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false);

  const [showMath, setShowMath] = useState<boolean>(false);
  const [showInputs, setShowInputs] = useState<boolean>(false);
  const [showChecks, setShowChecks] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyPulseKey, setVerifyPulseKey] = useState<number>(0);

  // Preference for reduced motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener?.("change", listener);
      return () => mediaQuery.removeEventListener?.("change", listener);
    }
  }, []);

  const rawConfig = useMemo(() => loadCbamConfig(), []);

  // Form input values (preset from illustrative example: 500 tonnes, verified SEE 1.90)
  const [inputYear, setInputYear] = useState<number>(2026);
  const [inputTonnes, setInputTonnes] = useState<string>("500.0");
  const [inputVerifiedSee, setInputVerifiedSee] = useState<string>("1.90");
  const [inputDefaultBase, setInputDefaultBase] = useState<string>("2.30");
  const [inputBenchmark, setInputBenchmark] = useState<string>("1.40");
  const [inputDefaultBenchmark, setInputDefaultBenchmark] = useState<string>("");
  const [inputFaf, setInputFaf] = useState<string>("0.975");
  const [inputCscf, setInputCscf] = useState<string>("1.00");
  const [inputDefaultMarkup, setInputDefaultMarkup] = useState<string>("0.10");
  const [inputPrice, setInputPrice] = useState<string>(
    String(rawConfig.price_eur_per_tco2e.value ?? 82.32)
  );
  const [isIllustrativePreset, setIsIllustrativePreset] = useState<boolean>(true);

  // Second slider: plant emissions reduction (0 to 30%)
  const [plantCutPercent, setPlantCutPercent] = useState<number>(0);

  // Verification runner
  const runVerification = useCallback(
    async (payload: unknown) => {
      setUploadError(null);
      try {
        const result = await verifyPeriodReport(payload, {
          forceOfflineSnapshot: true,
        });
        setVerificationResult(result);
        setCurrentPayload(payload);
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
    setInputVerifiedSee(String(illustrative.verified_see));
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

  const [tamperMode, setTamperMode] = useState<"valid" | "root" | "1digit" | "omission">("valid");

  const handleLoadValidSample = () => {
    setTamperMode("valid");
    runVerification(validReportPayload);
    setVerifyPulseKey((k) => k + 1);
  };

  const handleLoadTamperedSample = () => {
    setTamperMode("root");
    const tampered = JSON.parse(JSON.stringify(validReportPayload));
    tampered.report.merkle_roots[0] = keccak256(new TextEncoder().encode("tampered-merkle-root"));
    tampered.report.totals.specific_embedded_emissions_tco2e_per_t = 0.123456;
    runVerification(tampered);
    setVerifyPulseKey((k) => k + 1);
  };

  const handleLoadOneDigitTamper = () => {
    setTamperMode("1digit");
    const tampered = JSON.parse(JSON.stringify(validReportPayload));
    // Single-digit reduction in verified emissions (275.330569 -> 175.330569) while keeping Merkle root intact
    tampered.report.totals.verified_emissions_tco2e = 175.330569;
    tampered.report.totals.specific_embedded_emissions_tco2e_per_t = 0.350661;
    runVerification(tampered);
    setVerifyPulseKey((k) => k + 1);
  };

  const handleLoadMissingHoursTamper = () => {
    setTamperMode("omission");
    const tampered = JSON.parse(JSON.stringify(validReportPayload));
    // Omit 2 peak hourly packets from proof window and hide quarantined batch
    if (tampered.envelope?.merkle_proofs?.[0]?.all_proofs) {
      tampered.envelope.merkle_proofs[0].all_proofs =
        tampered.envelope.merkle_proofs[0].all_proofs.slice(0, 6);
    }
    tampered.report.coverage.coverage_bp = 10000;
    runVerification(tampered);
    setVerifyPulseKey((k) => k + 1);
  };

  const handleVerifyButtonClick = async () => {
    setIsVerifying(true);
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 0 : 200));
    await runVerification(currentPayload);
    setIsVerifying(false);
    setVerifyPulseKey((k) => k + 1);
  };

  const handleLoadIllustrativePreset = () => {
    const illustrative = getIllustrativeExampleInputs();
    setInputYear(illustrative.year);
    setInputTonnes(String(illustrative.tonnes_shipped));
    setInputVerifiedSee(String(illustrative.verified_see));
    setInputDefaultBase(String(illustrative.default_value_base));
    setInputBenchmark(String(illustrative.benchmark));
    setInputDefaultBenchmark(
      illustrative.default_benchmark !== null ? String(illustrative.default_benchmark) : ""
    );
    setInputFaf(String(illustrative.free_allocation_factor));
    setInputCscf(String(illustrative.cscf));
    setInputDefaultMarkup(String(illustrative.default_markup));
    setInputPrice(String(illustrative.certificate_price));
    setPlantCutPercent(0);
    setIsIllustrativePreset(true);
  };

  // Compute effective verified SEE with the plant reduction slider
  const effectiveVerifiedSee = useMemo(() => {
    const base = inputVerifiedSee.trim() === "" ? 1.90 : Number(inputVerifiedSee);
    const cutMultiplier = 1 - plantCutPercent / 100;
    return Math.max(0, base * cutMultiplier);
  }, [inputVerifiedSee, plantCutPercent]);

  // Compute CBAM calculation live
  const { comparison, missingParameters } = useMemo(() => {
    const tonnesVal = inputTonnes.trim() === "" ? null : Number(inputTonnes);
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
      verified_see: effectiveVerifiedSee,
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
    effectiveVerifiedSee,
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
  const coverageBp = report?.coverage?.coverage_bp ?? 5000;

  // Rubber stamp text & styling
  const stampConfig = useMemo(() => {
    if (!isReportValid) {
      return {
        text: "ALTERED",
        classes: "border-red-600 text-red-600 bg-red-500/10 dark:text-red-400 dark:border-red-400",
      };
    }
    if (coverageBp < 10000) {
      return {
        text: "PARTLY VERIFIED",
        classes: "border-amber-600 text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:border-amber-400",
      };
    }
    return {
      text: "VERIFIED",
      classes: "border-emerald-600 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-400",
    };
  }, [isReportValid, coverageBp]);

  const getCheckPassed = (ids: string[], fallback: boolean = true) => {
    if (!verificationResult) return fallback;
    const matched = verificationResult.checks.filter((c) => ids.includes(c.id));
    if (matched.length === 0) return fallback;
    return matched.every((c) => c.passed);
  };

  // Expandable 7 checks list dynamically bound to real verifier checks
  const checksList = [
    {
      id: "schema",
      label: "Data structure and integrity",
      passed: verificationResult?.schemaValid ?? true,
    },
    {
      id: "root",
      label: "Period Merkle root recomputation",
      passed: getCheckPassed(["period_merkle_root", "period_root_match"], isReportValid),
    },
    {
      id: "inclusion",
      label: "Batch root inclusion in period tree",
      passed: getCheckPassed(["inclusion_proofs", "batches_verified"], isReportValid),
    },
    {
      id: "sig",
      label: "Device ECDSA signature verification",
      passed: getCheckPassed(["signature_check"], isReportValid),
    },
    {
      id: "chain",
      label: "Hash-chain & sequence continuity check",
      passed: getCheckPassed(["chain_continuity", "coverage_match"], isReportValid),
    },
    {
      id: "registry",
      label: "On-chain attestation & totals match",
      passed: getCheckPassed(
        ["attestation_exists", "installation_match", "emissions_totals_match"],
        isReportValid
      ),
    },
    {
      id: "cbam",
      label: "CBAM regulation alignment check",
      passed: (report?.cbam_aligned ?? true) && (verificationResult?.schemaValid ?? true),
    },
  ];
  const failedChecksCount = checksList.filter((c) => !c.passed).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Portal Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-hairline">
        <div className="space-y-0.5">
          <h1 className="text-2xl sm:text-page-title text-ink font-heading font-bold tracking-tight">
            Buyer CBAM customs clearance
          </h1>
        </div>

        <div data-guide="valid-toggle" className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="load-valid-report-btn"
            onClick={handleLoadValidSample}
            className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer transition-colors ${
              tamperMode === "valid" && isReportValid
                ? "bg-surface-soft border-ink text-ink"
                : "bg-surface border-hairline text-muted-strong hover:text-ink"
            }`}
          >
            Valid report
          </button>
          <button
            type="button"
            data-testid="load-1digit-tamper-btn"
            onClick={handleLoadOneDigitTamper}
            className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer transition-colors ${
              tamperMode === "1digit" && !isReportValid
                ? "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400 font-bold"
                : "bg-surface border-hairline text-muted-strong hover:text-red-600"
            }`}
          >
            1-digit edit
          </button>
          <button
            type="button"
            data-testid="load-missing-hours-btn"
            onClick={handleLoadMissingHoursTamper}
            className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer transition-colors ${
              tamperMode === "omission" && !isReportValid
                ? "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400 font-bold"
                : "bg-surface border-hairline text-muted-strong hover:text-red-600"
            }`}
          >
            Missing hours
          </button>
          <button
            type="button"
            data-testid="load-tampered-report-btn"
            onClick={handleLoadTamperedSample}
            className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer transition-colors ${
              tamperMode === "root" && !isReportValid
                ? "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400 font-bold"
                : "bg-surface border-hairline text-muted-strong hover:text-red-600"
            }`}
          >
            Tampered
          </button>
        </div>
      </div>

      <PageHint
        what="Customs verification: review telemetry proofs and inspect the CBAM-aligned invoice comparison."
        nextLabel="See what we catch and miss"
        nextTo="/benchmark"
      />

      {/* 2. Main 12-Column Grid: Left (5 cols) Shipment & Proof | Right (7 cols) Receipt */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 cols): Shipment boarding pass strip & Proof ledger */}
        <div className="lg:col-span-5 space-y-4">
          {/* Boarding Pass Style Strip */}
          <div className="bg-surface border border-hairline rounded-card p-5 relative overflow-hidden shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-hairline pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted block">
                  Customs Manifest
                </span>
                <span className="text-xs font-semibold text-ink">
                  Consignment #{report?.attestation_id ?? 1}
                </span>
              </div>

              {/* Large Rubber Stamp with 200 ms stamp-in */}
              <motion.div
                key={`${stampConfig.text}-${verifyPulseKey}`}
                initial={prefersReducedMotion ? false : { scale: 1.4, opacity: 0, rotate: -15 }}
                animate={{ scale: 1, opacity: 1, rotate: -7 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`px-3 py-1 text-xs sm:text-sm font-black font-mono tracking-widest border-2 rounded uppercase select-none transform -rotate-6 shadow-sm ${stampConfig.classes}`}
              >
                {stampConfig.text}
              </motion.div>
            </div>

            {/* Boarding-Pass Data Points */}
            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-muted">Routing</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  Example shipment
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted block">Plant (ID)</span>
                  <span className="font-mono font-medium text-ink truncate block text-[11px]">
                    {report?.installation_id ?? "INST-CAMPD-1073"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted block">Port</span>
                  <span className="font-medium text-ink block text-[11px]">Rotterdam (NL)</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted block">Buyer</span>
                  <span className="font-medium text-ink block text-[11px]">EU Importer AG</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-hairline">
              <div>
                <span className="text-[10px] uppercase font-mono text-muted block">Product Line</span>
                <span className="font-medium text-ink text-[11px] block">Crude Steel (Agglomerated)</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-muted block">Period Window</span>
                <span className="font-mono text-[11px] text-ink block">
                  {report?.period?.start_utc ? "2025-01-01 (00:00–15:00 UTC)" : "2025-01-01"}
                </span>
              </div>
            </div>

            {/* Tonnes slider (100–2000, default 500) */}
            <div className="pt-2 border-t border-hairline space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-strong font-medium">Consignment mass:</span>
                <span className="font-mono font-bold text-ink">
                  {Number(inputTonnes).toLocaleString("en-US")} tonnes
                </span>
              </div>
              <input
                data-guide="tonnes-slider"
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

            {/* Replace the green banner and '7 checks passed' with one expandable '7 checks' */}
            <div className="pt-2 border-t border-hairline text-xs">
              <button
                type="button"
                onClick={() => setShowChecks((prev) => !prev)}
                aria-expanded={showChecks}
                className="w-full flex items-center justify-between text-muted-strong font-medium py-1 hover:text-ink cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  {isReportValid ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  )}
                  <span className="font-semibold text-ink">
                    7 checks {isReportValid ? "passed" : `(${failedChecksCount} failed)`}
                  </span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showChecks ? "rotate-180" : ""}`} />
              </button>

              {!isReportValid && verificationResult?.errors?.[0] && (
                <div className="mt-1.5 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-[11px] font-mono text-red-700 dark:text-red-300">
                  ✗ {verificationResult.errors[0]}
                </div>
              )}

              {showChecks && (
                <div className="pt-2 pl-2 space-y-1 text-[11px] font-mono text-muted-strong border-t border-hairline mt-1">
                  {checksList.map((chk) => (
                    <div key={chk.id} className="flex items-center justify-between">
                      <span className="font-sans text-[11px]">{chk.label}</span>
                      {chk.passed ? (
                        <span className="text-emerald-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-600 font-bold">✕</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Vertical "Proof ledger" */}
          <div className="bg-surface border border-hairline rounded-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <div>
                <h2 className="text-sm font-heading font-bold text-ink">
                  Proof ledger
                </h2>
                <p className="text-[11px] text-muted-strong">
                  {report ? `${report.coverage.verified_batches} of ${report.coverage.total_batches} batches verified` : "Ledger entries"}
                </p>
              </div>

              {/* Verify Icon Button (animates tick or cross) */}
              <button
                type="button"
                onClick={handleVerifyButtonClick}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-surface-soft border border-hairline hover:bg-hairline text-ink cursor-pointer transition-colors"
                title="Re-run browser telemetry check"
              >
                {isVerifying ? (
                  <RotateCw className="w-3.5 h-3.5 text-brand animate-spin" />
                ) : !isReportValid ? (
                  <motion.span
                    key={`cross-${verifyPulseKey}`}
                    initial={prefersReducedMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="w-3.5 h-3.5 text-red-600" />
                  </motion.span>
                ) : (
                  <motion.span
                    key={`tick-${verifyPulseKey}`}
                    initial={prefersReducedMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  </motion.span>
                )}
                <span>Verify</span>
              </button>
            </div>

            {/* Ledger Rows: Fade in one by one (150-250ms) */}
            <div className="space-y-2">
              {/* Batch 1 Row */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0 }}
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  !isReportValid
                    ? "border-red-500/60 bg-red-500/10 text-red-950 dark:text-red-200"
                    : "border-hairline bg-surface-soft"
                }`}
              >
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        !isReportValid ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                      }`}
                    />
                    <span className="font-semibold text-ink">Batch #1</span>
                    <span className="text-[11px] font-mono text-muted">Seq 000–007</span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-medium ${
                      !isReportValid ? "text-red-600 font-bold" : "text-emerald-600"
                    }`}
                  >
                    {!isReportValid ? "Root mismatch" : "Verified"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-strong pt-1 border-t border-hairline/60">
                  <span className="truncate">
                    {!isReportValid ? "Altered period Merkle root" : "Attested root"}
                  </span>
                  <span className="font-mono text-[10px]">
                    {report?.merkle_roots?.[0] ? `${report.merkle_roots[0].slice(0, 10)}...` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Batch 2 Row (Quarantined) */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.08 }}
                className="p-3 rounded-lg border border-hairline bg-surface-soft text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-semibold text-ink">Batch #2</span>
                    <span className="text-[11px] font-mono text-muted">Seq 008–015</span>
                  </div>
                  <span className="text-[11px] font-mono text-red-600 dark:text-red-400 font-medium">
                    Deposit slashed
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="px-2 py-0.5 rounded bg-surface border border-hairline text-ink text-[10px]">
                    Fuel vs. stack mismatch
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface border border-hairline text-ink text-[10px]">
                    Mass-balance residual
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface border border-hairline text-ink text-[10px]">
                    Repeated pattern anomaly
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Smaller Drop JSON area */}
            <div
              data-testid="dropzone-area"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("report-file-input")?.click()}
              role="button"
              tabIndex={0}
              className={`p-2 border border-dashed rounded flex items-center justify-center gap-2 cursor-pointer text-xs transition-colors ${
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
              <span className="text-muted-strong text-[11px]">
                Drop JSON to re-verify
              </span>
            </div>

            {uploadError && (
              <p className="text-[11px] text-red-700 bg-red-500/10 px-2 py-1 rounded border border-red-200 font-mono">
                {uploadError}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Customs Receipt & Calculations */}
        <div className="lg:col-span-7 space-y-4">
          {/* Printed Invoice / Customs Receipt */}
          <div className="bg-surface border border-hairline rounded-card p-5 space-y-4 shadow-sm font-sans">
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <div>
                <span className="text-sm font-heading font-bold text-ink">
                  Estimated CBAM cost (example)
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-strong">
                Currency: EUR (€)
              </span>
            </div>

            {/* Receipt Table Header */}
            <div className="flex items-baseline justify-between text-[11px] font-mono text-muted uppercase pb-1 border-b border-hairline">
              <span>Line item</span>
              <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 shrink-0">
                <span>Default value</span>
                <span>Verified data</span>
              </div>
            </div>

            {/* Line items with dotted leaders and draw-in animation */}
            <div className="space-y-2 text-xs">
              {/* Item 1: Emissions per tonne */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0.02 }}
                className="flex items-baseline justify-between"
              >
                <span className="text-muted-strong shrink-0">Emissions per tonne</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-muted-strong">
                    {comparison ? `${comparison.default_see_with_markup.toFixed(3)} t` : "--"}
                  </span>
                  <span className="text-ink font-semibold">
                    {comparison ? `${effectiveVerifiedSee.toFixed(3)} t` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Item 2: Minus free allocation */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.05 }}
                className="flex items-baseline justify-between"
              >
                <span className="text-muted-strong shrink-0">Minus free allocation</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-muted-strong">
                    {comparison ? `-${comparison.sefa_default.toFixed(3)} t` : "--"}
                  </span>
                  <span className="text-ink font-semibold">
                    {comparison ? `-${comparison.sefa_verified.toFixed(3)} t` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Item 3: Payable per tonne */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.08 }}
                className="flex items-baseline justify-between"
              >
                <span className="text-muted-strong shrink-0">Payable per tonne</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-muted-strong">
                    {comparison ? `${comparison.payable_per_tonne_default.toFixed(3)} t` : "--"}
                  </span>
                  <span className="text-ink font-semibold">
                    {comparison ? `${comparison.payable_per_tonne_verified.toFixed(3)} t` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Item 4: Tonnes */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.11 }}
                className="flex items-baseline justify-between"
              >
                <span className="text-muted-strong shrink-0">Tonnes</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-muted-strong">
                    {comparison ? `${comparison.tonnes_shipped.toFixed(1)} t` : "--"}
                  </span>
                  <span className="text-ink font-semibold">
                    {comparison ? `${comparison.tonnes_shipped.toFixed(1)} t` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Item 5: Price */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.14 }}
                className="flex items-baseline justify-between"
              >
                <span className="text-muted-strong shrink-0">Price</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-muted-strong">
                    {comparison ? `€${comparison.certificate_price.toFixed(2)}` : "--"}
                  </span>
                  <span className="text-ink font-semibold">
                    {comparison ? `€${comparison.certificate_price.toFixed(2)}` : "--"}
                  </span>
                </div>
              </motion.div>

              {/* Total Row */}
              <div className="border-b-2 border-hairline my-2" />

              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : 0.17 }}
                className="flex items-baseline justify-between pt-1"
              >
                <span className="text-ink font-bold shrink-0 text-sm">Total</span>
                <span className="flex-1 border-b border-dotted border-hairline mx-2" />
                <div className="grid grid-cols-2 gap-3 text-right w-48 sm:w-56 font-mono shrink-0">
                  <span className="text-ink font-bold text-base">
                    {comparison
                      ? `€${comparison.cost_with_default_eur.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "--"}
                  </span>
                  <span className="text-brand font-bold text-base">
                    {comparison
                      ? `€${comparison.cost_with_verified_eur.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "--"}
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Disclosed note directly under the total */}
            <div className="text-[11px] text-muted font-mono pt-1 text-right sm:text-left">
              Example numbers, not real product values
            </div>
          </div>

          {/* Black Strip: "You save EUR x" (largest number on page, count-up) */}
          <div className="bg-[#0A0A0A] text-white rounded-card p-5 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-white/70 block font-mono">
                Customs assessment savings
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
                  <>
                    €<NumberTicker value={comparison.savings_eur} decimalPlaces={2} className="text-[#FF6B6B] dark:text-[#FF6B6B] inline" />
                  </>
                ) : (
                  "--"
                )}
              </span>
              {comparison && comparison.cost_with_default_eur > 0 && comparison.cost_with_verified_eur > 0 && (
                <span className="text-xs font-mono text-white/70">
                  ({((comparison.savings_eur / comparison.cost_with_default_eur) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          {/* Second Slider: "If the plant cut its emissions by" 0-30% */}
          <div className="p-4 bg-surface border border-hairline rounded-card space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-strong font-medium">
                If the plant cut its emissions by
              </span>
              <span className="font-heading font-bold text-ink text-sm">
                {plantCutPercent}% reduction
              </span>
            </div>
            <input
              data-guide="cut-slider"
              type="range"
              min="0"
              max="30"
              step="1"
              value={plantCutPercent}
              onChange={(e) => {
                setPlantCutPercent(Number(e.target.value));
                setIsIllustrativePreset(false);
              }}
              className="w-full accent-brand cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted font-mono">
              <span>0% (actual 1.90 tCO₂e/t)</span>
              <span>15%</span>
              <span>30%</span>
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

          {/* Collapsible Inputs Panel (Inputs collapsed by default) */}
          <div className="border border-hairline rounded-card overflow-hidden bg-surface shadow-sm">
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
                    {inputPrice.trim() === "" && (
                      <span className="text-[10px] text-amber-600 block">needs source</span>
                    )}
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
