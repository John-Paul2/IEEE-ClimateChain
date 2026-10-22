"""Training and validation calibration entry point for VeriCEMS detectors (`python -m ml.train --split 0`).

Trains:
1. Baseline 1 (`StaticThresholdDetector`) on TRAINING facilities only; calibrates on VALIDATION facilities.
2. Baseline 2 (`MassBalancePhysicsDetector`) on TRAINING facilities only; calibrates on VALIDATION facilities.
3. Proposed Detector (`PhysicsInformedAutoencoderNet` + chain + physics + spectral + `fuel_ledger_synthetic`
   cross-source check) on TRAINING facilities only, with early stopping and threshold calibration on
   VALIDATION facilities.

Never touches test-split facilities (`test_facility_ids` are held out for Milestone P08).

Saves compact, deterministic artifacts (< 5 MB total) to `ml/artifacts/`:
- `ml/artifacts/model.onnx`
- `ml/artifacts/scalers.json`
- `ml/artifacts/thresholds.json`
- `ml/artifacts/training_curves.json`
- `ml/artifacts/training_curves.png`
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from backend.vericems.detectors.autoencoder import (
    set_deterministic_seed,
    train_physics_informed_autoencoder,
)
from backend.vericems.detectors.baseline_physics import MassBalancePhysicsDetector
from backend.vericems.detectors.baseline_static import StaticThresholdDetector
from backend.vericems.detectors.features import add_fuel_ledger_synthetic_column
from backend.vericems.detectors.verifier import DEFAULT_ARTIFACTS_DIR, ProposedDetector
from ml.data.yaml_loader import load_yaml_file

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROCESSED_PARQUET = REPO_ROOT / "data" / "processed" / "campd_hourly_processed.parquet"
DEFAULT_SPLITS_PATH = REPO_ROOT / "results" / "splits.json"
DEFAULT_PARAMS_PATH = REPO_ROOT / "config" / "params.yaml"


def _save_training_curves_plot(
    history: list[dict[str, float]],
    best_epoch: int,
    output_png: Path,
) -> None:
    """Render a compact dark-themed training vs. validation loss plot to `output_png`."""
    if not history:
        return
    epochs = [int(h["epoch"]) for h in history]
    tr_tot = [float(h["train_total_loss"]) for h in history]
    va_tot = [float(h["val_total_loss"]) for h in history]
    tr_phy = [float(h["train_physics_loss"]) for h in history]
    va_phy = [float(h["val_physics_loss"]) for h in history]

    fig, ax = plt.subplots(figsize=(7.5, 4.2), dpi=120)
    fig.patch.set_facecolor("#0B1220")
    ax.set_facecolor("#111A2E")

    ax.plot(epochs, tr_tot, label="Train Total Loss", color="#60A5FA", linewidth=2.0)
    ax.plot(epochs, va_tot, label="Val Total Loss", color="#2DD4BF", linewidth=2.0)
    ax.plot(
        epochs,
        tr_phy,
        label="Train Physics Penalty",
        color="#F59E0B",
        linestyle="--",
        linewidth=1.5,
    )
    ax.plot(
        epochs,
        va_phy,
        label="Val Physics Penalty",
        color="#F43F5E",
        linestyle=":",
        linewidth=1.5,
    )

    if best_epoch > 0:
        ax.axvline(
            best_epoch,
            color="#8FA0BF",
            linestyle="-.",
            linewidth=1.2,
            label=f"Best Val Epoch ({best_epoch})",
        )

    ax.set_title(
        "Physics-Informed Autoencoder Training & Validation Loss",
        color="#E6EDF7",
        fontsize=11,
        pad=10,
    )
    ax.set_xlabel("Epoch", color="#E6EDF7", fontsize=10)
    ax.set_ylabel("Loss (MSE + Physics Penalty)", color="#E6EDF7", fontsize=10)
    ax.tick_params(colors="#8FA0BF")
    for spine in ax.spines.values():
        spine.set_color("#1F2A44")
    ax.grid(True, color="#1F2A44", linestyle="--", alpha=0.6)
    leg = ax.legend(facecolor="#0B1220", edgecolor="#1F2A44", fontsize=8.5)
    for text in leg.get_texts():
        text.set_color("#E6EDF7")

    output_png.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_png, facecolor=fig.get_facecolor(), dpi=120)
    plt.close(fig)


def run_training_pipeline(
    *,
    split_index: int = 0,
    processed_parquet_path: Path = DEFAULT_PROCESSED_PARQUET,
    splits_path: Path = DEFAULT_SPLITS_PATH,
    params_path: Path = DEFAULT_PARAMS_PATH,
    artifacts_dir: Path = DEFAULT_ARTIFACTS_DIR,
    max_epochs_override: int | None = None,
) -> dict[str, Any]:
    """Train all three detectors on `split_index` and save artifacts to `artifacts_dir`."""
    if not processed_parquet_path.exists():
        raise FileNotFoundError(
            f"Missing processed Parquet dataset {processed_parquet_path}. "
            "Run `python -m ml.data.preprocess` first."
        )
    if not splits_path.exists():
        raise FileNotFoundError(
            f"Missing splits file {splits_path}. Run `python -m ml.data.splits` first."
        )

    splits_manifest = json.loads(splits_path.read_text(encoding="utf-8"))
    splits_list = splits_manifest["splits"]
    matching_splits = [s for s in splits_list if int(s["split_index"]) == int(split_index)]
    if not matching_splits:
        raise ValueError(f"split_index={split_index} not found in {splits_path}")
    split_obj = matching_splits[0]

    train_fids = sorted(int(f) for f in split_obj["train_facility_ids"])
    val_fids = sorted(int(f) for f in split_obj["val_facility_ids"])
    test_fids = sorted(int(f) for f in split_obj["test_facility_ids"])

    # Strict facility-disjointness assertion (Zero Facility Leakage)
    assert set(train_fids).isdisjoint(val_fids), "Train and Val facilities must be disjoint!"
    assert set(train_fids).isdisjoint(test_fids), "Train and Test facilities must be disjoint!"
    assert set(val_fids).isdisjoint(test_fids), "Val and Test facilities must be disjoint!"

    params = load_yaml_file(params_path) if params_path.exists() else {}
    det_cfg = params.get("detectors", {})
    ae_cfg = det_cfg.get("autoencoder", {})

    target_fpr = float(det_cfg.get("target_fpr", 0.02))
    window_size = int(det_cfg.get("rolling_window_hours", 8))
    noise_std_frac = float(det_cfg.get("fuel_ledger_synthetic_noise_std_fraction", 0.0015))

    seed = int(ae_cfg.get("seed", split_obj.get("seed", 42)))
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

    set_deterministic_seed(seed)

    full_df = pd.read_parquet(processed_parquet_path)
    # Partition strictly into train and validation DataFrames (test facilities are NEVER loaded)
    train_df = full_df.loc[full_df["facility_id"].isin(train_fids)].reset_index(drop=True)
    val_df = full_df.loc[full_df["facility_id"].isin(val_fids)].reset_index(drop=True)

    assert set(train_df["facility_id"].unique()).issubset(train_fids)
    assert set(val_df["facility_id"].unique()).issubset(val_fids)
    assert set(train_df["facility_id"].unique()).isdisjoint(test_fids)
    assert set(val_df["facility_id"].unique()).isdisjoint(test_fids)

    # Populate synthetic `fuel_ledger_synthetic` channel for cross-source calibration
    train_df = add_fuel_ledger_synthetic_column(
        train_df, seed=seed, noise_std_fraction=noise_std_frac
    )
    val_df = add_fuel_ledger_synthetic_column(
        val_df, seed=seed, noise_std_fraction=noise_std_frac
    )

    artifacts_dir = Path(artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = artifacts_dir / "model.onnx"
    scalers_path = artifacts_dir / "scalers.json"
    thresholds_path = artifacts_dir / "thresholds.json"
    curves_json_path = artifacts_dir / "training_curves.json"
    curves_png_path = artifacts_dir / "training_curves.png"

    # 1. Baseline 1: Static Threshold Detector (fit on train_df, calibrate on val_df)
    baseline1 = StaticThresholdDetector()
    baseline1.fit(train_df, target_fpr=target_fpr)
    b1_cal = baseline1.calibrate(val_df, target_fpr=target_fpr, window_size=window_size)

    # 2. Baseline 2: Mass-Balance & Load-Consistency Physics Detector (fit on train_df, calibrate on val_df)
    baseline2 = MassBalancePhysicsDetector()
    baseline2.fit(train_df, target_fpr=target_fpr)
    b2_cal = baseline2.calibrate(val_df, target_fpr=target_fpr, window_size=window_size)

    # Also populate facility_fuel_map for all known facilities from config/facilities.yaml if available
    # (fuel type is static plant metadata, never a target label, though we keep trained_facility_ids strict)
    fac_yaml_path = REPO_ROOT / "config" / "facilities.yaml"
    if fac_yaml_path.exists():
        fac_yaml = load_yaml_file(fac_yaml_path)
        for f_entry in fac_yaml.get("facilities", []):
            fid = int(f_entry["facility_id"])
            if fid not in baseline2.facility_fuel_map and f_entry.get("primary_fuels"):
                baseline2.facility_fuel_map[fid] = str(f_entry["primary_fuels"][0])

    # 3. Proposed Detector: Physics-Informed Autoencoder (train on train_df, early stop on val_df)
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

    from backend.vericems.detectors.autoencoder import OnnxAutoencoderRunner

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
    prop_cal = proposed.calibrate(
        val_df, target_fpr=target_fpr, window_size=window_size, seed=seed
    )

    # 4. Write artifacts to `ml/artifacts/`
    scalers_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "split_index": int(split_index),
        "seed": int(seed),
        "model_hash": ae_out.model_hash,
        "trained_facility_ids": train_fids,
        "val_facility_ids": val_fids,
        "channel_scaler": ae_out.scaler.to_dict(),
        "fuel_ratios": {str(k): float(v) for k, v in ae_out.fuel_ratios.items()},
        "global_ratio": float(ae_out.global_ratio),
        "physics_penalty_weight": float(phys_weight),
        "fuel_ledger_synthetic": {
            "channel_name": "fuel_ledger_synthetic",
            "source": "synthetic",
            "noise_std_fraction": float(noise_std_frac),
            "description": "Synthetic fuel ledger cross-check channel derived from true heat input plus calibrated meter noise.",
        },
    }
    scalers_path.write_text(
        json.dumps(scalers_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    thresholds_payload = proposed.to_thresholds_dict()
    thresholds_payload["split_index"] = int(split_index)
    thresholds_payload["seed"] = int(seed)
    thresholds_path.write_text(
        json.dumps(thresholds_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    curves_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "split_index": int(split_index),
        "seed": int(seed),
        "model_hash": ae_out.model_hash,
        "best_epoch": int(ae_out.best_epoch),
        "best_train_loss": float(ae_out.best_train_loss),
        "best_val_loss": float(ae_out.best_val_loss),
        "epochs": ae_out.training_history,
    }
    curves_json_path.write_text(
        json.dumps(curves_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    _save_training_curves_plot(ae_out.training_history, ae_out.best_epoch, curves_png_path)

    return {
        "split_index": int(split_index),
        "seed": int(seed),
        "train_rows": len(train_df),
        "val_rows": len(val_df),
        "train_facilities_count": len(train_fids),
        "val_facilities_count": len(val_fids),
        "model_hash": ae_out.model_hash,
        "best_epoch": ae_out.best_epoch,
        "best_train_loss": ae_out.best_train_loss,
        "best_val_loss": ae_out.best_val_loss,
        "target_fpr": target_fpr,
        "baseline_1_calibration": b1_cal,
        "baseline_2_calibration": b2_cal,
        "proposed_calibration": prop_cal,
        "artifacts": {
            "model_onnx": str(onnx_path),
            "scalers_json": str(scalers_path),
            "thresholds_json": str(thresholds_path),
            "training_curves_json": str(curves_json_path),
            "training_curves_png": str(curves_png_path),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train VeriCEMS anomaly detectors on facility-grouped split and export ONNX artifacts."
    )
    parser.add_argument("--split", type=int, default=0, help="Split index in results/splits.json (0..4).")
    parser.add_argument("--processed-parquet", type=Path, default=DEFAULT_PROCESSED_PARQUET)
    parser.add_argument("--splits", type=Path, default=DEFAULT_SPLITS_PATH)
    parser.add_argument("--params", type=Path, default=DEFAULT_PARAMS_PATH)
    parser.add_argument("--artifacts-dir", type=Path, default=DEFAULT_ARTIFACTS_DIR)
    parser.add_argument("--max-epochs", type=int, default=None)
    args = parser.parse_args()

    summary = run_training_pipeline(
        split_index=args.split,
        processed_parquet_path=args.processed_parquet,
        splits_path=args.splits,
        params_path=args.params,
        artifacts_dir=args.artifacts_dir,
        max_epochs_override=args.max_epochs,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
