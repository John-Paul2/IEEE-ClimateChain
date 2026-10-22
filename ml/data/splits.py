"""Facility-grouped dataset splitting using GroupShuffleSplit (Milestone P03, Task 7).

Creates 5 repeated random facility-grouped splits (train / val / test) across at least
20 facilities using `sklearn.model_selection.GroupShuffleSplit` with fixed seeds and
writes the manifest to `results/splits.json` (containing facility IDs only).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from sklearn.model_selection import GroupShuffleSplit

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PROCESSED_MANIFEST = REPO_ROOT / "data" / "processed" / "preprocessing_manifest.json"
DEFAULT_SPLITS_PATH = REPO_ROOT / "results" / "splits.json"


def generate_facility_splits(
    facility_ids: Sequence[int],
    n_splits: int = 5,
    test_size: float = 0.20,
    val_size_of_trainval: float = 0.25,
    base_seed: int = 42,
    output_path: Path | None = DEFAULT_SPLITS_PATH,
) -> dict[str, Any]:
    """Generate `n_splits` facility-grouped train/val/test splits using GroupShuffleSplit."""
    unique_facilities = sorted({int(fid) for fid in facility_ids})
    if len(unique_facilities) < 20:
        raise ValueError(
            f"Facility pool must contain at least 20 facilities; got {len(unique_facilities)}"
        )
    if n_splits < 5:
        raise ValueError(f"Must generate at least 5 repeated splits; got {n_splits}")

    groups = np.array(unique_facilities, dtype=np.int64)
    dummy_x = np.zeros((len(groups), 1), dtype=np.float64)

    outer_splitter = GroupShuffleSplit(
        n_splits=n_splits,
        test_size=test_size,
        random_state=base_seed,
    )

    splits_list: list[dict[str, Any]] = []
    for split_idx, (trainval_indices, test_indices) in enumerate(
        outer_splitter.split(dummy_x, groups=groups)
    ):
        split_seed = int(base_seed + split_idx)
        trainval_groups = groups[trainval_indices]
        test_groups = groups[test_indices]

        inner_splitter = GroupShuffleSplit(
            n_splits=1,
            test_size=val_size_of_trainval,
            random_state=base_seed + 1000 + split_idx,
        )
        inner_x = np.zeros((len(trainval_groups), 1), dtype=np.float64)
        train_sub_idx, val_sub_idx = next(
            inner_splitter.split(inner_x, groups=trainval_groups)
        )

        train_fids = sorted(int(x) for x in trainval_groups[train_sub_idx])
        val_fids = sorted(int(x) for x in trainval_groups[val_sub_idx])
        test_fids = sorted(int(x) for x in test_groups)

        # Sanity-check zero leakage across train, val, and test
        assert set(train_fids).isdisjoint(val_fids)
        assert set(train_fids).isdisjoint(test_fids)
        assert set(val_fids).isdisjoint(test_fids)
        assert sorted(train_fids + val_fids + test_fids) == unique_facilities

        splits_list.append(
            {
                "split_index": int(split_idx),
                "seed": split_seed,
                "train_facility_ids": train_fids,
                "val_facility_ids": val_fids,
                "test_facility_ids": test_fids,
            }
        )

    manifest: dict[str, Any] = {
        "schema_version": "1.0.0",
        "splitter": "sklearn.model_selection.GroupShuffleSplit",
        "base_seed": int(base_seed),
        "n_splits": int(n_splits),
        "n_facilities": len(unique_facilities),
        "facility_ids": unique_facilities,
        "splits": splits_list,
    }

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    return manifest


def generate_splits_from_processed(
    processed_manifest_path: Path = DEFAULT_PROCESSED_MANIFEST,
    output_path: Path = DEFAULT_SPLITS_PATH,
    n_splits: int = 5,
    base_seed: int = 42,
) -> dict[str, Any]:
    """Load facility IDs from `preprocessing_manifest.json` and save `results/splits.json`."""
    if not processed_manifest_path.exists():
        raise FileNotFoundError(
            f"Missing {processed_manifest_path}. Run `python -m ml.data.preprocess` first."
        )
    proc_manifest = json.loads(processed_manifest_path.read_text(encoding="utf-8"))
    fids = sorted({int(u["facility_id"]) for u in proc_manifest["units"]})
    return generate_facility_splits(
        facility_ids=fids,
        n_splits=n_splits,
        base_seed=base_seed,
        output_path=output_path,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate 5 repeated GroupShuffleSplit facility-grouped splits."
    )
    parser.add_argument(
        "--processed-manifest", type=Path, default=DEFAULT_PROCESSED_MANIFEST
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_SPLITS_PATH)
    parser.add_argument("--n-splits", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    manifest = generate_splits_from_processed(
        processed_manifest_path=args.processed_manifest,
        output_path=args.output,
        n_splits=args.n_splits,
        base_seed=args.seed,
    )
    s0 = manifest["splits"][0]
    print(
        f"Generated {manifest['n_splits']} GroupShuffleSplit facility splits across "
        f"{manifest['n_facilities']} facilities -> {args.output} "
        f"(per split: {len(s0['train_facility_ids'])} train, "
        f"{len(s0['val_facility_ids'])} val, {len(s0['test_facility_ids'])} test)."
    )


if __name__ == "__main__":
    main()
