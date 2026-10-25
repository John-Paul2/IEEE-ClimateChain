"""Configuration-driven EU CBAM cost calculator (reference Python implementation).

Important Regulatory & Modelling Notes:
- Net Liability Model: This calculator computes **net CBAM financial liability after the
  free-allocation adjustment** (SEFA = free_allocation_factor(year) * CSCF(year) * benchmark).
- Default-Value Benchmark Distinction [VERIFY]: When an importer relies on default SEE values
  rather than actual verified installation data, specific default-value benchmarks may apply
  under Implementing Regulation (EU) 2025/2620 / 2025/2621 [VERIFY]. Accordingly, this module
  supports an optional `default_benchmark` parameter that defaults to `benchmark` when not
  separately specified.
- Honesty Rules (AGENTS.md): Regulatory parameters without verified sources in
  `calculator/config/cbam_config.json` are stored as `null` (`"status": "NEEDS_SOURCE"`).
  Attempting to compute CBAM liability when any required parameter is `null` raises
  `NeedsSourceError` identifying the missing parameter(s) so the UI can display `"needs source"`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_EVEN
import json
import math
from pathlib import Path
from typing import Any, Mapping


CONFIG_PATH = Path(__file__).resolve().parent / "config" / "cbam_config.json"
SOURCES_PATH = Path(__file__).resolve().parent / "sources.json"


class NeedsSourceError(ValueError):
    """Raised when one or more required CBAM regulatory parameters are null (status: NEEDS_SOURCE)."""

    def __init__(self, missing_parameters: list[str] | str, message: str | None = None) -> None:
        if isinstance(missing_parameters, str):
            self.missing_parameters = [missing_parameters]
        else:
            self.missing_parameters = list(missing_parameters)
        joined = ", ".join(self.missing_parameters)
        default_msg = (
            f"Missing verified regulatory source for parameter(s): {joined} (status: NEEDS_SOURCE). "
            "Provide explicit override values or populate calculator/config/cbam_config.json from the primary EU text."
        )
        super().__init__(message or default_msg)


class CBAMValidationError(ValueError):
    """Raised when numerical inputs to the CBAM calculator are negative, NaN, infinite, or out of range."""


@dataclass(frozen=True)
class FormulaStep:
    """Single step in the step-by-step formula breakdown for UI display."""

    step_id: str
    label: str
    formula: str
    substituted: str
    result: float
    unit: str


@dataclass(frozen=True)
class CBAMInputs:
    """Validated inputs for a CBAM net liability and default-vs-verified comparison."""

    year: int
    tonnes_shipped: float
    verified_see: float
    default_value_base: float
    benchmark: float
    free_allocation_factor: float
    cscf: float
    default_markup: float
    certificate_price: float
    default_benchmark: float | None = None
    price_quarter: str = "2026-Q3"
    tag: str | None = None


@dataclass(frozen=True)
class CBAMCalculationResult:
    """Complete deterministic output of the CBAM net liability comparison."""

    year: int
    price_quarter: str
    net_liability_after_free_allocation: bool
    default_benchmark_note: str
    tag: str | None
    tonnes_shipped: float
    verified_see: float
    default_value_base: float
    default_markup: float
    default_see_with_markup: float
    benchmark_verified: float
    benchmark_default: float
    free_allocation_factor: float
    cscf: float
    sefa_verified: float
    sefa_default: float
    payable_per_tonne_verified: float
    payable_per_tonne_default: float
    total_payable_tonnes_verified: float
    total_payable_tonnes_default: float
    certificate_price: float
    cost_with_verified_eur: float
    cost_with_default_eur: float
    savings_per_tonne_tco2e: float
    savings_eur: float
    steps: list[FormulaStep]

    def to_dict(self) -> dict[str, Any]:
        """Serialize result to a plain JSON-compatible dictionary."""
        return asdict(self)


def _to_decimal(val: float | int | Decimal, name: str) -> Decimal:
    if isinstance(val, bool) or val is None:
        raise NeedsSourceError(name)
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            raise CBAMValidationError(f"Parameter '{name}' must be a finite number.")
    try:
        return Decimal(str(val))
    except Exception as exc:
        raise CBAMValidationError(f"Invalid numeric value for '{name}': {val}") from exc


def _round_6(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN))


def _round_2(val: Decimal) -> float:
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))


def _fmt_num(val: float, decimals: int = 2) -> str:
    d = Decimal(str(val))
    # Format cleanly: preserve at least `decimals` places, up to 6 without trailing zeros
    quant6 = d.quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
    s = f"{quant6:f}".rstrip("0")
    if "." in s:
        int_part, dec_part = s.split(".")
        if len(dec_part) < decimals:
            dec_part = dec_part.ljust(decimals, "0")
        return f"{int_part}.{dec_part}" if dec_part else int_part
    if decimals > 0:
        return f"{s}." + ("0" * decimals)
    return s


def _validate_non_negative(val: float | int | None, name: str) -> Decimal:
    if val is None:
        raise NeedsSourceError(name)
    d = _to_decimal(val, name)
    if d < Decimal("0"):
        raise CBAMValidationError(f"Parameter '{name}' cannot be negative (got {val}).")
    return d


def calculate_sefa(
    free_allocation_factor: float | None,
    cscf: float | None,
    benchmark: float | None,
) -> float:
    """Compute Specific Embedded Free Allocation (SEFA):

    SEFA = free_allocation_factor(year) * CSCF(year) * benchmark
    """
    missing: list[str] = []
    if free_allocation_factor is None:
        missing.append("free_allocation_factor")
    if cscf is None:
        missing.append("cscf")
    if benchmark is None:
        missing.append("benchmark")
    if missing:
        raise NeedsSourceError(missing)

    faf_d = _validate_non_negative(free_allocation_factor, "free_allocation_factor")
    if faf_d > Decimal("1"):
        raise CBAMValidationError(
            f"Parameter 'free_allocation_factor' must be in [0, 1] (got {free_allocation_factor})."
        )
    cscf_d = _validate_non_negative(cscf, "cscf")
    bench_d = _validate_non_negative(benchmark, "benchmark")
    return _round_6(faf_d * cscf_d * bench_d)


def calculate_default_see_with_markup(
    default_value_base: float | None,
    markup: float | None,
) -> float:
    """Compute marked-up default Specific Embedded Emissions:

    default_SEE_with_markup = default_value_base * (1 + markup(year))
    """
    missing: list[str] = []
    if default_value_base is None:
        missing.append("default_value_base")
    if markup is None:
        missing.append("default_markup")
    if missing:
        raise NeedsSourceError(missing)

    base_d = _validate_non_negative(default_value_base, "default_value_base")
    markup_d = _validate_non_negative(markup, "default_markup")
    return _round_6(base_d * (Decimal("1") + markup_d))


def calculate_payable_per_tonne(
    see: float | None,
    sefa: float | None,
) -> float:
    """Compute net payable Specific Embedded Emissions per tonne of product (floored at zero):

    payable_per_tonne = max(0, SEE - SEFA)
    """
    missing: list[str] = []
    if see is None:
        missing.append("see")
    if sefa is None:
        missing.append("sefa")
    if missing:
        raise NeedsSourceError(missing)

    see_d = _validate_non_negative(see, "see")
    sefa_d = _validate_non_negative(sefa, "sefa")
    diff = see_d - sefa_d
    payable = diff if diff > Decimal("0") else Decimal("0")
    return _round_6(payable)


def calculate_cost_eur(
    tonnes_shipped: float | None,
    payable_per_tonne: float | None,
    certificate_price: float | None,
) -> float:
    """Compute total CBAM certificate cost in EUR (rounded half-to-even to 2 decimal places):

    cost_eur = tonnes_shipped * payable_per_tonne * certificate_price
    """
    missing: list[str] = []
    if tonnes_shipped is None:
        missing.append("tonnes_shipped")
    if payable_per_tonne is None:
        missing.append("payable_per_tonne")
    if certificate_price is None:
        missing.append("certificate_price")
    if missing:
        raise NeedsSourceError(missing)

    tonnes_d = _validate_non_negative(tonnes_shipped, "tonnes_shipped")
    payable_d = _validate_non_negative(payable_per_tonne, "payable_per_tonne")
    price_d = _validate_non_negative(certificate_price, "certificate_price")
    return _round_2(tonnes_d * payable_d * price_d)


def calculate_savings_eur(
    cost_with_default: float | None,
    cost_with_verified: float | None,
) -> float:
    """Compute savings in EUR from using verified actual emissions instead of default values:

    savings_eur = cost_with_default - cost_with_verified
    """
    missing: list[str] = []
    if cost_with_default is None:
        missing.append("cost_with_default")
    if cost_with_verified is None:
        missing.append("cost_with_verified")
    if missing:
        raise NeedsSourceError(missing)

    def_d = _validate_non_negative(cost_with_default, "cost_with_default")
    ver_d = _validate_non_negative(cost_with_verified, "cost_with_verified")
    return _round_2(def_d - ver_d)


def load_cbam_config(path: Path | str = CONFIG_PATH) -> dict[str, Any]:
    """Load `calculator/config/cbam_config.json`."""
    with Path(path).open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_cbam_sources(path: Path | str = SOURCES_PATH) -> dict[str, Any]:
    """Load `calculator/sources.json`."""
    with Path(path).open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _extract_year_entry(mapping: Mapping[str, Any], year: int, field_name: str) -> float | None:
    year_key = str(year)
    if year_key not in mapping:
        raise NeedsSourceError(
            f"{field_name}[{year_key}]",
            f"Year {year_key} is not configured in '{field_name}' (status: NEEDS_SOURCE).",
        )
    entry = mapping[year_key]
    if isinstance(entry, Mapping):
        val = entry.get("value")
    else:
        val = entry
    return float(val) if val is not None else None


def resolve_inputs_from_config(
    config: Mapping[str, Any],
    *,
    year: int = 2026,
    origin: str | None = None,
    tonnes_shipped: float | None = None,
    verified_see: float | None = None,
    default_value_base: float | None = None,
    benchmark: float | None = None,
    benchmark_actual: float | None = None,
    default_benchmark: float | None = None,
    benchmark_default: float | None = None,
    free_allocation_factor: float | None = None,
    cscf: float | None = None,
    default_markup: float | None = None,
    certificate_price: float | None = None,
    tag: str | None = None,
) -> CBAMInputs:
    """Resolve calculator inputs from `cbam_config.json`, applying explicit overrides.

    Raises `NeedsSourceError` listing all required parameters that remain `null` (`NEEDS_SOURCE`).
    """
    if not isinstance(year, int) or isinstance(year, bool) or year < 2026:
        raise CBAMValidationError(f"Parameter 'year' must be an integer >= 2026 (got {year}).")

    faf_val = (
        free_allocation_factor
        if free_allocation_factor is not None
        else _extract_year_entry(config.get("free_allocation_factor_by_year", {}), year, "free_allocation_factor_by_year")
    )
    cscf_val = (
        cscf
        if cscf is not None
        else _extract_year_entry(config.get("cscf_by_year", {}), year, "cscf_by_year")
    )
    markup_val = (
        default_markup
        if default_markup is not None
        else _extract_year_entry(config.get("default_markup_by_year", {}), year, "default_markup_by_year")
    )

    price_cfg = config.get("price_eur_per_tco2e", {})
    price_val = certificate_price if certificate_price is not None else price_cfg.get("value")
    price_quarter = str(price_cfg.get("quarter", "2026-Q3"))

    actual_b = benchmark_actual if benchmark_actual is not None else benchmark
    if actual_b is not None:
        bench_val = actual_b
    else:
        bench_val = config.get("benchmark_actual", {}).get("value")
        if bench_val is None:
            bench_val = config.get("benchmark_tco2e_per_t", {}).get("value")

    default_b = benchmark_default if benchmark_default is not None else default_benchmark
    if default_b is not None:
        def_bench_val = default_b
    else:
        def_bench_val = config.get("benchmark_default", {}).get("value")
        if def_bench_val is None:
            def_bench_val = config.get("default_benchmark_tco2e_per_t", {}).get("value")

    def_base_val = default_value_base
    if def_base_val is None and origin is not None:
        def_base_val = config.get("default_value_base_by_origin", {}).get(origin, {}).get("value")
    if def_base_val is None:
        def_base_cfg = config.get("default_value_base_tco2e_per_t", {})
        def_base_val = def_base_cfg.get("value")

    ver_val = verified_see
    if ver_val is None:
        ver_val = config.get("example_plant_verified_see", {}).get("value")

    missing: list[str] = []
    if tonnes_shipped is None:
        missing.append("tonnes_shipped")
    if ver_val is None:
        missing.append("verified_see")
    if def_base_val is None:
        missing.append("default_value_base_tco2e_per_t")
    if bench_val is None:
        missing.append("benchmark_tco2e_per_t")
    if faf_val is None:
        missing.append(f"free_allocation_factor_by_year[{year}]")
    if cscf_val is None:
        missing.append(f"cscf_by_year[{year}]")
    if markup_val is None:
        missing.append(f"default_markup_by_year[{year}]")
    if price_val is None:
        missing.append("price_eur_per_tco2e")

    if missing:
        raise NeedsSourceError(missing)

    return CBAMInputs(
        year=year,
        tonnes_shipped=float(tonnes_shipped),  # type: ignore[arg-type]
        verified_see=float(ver_val),  # type: ignore[arg-type]
        default_value_base=float(def_base_val),  # type: ignore[arg-type]
        benchmark=float(bench_val),  # type: ignore[arg-type]
        free_allocation_factor=float(faf_val),  # type: ignore[arg-type]
        cscf=float(cscf_val),  # type: ignore[arg-type]
        default_markup=float(markup_val),  # type: ignore[arg-type]
        certificate_price=float(price_val),  # type: ignore[arg-type]
        default_benchmark=float(def_bench_val) if def_bench_val is not None else None,
        price_quarter=price_quarter,
        tag=tag,
    )


def calculate_cbam_Comparison(
    *,
    year: int = 2026,
    tonnes_shipped: float | None = None,
    verified_see: float | None = None,
    default_value_base: float | None = None,
    benchmark: float | None = None,
    benchmark_actual: float | None = None,
    free_allocation_factor: float | None = None,
    cscf: float | None = None,
    default_markup: float | None = None,
    certificate_price: float | None = None,
    default_benchmark: float | None = None,
    benchmark_default: float | None = None,
    price_quarter: str = "2026-Q3",
    tag: str | None = None,
) -> CBAMCalculationResult:
    """Compute the full CBAM net liability comparison and step-by-step explanation.

    Computes net liability after the free-allocation adjustment (SEFA).
    Note: Default-value benchmarks may differ from actual route benchmarks under
    Implementing Regulation (EU) 2025/2620 / 2025/2621.
    """
    if not isinstance(year, int) or isinstance(year, bool) or year < 2026:
        raise CBAMValidationError(f"Parameter 'year' must be an integer >= 2026 (got {year}).")

    actual_b = benchmark_actual if benchmark_actual is not None else benchmark
    default_b = benchmark_default if benchmark_default is not None else default_benchmark

    missing: list[str] = []
    if tonnes_shipped is None:
        missing.append("tonnes_shipped")
    if verified_see is None:
        missing.append("verified_see")
    if default_value_base is None:
        missing.append("default_value_base")
    if actual_b is None:
        missing.append("benchmark")
    if free_allocation_factor is None:
        missing.append("free_allocation_factor")
    if cscf is None:
        missing.append("cscf")
    if default_markup is None:
        missing.append("default_markup")
    if certificate_price is None:
        missing.append("certificate_price")
    if missing:
        raise NeedsSourceError(missing)

    tonnes_d = _validate_non_negative(tonnes_shipped, "tonnes_shipped")
    ver_see_d = _validate_non_negative(verified_see, "verified_see")
    def_base_d = _validate_non_negative(default_value_base, "default_value_base")
    bench_ver_d = _validate_non_negative(actual_b, "benchmark")
    bench_def_d = (
        _validate_non_negative(default_b, "default_benchmark")
        if default_b is not None
        else bench_ver_d
    )
    faf_d = _validate_non_negative(free_allocation_factor, "free_allocation_factor")
    if faf_d > Decimal("1"):
        raise CBAMValidationError(
            f"Parameter 'free_allocation_factor' must be in [0, 1] (got {free_allocation_factor})."
        )
    cscf_d = _validate_non_negative(cscf, "cscf")
    markup_d = _validate_non_negative(default_markup, "default_markup")
    price_d = _validate_non_negative(certificate_price, "certificate_price")

    sefa_verified = calculate_sefa(float(faf_d), float(cscf_d), float(bench_ver_d))
    sefa_default = calculate_sefa(float(faf_d), float(cscf_d), float(bench_def_d))
    default_see_with_markup = calculate_default_see_with_markup(float(def_base_d), float(markup_d))

    payable_verified = calculate_payable_per_tonne(float(ver_see_d), sefa_verified)
    payable_default = calculate_payable_per_tonne(default_see_with_markup, sefa_default)

    total_payable_verified = _round_6(tonnes_d * Decimal(str(payable_verified)))
    total_payable_default = _round_6(tonnes_d * Decimal(str(payable_default)))

    cost_verified = calculate_cost_eur(float(tonnes_d), payable_verified, float(price_d))
    cost_default = calculate_cost_eur(float(tonnes_d), payable_default, float(price_d))
    savings_eur = calculate_savings_eur(cost_default, cost_verified)
    savings_per_t = _round_6(Decimal(str(payable_default)) - Decimal(str(payable_verified)))

    steps: list[FormulaStep] = [
        FormulaStep(
            step_id="sefa",
            label="Specific Embedded Free Allocation (SEFA)",
            formula="SEFA = free_allocation_factor(year) * CSCF(year) * benchmark",
            substituted=(
                f"SEFA = {_fmt_num(float(faf_d), 3)} * {_fmt_num(float(cscf_d), 2)} * "
                f"{_fmt_num(float(bench_ver_d), 2)} = {_fmt_num(sefa_verified, 3)} tCO2e/t"
            ),
            result=sefa_verified,
            unit="tCO2e/t",
        ),
        FormulaStep(
            step_id="default_see_with_markup",
            label="Default SEE with annual markup",
            formula="default_SEE_with_markup = default_value_base * (1 + markup(year))",
            substituted=(
                f"default_SEE_with_markup = {_fmt_num(float(def_base_d), 2)} * "
                f"(1 + {_fmt_num(float(markup_d), 2)}) = {_fmt_num(default_see_with_markup, 2)} tCO2e/t"
            ),
            result=default_see_with_markup,
            unit="tCO2e/t",
        ),
        FormulaStep(
            step_id="payable_per_tonne_verified",
            label="Payable emissions per tonne (with verified data)",
            formula="payable_per_tonne_verified = max(0, verified_SEE - SEFA)",
            substituted=(
                f"payable_per_tonne_verified = max(0, {_fmt_num(float(ver_see_d), 2)} - "
                f"{_fmt_num(sefa_verified, 3)}) = {_fmt_num(payable_verified, 3)} tCO2e/t"
            ),
            result=payable_verified,
            unit="tCO2e/t",
        ),
        FormulaStep(
            step_id="payable_per_tonne_default",
            label="Payable emissions per tonne (with default value)",
            formula="payable_per_tonne_default = max(0, default_SEE_with_markup - SEFA)",
            substituted=(
                f"payable_per_tonne_default = max(0, {_fmt_num(default_see_with_markup, 2)} - "
                f"{_fmt_num(sefa_default, 3)}) = {_fmt_num(payable_default, 3)} tCO2e/t"
            ),
            result=payable_default,
            unit="tCO2e/t",
        ),
        FormulaStep(
            step_id="cost_with_verified",
            label="CBAM certificate cost (with verified data)",
            formula="cost_with_verified = tonnes_shipped * payable_per_tonne_verified * certificate_price",
            substituted=(
                f"cost_with_verified = {_fmt_num(float(tonnes_d), 0)} * "
                f"{_fmt_num(payable_verified, 3)} * {_fmt_num(float(price_d), 2)} = EUR {cost_verified:.2f}"
            ),
            result=cost_verified,
            unit="EUR",
        ),
        FormulaStep(
            step_id="cost_with_default",
            label="CBAM certificate cost (with default value)",
            formula="cost_with_default = tonnes_shipped * payable_per_tonne_default * certificate_price",
            substituted=(
                f"cost_with_default = {_fmt_num(float(tonnes_d), 0)} * "
                f"{_fmt_num(payable_default, 3)} * {_fmt_num(float(price_d), 2)} = EUR {cost_default:.2f}"
            ),
            result=cost_default,
            unit="EUR",
        ),
        FormulaStep(
            step_id="savings_eur",
            label="Savings from verified installation data",
            formula="savings_eur = cost_with_default - cost_with_verified",
            substituted=(
                f"savings_eur = {cost_default:.2f} - {cost_verified:.2f} = EUR {savings_eur:.2f}"
            ),
            result=savings_eur,
            unit="EUR",
        ),
    ]

    default_benchmark_note = (
        "Net liability after free-allocation adjustment (SEFA). Note: when default SEE values are used, "
        "specific default-value benchmarks may apply under Implementing Regulation (EU) 2025/2620 / 2025/2621 [VERIFY]."
    )

    return CBAMCalculationResult(
        year=year,
        price_quarter=price_quarter,
        net_liability_after_free_allocation=True,
        default_benchmark_note=default_benchmark_note,
        tag=tag,
        tonnes_shipped=_round_6(tonnes_d),
        verified_see=_round_6(ver_see_d),
        default_value_base=_round_6(def_base_d),
        default_markup=_round_6(markup_d),
        default_see_with_markup=default_see_with_markup,
        benchmark_verified=_round_6(bench_ver_d),
        benchmark_default=_round_6(bench_def_d),
        free_allocation_factor=_round_6(faf_d),
        cscf=_round_6(cscf_d),
        sefa_verified=sefa_verified,
        sefa_default=sefa_default,
        payable_per_tonne_verified=payable_verified,
        payable_per_tonne_default=payable_default,
        total_payable_tonnes_verified=total_payable_verified,
        total_payable_tonnes_default=total_payable_default,
        certificate_price=_round_2(price_d),
        cost_with_verified_eur=cost_verified,
        cost_with_default_eur=cost_default,
        savings_per_tonne_tco2e=savings_per_t,
        savings_eur=savings_eur,
        steps=steps,
    )


def explain_cbam_calculation(result: CBAMCalculationResult) -> list[dict[str, Any]]:
    """Return the step-by-step formula breakdown (each formula line with numbers substituted) for UI display."""
    return [asdict(step) for step in result.steps]


calculate_cbam_comparison = calculate_cbam_Comparison


def get_illustrative_example_inputs(origin: str = "India") -> CBAMInputs:
    """Return the Pig iron (CN 7201) example inputs, with status EXAMPLE."""
    config = load_cbam_config()
    return resolve_inputs_from_config(
        config,
        year=2026,
        origin=origin,
        tonnes_shipped=500.0,
        tag="EXAMPLE",
    )
