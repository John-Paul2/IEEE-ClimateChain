"""Main reproducible benchmark runner (`python -m ml.benchmark.run_benchmark` / `make benchmark`).

Follows `VeriCEMS_Project_Guide.md` Section 14 Appendices C and D:
- Evaluates all 5 facility-grouped splits (`results/splits.json`).
- Trains detectors strictly on `train_facility_ids` and calibrates thresholds strictly on
  `val_facility_ids` (never touching `test_facility_ids` during training or threshold selection).
- Applies all 8 attack families (14 configurations) to a contiguous window of each held-out
  test-facility unit series and computes precision, recall, FPR, AUROC, and detection delay (hours).
- Sweeps target CO2 reductions for Adaptive White-Box Variants A and B to produce the
  reported-CO2-reduction vs. probability-of-detection curve.
- Outputs:
  - `results/benchmark_raw.csv`
  - `results/benchmark_summary.json`
  - `results/run_manifest.json`
  - `results/figures/roc_curves.png`
  - `results/figures/recall_per_attack_detector.png`
  - `results/figures/adaptive_attacker_curve.png`
  - `results/WHAT_STILL_GETS_THROUGH.md`
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import tempfile
import time
from typing import Any

import numpy as np
import pandas as pd

from backend.vericems.detectors.autoencoder import (
    OnnxAutoencoderRunner,
    set_deterministic_seed,
    train_physics_informed_autoencoder,
)
from backend.vericems.detectors.baseline_physics import MassBalancePhysicsDetector
from backend.vericems.detectors.baseline_static import StaticThresholdDetector
from backend.vericems.detectors.features import add_fuel_ledger_synthetic_column
from backend.vericems.detectors.verifier import DEFAULT_ARTIFACTS_DIR, ProposedDetector
from ml.attacks import (
    BENCHMARK_ATTACK_SPECS,
    attack_adaptive_whitebox_coordinated_insider,
    attack_adaptive_whitebox_single_source,
    resolve_attack_window,
    run_attack_by_id,
)
from ml.benchmark.metrics import (
    compute_roc_curve_points,
    compute_split_attack_metrics,
    score_series_with_all_detectors,
)
from ml.benchmark.report import (
    generate_what_still_gets_through_markdown,
    plot_adaptive_attacker_curve,
    plot_recall_per_attack,
    plot_roc_curves,
)
from ml.data.yaml_loader import load_yaml_file

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PROCESSED_PARQUET = REPO_ROOT / "data" / "processed" / "campd_hourly_processed.parquet"
if not DEFAULT_PROCESSED_PARQUET.exists() and (REPO_ROOT.parent / "data" / "processed" / "campd_hourly_processed.parquet").exists():
    DEFAULT_PROCESSED_PARQUET = REPO_ROOT.parent / "data" / "processed" / "campd_hourly_processed.parquet"
DEFAULT_SPLITS_PATH = REPO_ROOT / "results" / "splits.json"
DEFAULT_PARAMS_PATH = REPO_ROOT / "config" / "params.yaml"
DEFAULT_RESULTS_DIR = REPO_ROOT / "results"

ADAPTIVE_CURVE_REDUCTION_TARGETS: tuple[float, ...] = (
    2.0,
    3.0,
    4.0,
    5.0,
    7.5,
    10.0,
    15.0,
    20.0,
    25.0,
    30.0,
)

DETECTOR_KEYS: tuple[str, ...] = (
    "baseline_1_static",
    "baseline_2_physics",
    "proposed",
    "autoencoder_only",
)


def _get_git_commit_hash() -> str:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return res.stdout.strip()
    except Exception:
        return "uncommitted"


def _compute_file_sha256(path: Path) -> str:
    if not path.exists():
        return "missing"
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return "0x" + h.hexdigest()


def _get_library_versions() -> dict[str, str]:
    pkgs = (
        "numpy",
        "pandas",
        "scipy",
        "scikit-learn",
        "torch",
        "onnx",
        "onnxruntime",
        "cryptography",
        "matplotlib",
        "pyyaml",
    )
    out: dict[str, str] = {"python": platform.python_version()}
    for p in pkgs:
        try:
            out[p] = importlib.metadata.version(p)
        except Exception:
            out[p] = "unknown"
    return out


def _extract_test_unit_series_slices(
    test_df: pd.DataFrame,
    *,
    series_hours: int = 720,
    min_series_hours: int = 160,
) -> list[pd.DataFrame]:
    """Extract deterministic contiguous operating-hour slices for each unit series in `test_df`."""
    slices: list[pd.DataFrame] = []
    group_col = "unit_series_id" if "unit_series_id" in test_df.columns else "facility_id"
    for _, grp in test_df.groupby(group_col, sort=True):
        grp_sorted = grp.reset_index(drop=True)
        n = len(grp_sorted)
        if n < min_series_hours:
            continue
        if n <= series_hours:
            # Align length to a multiple of 8
            aligned_n = (n // 8) * 8
            if aligned_n >= min_series_hours:
                slices.append(grp_sorted.iloc[:aligned_n].reset_index(drop=True))
        else:
            # Take a deterministic mid-year contiguous window of `series_hours`
            start_offset = ((n - series_hours) // 16) * 8
            slices.append(
                grp_sorted.iloc[start_offset : start_offset + series_hours].reset_index(drop=True)
            )
    return slices


def _train_and_calibrate_split_detectors(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    *,
    onnx_path: Path,
    target_fpr: float,
    window_size: int,
    hidden_dim: int,
    latent_dim: int,
    learning_rate: float,
    batch_size: int,
    max_epochs: int,
    patience: int,
    phys_weight: float,
    seed: int,
) -> tuple[StaticThresholdDetector, MassBalancePhysicsDetector, ProposedDetector]:
    """Train and calibrate all 3 detectors on a single split (strictly using train_df and val_df)."""
    set_deterministic_seed(seed)

    train_fids = sorted(int(f) for f in train_df["facility_id"].unique())
    val_fids = sorted(int(f) for f in val_df["facility_id"].unique())
    assert set(train_fids).isdisjoint(val_fids), "Train/Val facility leakage detected!"

    # 1. Baseline 1: Static Threshold Detector
    baseline1 = StaticThresholdDetector()
    baseline1.fit(train_df, target_fpr=target_fpr)
    baseline1.calibrate(val_df, target_fpr=target_fpr, window_size=window_size)

    # 2. Baseline 2: Mass-Balance & Load-Consistency Physics Detector
    baseline2 = MassBalancePhysicsDetector()
    baseline2.fit(train_df, target_fpr=target_fpr)
    baseline2.calibrate(val_df, target_fpr=target_fpr, window_size=window_size)

    fac_yaml_path = REPO_ROOT / "config" / "facilities.yaml"
    if fac_yaml_path.exists():
        fac_yaml = load_yaml_file(fac_yaml_path)
        for f_entry in fac_yaml.get("facilities", []):
            fid = int(f_entry["facility_id"])
            if fid not in baseline2.facility_fuel_map and f_entry.get("primary_fuels"):
                baseline2.facility_fuel_map[fid] = str(f_entry["primary_fuels"][0])

    # 3. Physics-Informed Autoencoder + Proposed Detector
    ae_out = train_physics_informed_autoencoder(
        train_df=train_df,
        val_df=val_df,
        onnx_path=onnx_path,
        hidden_dim=hidden_dim,
        latent_dim=latent_dim,
        learning_rate=learning_rate,
        batch_size=batch_size,
        max_epochs=max_epochs,
        early_stopping_patience=patience,
        physics_penalty_weight=phys_weight,
        target_fpr=target_fpr,
        window_size=window_size,
        seed=seed,
    )

    ae_runner = OnnxAutoencoderRunner(
        onnx_path=onnx_path,
        scaler=ae_out.scaler,
        fuel_ratios=ae_out.fuel_ratios,
        global_ratio=ae_out.global_ratio,
        physics_penalty_weight=phys_weight,
        record_threshold=ae_out.record_threshold,
        batch_threshold=ae_out.batch_threshold,
    )

    proposed = ProposedDetector(
        physics_detector=baseline2,
        ae_runner=ae_runner,
        static_detector=baseline1,
        trained_facility_ids=train_fids,
        val_facility_ids=val_fids,
        target_fpr=target_fpr,
        window_size=window_size,
    )
    proposed.calibrate(val_df, target_fpr=target_fpr, window_size=window_size, seed=seed)

    return baseline1, baseline2, proposed


def run_full_benchmark(
    *,
    processed_parquet_path: Path = DEFAULT_PROCESSED_PARQUET,
    splits_path: Path = DEFAULT_SPLITS_PATH,
    params_path: Path = DEFAULT_PARAMS_PATH,
    results_dir: Path = DEFAULT_RESULTS_DIR,
    series_hours: int = 720,
    attack_fraction: float = 0.40,
    max_epochs_override: int | None = None,
) -> dict[str, Any]:
    """Run the complete 5-split benchmark across all 14 attack scenarios and adaptive curves."""
    t0 = time.perf_counter()

    if not processed_parquet_path.exists():
        raise FileNotFoundError(f"Missing processed Parquet dataset: {processed_parquet_path}")
    if not splits_path.exists():
        raise FileNotFoundError(f"Missing facility splits file: {splits_path}")

    splits_manifest = json.loads(splits_path.read_text(encoding="utf-8"))
    splits_list = splits_manifest["splits"]

    params = load_yaml_file(params_path) if params_path.exists() else {}
    det_cfg = params.get("detectors", {})
    ae_cfg = det_cfg.get("autoencoder", {})

    target_fpr = float(det_cfg.get("target_fpr", 0.02))
    window_size = int(det_cfg.get("rolling_window_hours", 8))
    noise_std_frac = float(det_cfg.get("fuel_ledger_synthetic_noise_std_fraction", 0.0015))

    hidden_dim = int(ae_cfg.get("hidden_dim", 16))
    latent_dim = int(ae_cfg.get("latent_dim", 3))
    learning_rate = float(ae_cfg.get("learning_rate", 0.002))
    batch_size = int(ae_cfg.get("batch_size", 512))
    max_epochs = (
        int(max_epochs_override)
        if max_epochs_override is not None
        else int(ae_cfg.get("max_epochs", 25))
    )
    patience = int(ae_cfg.get("early_stopping_patience", 5))
    phys_weight = float(ae_cfg.get("physics_penalty_weight", 0.50))

    full_df = pd.read_parquet(processed_parquet_path)

    raw_rows: list[dict[str, Any]] = []
    split_model_hashes: dict[str, str] = {}
    split_val_calibration: dict[str, Any] = {}

    # Store per-split ROC curves (across all attacks pooled per split)
    split_overall_roc: dict[str, list[dict[str, Any]]] = {k: [] for k in DETECTOR_KEYS}

    # Store adaptive attacker curve points per split
    adaptive_a_by_target: dict[float, list[dict[str, float]]] = {
        r: [] for r in ADAPTIVE_CURVE_REDUCTION_TARGETS
    }
    adaptive_b_by_target: dict[float, list[dict[str, float]]] = {
        r: [] for r in ADAPTIVE_CURVE_REDUCTION_TARGETS
    }

    with tempfile.TemporaryDirectory(prefix="vericems_bench_onnx_") as tmp_onnx_dir:
        tmp_onnx_root = Path(tmp_onnx_dir)

        for sp_obj in splits_list:
            sp_idx = int(sp_obj["split_index"])
            sp_seed = int(sp_obj["seed"])
            tr_fids = sorted(int(f) for f in sp_obj["train_facility_ids"])
            va_fids = sorted(int(f) for f in sp_obj["val_facility_ids"])
            te_fids = sorted(int(f) for f in sp_obj["test_facility_ids"])

            # Strict zero-leakage assertions
            assert set(tr_fids).isdisjoint(va_fids), f"Split {sp_idx} train/val overlap"
            assert set(tr_fids).isdisjoint(te_fids), f"Split {sp_idx} train/test overlap"
            assert set(va_fids).isdisjoint(te_fids), f"Split {sp_idx} val/test overlap"

            train_df = full_df.loc[full_df["facility_id"].isin(tr_fids)].reset_index(drop=True)
            val_df = full_df.loc[full_df["facility_id"].isin(va_fids)].reset_index(drop=True)
            test_df = full_df.loc[full_df["facility_id"].isin(te_fids)].reset_index(drop=True)

            # Populate deterministic synthetic `fuel_ledger_synthetic` channel per facility
            train_df = add_fuel_ledger_synthetic_column(
                train_df, seed=sp_seed, noise_std_fraction=noise_std_frac
            )
            val_df = add_fuel_ledger_synthetic_column(
                val_df, seed=sp_seed, noise_std_fraction=noise_std_frac
            )
            test_df = add_fuel_ledger_synthetic_column(
                test_df, seed=sp_seed, noise_std_fraction=noise_std_frac
            )

            onnx_file = tmp_onnx_root / f"model_split_{sp_idx}.onnx"
            b1_det, b2_det, prop_det = _train_and_calibrate_split_detectors(
                train_df=train_df,
                val_df=val_df,
                onnx_path=onnx_file,
                target_fpr=target_fpr,
                window_size=window_size,
                hidden_dim=hidden_dim,
                latent_dim=latent_dim,
                learning_rate=learning_rate,
                batch_size=batch_size,
                max_epochs=max_epochs,
                patience=patience,
                phys_weight=phys_weight,
                seed=sp_seed,
            )

            split_model_hashes[f"split_{sp_idx}"] = prop_det.model_hash
            split_val_calibration[f"split_{sp_idx}"] = {
                "seed": sp_seed,
                "model_hash": prop_det.model_hash,
                "baseline_1_val_record_fpr": b1_det.val_record_fpr,
                "baseline_2_val_record_fpr": b2_det.val_record_fpr,
                "proposed_val_record_fpr": prop_det.val_record_fpr,
                "proposed_thresholds": {
                    "physics_threshold": prop_det.physics_threshold,
                    "ae_threshold": prop_det.ae_threshold,
                    "flatness_threshold": prop_det.flatness_threshold,
                    "repeat_threshold": prop_det.repeat_threshold,
                    "cross_source_rel_threshold": prop_det.cross_source_rel_threshold,
                    "combined_batch_threshold": prop_det.combined_batch_threshold,
                },
            }

            test_slices = _extract_test_unit_series_slices(
                test_df, series_hours=series_hours
            )

            pooled_labels_for_roc: list[np.ndarray] = []
            pooled_scores_for_roc: dict[str, list[np.ndarray]] = {k: [] for k in DETECTOR_KEYS}

            # Evaluate all 14 benchmark attacks on held-out test slices
            for atk_spec in BENCHMARK_ATTACK_SPECS:
                aid = str(atk_spec["attack_id"])
                afam = str(atk_spec["attack_family"])
                aname = str(atk_spec["attack_name"])

                s_labels: list[np.ndarray] = []
                s_bounds: list[tuple[int, int]] = []
                s_reductions: list[float] = []
                s_det_scores: dict[str, list[np.ndarray]] = {k: [] for k in DETECTOR_KEYS}
                s_det_preds: dict[str, list[np.ndarray]] = {k: [] for k in DETECTOR_KEYS}

                for u_df in test_slices:
                    atk_res = run_attack_by_id(
                        aid,
                        u_df,
                        detector=prop_det,
                        attack_fraction=attack_fraction,
                        seed=sp_seed,
                        sign_packets=False,
                    )
                    w_start = int(atk_res.metadata.get("window_start", 0))
                    w_end = int(atk_res.metadata.get("window_end", len(u_df)))

                    s_labels.append(atk_res.labels)
                    s_bounds.append((w_start, w_end))
                    s_reductions.append(atk_res.co2_reduction_pct)
                    pooled_labels_for_roc.append(atk_res.labels)

                    scored_map = score_series_with_all_detectors(
                        atk_res,
                        static_detector=b1_det,
                        physics_detector=b2_det,
                        proposed_detector=prop_det,
                        window_size=window_size,
                    )
                    for d_key in DETECTOR_KEYS:
                        s_det_scores[d_key].append(scored_map[d_key]["scores"])
                        s_det_preds[d_key].append(scored_map[d_key]["preds"])
                        pooled_scores_for_roc[d_key].append(scored_map[d_key]["scores"])

                mean_co2_red = float(np.mean(s_reductions)) if s_reductions else 0.0
                n_total_rec = int(sum(len(x) for x in s_labels))
                n_atk_rec = int(sum(int(np.sum(x == 1)) for x in s_labels))

                for d_key in DETECTOR_KEYS:
                    m = compute_split_attack_metrics(
                        s_labels,
                        s_det_scores[d_key],
                        s_det_preds[d_key],
                        s_bounds,
                    )
                    raw_rows.append(
                        {
                            "split_index": sp_idx,
                            "seed": sp_seed,
                            "attack_id": aid,
                            "attack_family": afam,
                            "attack_name": aname,
                            "detector": d_key,
                            "precision": round(m["precision"], 6),
                            "recall": round(m["recall"], 6),
                            "fpr": round(m["fpr"], 6),
                            "auroc": round(m["auroc"], 6),
                            "detection_delay_hours": round(m["detection_delay_hours"], 4),
                            "detected_series_delay_hours": round(
                                m["detected_series_delay_hours"], 4
                            ),
                            "detected_series_fraction": round(m["detected_series_fraction"], 4),
                            "co2_reduction_achieved_pct": round(mean_co2_red, 4),
                            "n_test_facilities": len(te_fids),
                            "n_test_series": len(test_slices),
                            "n_total_records": n_total_rec,
                            "n_attacked_records": n_atk_rec,
                        }
                    )

            # Compute pooled ROC curve for this split
            y_true_pool = np.concatenate(pooled_labels_for_roc)
            for d_key in DETECTOR_KEYS:
                y_score_pool = np.concatenate(pooled_scores_for_roc[d_key])
                split_overall_roc[d_key].append(
                    compute_roc_curve_points(y_true_pool, y_score_pool)
                )

            # Evaluate Adaptive Attacker Trade-Off Curve across target reduction percentages
            # Use a representative subset of test slices per split (up to 6 slices, 1 per test facility)
            curve_slices: list[pd.DataFrame] = []
            seen_fids: set[int] = set()
            for u_df in test_slices:
                fid = int(u_df["facility_id"].iloc[0])
                if fid not in seen_fids:
                    seen_fids.add(fid)
                    curve_slices.append(u_df.iloc[: min(len(u_df), 240)].reset_index(drop=True))

            for target_r in ADAPTIVE_CURVE_REDUCTION_TARGETS:
                # Variant A at target_r
                a_reds, a_prop_preds, a_b2_preds, a_b1_preds, a_lbls = [], [], [], [], []
                # Variant B at target_r
                b_reds, b_prop_preds, b_b2_preds, b_b1_preds, b_lbls = [], [], [], [], []

                for c_df in curve_slices:
                    res_a = attack_adaptive_whitebox_single_source(
                        c_df,
                        detector=prop_det,
                        target_reduction_pct=target_r,
                        attack_fraction=attack_fraction,
                        window_size=window_size,
                        sign_packets=False,
                    )
                    sc_a = score_series_with_all_detectors(
                        res_a,
                        static_detector=b1_det,
                        physics_detector=b2_det,
                        proposed_detector=prop_det,
                        window_size=window_size,
                    )
                    atk_mask_a = res_a.labels == 1
                    a_reds.append(res_a.co2_reduction_pct)
                    a_lbls.append(res_a.labels[atk_mask_a])
                    a_prop_preds.append(sc_a["proposed"]["preds"][atk_mask_a])
                    a_b2_preds.append(sc_a["baseline_2_physics"]["preds"][atk_mask_a])
                    a_b1_preds.append(sc_a["baseline_1_static"]["preds"][atk_mask_a])

                    res_b = attack_adaptive_whitebox_coordinated_insider(
                        c_df,
                        detector=prop_det,
                        target_reduction_pct=target_r,
                        attack_fraction=attack_fraction,
                        window_size=window_size,
                        sign_packets=False,
                    )
                    sc_b = score_series_with_all_detectors(
                        res_b,
                        static_detector=b1_det,
                        physics_detector=b2_det,
                        proposed_detector=prop_det,
                        window_size=window_size,
                    )
                    atk_mask_b = res_b.labels == 1
                    b_reds.append(res_b.co2_reduction_pct)
                    b_lbls.append(res_b.labels[atk_mask_b])
                    b_prop_preds.append(sc_b["proposed"]["preds"][atk_mask_b])
                    b_b2_preds.append(sc_b["baseline_2_physics"]["preds"][atk_mask_b])
                    b_b1_preds.append(sc_b["baseline_1_static"]["preds"][atk_mask_b])

                adaptive_a_by_target[target_r].append(
                    {
                        "achieved_reduction_pct": float(np.mean(a_reds)),
                        "proposed_detection_prob": float(np.mean(np.concatenate(a_prop_preds))),
                        "baseline_2_detection_prob": float(np.mean(np.concatenate(a_b2_preds))),
                        "baseline_1_detection_prob": float(np.mean(np.concatenate(a_b1_preds))),
                    }
                )
                adaptive_b_by_target[target_r].append(
                    {
                        "achieved_reduction_pct": float(np.mean(b_reds)),
                        "proposed_detection_prob": float(np.mean(np.concatenate(b_prop_preds))),
                        "baseline_2_detection_prob": float(np.mean(np.concatenate(b_b2_preds))),
                        "baseline_1_detection_prob": float(np.mean(np.concatenate(b_b1_preds))),
                    }
                )

    results_dir = Path(results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir = results_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)

    # 1. Save results/benchmark_raw.csv
    raw_df = pd.DataFrame(raw_rows)
    raw_csv_path = results_dir / "benchmark_raw.csv"
    raw_df.to_csv(raw_csv_path, index=False)

    # 2. Aggregate mean and std across splits for results/benchmark_summary.json
    attacks_summary: dict[str, Any] = {}
    for atk_spec in BENCHMARK_ATTACK_SPECS:
        aid = str(atk_spec["attack_id"])
        afam = str(atk_spec["attack_family"])
        aname = str(atk_spec["attack_name"])
        sub_atk = raw_df.loc[raw_df["attack_id"] == aid]

        # Achieved CO2 reduction across splits (identical across detectors for a given attack & split)
        sub_prop = sub_atk.loc[sub_atk["detector"] == "proposed"]
        red_vals = sub_prop["co2_reduction_achieved_pct"].to_numpy(dtype=np.float64)

        det_entries: dict[str, Any] = {}
        for d_key in DETECTOR_KEYS:
            sub_d = sub_atk.loc[sub_atk["detector"] == d_key]
            metrics_agg: dict[str, dict[str, float]] = {}
            for m_col in (
                "precision",
                "recall",
                "fpr",
                "auroc",
                "detection_delay_hours",
                "detected_series_delay_hours",
                "detected_series_fraction",
            ):
                arr = sub_d[m_col].to_numpy(dtype=np.float64)
                metrics_agg[m_col] = {
                    "mean": round(float(np.mean(arr)), 6),
                    "std": round(float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0, 6),
                }
            det_entries[d_key] = metrics_agg

        attacks_summary[aid] = {
            "attack_id": aid,
            "attack_family": afam,
            "attack_name": aname,
            "co2_reduction_achieved_pct": {
                "mean": round(float(np.mean(red_vals)), 4),
                "std": round(float(np.std(red_vals, ddof=1)) if len(red_vals) > 1 else 0.0, 4),
            },
            "detectors": det_entries,
        }

    # Aggregate macro-averages across all 14 attacks per detector
    overall_by_detector: dict[str, Any] = {}
    for d_key in DETECTOR_KEYS:
        sub_d = raw_df.loc[raw_df["detector"] == d_key]
        # Compute per-split macro-average first, then mean & std across splits
        split_means = sub_d.groupby("split_index")[
            ["precision", "recall", "fpr", "auroc", "detection_delay_hours"]
        ].mean()
        overall_by_detector[d_key] = {
            col: {
                "mean": round(float(split_means[col].mean()), 6),
                "std": round(float(split_means[col].std(ddof=1)), 6),
            }
            for col in ("precision", "recall", "fpr", "auroc", "detection_delay_hours")
        }

    # Aggregate ROC curves across splits
    roc_curves_overall: dict[str, Any] = {}
    for d_key, roc_list in split_overall_roc.items():
        if not roc_list:
            continue
        fpr_grid = roc_list[0]["fpr"]
        tpr_mat = np.array([r["tpr"] for r in roc_list], dtype=np.float64)
        aurocs = np.array([r["auroc"] for r in roc_list], dtype=np.float64)
        roc_curves_overall[d_key] = {
            "fpr": fpr_grid,
            "tpr_mean": [round(float(x), 5) for x in np.mean(tpr_mat, axis=0)],
            "tpr_std": [
                round(float(x), 5)
                for x in (np.std(tpr_mat, axis=0, ddof=1) if len(roc_list) > 1 else np.zeros_like(tpr_mat[0]))
            ],
            "auroc_mean": round(float(np.mean(aurocs)), 6),
            "auroc_std": round(float(np.std(aurocs, ddof=1)) if len(aurocs) > 1 else 0.0, 6),
        }

    # Aggregate Adaptive Attacker curves across splits
    def _agg_adaptive_curve(
        by_target: dict[float, list[dict[str, float]]]
    ) -> list[dict[str, float]]:
        curve_out: list[dict[str, float]] = []
        for target_r, pts in by_target.items():
            ach = np.array([p["achieved_reduction_pct"] for p in pts], dtype=np.float64)
            pr_p = np.array([p["proposed_detection_prob"] for p in pts], dtype=np.float64)
            b2_p = np.array([p["baseline_2_detection_prob"] for p in pts], dtype=np.float64)
            b1_p = np.array([p["baseline_1_detection_prob"] for p in pts], dtype=np.float64)
            ddof = 1 if len(pts) > 1 else 0
            curve_out.append(
                {
                    "target_reduction_pct": float(target_r),
                    "achieved_reduction_pct_mean": round(float(np.mean(ach)), 4),
                    "achieved_reduction_pct_std": round(float(np.std(ach, ddof=ddof)), 4),
                    "proposed_detection_prob_mean": round(float(np.mean(pr_p)), 6),
                    "proposed_detection_prob_std": round(float(np.std(pr_p, ddof=ddof)), 6),
                    "baseline_2_detection_prob_mean": round(float(np.mean(b2_p)), 6),
                    "baseline_2_detection_prob_std": round(float(np.std(b2_p, ddof=ddof)), 6),
                    "baseline_1_detection_prob_mean": round(float(np.mean(b1_p)), 6),
                    "baseline_1_detection_prob_std": round(float(np.std(b1_p, ddof=ddof)), 6),
                }
            )
        return curve_out

    adaptive_curve_summary = {
        "variant_a_single_source": _agg_adaptive_curve(adaptive_a_by_target),
        "variant_b_coordinated_insider": _agg_adaptive_curve(adaptive_b_by_target),
    }

    summary_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "n_splits": len(splits_list),
        "n_attacks": len(BENCHMARK_ATTACK_SPECS),
        "series_hours_evaluated_per_unit": int(series_hours),
        "attack_window_fraction": float(attack_fraction),
        "attack_window_hours": int(round(series_hours * attack_fraction)),
        "target_validation_fpr": float(target_fpr),
        "overall_macro_average": overall_by_detector,
        "attacks": attacks_summary,
        "adaptive_curve": adaptive_curve_summary,
        "roc_curves_overall": roc_curves_overall,
        "validation_calibration_by_split": split_val_calibration,
    }

    summary_json_path = results_dir / "benchmark_summary.json"
    summary_json_path.write_text(
        json.dumps(summary_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    # 3. Write results/run_manifest.json
    elapsed_sec = round(time.perf_counter() - t0, 3)
    manifest_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "git_commit_hash": _get_git_commit_hash(),
        "library_versions": _get_library_versions(),
        "base_seed": int(splits_manifest.get("base_seed", 42)),
        "split_seeds": [int(s["seed"]) for s in splits_list],
        "n_splits": len(splits_list),
        "n_facilities_total": int(splits_manifest.get("n_facilities", 29)),
        "data_hashes": {
            "campd_hourly_processed_parquet_sha256": _compute_file_sha256(processed_parquet_path),
            "preprocessing_manifest_json_sha256": _compute_file_sha256(
                processed_parquet_path.parent / "preprocessing_manifest.json"
            ),
            "splits_json_sha256": _compute_file_sha256(splits_path),
        },
        "split_onnx_model_hashes": split_model_hashes,
        "parameters": {
            "target_fpr": float(target_fpr),
            "rolling_window_hours": int(window_size),
            "series_hours_per_unit": int(series_hours),
            "attack_window_fraction": float(attack_fraction),
            "fuel_ledger_synthetic_noise_std_fraction": float(noise_std_frac),
            "autoencoder_hidden_dim": int(hidden_dim),
            "autoencoder_latent_dim": int(latent_dim),
            "autoencoder_max_epochs": int(max_epochs),
            "autoencoder_physics_penalty_weight": float(phys_weight),
        },
        "runtime_seconds": elapsed_sec,
    }
    manifest_path = results_dir / "run_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    # 4. Generate figures in results/figures/
    plot_roc_curves(summary_payload, figures_dir / "roc_curves.png")
    plot_recall_per_attack(summary_payload, figures_dir / "recall_per_attack_detector.png")
    plot_adaptive_attacker_curve(summary_payload, figures_dir / "adaptive_attacker_curve.png")

    # 5. Generate results/WHAT_STILL_GETS_THROUGH.md automatically from the numbers
    what_gets_through_path = results_dir / "WHAT_STILL_GETS_THROUGH.md"
    generate_what_still_gets_through_markdown(
        summary_payload, manifest_payload, what_gets_through_path
    )

    return {
        "benchmark_raw_csv": str(raw_csv_path),
        "benchmark_summary_json": str(summary_json_path),
        "run_manifest_json": str(manifest_path),
        "what_still_gets_through_md": str(what_gets_through_path),
        "figures": {
            "roc_curves_png": str(figures_dir / "roc_curves.png"),
            "recall_per_attack_detector_png": str(
                figures_dir / "recall_per_attack_detector.png"
            ),
            "adaptive_attacker_curve_png": str(figures_dir / "adaptive_attacker_curve.png"),
        },
        "runtime_seconds": elapsed_sec,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the reproducible VeriCEMS adversarial benchmark across all 5 facility splits."
    )
    parser.add_argument("--processed-parquet", type=Path, default=DEFAULT_PROCESSED_PARQUET)
    parser.add_argument("--splits", type=Path, default=DEFAULT_SPLITS_PATH)
    parser.add_argument("--params", type=Path, default=DEFAULT_PARAMS_PATH)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    parser.add_argument(
        "--series-hours",
        type=int,
        default=720,
        help="Contiguous operating hours evaluated per test unit series (default: 720 = 30 days).",
    )
    parser.add_argument(
        "--attack-fraction",
        type=float,
        default=0.40,
        help="Contiguous fraction of each test series attacked (default: 0.40 = 288 hours).",
    )
    parser.add_argument("--max-epochs", type=int, default=None)
    args = parser.parse_args()

    out = run_full_benchmark(
        processed_parquet_path=args.processed_parquet,
        splits_path=args.splits,
        params_path=args.params,
        results_dir=args.results_dir,
        series_hours=args.series_hours,
        attack_fraction=args.attack_fraction,
        max_epochs_override=args.max_epochs,
    )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
