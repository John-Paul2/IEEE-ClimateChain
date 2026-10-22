/**
 * Configuration-driven EU CBAM cost calculator (TypeScript port for the web app).
 *
 * Important Regulatory & Modelling Notes:
 * - Net Liability Model: This calculator computes **net CBAM financial liability after the
 *   free-allocation adjustment** (SEFA = free_allocation_factor(year) * CSCF(year) * benchmark).
 * - Default-Value Benchmark Distinction [VERIFY]: When an importer relies on default SEE values
 *   rather than actual verified installation data, specific default-value benchmarks may apply
 *   under Implementing Regulation (EU) 2025/2620 / 2025/2621 [VERIFY]. Accordingly, this module
 *   supports an optional `default_benchmark` parameter that defaults to `benchmark` when not
 *   separately specified.
 * - Honesty Rules (AGENTS.md): Regulatory parameters without verified sources in
 *   `calculator/config/cbam_config.json` are stored as `null` (`"status": "NEEDS_SOURCE"`).
 *   Attempting to compute CBAM liability when any required parameter is `null` throws
 *   `NeedsSourceError` identifying the missing parameter(s) so the UI can display `"needs source"`.
 */

import rawCbamConfig from "../../../calculator/config/cbam_config.json" with { type: "json" };
import rawCbamSources from "../../../calculator/sources.json" with { type: "json" };

export type ParameterStatus = "VERIFIED_SECONDARY" | "NEEDS_SOURCE";

export interface SourcedParameter<T = number | null> {
  value: T;
  status: ParameterStatus;
  last_verified: string | null;
  source: string;
  quarter?: string;
  route?: string | null;
  cn_code?: string | null;
  country?: string | null;
}

export interface CBAMConfig {
  schema_version: string;
  description: string;
  price_eur_per_tco2e: SourcedParameter<number | null> & { quarter: string };
  free_allocation_factor_by_year: Record<string, SourcedParameter<number | null> | string>;
  cscf_by_year: Record<string, SourcedParameter<number | null> | string>;
  benchmark_tco2e_per_t: SourcedParameter<number | null> & { route: string | null };
  default_benchmark_tco2e_per_t: SourcedParameter<number | null> & { route: string | null };
  default_value_base_tco2e_per_t: SourcedParameter<number | null> & {
    cn_code: string | null;
    country: string | null;
  };
  default_markup_by_year: Record<string, SourcedParameter<number | null> | string>;
}

export interface FormulaStep {
  step_id: string;
  label: string;
  formula: string;
  substituted: string;
  result: number;
  unit: string;
}

export interface CBAMInputs {
  year: number;
  tonnes_shipped: number;
  verified_see: number;
  default_value_base: number;
  benchmark: number;
  free_allocation_factor: number;
  cscf: number;
  default_markup: number;
  certificate_price: number;
  default_benchmark?: number | null;
  price_quarter?: string;
  tag?: string | null;
}

export interface CBAMPartialInputs {
  year?: number;
  tonnes_shipped?: number | null;
  verified_see?: number | null;
  default_value_base?: number | null;
  benchmark?: number | null;
  default_benchmark?: number | null;
  free_allocation_factor?: number | null;
  cscf?: number | null;
  default_markup?: number | null;
  certificate_price?: number | null;
  price_quarter?: string;
  tag?: string | null;
}

export interface CBAMCalculationResult {
  year: number;
  price_quarter: string;
  net_liability_after_free_allocation: boolean;
  default_benchmark_note: string;
  tag: string | null;
  tonnes_shipped: number;
  verified_see: number;
  default_value_base: number;
  default_markup: number;
  default_see_with_markup: number;
  benchmark_verified: number;
  benchmark_default: number;
  free_allocation_factor: number;
  cscf: number;
  sefa_verified: number;
  sefa_default: number;
  payable_per_tonne_verified: number;
  payable_per_tonne_default: number;
  total_payable_tonnes_verified: number;
  total_payable_tonnes_default: number;
  certificate_price: number;
  cost_with_verified_eur: number;
  cost_with_default_eur: number;
  savings_per_tonne_tco2e: number;
  savings_eur: number;
  steps: FormulaStep[];
}

export class NeedsSourceError extends Error {
  public readonly missing_parameters: string[];

  constructor(missingParameters: string[] | string, message?: string) {
    const list = Array.isArray(missingParameters) ? missingParameters : [missingParameters];
    const defaultMsg =
      `Missing verified regulatory source for parameter(s): ${list.join(", ")} (status: NEEDS_SOURCE). ` +
      "Provide explicit override values or populate calculator/config/cbam_config.json from the primary EU text.";
    super(message ?? defaultMsg);
    this.name = "NeedsSourceError";
    this.missing_parameters = list;
    Object.setPrototypeOf(this, NeedsSourceError.prototype);
  }
}

export class CBAMValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CBAMValidationError";
    Object.setPrototypeOf(this, CBAMValidationError.prototype);
  }
}

/**
 * Deterministic round-half-to-even (banker's rounding) to `decimals` places,
 * matching Python's `Decimal.quantize(..., rounding=ROUND_HALF_EVEN)`.
 */
function roundHalfEven(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  // Scale via string/Number precision guard to eliminate binary float representation drift
  const scaled = Number(
    (Math.round(Number((value * factor).toPrecision(15)) * 1e6) / 1e6).toFixed(8)
  );
  const floorVal = Math.floor(scaled);
  const diff = scaled - floorVal;
  const eps = 1e-9;

  let roundedInt: number;
  if (Math.abs(diff - 0.5) <= eps) {
    roundedInt = floorVal % 2 === 0 ? floorVal : floorVal + 1;
  } else if (diff > 0.5) {
    roundedInt = floorVal + 1;
  } else {
    roundedInt = floorVal;
  }
  const res = roundedInt / factor;
  return Object.is(res, -0) ? 0 : Number(res.toFixed(decimals));
}

function round6(value: number): number {
  return roundHalfEven(value, 6);
}

function round2(value: number): number {
  return roundHalfEven(value, 2);
}

function formatNum(val: number, minDecimals: number = 2): string {
  const r6 = round6(val).toFixed(6).replace(/0+$/, "");
  if (r6.includes(".")) {
    const [intPart, decPart] = r6.split(".");
    const paddedDec =
      decPart.length < minDecimals ? decPart.padEnd(minDecimals, "0") : decPart;
    return paddedDec.length > 0 ? `${intPart}.${paddedDec}` : intPart;
  }
  if (minDecimals > 0) {
    return `${r6}.${"0".repeat(minDecimals)}`;
  }
  return r6;
}

function validateNonNegative(val: number | null | undefined, name: string): number {
  if (val === null || val === undefined) {
    throw new NeedsSourceError(name);
  }
  if (typeof val !== "number" || Number.isNaN(val) || !Number.isFinite(val)) {
    throw new CBAMValidationError(`Parameter '${name}' must be a finite number.`);
  }
  if (val < 0) {
    throw new CBAMValidationError(`Parameter '${name}' cannot be negative (got ${val}).`);
  }
  return val;
}

/**
 * Compute Specific Embedded Free Allocation (SEFA):
 * SEFA = free_allocation_factor(year) * CSCF(year) * benchmark
 */
export function calculateSefa(
  freeAllocationFactor: number | null | undefined,
  cscf: number | null | undefined,
  benchmark: number | null | undefined
): number {
  const missing: string[] = [];
  if (freeAllocationFactor === null || freeAllocationFactor === undefined) {
    missing.push("free_allocation_factor");
  }
  if (cscf === null || cscf === undefined) {
    missing.push("cscf");
  }
  if (benchmark === null || benchmark === undefined) {
    missing.push("benchmark");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const faf = validateNonNegative(freeAllocationFactor, "free_allocation_factor");
  if (faf > 1) {
    throw new CBAMValidationError(
      `Parameter 'free_allocation_factor' must be in [0, 1] (got ${freeAllocationFactor}).`
    );
  }
  const cscfVal = validateNonNegative(cscf, "cscf");
  const benchVal = validateNonNegative(benchmark, "benchmark");
  return round6(faf * cscfVal * benchVal);
}

/**
 * Compute marked-up default Specific Embedded Emissions:
 * default_SEE_with_markup = default_value_base * (1 + markup(year))
 */
export function calculateDefaultSeeWithMarkup(
  defaultValueBase: number | null | undefined,
  markup: number | null | undefined
): number {
  const missing: string[] = [];
  if (defaultValueBase === null || defaultValueBase === undefined) {
    missing.push("default_value_base");
  }
  if (markup === null || markup === undefined) {
    missing.push("default_markup");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const base = validateNonNegative(defaultValueBase, "default_value_base");
  const mk = validateNonNegative(markup, "default_markup");
  return round6(base * (1 + mk));
}

/**
 * Compute net payable Specific Embedded Emissions per tonne of product (floored at zero):
 * payable_per_tonne = max(0, SEE - SEFA)
 */
export function calculatePayablePerTonne(
  see: number | null | undefined,
  sefa: number | null | undefined
): number {
  const missing: string[] = [];
  if (see === null || see === undefined) {
    missing.push("see");
  }
  if (sefa === null || sefa === undefined) {
    missing.push("sefa");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const seeVal = validateNonNegative(see, "see");
  const sefaVal = validateNonNegative(sefa, "sefa");
  const diff = round6(seeVal - sefaVal);
  return diff > 0 ? diff : 0;
}

/**
 * Compute total CBAM certificate cost in EUR (rounded half-to-even to 2 decimal places):
 * cost_eur = tonnes_shipped * payable_per_tonne * certificate_price
 */
export function calculateCostEur(
  tonnesShipped: number | null | undefined,
  payablePerTonne: number | null | undefined,
  certificatePrice: number | null | undefined
): number {
  const missing: string[] = [];
  if (tonnesShipped === null || tonnesShipped === undefined) {
    missing.push("tonnes_shipped");
  }
  if (payablePerTonne === null || payablePerTonne === undefined) {
    missing.push("payable_per_tonne");
  }
  if (certificatePrice === null || certificatePrice === undefined) {
    missing.push("certificate_price");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const tonnes = validateNonNegative(tonnesShipped, "tonnes_shipped");
  const payable = validateNonNegative(payablePerTonne, "payable_per_tonne");
  const price = validateNonNegative(certificatePrice, "certificate_price");
  return round2(tonnes * payable * price);
}

/**
 * Compute savings in EUR from using verified actual emissions instead of default values:
 * savings_eur = cost_with_default - cost_with_verified
 */
export function calculateSavingsEur(
  costWithDefault: number | null | undefined,
  costWithVerified: number | null | undefined
): number {
  const missing: string[] = [];
  if (costWithDefault === null || costWithDefault === undefined) {
    missing.push("cost_with_default");
  }
  if (costWithVerified === null || costWithVerified === undefined) {
    missing.push("cost_with_verified");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const defCost = validateNonNegative(costWithDefault, "cost_with_default");
  const verCost = validateNonNegative(costWithVerified, "cost_with_verified");
  return round2(defCost - verCost);
}

export function loadCbamConfig(): CBAMConfig {
  return rawCbamConfig as unknown as CBAMConfig;
}

export function loadCbamSources(): typeof rawCbamSources {
  return rawCbamSources;
}

function extractYearEntry(
  mapping: Record<string, SourcedParameter<number | null> | string>,
  year: number,
  fieldName: string
): number | null {
  const yearKey = String(year);
  if (!(yearKey in mapping)) {
    throw new NeedsSourceError(
      `${fieldName}[${yearKey}]`,
      `Year ${yearKey} is not configured in '${fieldName}' (status: NEEDS_SOURCE).`
    );
  }
  const entry = mapping[yearKey];
  if (typeof entry === "object" && entry !== null && "value" in entry) {
    return entry.value !== null && entry.value !== undefined ? Number(entry.value) : null;
  }
  return null;
}

/**
 * Resolve calculator inputs from `cbam_config.json`, applying explicit overrides.
 * Throws `NeedsSourceError` listing all required parameters that remain `null` (`NEEDS_SOURCE`).
 */
export function resolveInputsFromConfig(
  config: CBAMConfig,
  overrides: CBAMPartialInputs = {}
): CBAMInputs {
  const year = overrides.year ?? 2026;
  if (!Number.isInteger(year) || year < 2026) {
    throw new CBAMValidationError(`Parameter 'year' must be an integer >= 2026 (got ${year}).`);
  }

  const fafVal =
    overrides.free_allocation_factor !== undefined && overrides.free_allocation_factor !== null
      ? overrides.free_allocation_factor
      : extractYearEntry(
          config.free_allocation_factor_by_year,
          year,
          "free_allocation_factor_by_year"
        );

  const cscfVal =
    overrides.cscf !== undefined && overrides.cscf !== null
      ? overrides.cscf
      : extractYearEntry(config.cscf_by_year, year, "cscf_by_year");

  const markupVal =
    overrides.default_markup !== undefined && overrides.default_markup !== null
      ? overrides.default_markup
      : extractYearEntry(config.default_markup_by_year, year, "default_markup_by_year");

  const priceVal =
    overrides.certificate_price !== undefined && overrides.certificate_price !== null
      ? overrides.certificate_price
      : config.price_eur_per_tco2e.value;

  const priceQuarter = overrides.price_quarter ?? config.price_eur_per_tco2e.quarter ?? "2026-Q3";

  const benchVal =
    overrides.benchmark !== undefined && overrides.benchmark !== null
      ? overrides.benchmark
      : config.benchmark_tco2e_per_t.value;

  const defBenchVal =
    overrides.default_benchmark !== undefined && overrides.default_benchmark !== null
      ? overrides.default_benchmark
      : config.default_benchmark_tco2e_per_t.value;

  const defBaseVal =
    overrides.default_value_base !== undefined && overrides.default_value_base !== null
      ? overrides.default_value_base
      : config.default_value_base_tco2e_per_t.value;

  const missing: string[] = [];
  if (overrides.tonnes_shipped === null || overrides.tonnes_shipped === undefined) {
    missing.push("tonnes_shipped");
  }
  if (overrides.verified_see === null || overrides.verified_see === undefined) {
    missing.push("verified_see");
  }
  if (defBaseVal === null || defBaseVal === undefined) {
    missing.push("default_value_base_tco2e_per_t");
  }
  if (benchVal === null || benchVal === undefined) {
    missing.push("benchmark_tco2e_per_t");
  }
  if (fafVal === null || fafVal === undefined) {
    missing.push(`free_allocation_factor_by_year[${year}]`);
  }
  if (cscfVal === null || cscfVal === undefined) {
    missing.push(`cscf_by_year[${year}]`);
  }
  if (markupVal === null || markupVal === undefined) {
    missing.push(`default_markup_by_year[${year}]`);
  }
  if (priceVal === null || priceVal === undefined) {
    missing.push("price_eur_per_tco2e");
  }

  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  return {
    year,
    tonnes_shipped: Number(overrides.tonnes_shipped),
    verified_see: Number(overrides.verified_see),
    default_value_base: Number(defBaseVal),
    benchmark: Number(benchVal),
    free_allocation_factor: Number(fafVal),
    cscf: Number(cscfVal),
    default_markup: Number(markupVal),
    certificate_price: Number(priceVal),
    default_benchmark: defBenchVal !== null && defBenchVal !== undefined ? Number(defBenchVal) : null,
    price_quarter: priceQuarter,
    tag: overrides.tag ?? null,
  };
}

/**
 * Compute the full CBAM net liability comparison and step-by-step explanation.
 *
 * Computes net liability after the free-allocation adjustment (SEFA).
 * Note: Default-value benchmarks may differ from actual route benchmarks under
 * Implementing Regulation (EU) 2025/2620 / 2025/2621 [VERIFY]. If `default_benchmark`
 * is null/undefined, `benchmark` is used for both verified and default calculations.
 */
export function calculateCbamComparison(params: CBAMPartialInputs): CBAMCalculationResult {
  const year = params.year ?? 2026;
  if (!Number.isInteger(year) || year < 2026) {
    throw new CBAMValidationError(`Parameter 'year' must be an integer >= 2026 (got ${year}).`);
  }

  const missing: string[] = [];
  if (params.tonnes_shipped === null || params.tonnes_shipped === undefined) {
    missing.push("tonnes_shipped");
  }
  if (params.verified_see === null || params.verified_see === undefined) {
    missing.push("verified_see");
  }
  if (params.default_value_base === null || params.default_value_base === undefined) {
    missing.push("default_value_base");
  }
  if (params.benchmark === null || params.benchmark === undefined) {
    missing.push("benchmark");
  }
  if (params.free_allocation_factor === null || params.free_allocation_factor === undefined) {
    missing.push("free_allocation_factor");
  }
  if (params.cscf === null || params.cscf === undefined) {
    missing.push("cscf");
  }
  if (params.default_markup === null || params.default_markup === undefined) {
    missing.push("default_markup");
  }
  if (params.certificate_price === null || params.certificate_price === undefined) {
    missing.push("certificate_price");
  }
  if (missing.length > 0) {
    throw new NeedsSourceError(missing);
  }

  const tonnes = validateNonNegative(params.tonnes_shipped, "tonnes_shipped");
  const verSee = validateNonNegative(params.verified_see, "verified_see");
  const defBase = validateNonNegative(params.default_value_base, "default_value_base");
  const benchVer = validateNonNegative(params.benchmark, "benchmark");
  const benchDef =
    params.default_benchmark !== null && params.default_benchmark !== undefined
      ? validateNonNegative(params.default_benchmark, "default_benchmark")
      : benchVer;
  const faf = validateNonNegative(params.free_allocation_factor, "free_allocation_factor");
  if (faf > 1) {
    throw new CBAMValidationError(
      `Parameter 'free_allocation_factor' must be in [0, 1] (got ${params.free_allocation_factor}).`
    );
  }
  const cscf = validateNonNegative(params.cscf, "cscf");
  const markup = validateNonNegative(params.default_markup, "default_markup");
  const price = validateNonNegative(params.certificate_price, "certificate_price");
  const priceQuarter = params.price_quarter ?? "2026-Q3";

  const sefaVerified = calculateSefa(faf, cscf, benchVer);
  const sefaDefault = calculateSefa(faf, cscf, benchDef);
  const defaultSeeWithMarkup = calculateDefaultSeeWithMarkup(defBase, markup);

  const payableVerified = calculatePayablePerTonne(verSee, sefaVerified);
  const payableDefault = calculatePayablePerTonne(defaultSeeWithMarkup, sefaDefault);

  const totalPayableVerified = round6(tonnes * payableVerified);
  const totalPayableDefault = round6(tonnes * payableDefault);

  const costVerified = calculateCostEur(tonnes, payableVerified, price);
  const costDefault = calculateCostEur(tonnes, payableDefault, price);
  const savingsEur = calculateSavingsEur(costDefault, costVerified);
  const savingsPerT = round6(payableDefault - payableVerified);

  const steps: FormulaStep[] = [
    {
      step_id: "sefa",
      label: "Specific Embedded Free Allocation (SEFA)",
      formula: "SEFA = free_allocation_factor(year) * CSCF(year) * benchmark",
      substituted: `SEFA = ${formatNum(faf, 3)} * ${formatNum(cscf, 2)} * ${formatNum(benchVer, 2)} = ${formatNum(sefaVerified, 3)} tCO2e/t`,
      result: sefaVerified,
      unit: "tCO2e/t",
    },
    {
      step_id: "default_see_with_markup",
      label: "Default SEE with annual markup",
      formula: "default_SEE_with_markup = default_value_base * (1 + markup(year))",
      substituted: `default_SEE_with_markup = ${formatNum(defBase, 2)} * (1 + ${formatNum(markup, 2)}) = ${formatNum(defaultSeeWithMarkup, 2)} tCO2e/t`,
      result: defaultSeeWithMarkup,
      unit: "tCO2e/t",
    },
    {
      step_id: "payable_per_tonne_verified",
      label: "Payable emissions per tonne (with verified data)",
      formula: "payable_per_tonne_verified = max(0, verified_SEE - SEFA)",
      substituted: `payable_per_tonne_verified = max(0, ${formatNum(verSee, 2)} - ${formatNum(sefaVerified, 3)}) = ${formatNum(payableVerified, 3)} tCO2e/t`,
      result: payableVerified,
      unit: "tCO2e/t",
    },
    {
      step_id: "payable_per_tonne_default",
      label: "Payable emissions per tonne (with default value)",
      formula: "payable_per_tonne_default = max(0, default_SEE_with_markup - SEFA)",
      substituted: `payable_per_tonne_default = max(0, ${formatNum(defaultSeeWithMarkup, 2)} - ${formatNum(sefaDefault, 3)}) = ${formatNum(payableDefault, 3)} tCO2e/t`,
      result: payableDefault,
      unit: "tCO2e/t",
    },
    {
      step_id: "cost_with_verified",
      label: "CBAM certificate cost (with verified data)",
      formula: "cost_with_verified = tonnes_shipped * payable_per_tonne_verified * certificate_price",
      substituted: `cost_with_verified = ${formatNum(tonnes, 0)} * ${formatNum(payableVerified, 3)} * ${formatNum(price, 2)} = EUR ${costVerified.toFixed(2)}`,
      result: costVerified,
      unit: "EUR",
    },
    {
      step_id: "cost_with_default",
      label: "CBAM certificate cost (with default value)",
      formula: "cost_with_default = tonnes_shipped * payable_per_tonne_default * certificate_price",
      substituted: `cost_with_default = ${formatNum(tonnes, 0)} * ${formatNum(payableDefault, 3)} * ${formatNum(price, 2)} = EUR ${costDefault.toFixed(2)}`,
      result: costDefault,
      unit: "EUR",
    },
    {
      step_id: "savings_eur",
      label: "Savings from verified installation data",
      formula: "savings_eur = cost_with_default - cost_with_verified",
      substituted: `savings_eur = ${costDefault.toFixed(2)} - ${costVerified.toFixed(2)} = EUR ${savingsEur.toFixed(2)}`,
      result: savingsEur,
      unit: "EUR",
    },
  ];

  const defaultBenchmarkNote =
    "Net liability after free-allocation adjustment (SEFA). Note: when default SEE values are used, " +
    "specific default-value benchmarks may apply under Implementing Regulation (EU) 2025/2620 / 2025/2621 [VERIFY].";

  return {
    year,
    price_quarter: priceQuarter,
    net_liability_after_free_allocation: true,
    default_benchmark_note: defaultBenchmarkNote,
    tag: params.tag ?? null,
    tonnes_shipped: round6(tonnes),
    verified_see: round6(verSee),
    default_value_base: round6(defBase),
    default_markup: round6(markup),
    default_see_with_markup: defaultSeeWithMarkup,
    benchmark_verified: round6(benchVer),
    benchmark_default: round6(benchDef),
    free_allocation_factor: round6(faf),
    cscf: round6(cscf),
    sefa_verified: sefaVerified,
    sefa_default: sefaDefault,
    payable_per_tonne_verified: payableVerified,
    payable_per_tonne_default: payableDefault,
    total_payable_tonnes_verified: totalPayableVerified,
    total_payable_tonnes_default: totalPayableDefault,
    certificate_price: round2(price),
    cost_with_verified_eur: costVerified,
    cost_with_default_eur: costDefault,
    savings_per_tonne_tco2e: savingsPerT,
    savings_eur: savingsEur,
    steps,
  };
}

/**
 * Return the step-by-step formula breakdown (each formula line with numbers substituted) for UI display.
 */
export function explainCbamCalculation(result: CBAMCalculationResult): FormulaStep[] {
  return result.steps.map((s) => ({ ...s }));
}

/**
 * Return the Guide Section 14 Appendix A worked example inputs, explicitly tagged ILLUSTRATIVE.
 */
export function getIllustrativeExampleInputs(): CBAMInputs {
  const config = loadCbamConfig();
  return resolveInputsFromConfig(config, {
    year: 2026,
    tonnes_shipped: 500.0,
    verified_see: 1.9,
    default_value_base: 2.3,
    benchmark: 1.4,
    cscf: 1.0,
    tag: "ILLUSTRATIVE",
  });
}
