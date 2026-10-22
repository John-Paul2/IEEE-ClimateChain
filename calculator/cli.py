"""Command-line interface for the VeriCEMS CBAM cost calculator.

Usage:
    python -m calculator.cli --example
    python -m calculator.cli --example --json
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from calculator.cbam_calculator import (
    calculate_cbam_Comparison,
    explain_cbam_calculation,
    get_illustrative_example_inputs,
    load_cbam_config,
)


def format_example_report() -> str:
    """Format the Guide Section 14 Appendix A worked example step by step."""
    config = load_cbam_config()
    inputs = get_illustrative_example_inputs()
    result = calculate_cbam_Comparison(
        year=inputs.year,
        tonnes_shipped=inputs.tonnes_shipped,
        verified_see=inputs.verified_see,
        default_value_base=inputs.default_value_base,
        benchmark=inputs.benchmark,
        default_benchmark=inputs.default_benchmark,
        free_allocation_factor=inputs.free_allocation_factor,
        cscf=inputs.cscf,
        default_markup=inputs.default_markup,
        certificate_price=inputs.certificate_price,
        price_quarter=inputs.price_quarter,
        tag=inputs.tag,
    )
    steps = explain_cbam_calculation(result)

    lines: list[str] = [
        "==============================================================================",
        "VeriCEMS EU CBAM Cost Calculator -- Worked Example [ILLUSTRATIVE]",
        "==============================================================================",
        "NOTE: ALL PRODUCT/BENCHMARK/DEFAULT NUMBERS IN THIS WORKED EXAMPLE ARE",
        "      [ILLUSTRATIVE] (Guide Section 14 Appendix A) AND DO NOT REPRESENT ANY",
        "      REAL PRODUCT.",
        f"Model: Net liability after free-allocation adjustment (SEFA) | Year: {result.year}",
        f"Certificate Price: EUR {result.certificate_price:.2f}/tCO2e ({result.price_quarter}) "
        f"[status: {config['price_eur_per_tco2e']['status']}]",
        "Default Benchmark Note: " + result.default_benchmark_note,
        "------------------------------------------------------------------------------",
        "INPUTS:",
        f"  Tonnes shipped            : {result.tonnes_shipped:.0f} t [ILLUSTRATIVE]",
        f"  Benchmark                 : {result.benchmark_verified:.2f} tCO2e/t [ILLUSTRATIVE]",
        f"  Free-allocation factor    : {result.free_allocation_factor:.3f} (2026, VERIFIED_SECONDARY)",
        f"  CSCF                      : {result.cscf:.2f} [ILLUSTRATIVE override; config is null/NEEDS_SOURCE]",
        f"  Verified SEE              : {result.verified_see:.2f} tCO2e/t [ILLUSTRATIVE]",
        f"  Default value (base)      : {result.default_value_base:.2f} tCO2e/t [ILLUSTRATIVE]",
        f"  Default markup ({result.year})     : {result.default_markup * 100:.0f}% (VERIFIED_SECONDARY)",
        f"  Certificate price         : EUR {result.certificate_price:.2f}/tCO2e ({result.price_quarter})",
        "------------------------------------------------------------------------------",
        "STEP-BY-STEP FORMULA BREAKDOWN:",
    ]

    for idx, step in enumerate(steps, start=1):
        lines.append(f"  Step {idx}: {step['label']}")
        lines.append(f"    Formula     : {step['formula']}")
        lines.append(f"    Substituted : {step['substituted']}")

    lines.extend(
        [
            "------------------------------------------------------------------------------",
            "SUMMARY:",
            f"  Cost with verified data   : EUR {result.cost_with_verified_eur:,.2f} (EUR {result.cost_with_verified_eur:.2f})",
            f"  Cost with default value   : EUR {result.cost_with_default_eur:,.2f} (EUR {result.cost_with_default_eur:.2f})",
            f"  Savings with verified data: EUR {result.savings_eur:,.2f} (EUR {result.savings_eur:.2f})",
            "==============================================================================",
        ]
    )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m calculator.cli",
        description="VeriCEMS EU CBAM net liability calculator CLI.",
    )
    parser.add_argument(
        "--example",
        action="store_true",
        help="Print the Guide Appendix A [ILLUSTRATIVE] worked example step by step.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output the calculation result and step-by-step explanation as JSON.",
    )
    args = parser.parse_args(argv)

    if not args.example:
        parser.print_help()
        return 1

    if args.json:
        inputs = get_illustrative_example_inputs()
        result = calculate_cbam_Comparison(
            year=inputs.year,
            tonnes_shipped=inputs.tonnes_shipped,
            verified_see=inputs.verified_see,
            default_value_base=inputs.default_value_base,
            benchmark=inputs.benchmark,
            default_benchmark=inputs.default_benchmark,
            free_allocation_factor=inputs.free_allocation_factor,
            cscf=inputs.cscf,
            default_markup=inputs.default_markup,
            certificate_price=inputs.certificate_price,
            price_quarter=inputs.price_quarter,
            tag=inputs.tag,
        )
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    print(format_example_report())
    return 0


if __name__ == "__main__":
    sys.exit(main())
