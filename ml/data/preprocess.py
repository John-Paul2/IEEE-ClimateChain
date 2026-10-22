"""Preprocess raw EPA CAMPD hourly CSVs into per-unit Parquet time series (Milestone P03, Task 6).

Documented Preprocessing Rules:
1. Keep Operating Hours Only: Retain rows with `Operating Time > 0` (`op_time_fraction > 0`).
   Offline/shutdown hours (`Operating Time == 0` or `NaN`), where stack emissions and load are
   structurally blank in 40 CFR Part 75 reporting, are removed and counted.
2. Canonical Timestamp & Ordering: Build `timestamp_utc` (`YYYY-MM-DDTHH:00:00Z`) from `Date`
   and `Hour` (`0..23`), sort chronologically within each `(facility_id, unit_id)` pair, and
   remove any duplicate `(facility_id, unit_id, timestamp_utc)` rows keeping the first entry.
3. Missing-Value Handling on Operating Hours (applied independently per unit time series):
   - Record boolean missingness indicators (`gross_load_missing_flag`, `steam_load_missing_flag`)
     prior to imputation.
   - Short isolated telemetry gaps (up to `max_interp_gap_hours = 3` consecutive operating hours)
     in numeric channels (`heat_input_mmbtu`, `co2_mass_short_tons`, `gross_load_mw`,
     `steam_load_1000_lb_hr`, `so2_mass_lbs`, `nox_mass_lbs`, `co2_rate_short_tons_mmbtu`) are
     filled via causal linear/forward interpolation within the same unit series (`limit=3`).
   - Core combustion channels (`heat_input_mmbtu`, `co2_mass_short_tons`): Any operating row where
     `heat_input_mmbtu` or `co2_mass_short_tons` remains `NaN` after short-gap interpolation, or
     where `heat_input_mmbtu <= 0` or `co2_mass_short_tons < 0`, is dropped and logged.
   - Auxiliary load and pollutant channels (`gross_load_mw`, `steam_load_1000_lb_hr`,
     `so2_mass_lbs`, `nox_mass_lbs`): Remaining `NaN` values (such as `Steam Load` on electric-only
     generating units) are filled with `0.0`. Remaining `NaN` values in `co2_rate_short_tons_mmbtu`
     are filled with `co2_mass_short_tons / heat_input_mmbtu`.
4. One Time Series per Unit: Write one Parquet file per unit under `data/processed/units/`
   (`facility_<id>_unit_<unit>.parquet`), alongside a combined Parquet dataset
   (`data/processed/campd_hourly_processed.parquet`) and `data/processed/preprocessing_manifest.json`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
from typing import Any

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"
DEFAULT_PROCESSED_DIR = REPO_ROOT / "data" / "processed"

NUMERIC_CHANNEL_MAP: dict[str, str] = {
    "Operating Time": "op_time_fraction",
    "Gross Load (MW)": "gross_load_mw",
    "Steam Load (1000 lb/hr)": "steam_load_1000_lb_hr",
    "Heat Input (mmBtu)": "heat_input_mmbtu",
    "CO2 Mass (short tons)": "co2_mass_short_tons",
    "CO2 Rate (short tons/mmBtu)": "co2_rate_short_tons_mmbtu",
    "SO2 Mass (lbs)": "so2_mass_lbs",
    "NOx Mass (lbs)": "nox_mass_lbs",
}


def _sanitize_unit_id(unit_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(unit_id).strip())


def preprocess_dataframe(
    raw_df: pd.DataFrame,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
    max_interp_gap_hours: int = 3,
) -> dict[str, Any]:
    """Preprocess raw CAMPD DataFrame and write one Parquet time series per unit."""
    total_raw_rows = int(len(raw_df))

    # Rule 1: Keep operating hours (Operating Time > 0)
    op_mask = raw_df["Operating Time"].fillna(0.0).astype(float) > 0.0
    op_df = raw_df.loc[op_mask].copy()
    operating_raw_rows = int(len(op_df))
    dropped_non_operating_rows = total_raw_rows - operating_raw_rows

    # Rule 2: Map columns to canonical names and construct UTC hourly timestamp
    df = pd.DataFrame()
    df["state"] = op_df["State"].astype(str)
    df["facility_id"] = op_df["Facility ID"].astype(int)
    df["facility_name"] = op_df["Facility Name"].astype(str)
    df["unit_id"] = op_df["Unit ID"].astype(str).str.strip()
    df["unit_series_id"] = (
        "FAC_" + df["facility_id"].astype(str) + "_UNIT_" + df["unit_id"].map(_sanitize_unit_id)
    )
    df["date"] = op_df["Date"].astype(str).str.strip()
    df["hour"] = op_df["Hour"].astype(int)
    df["timestamp_utc"] = (
        df["date"] + "T" + df["hour"].map(lambda h: f"{int(h):02d}") + ":00:00Z"
    )

    for raw_col, canon_col in NUMERIC_CHANNEL_MAP.items():
        if raw_col in op_df.columns:
            df[canon_col] = pd.to_numeric(op_df[raw_col], errors="coerce").astype(float)
        else:
            df[canon_col] = float("nan")

    df["primary_fuel_type"] = op_df["Primary Fuel Type"].fillna("Unknown").astype(str)
    df["unit_type"] = (
        op_df["Unit Type"].fillna("Unknown").astype(str)
        if "Unit Type" in op_df.columns
        else "Unknown"
    )
    df["co2_measure_indicator"] = (
        op_df["CO2 Mass Measure Indicator"].fillna("Missing").astype(str)
        if "CO2 Mass Measure Indicator" in op_df.columns
        else "Missing"
    )
    df["heat_input_measure_indicator"] = (
        op_df["Heat Input Measure Indicator"].fillna("Missing").astype(str)
        if "Heat Input Measure Indicator" in op_df.columns
        else "Missing"
    )

    units_dir = processed_dir / "units"
    units_dir.mkdir(parents=True, exist_ok=True)

    unit_frames: list[pd.DataFrame] = []
    unit_manifests: list[dict[str, Any]] = []
    total_duplicates_removed = 0
    total_interpolated_core_cells = 0
    total_dropped_missing_core_rows = 0

    interp_cols = [
        "gross_load_mw",
        "steam_load_1000_lb_hr",
        "heat_input_mmbtu",
        "co2_mass_short_tons",
        "co2_rate_short_tons_mmbtu",
        "so2_mass_lbs",
        "nox_mass_lbs",
    ]

    for (fac_id, unit_id), u_grp in df.groupby(["facility_id", "unit_id"], sort=True):
        u_df = u_grp.sort_values("timestamp_utc", kind="mergesort").copy()
        before_dedup = len(u_df)
        u_df = u_df.drop_duplicates(subset=["timestamp_utc"], keep="first").reset_index(drop=True)
        total_duplicates_removed += int(before_dedup - len(u_df))

        u_df["op_time_fraction"] = u_df["op_time_fraction"].clip(lower=0.0, upper=1.0)
        u_df["gross_load_missing_flag"] = u_df["gross_load_mw"].isna()
        u_df["steam_load_missing_flag"] = u_df["steam_load_1000_lb_hr"].isna()

        core_na_before = int(
            u_df["heat_input_mmbtu"].isna().sum() + u_df["co2_mass_short_tons"].isna().sum()
        )

        # Short-gap interpolation within the unit series
        if max_interp_gap_hours > 0 and len(u_df) > 1:
            for col in interp_cols:
                u_df[col] = u_df[col].interpolate(
                    method="linear",
                    limit=max_interp_gap_hours,
                    limit_direction="forward",
                )

        core_na_after = int(
            u_df["heat_input_mmbtu"].isna().sum() + u_df["co2_mass_short_tons"].isna().sum()
        )
        total_interpolated_core_cells += max(0, core_na_before - core_na_after)

        # Drop operating rows where core combustion channels remain missing or invalid
        valid_core_mask = (
            u_df["heat_input_mmbtu"].notna()
            & u_df["co2_mass_short_tons"].notna()
            & (u_df["heat_input_mmbtu"] > 0.0)
            & (u_df["co2_mass_short_tons"] >= 0.0)
        )
        dropped_core = int((~valid_core_mask).sum())
        total_dropped_missing_core_rows += dropped_core
        u_df = u_df.loc[valid_core_mask].reset_index(drop=True)

        if len(u_df) == 0:
            continue

        # Fill remaining auxiliary NaNs deterministically
        for col in ("gross_load_mw", "steam_load_1000_lb_hr", "so2_mass_lbs", "nox_mass_lbs"):
            u_df[col] = u_df[col].fillna(0.0).clip(lower=0.0)

        derived_rate = u_df["co2_mass_short_tons"] / u_df["heat_input_mmbtu"]
        u_df["co2_rate_short_tons_mmbtu"] = u_df["co2_rate_short_tons_mmbtu"].fillna(derived_rate)

        safe_unit = _sanitize_unit_id(str(unit_id))
        unit_filename = f"facility_{int(fac_id)}_unit_{safe_unit}.parquet"
        unit_path = units_dir / unit_filename
        u_df.to_parquet(unit_path, index=False, engine="pyarrow")

        unit_frames.append(u_df)
        unit_manifests.append(
            {
                "facility_id": int(fac_id),
                "facility_name": str(u_df["facility_name"].iloc[0]),
                "state": str(u_df["state"].iloc[0]),
                "unit_id": str(unit_id),
                "unit_series_id": str(u_df["unit_series_id"].iloc[0]),
                "primary_fuel_type": str(u_df["primary_fuel_type"].iloc[0]),
                "unit_type": str(u_df["unit_type"].iloc[0]),
                "rows": int(len(u_df)),
                "dropped_core_missing_rows": dropped_core,
                "start_timestamp_utc": str(u_df["timestamp_utc"].iloc[0]),
                "end_timestamp_utc": str(u_df["timestamp_utc"].iloc[-1]),
                "parquet_file": f"units/{unit_filename}",
            }
        )

    combined_df = (
        pd.concat(unit_frames, ignore_index=True)
        if unit_frames
        else pd.DataFrame()
    )
    combined_parquet_path = processed_dir / "campd_hourly_processed.parquet"
    if len(combined_df) > 0:
        combined_df.to_parquet(combined_parquet_path, index=False, engine="pyarrow")

    manifest: dict[str, Any] = {
        "schema_version": "1.0.0",
        "rules": {
            "operating_hours_filter": "Operating Time > 0",
            "max_interp_gap_hours": max_interp_gap_hours,
            "core_channels_required": ["heat_input_mmbtu", "co2_mass_short_tons"],
            "auxiliary_channels_zero_filled": [
                "gross_load_mw",
                "steam_load_1000_lb_hr",
                "so2_mass_lbs",
                "nox_mass_lbs",
            ],
            "one_time_series_per_unit": True,
        },
        "summary": {
            "total_raw_rows": total_raw_rows,
            "operating_raw_rows": operating_raw_rows,
            "dropped_non_operating_rows": dropped_non_operating_rows,
            "duplicates_removed": total_duplicates_removed,
            "interpolated_core_cells": total_interpolated_core_cells,
            "dropped_missing_core_rows": total_dropped_missing_core_rows,
            "processed_rows": int(len(combined_df)),
            "facilities_count": int(combined_df["facility_id"].nunique())
            if len(combined_df) > 0
            else 0,
            "units_count": len(unit_manifests),
            "combined_parquet": combined_parquet_path.name,
        },
        "units": unit_manifests,
    }

    manifest_path = processed_dir / "preprocessing_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def preprocess_raw_directory(
    raw_dir: Path = DEFAULT_RAW_DIR,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
    max_interp_gap_hours: int = 3,
) -> dict[str, Any]:
    """Load raw CAMPD CSVs from `raw_dir` and preprocess to `processed_dir`."""
    csv_files = sorted(raw_dir.glob("campd_hourly_*.csv"))
    if not csv_files:
        raise FileNotFoundError(
            f"No campd_hourly_*.csv files found in {raw_dir}. Run `python -m ml.data.download` first."
        )
    frames = [pd.read_csv(f, low_memory=False) for f in csv_files]
    full_df = pd.concat(frames, ignore_index=True)
    return preprocess_dataframe(
        full_df,
        processed_dir=processed_dir,
        max_interp_gap_hours=max_interp_gap_hours,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Preprocess raw EPA CAMPD CSVs into per-unit Parquet files."
    )
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    parser.add_argument("--max-interp-gap", type=int, default=3)
    args = parser.parse_args()

    manifest = preprocess_raw_directory(
        raw_dir=args.raw_dir,
        processed_dir=args.processed_dir,
        max_interp_gap_hours=args.max_interp_gap,
    )
    s = manifest["summary"]
    print(
        f"Preprocessed {s['processed_rows']} operating rows across {s['facilities_count']} "
        f"facilities and {s['units_count']} unit time series into {args.processed_dir} "
        f"(dropped {s['dropped_non_operating_rows']} offline rows and "
        f"{s['dropped_missing_core_rows']} missing-core rows)."
    )


if __name__ == "__main__":
    main()
