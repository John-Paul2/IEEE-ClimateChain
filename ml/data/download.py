"""Download official US EPA CAMPD hourly Part 75 emissions data (Milestone P03, Task 2).

Fetches state-level hourly bulk CSV files from the official US EPA Clean Air Markets
Program Data (CAMPD) / EASEY bulk files service (`https://api.epa.gov/easey/bulk-files`)
for the reproducible 30-facility pool defined in `config/facilities.yaml`, filters to
the configured facility IDs and coal/natural-gas units so no excess data is retained,
and saves the raw CSV files and checksum manifest under `data/raw/` (git-ignored).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import pandas as pd
import requests

from ml.data.yaml_loader import load_yaml_file

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "facilities.yaml"
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"


def _build_headers() -> dict[str, str]:
    """Build HTTP headers, attaching optional CAMPD_API_KEY from .env without ever printing it."""
    load_dotenv(REPO_ROOT / ".env", override=False)
    headers: dict[str, str] = {
        "Accept": "text/csv,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "VeriCEMS-Research-Pipeline/1.0",
    }
    api_key = os.environ.get("CAMPD_API_KEY", "").strip()
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return "0x" + digest.hexdigest()


def download_campd_raw(
    config_path: Path = DEFAULT_CONFIG_PATH,
    raw_dir: Path = DEFAULT_RAW_DIR,
    force: bool = False,
    timeout_seconds: int = 120,
) -> dict[str, Any]:
    """Download and filter EPA CAMPD hourly bulk CSVs for the configured facility list."""
    config = load_yaml_file(config_path)
    year = int(config["calendar_year"])
    base_url = str(config["bulk_files_base_url"]).rstrip("/")
    states: list[str] = [str(s).upper() for s in config["states"]]
    allowed_fuels: set[str] = {str(f) for f in config["allowed_primary_fuels"]}
    facilities: list[dict[str, Any]] = list(config["facilities"])

    if len(facilities) < 25:
        raise ValueError(f"Expected at least 25 facilities in {config_path}, found {len(facilities)}")

    fuel_categories = {str(f["primary_fuel_category"]) for f in facilities}
    if not ({"Coal", "Natural Gas"} <= fuel_categories):
        raise ValueError(f"Facility list must mix Coal and Natural Gas; found {fuel_categories}")

    target_Ids: set[int] = {int(f["facility_id"]) for f in facilities}
    by_state_expected: dict[str, set[int]] = {st: set() for st in states}
    for fac in facilities:
        by_state_expected[str(fac["state"]).upper()].add(int(fac["facility_id"]))

    raw_dir.mkdir(parents=True, exist_ok=True)
    headers = _build_headers()

    manifest_files: list[dict[str, Any]] = []
    total_rows = 0
    found_facilities: set[int] = set()

    for state in states:
        out_csv = raw_dir / f"campd_hourly_{year}_{state}.csv"
        s3_rel_path = f"emissions/hourly/state/emissions-hourly-{year}-{state.lower()}.csv"
        source_url = f"{base_url}/{s3_rel_path}"
        expected_state_ids = by_state_expected[state]

        use_cached = False
        if out_csv.exists() and not force:
            cached_df = pd.read_csv(out_csv, low_memory=False)
            cached_ids = set(cached_df["Facility ID"].dropna().astype(int).unique())
            if expected_state_ids.issubset(cached_ids):
                use_cached = True
                df_filtered = cached_df

        if not use_cached:
            response = requests.get(source_url, headers=headers, timeout=timeout_seconds)
            if response.status_code in (401, 403):
                raise RuntimeError(
                    f"EPA CAMPD endpoint returned HTTP {response.status_code} for {source_url}. "
                    "STOP: Please provide a free EPA API key in .env as CAMPD_API_KEY."
                )
            response.raise_for_status()

            df_state = pd.read_csv(io.StringIO(response.text), low_memory=False)
            df_filtered = df_state[
                df_state["Facility ID"].isin(target_Ids)
                & df_state["Primary Fuel Type"].isin(allowed_fuels)
            ].copy()

            df_filtered.sort_values(
                by=["Facility ID", "Unit ID", "Date", "Hour"],
                inplace=True,
                kind="mergesort",
            )
            df_filtered.to_csv(out_csv, index=False, lineterminator="\n")

        state_found_ids = sorted(int(x) for x in df_filtered["Facility ID"].dropna().unique())
        missing_state_ids = sorted(expected_state_ids - set(state_found_ids))
        if missing_state_ids:
            raise RuntimeError(
                f"Missing expected facilities {missing_state_ids} in {state} file {out_csv}"
            )

        found_facilities.update(state_found_ids)
        row_count = int(len(df_filtered))
        total_rows += row_count

        manifest_files.append(
            {
                "state": state,
                "filename": out_csv.name,
                "source_url": source_url,
                "s3_path": s3_rel_path,
                "rows": row_count,
                "facilities_count": len(state_found_ids),
                "facility_ids": state_found_ids,
                "bytes": int(out_csv.stat().st_size),
                "sha256": _sha256_file(out_csv),
                "cached": use_cached,
            }
        )

    manifest: dict[str, Any] = {
        "schema_version": "1.0.0",
        "downloaded_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "calendar_year": year,
        "source_portal_url": str(config["source_portal_url"]),
        "bulk_files_base_url": base_url,
        "selection_rule": str(config["selection_rule"]),
        "states": states,
        "total_facilities": len(found_facilities),
        "facility_ids": sorted(found_facilities),
        "total_rows": total_rows,
        "files": manifest_files,
    }

    manifest_path = raw_dir / "download_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download official EPA CAMPD hourly emissions CSVs for configured facilities."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to config/facilities.yaml",
    )
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=DEFAULT_RAW_DIR,
        help="Directory to store raw filtered CSVs",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if raw CSV files already exist on disk",
    )
    args = parser.parse_args()
    manifest = download_campd_raw(
        config_path=args.config,
        raw_dir=args.raw_dir,
        force=args.force,
    )
    print(
        f"Downloaded/verified {manifest['total_rows']} hourly rows across "
        f"{manifest['total_facilities']} facilities ({', '.join(manifest['states'])}, "
        f"year {manifest['calendar_year']}) into {args.raw_dir}"
    )


if __name__ == "__main__":
    main()
