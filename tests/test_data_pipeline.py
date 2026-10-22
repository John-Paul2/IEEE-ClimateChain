"""Unit and integration tests for Milestone P03 data pipeline (`ml/data/`).

Uses a tiny synthetic fixture named `fixture_synthetic` (explicitly isolated in `tmp_path`
so it never feeds any reported result in `data/`, `results/`, or `docs/`) to test:
- `ml.data.inspect`: column inspection, O2/temperature/flow absence check, and circularity check.
- `ml.data.preprocess`: operating-hour filtering, short-gap interpolation, missing-core removal,
  and one-Parquet-time-series-per-unit output.
- `ml.data.splits`: `GroupShuffleSplit` across 20+ facilities, 5 seeds, strict train/val/test
  disjointness, and facility-IDs-only manifest format.
- Verification of real on-disk P03 outputs (`config/facilities.yaml`, `config/emission_factors.yaml`,
  `results/data_inspection.json`, `results/splits.json`, `docs/DATA_CARD.md`, `schemas/channels.json`).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

from ml.data.inspect import check_missing_physical_channels, inspect_dataframe
from ml.data.preprocess import preprocess_dataframe
from ml.data.splits import generate_facility_splits
from ml.data.yaml_loader import load_yaml_file

REPO_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture()
def fixture_synthetic() -> pd.DataFrame:
    """Tiny synthetic CAMPD-like DataFrame for unit-testing cleaning and splitting ONLY.

    Uses synthetic Facility IDs 90001..90022 (never present in real EPA CAMPD data) and
    is only ever written to pytest `tmp_path` directories.
    """
    rows: list[dict[str, Any]] = []
    for idx in range(22):
        fac_id = 90001 + idx
        is_coal = idx < 11
        fuel = "Coal" if is_coal else "Pipeline Natural Gas"
        factor = 0.1049 if is_coal else 0.0594
        units = ["U1", "U2"] if idx == 0 else ["U1"]

        for unit_id in units:
            for hour in range(8):
                # Hour 0 is offline (Operating Time == 0.0) -> must be dropped
                if hour == 0:
                    op_time = 0.0
                    hi = float("nan")
                    co2 = float("nan")
                    load = float("nan")
                # Hour 3 on fac 90001 U1 is a 1-hour isolated gap -> must be linearly interpolated
                elif fac_id == 90001 and unit_id == "U1" and hour == 3:
                    op_time = 1.0
                    hi = float("nan")
                    co2 = float("nan")
                    load = float("nan")
                # Hours 2..6 (5 consecutive hours > limit=3) on fac 90002 are missing -> un-interpolated rows dropped
                elif fac_id == 90002 and hour in (2, 3, 4, 5, 6):
                    op_time = 1.0
                    hi = float("nan")
                    co2 = float("nan")
                    load = 100.0
                else:
                    op_time = 1.0
                    hi = float(1000.0 + 50.0 * hour + idx * 10.0)
                    co2 = round(hi * factor, 4)
                    load = float(100.0 + 5.0 * hour)

                rows.append(
                    {
                        "State": "SY",
                        "Facility Name": f"Synthetic Test Plant {fac_id}",
                        "Facility ID": fac_id,
                        "Unit ID": unit_id,
                        "unit_id": fac_id * 10 + (1 if unit_id == "U1" else 2),
                        "Associated Stacks": float("nan"),
                        "Date": "2025-01-01",
                        "Hour": hour,
                        "Operating Time": op_time,
                        "Gross Load (MW)": load,
                        "Steam Load (1000 lb/hr)": float("nan"),
                        "SO2 Mass (lbs)": 12.5 if op_time > 0 else float("nan"),
                        "SO2 Mass Measure Indicator": "Measured" if op_time > 0 else float("nan"),
                        "SO2 Rate (lbs/mmBtu)": 0.012 if op_time > 0 else float("nan"),
                        "SO2 Rate Measure Indicator": "Calculated" if op_time > 0 else float("nan"),
                        "CO2 Mass (short tons)": co2,
                        "CO2 Mass Measure Indicator": "Measured" if op_time > 0 else float("nan"),
                        "CO2 Rate (short tons/mmBtu)": factor if op_time > 0 else float("nan"),
                        "CO2 Rate Measure Indicator": "Calculated" if op_time > 0 else float("nan"),
                        "NOx Mass (lbs)": 25.0 if op_time > 0 else float("nan"),
                        "NOx Mass Measure Indicator": "Measured" if op_time > 0 else float("nan"),
                        "NOx Rate (lbs/mmBtu)": 0.025 if op_time > 0 else float("nan"),
                        "NOx Rate Measure Indicator": "Calculated" if op_time > 0 else float("nan"),
                        "Heat Input (mmBtu)": hi,
                        "Heat Input Measure Indicator": "Measured" if op_time > 0 else float("nan"),
                        "Primary Fuel Type": fuel,
                        "Secondary Fuel Type": float("nan"),
                        "Unit Type": "Dry bottom wall-fired boiler" if is_coal else "Combined cycle",
                        "SO2 Controls": float("nan"),
                        "NOx Controls": "Low NOx Burner Technology",
                        "PM Controls": float("nan"),
                        "Hg Controls": float("nan"),
                        "Program Code": "ARP",
                    }
                )

    # Add one duplicate row to verify deduplication
    rows.append(dict(rows[1]))
    return pd.DataFrame(rows)


def test_preprocess_on_fixture_synthetic(
    fixture_synthetic: pd.DataFrame, tmp_path: Path
) -> None:
    """Test operating-hour filtering, interpolation, and per-unit Parquet output on fixture_synthetic."""
    out_dir = tmp_path / "processed_synthetic"
    manifest = preprocess_dataframe(
        fixture_synthetic,
        processed_dir=out_dir,
        max_interp_gap_hours=3,
    )

    summary = manifest["summary"]
    # 23 unit series (22 facilities, with facility 90001 having U1 and U2)
    assert summary["facilities_count"] == 22
    assert summary["units_count"] == 23
    # 23 offline rows (hour 0 for each of the 23 units) must be dropped
    assert summary["dropped_non_operating_rows"] == 23
    # 1 duplicate row removed
    assert summary["duplicates_removed"] == 1
    # Facility 90002 has a 5-hour gap: first 3 hours interpolated, remaining 2 hours dropped
    assert summary["dropped_missing_core_rows"] == 2
    assert summary["interpolated_core_cells"] > 0

    # Verify one Parquet file per unit exists in tmp_path
    unit_files = list((out_dir / "units").glob("*.parquet"))
    assert len(unit_files) == 23

    # Verify Facility 90001 U1 hour 3 was linearly interpolated between hour 2 (1100.0) and hour 4 (1200.0)
    u1_df = pd.read_parquet(out_dir / "units" / "facility_90001_unit_U1.parquet")
    assert (u1_df["op_time_fraction"] > 0.0).all()
    h3_row = u1_df[u1_df["hour"] == 3].iloc[0]
    assert np.isclose(h3_row["heat_input_mmbtu"], 1150.0)
    assert np.isclose(h3_row["co2_mass_short_tons"], 1150.0 * 0.1049, atol=1e-3)
    # Steam load was all NaN -> zero-filled with steam_load_missing_flag == True
    assert (u1_df["steam_load_1000_lb_hr"] == 0.0).all()
    assert u1_df["steam_load_missing_flag"].all()


def test_splits_on_fixture_synthetic(
    fixture_synthetic: pd.DataFrame, tmp_path: Path
) -> None:
    """Test GroupShuffleSplit facility splitting on fixture_synthetic."""
    fids = sorted(fixture_synthetic["Facility ID"].unique().tolist())
    assert len(fids) == 22

    splits_file = tmp_path / "splits_synthetic.json"
    manifest_1 = generate_facility_splits(
        facility_ids=fids,
        n_splits=5,
        base_seed=42,
        output_path=splits_file,
    )
    manifest_2 = generate_facility_splits(
        facility_ids=fids,
        n_splits=5,
        base_seed=42,
        output_path=None,
    )

    # Deterministic across runs
    assert manifest_1 == manifest_2
    assert manifest_1["n_facilities"] == 22
    assert manifest_1["n_splits"] == 5

    for sp in manifest_1["splits"]:
        train_set = set(sp["train_facility_ids"])
        val_set = set(sp["val_facility_ids"])
        test_set = set(sp["test_facility_ids"])
        assert train_set.isdisjoint(val_set)
        assert train_set.isdisjoint(test_set)
        assert val_set.isdisjoint(test_set)
        assert sorted(train_set | val_set | test_set) == fids
        # Facility IDs only (integers)
        assert all(isinstance(x, int) for x in sp["train_facility_ids"])
        assert all(isinstance(x, int) for x in sp["val_facility_ids"])
        assert all(isinstance(x, int) for x in sp["test_facility_ids"])

    # Fewer than 20 facilities must raise ValueError
    with pytest.raises(ValueError, match="at least 20 facilities"):
        generate_facility_splits(facility_ids=fids[:15], n_splits=5, output_path=None)


def test_inspect_on_fixture_synthetic(fixture_synthetic: pd.DataFrame) -> None:
    """Test column inspection, O2/temp/flow check, and circularity detection on fixture_synthetic."""
    report = inspect_dataframe(fixture_synthetic, source_files=["fixture_synthetic.csv"])
    chk = report["missing_physical_channels_check"]
    assert chk["stack_o2_present"] is False
    assert chk["flue_temperature_present"] is False
    assert chk["stack_flow_rate_present"] is False

    circ = report["co2_heat_input_circularity"]
    assert circ["is_circular"] is True
    assert circ["per_fuel_type"]["Coal"]["pearson_r"] > 0.999
    assert circ["per_fuel_type"]["Pipeline Natural Gas"]["pearson_r"] > 0.999

    # Also verify check_missing_physical_channels detects O2/temp/flow if present
    pos_chk = check_missing_physical_channels(
        ["Stack O2 (%)", "Flue Gas Temperature (C)", "Stack Flow (scfm)"]
    )
    assert pos_chk["stack_o2_present"] is True
    assert pos_chk["flue_temperature_present"] is True
    assert pos_chk["stack_flow_rate_present"] is True


def test_real_pipeline_outputs_and_no_synthetic_contamination() -> None:
    """Verify real P03 artifacts exist, satisfy all rules, and contain zero synthetic fixture IDs."""
    fac_cfg = load_yaml_file(REPO_ROOT / "config" / "facilities.yaml")
    assert len(fac_cfg["facilities"]) >= 25

    ef_cfg = load_yaml_file(REPO_ROOT / "config" / "emission_factors.yaml")
    for key, factor in ef_cfg["published_reference_factors"].items():
        assert factor["status"] == "unverified", f"Factor {key} must be marked unverified"
        assert str(factor["source_url"]).startswith("https://")

    inspection_path = REPO_ROOT / "results" / "data_inspection.json"
    splits_path = REPO_ROOT / "results" / "splits.json"
    proc_manifest_path = REPO_ROOT / "data" / "processed" / "preprocessing_manifest.json"
    data_card_path = REPO_ROOT / "docs" / "DATA_CARD.md"

    assert inspection_path.exists()
    assert splits_path.exists()
    assert proc_manifest_path.exists()
    assert data_card_path.exists()

    inspection = json.loads(inspection_path.read_text(encoding="utf-8"))
    splits = json.loads(splits_path.read_text(encoding="utf-8"))
    proc_manifest = json.loads(proc_manifest_path.read_text(encoding="utf-8"))
    data_card = data_card_path.read_text(encoding="utf-8")

    # Ensure synthetic fixture facility IDs (90001..90022) never appear in real outputs
    real_fids = set(inspection["dataset_summary"]["facility_ids"])
    assert real_fids.isdisjoint(set(range(90001, 90030)))
    assert len(real_fids) >= 25

    # Check splits.json has >= 20 facilities and 5 disjoint splits of integer facility IDs only
    assert splits["n_facilities"] >= 20
    assert splits["n_splits"] == 5
    for sp in splits["splits"]:
        tr, va, te = (
            set(sp["train_facility_ids"]),
            set(sp["val_facility_ids"]),
            set(sp["test_facility_ids"]),
        )
        assert tr.isdisjoint(va) and tr.isdisjoint(te) and va.isdisjoint(te)
        assert tr.issubset(real_fids) and va.issubset(real_fids) and te.issubset(real_fids)

    # Check processed Parquet files exist
    assert proc_manifest["summary"]["processed_rows"] > 100_000
    assert proc_manifest["summary"]["units_count"] >= 25
    for unit_entry in proc_manifest["units"]:
        p_file = REPO_ROOT / "data" / "processed" / unit_entry["parquet_file"]
        assert p_file.exists(), f"Missing unit Parquet file: {p_file}"

    # Check required statements in docs/DATA_CARD.md
    assert "US power-sector proxy for industrial installations" in data_card
    assert "circular" in data_card.lower()
    assert "synthetic_stack_o2_pct" in data_card
