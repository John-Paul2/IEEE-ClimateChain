#!/usr/bin/env python3
"""
ml/impact.py
Calculates quantified climate impact and deterrence metrics from:
  1. results/benchmark_summary.json (empirical measured detection rates)
  2. config/impact_inputs.yaml (covered emissions and misreporting assumptions)

Conforms strictly to AGENTS.md honesty rules:
- Does NOT invent covered emissions.
- If config/impact_inputs.yaml is missing or incomplete, exits with instructions on what to source.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
BENCHMARK_FILE = REPO_ROOT / "results" / "benchmark_summary.json"
IMPACT_CONFIG_FILE = REPO_ROOT / "config" / "impact_inputs.yaml"


def load_yaml(path: Path) -> Dict[str, Any]:
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        # Lightweight robust YAML parser for primitive dicts, floats, and lists
        res: Dict[str, Any] = {}
        current_list_key: Optional[str] = None
        current_dict_key: Optional[str] = None

        with open(path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.rstrip()
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue

                # Handle list item
                if stripped.startswith("- "):
                    val_str = stripped[2:].split("#")[0].strip().strip('"').strip("'")
                    val: Any = val_str
                    try:
                        val = float(val_str) if "." in val_str else int(val_str)
                    except ValueError:
                        pass
                    if current_list_key and isinstance(res.get(current_list_key), list):
                        res[current_list_key].append(val)
                    continue

                if ":" in stripped:
                    k, v = stripped.split(":", 1)
                    k = k.strip()
                    v = v.split("#")[0].strip().strip('"').strip("'")

                    # Check indentation
                    indent = len(line) - len(line.lstrip())
                    if indent > 0 and current_dict_key:
                        if v.lower() == "null" or v == "":
                            res[current_dict_key][k] = None
                        elif v.replace(".", "", 1).isdigit():
                            res[current_dict_key][k] = float(v) if "." in v else int(v)
                        else:
                            res[current_dict_key][k] = v
                        continue

                    if not v:
                        # Could be a list or a nested dict
                        # Peek ahead or default to empty list/dict based on key name
                        if "scenarios" in k or "list" in k:
                            res[k] = []
                            current_list_key = k
                            current_dict_key = None
                        else:
                            res[k] = {}
                            current_dict_key = k
                            current_list_key = None
                    else:
                        current_list_key = None
                        current_dict_key = None
                        if v.lower() == "null":
                            res[k] = None
                        elif v.replace(".", "", 1).isdigit():
                            res[k] = float(v) if "." in v else int(v)
                        else:
                            res[k] = v
        return res


def load_benchmark_detection_rate() -> Dict[str, float]:
    if not BENCHMARK_FILE.exists():
        raise FileNotFoundError(f"Missing benchmark summary: {BENCHMARK_FILE}")

    with open(BENCHMARK_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    macro_proposed = data["overall_macro_average"]["proposed"]
    macro_recall = macro_proposed["recall"]["mean"]
    macro_std = macro_proposed["recall"]["std"]

    # Also extract specific attack scenario recalls
    attacks = data.get("attacks", {})
    scaling_5pct_recall = attacks.get("constant_scaling_5pct", {}).get("detectors", {}).get("proposed", {}).get("recall", {}).get("mean", macro_recall)
    scaling_10pct_recall = attacks.get("constant_scaling_10pct", {}).get("detectors", {}).get("proposed", {}).get("recall", {}).get("mean", macro_recall)

    return {
        "macro_recall": macro_recall,
        "macro_recall_std": macro_std,
        "scaling_5pct_recall": scaling_5pct_recall,
        "scaling_10pct_recall": scaling_10pct_recall,
    }


def compute_impact(config: Dict[str, Any], rates: Dict[str, float]) -> Dict[str, Any]:
    covered = config.get("covered_emissions_tco2e")
    source_info = config.get("source_info", {})
    certificate_price = float(config.get("cbam_certificate_price_eur", 82.32))

    if covered is None:
        raise ValueError(
            "Missing 'covered_emissions_tco2e' in config/impact_inputs.yaml. "
            "Per AGENTS.md honesty rules, this number cannot be invented. "
            "Please source a verified figure and add it to config/impact_inputs.yaml."
        )

    scenarios = config.get("misreporting_scenarios_pct", [1.0, 5.0, 10.0])
    macro_rate = rates["macro_recall"]

    results = []
    for sc in scenarios:
        sc_frac = float(sc) / 100.0
        # Determine appropriate detection rate: for 5% and 10% scaling, we have specific measured rates
        if abs(sc - 5.0) < 1e-4:
            det_rate = rates["scaling_5pct_recall"]
            rate_source = "measured_constant_scaling_5pct"
        elif abs(sc - 10.0) < 1e-4:
            det_rate = rates["scaling_10pct_recall"]
            rate_source = "measured_constant_scaling_10pct"
        else:
            det_rate = macro_rate
            rate_source = "measured_macro_average"

        unpriced_potential_tco2e = covered * sc_frac
        deterred_tco2e = unpriced_potential_tco2e * det_rate
        undetected_tco2e = unpriced_potential_tco2e - deterred_tco2e
        value_deterred_eur = deterred_tco2e * certificate_price

        results.append({
            "scenario_label": f"{sc:.0f}% misreporting [ASSUMPTION]",
            "misreporting_rate_pct": sc,
            "covered_emissions_tco2e": covered,
            "potential_unpriced_tco2e": unpriced_potential_tco2e,
            "detection_rate_pct": det_rate * 100.0,
            "detection_rate_source": rate_source,
            "deterred_emissions_tco2e": deterred_tco2e,
            "undetected_emissions_tco2e": undetected_tco2e,
            "certificate_price_eur": certificate_price,
            "financial_value_protected_eur": value_deterred_eur,
        })

    return {
        "covered_emissions_tco2e": covered,
        "source_info": source_info,
        "certificate_price_eur": certificate_price,
        "measured_macro_detection_rate_pct": macro_rate * 100.0,
        "scenarios": results,
    }


def format_markdown_table(impact_data: Dict[str, Any]) -> str:
    lines = [
        "| Misreporting Scenario (Assumption) | Covered Scope (tCO2e) | Potential Unpriced CO2e | Measured Detection Rate | Deterred Emissions (tCO2e) | Unpriced Value Protected (EUR) |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in impact_data["scenarios"]:
        sc_name = row["scenario_label"]
        cov = f"{row['covered_emissions_tco2e']:,.0f}"
        pot = f"{row['potential_unpriced_tco2e']:,.0f}"
        rate = f"{row['detection_rate_pct']:.2f}%"
        det = f"{row['deterred_emissions_tco2e']:,.0f}"
        val = f"€{row['financial_value_protected_eur']:,.2f}"
        lines.append(f"| {sc_name} | {cov} | {pot} | **{rate}** | **{det}** | **{val}** |")
    return "\n".join(lines)


def main():
    print("Checking impact inputs and benchmark detection rates...")

    if not IMPACT_CONFIG_FILE.exists():
        print(f"\n[ERROR] Missing {IMPACT_CONFIG_FILE}!", file=sys.stderr)
        print(
            "Per AGENTS.md honesty rules, covered emissions cannot be invented.\n"
            "Please create config/impact_inputs.yaml with a verified source.\n"
            "Required schema:\n"
            "  covered_emissions_tco2e: <float>\n"
            "  cbam_certificate_price_eur: 82.32\n"
            "  misreporting_scenarios_pct: [1.0, 5.0, 10.0]\n"
            "  source_info:\n"
            "    name: '<Source Name>'\n"
            "    url: '<Source URL>'\n"
            "    last_verified: 'YYYY-MM-DD'\n",
            file=sys.stderr,
        )
        sys.exit(2)

    config = load_yaml(IMPACT_CONFIG_FILE)
    if not config.get("covered_emissions_tco2e"):
        print(
            "\n[ERROR] 'covered_emissions_tco2e' is null or missing in config/impact_inputs.yaml!",
            file=sys.stderr,
        )
        print("Please supply a verified source value before running impact calculations.", file=sys.stderr)
        sys.exit(2)

    rates = load_benchmark_detection_rate()
    impact = compute_impact(config, rates)

    print("\nImpact Analysis Results:")
    print(format_markdown_table(impact))


if __name__ == "__main__":
    main()
