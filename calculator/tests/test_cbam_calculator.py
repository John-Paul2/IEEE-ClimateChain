"""Unit and shared-vector tests for the VeriCEMS Python CBAM cost calculator."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from calculator.cbam_calculator import (
    CBAMValidationError,
    NeedsSourceError,
    calculate_cbam_Comparison,
    calculate_cost_eur,
    calculate_default_see_with_markup,
    calculate_payable_per_tonne,
    calculate_savings_eur,
    calculate_sefa,
    explain_cbam_calculation,
    get_illustrative_example_inputs,
    load_cbam_config,
    load_cbam_sources,
    resolve_inputs_from_config,
)
from calculator.cli import main as cli_main


VECTORS_PATH = Path(__file__).resolve().parent / "vectors.json"


def _load_vectors() -> dict[str, Any]:
    with VECTORS_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


VECTORS_DATA = _load_vectors()


def test_cbam_config_structure_and_honesty_rules() -> None:
    """Verify Task 1: cbam_config.json fills only verified values and keeps everything else null + NEEDS_SOURCE."""
    cfg = load_cbam_config()

    # 1. Price: 82.32 (2026-Q3), VERIFIED_SECONDARY
    price_entry = cfg["price_eur_per_tco2e"]
    assert price_entry["value"] == 82.32
    assert price_entry["quarter"] == "2026-Q3"
    assert price_entry["status"] == "VERIFIED_SECONDARY"
    assert price_entry["last_verified"] is not None
    assert price_entry["source"]

    # 2. Free allocation factor: 0.975 in 2026, later years null with NEEDS_SOURCE
    faf = cfg["free_allocation_factor_by_year"]
    assert faf["2026"]["value"] == 0.975
    assert faf["2026"]["status"] == "VERIFIED_SECONDARY"
    assert faf["2026"]["last_verified"] is not None
    for year in ("2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034"):
        assert faf[year]["value"] is None
        assert faf[year]["status"] == "NEEDS_SOURCE"
        assert faf[year]["source"]

    # 3. Default markups: 0.10 / 0.20 / 0.30 for 2026 / 2027 / 2028
    markups = cfg["default_markup_by_year"]
    assert markups["2026"]["value"] == 0.10
    assert markups["2027"]["value"] == 0.20
    assert markups["2028"]["value"] == 0.30
    for year in ("2026", "2027", "2028"):
        assert markups[year]["status"] == "VERIFIED_SECONDARY"
        assert markups[year]["last_verified"] is not None
        assert markups[year]["source"]

    # 4. Everything else must be null with status NEEDS_SOURCE
    cscf = cfg["cscf_by_year"]
    assert cscf["2026"]["value"] is None
    assert cscf["2026"]["status"] == "NEEDS_SOURCE"

    bench = cfg["benchmark_tco2e_per_t"]
    assert bench["value"] is None
    assert bench["route"] is None
    assert bench["status"] == "NEEDS_SOURCE"

    def_base = cfg["default_value_base_tco2e_per_t"]
    assert def_base["value"] is None
    assert def_base["cn_code"] is None
    assert def_base["country"] is None
    assert def_base["status"] == "NEEDS_SOURCE"


def test_sources_json_maps_all_regulations_and_variables() -> None:
    """Verify Task 2: sources.json maps every variable to the 7 required regulations and Commission URL."""
    sources = load_cbam_sources()
    expected_url = (
        "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/"
        "cbam-legislation-and-guidance_en"
    )
    assert sources["commission_cbam_legislation_url"] == expected_url

    required_regs = {
        "2023/956",
        "2025/2083",
        "2025/2546",
        "2025/2547",
        "2025/2548",
        "2025/2620",
        "2025/2621 (as corrected by 2026/1740)",
    }
    assert required_regs.issubset(set(sources["regulations"].keys()))

    referenced_regs: set[str] = set()
    for var_name, var_meta in sources["variables"].items():
        assert var_meta["parameter"] == var_name
        assert var_meta["commission_url"] == expected_url
        assert "article" in var_meta
        assert len(var_meta["regulations"]) >= 1
        referenced_regs.update(var_meta["regulations"])

    assert required_regs == referenced_regs


@pytest.mark.parametrize(
    "vector",
    VECTORS_DATA["valid_vectors"],
    ids=[v["name"] for v in VECTORS_DATA["valid_vectors"]],
)
def test_shared_valid_vectors(vector: dict[str, Any]) -> None:
    """Verify Task 5 & 6: shared valid vectors reproduce exact expected figures."""
    inp = vector["inputs"]
    exp = vector["expected"]

    result = calculate_cbam_Comparison(
        year=inp["year"],
        tonnes_shipped=inp["tonnes_shipped"],
        verified_see=inp["verified_see"],
        default_value_base=inp["default_value_base"],
        benchmark=inp["benchmark"],
        default_benchmark=inp.get("default_benchmark"),
        free_allocation_factor=inp["free_allocation_factor"],
        cscf=inp["cscf"],
        default_markup=inp["default_markup"],
        certificate_price=inp["certificate_price"],
        price_quarter=inp.get("price_quarter", "2026-Q3"),
        tag=vector.get("tag"),
    )

    assert result.tag == "ILLUSTRATIVE"
    assert result.net_liability_after_free_allocation is True
    assert result.sefa_verified == pytest.approx(exp["sefa_verified"], abs=1e-6)
    assert result.sefa_default == pytest.approx(exp["sefa_default"], abs=1e-6)
    assert result.default_see_with_markup == pytest.approx(exp["default_see_with_markup"], abs=1e-6)
    assert result.payable_per_tonne_verified == pytest.approx(exp["payable_per_tonne_verified"], abs=1e-6)
    assert result.payable_per_tonne_default == pytest.approx(exp["payable_per_tonne_default"], abs=1e-6)
    assert result.total_payable_tonnes_verified == pytest.approx(exp["total_payable_tonnes_verified"], abs=1e-6)
    assert result.total_payable_tonnes_default == pytest.approx(exp["total_payable_tonnes_default"], abs=1e-6)
    assert result.cost_with_verified_eur == pytest.approx(exp["cost_with_verified_eur"], abs=1e-2)
    assert result.cost_with_default_eur == pytest.approx(exp["cost_with_default_eur"], abs=1e-2)
    assert result.savings_per_tonne_tco2e == pytest.approx(exp["savings_per_tonne_tco2e"], abs=1e-6)
    assert result.savings_eur == pytest.approx(exp["savings_eur"], abs=1e-2)

    # Check step-by-step explanation list
    steps = explain_cbam_calculation(result)
    assert len(steps) == 7
    assert steps[0]["step_id"] == "sefa"
    assert steps[4]["result"] == pytest.approx(exp["cost_with_verified_eur"], abs=1e-2)
    assert steps[5]["result"] == pytest.approx(exp["cost_with_default_eur"], abs=1e-2)
    assert steps[6]["result"] == pytest.approx(exp["savings_eur"], abs=1e-2)


def test_illustrative_example_exact_numbers() -> None:
    """Explicit check for Guide Appendix A worked example (€22,020.60 / €47,951.40 / €25,930.80)."""
    inputs = get_illustrative_example_inputs()
    assert inputs.tag == "ILLUSTRATIVE"
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
    assert result.sefa_verified == 1.365
    assert result.default_see_with_markup == 2.53
    assert result.payable_per_tonne_verified == 0.535
    assert result.payable_per_tonne_default == 1.165
    assert result.cost_with_verified_eur == 22020.60
    assert result.cost_with_default_eur == 47951.40
    assert result.savings_eur == 25930.80


@pytest.mark.parametrize(
    "err_vector",
    VECTORS_DATA["error_vectors"],
    ids=[v["name"] for v in VECTORS_DATA["error_vectors"]],
)
def test_shared_error_vectors(err_vector: dict[str, Any]) -> None:
    """Verify Task 6: null parameters raise NeedsSourceError and negative/invalid inputs raise CBAMValidationError."""
    inp = err_vector["inputs"]
    expected_error = err_vector["expected_error"]

    if expected_error == "NeedsSourceError":
        with pytest.raises(NeedsSourceError) as exc_info:
            calculate_cbam_Comparison(**inp)
        missing_param = err_vector.get("missing_parameter")
        if missing_param:
            assert missing_param in exc_info.value.missing_parameters
    elif expected_error == "CBAMValidationError":
        with pytest.raises(CBAMValidationError):
            calculate_cbam_Comparison(**inp)
    else:
        pytest.fail(f"Unknown expected_error type: {expected_error}")


def test_resolve_from_raw_config_raises_needs_source_for_unverified_fields() -> None:
    """Verify that resolving from cbam_config.json without overrides raises NeedsSourceError for null fields."""
    cfg = load_cbam_config()
    with pytest.raises(NeedsSourceError) as exc_info:
        resolve_inputs_from_config(cfg, year=2026, tonnes_shipped=500.0, verified_see=1.90)

    missing = exc_info.value.missing_parameters
    assert "default_value_base_tco2e_per_t" in missing
    assert "benchmark_tco2e_per_t" in missing
    assert "cscf_by_year[2026]" in missing

    # Also check year 2027 where free_allocation_factor_by_year[2027] is null in config
    with pytest.raises(NeedsSourceError) as exc_info_2027:
        resolve_inputs_from_config(
            cfg,
            year=2027,
            tonnes_shipped=500.0,
            verified_see=1.90,
            default_value_base=2.30,
            benchmark=1.40,
            cscf=1.00,
        )
    assert "free_allocation_factor_by_year[2027]" in exc_info_2027.value.missing_parameters


def test_pure_helper_functions_edge_cases() -> None:
    """Test individual pure functions for zero floor and null handling."""
    assert calculate_sefa(0.975, 1.0, 1.40) == 1.365
    assert calculate_default_see_with_markup(2.30, 0.10) == 2.53
    assert calculate_payable_per_tonne(1.00, 1.365) == 0.0
    assert calculate_cost_eur(0.0, 0.535, 82.32) == 0.0
    assert calculate_savings_eur(47951.40, 22020.60) == 25930.80

    with pytest.raises(NeedsSourceError):
        calculate_sefa(0.975, None, 1.40)
    with pytest.raises(NeedsSourceError):
        calculate_payable_per_tonne(None, 1.365)
    with pytest.raises(CBAMValidationError):
        calculate_cost_eur(-1.0, 0.535, 82.32)


def test_cli_example_output(capsys: pytest.CaptureFixture[str]) -> None:
    """Verify Task 8: `python -m calculator.cli --example` prints the worked example step by step."""
    exit_code = cli_main(["--example"])
    assert exit_code == 0
    captured = capsys.readouterr().out
    assert "[ILLUSTRATIVE]" in captured
    assert "22,020.60" in captured
    assert "47,951.40" in captured
    assert "25,930.80" in captured
    assert "SEFA = 0.975 * 1.00 * 1.40 = 1.365 tCO2e/t" in captured
