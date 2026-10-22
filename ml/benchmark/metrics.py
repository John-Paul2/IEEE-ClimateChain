"""Evaluation metrics and detector scoring harness for `ml/benchmark/metrics.py`.

Computes for each split, attack, and detector:
- `precision`
- `recall`
- `fpr` (false-positive rate on clean records)
- `auroc` (Area Under the ROC Curve from continuous anomaly scores)
- `detection_delay_hours` (hours from attack window start to first true-positive detection;
  if a unit series is never detected during the attack window, its delay equals the full
  attack window length in hours)
- `detected_series_delay_hours` (mean delay across unit series where at least 1 record was detected)
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, roc_curve

from backend.vericems.crypto.packet import GENESIS_PREV_HASH, packet_hash
from backend.vericems.detectors.autoencoder import OnnxAutoencoderRunner
from backend.vericems.detectors.baseline_physics import MassBalancePhysicsDetector
from backend.vericems.detectors.baseline_static import StaticThresholdDetector
from backend.vericems.detectors.features import compute_window_spectral_features
from backend.vericems.detectors.verifier import ProposedDetector
from ml.attacks.base import AttackResult


def score_crypto_chain_per_record(
    n_records: int,
    packets: Sequence[dict[str, Any]],
) -> np.ndarray:
    """Evaluate cryptographic sequence continuity and `prev_hash` integrity mapped to `[0..n_records)`.

    Returns an array of length `n_records` where `0.0` = cryptographically valid and `2.0` =
    cryptographic violation (`SEQ_GAP`, `CHAIN_BREAK`, `SIG_INVALID`) at that record index.
    """
    scores = np.zeros(n_records, dtype=np.float64)
    if not packets:
        scores[:] = 2.0
        return scores

    present_seqs: set[int] = set()
    prev_h = GENESIS_PREV_HASH
    prev_seq = -1

    for pos_idx, pkt in enumerate(packets):
        curr_seq = int(pkt.get("seq", -1))
        actual_prev = str(pkt.get("prev_hash", ""))
        target_idx = min(max(pos_idx, 0), n_records - 1)

        # Check sequence continuity and uniqueness
        if curr_seq != prev_seq + 1 or curr_seq in present_seqs:
            scores[target_idx] = 2.0
            # If packets were dropped between prev_seq and curr_seq, flag the missing seq indices
            if curr_seq > prev_seq + 1:
                for missing_s in range(max(0, prev_seq + 1), min(n_records, curr_seq)):
                    scores[missing_s] = 2.0

        # Check hash chain link
        if actual_prev != prev_h:
            scores[target_idx] = 2.0

        present_seqs.add(curr_seq)
        prev_seq = curr_seq
        try:
            prev_h = packet_hash(pkt)
        except Exception:
            scores[target_idx] = 2.0
            prev_h = ""

    # Any trailing sequence numbers omitted at the end of the stream are also SEQ_GAPs
    for s in range(n_records):
        if s not in present_seqs:
            scores[s] = 2.0

    return scores


def score_series_with_all_detectors(
    attack_res: AttackResult,
    *,
    static_detector: StaticThresholdDetector,
    physics_detector: MassBalancePhysicsDetector,
    proposed_detector: ProposedDetector,
    window_size: int = 8,
) -> dict[str, dict[str, np.ndarray]]:
    """Run all 3 benchmark detectors (plus standalone `autoencoder_only`) on a single unit series `AttackResult`.

    For each detector, returns:
    - `scores`: Continuous normalized anomaly score per record (where `> 1.0` triggers a fraud flag).
    - `preds`: Binary prediction per record (`1` = flagged as fraud, `0` = clean).
    """
    df = attack_res.records
    n = len(df)
    if n == 0:
        empty_f = np.zeros(0, dtype=np.float64)
        empty_i = np.zeros(0, dtype=np.int64)
        return {
            k: {"scores": empty_f, "preds": empty_i}
            for k in ("baseline_1_static", "baseline_2_physics", "proposed", "autoencoder_only")
        }

    # 1. Baseline 1: Static Threshold Detector
    b1_raw = static_detector.score_records(df)
    b1_norm = b1_raw / max(static_detector.record_threshold, 1e-6)
    b1_preds = (b1_norm > 1.0).astype(np.int64)

    # 2. Baseline 2: Deterministic Mass-Balance & Load-Consistency Physics Detector
    b2_raw = physics_detector.score_records(df)
    b2_norm = b2_raw / max(physics_detector.record_threshold, 1e-6)
    b2_preds = (b2_norm > 1.0).astype(np.int64)

    # 3. Standalone Autoencoder (for direct ablation against Baseline 2 and Proposed)
    ae_raw = proposed_detector.ae_runner.score_records(df)
    ae_only_thresh = max(proposed_detector.ae_runner.record_threshold, 1e-6)
    ae_only_norm = ae_raw / ae_only_thresh
    ae_only_preds = (ae_only_norm > 1.0).astype(np.int64)

    # 4. Proposed Multi-Layer Detector (Crypto + Physics + ONNX AE + Spectral + Cross-Source)
    prop_phys_norm = b2_raw / max(proposed_detector.physics_threshold, 1e-6)
    prop_ae_norm = ae_raw / max(proposed_detector.ae_threshold, 1e-6)
    _, prop_cs_norm = proposed_detector.score_cross_source_records(df)
    crypto_norm = score_crypto_chain_per_record(n, attack_res.packets)

    # Rolling window spectral flatness & repeat scores across windows of `window_size`
    spec_norm = np.zeros(n, dtype=np.float64)
    co2_arr = df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
    hi_arr = df["heat_input_mmbtu"].to_numpy(dtype=np.float64)
    ld_arr = (
        df["gross_load_mw"].to_numpy(dtype=np.float64)
        if "gross_load_mw" in df.columns
        else np.zeros_like(co2_arr)
    )
    batch_scale = max(proposed_detector.combined_batch_threshold, 1.0)

    for w_start in range(0, n, window_size):
        w_end = min(n, w_start + window_size)
        if w_end - w_start < 4:
            continue
        # Evaluate current window for flatness
        sp_curr = compute_window_spectral_features(
            co2_arr[w_start:w_end],
            hi_arr[w_start:w_end],
            ld_arr[w_start:w_end],
        )
        flat_r = (sp_curr["flatness_score"] / max(proposed_detector.flatness_threshold, 1e-6)) / batch_scale
        rep_r = (sp_curr["repeat_score"] / max(proposed_detector.repeat_threshold, 1e-6)) / batch_scale

        # Also check 2-window history (matching verify_batch with history_packets) for 8-hour loop detection
        if w_start >= window_size:
            h_start = w_start - window_size
            sp_hist = compute_window_spectral_features(
                co2_arr[h_start:w_end],
                hi_arr[h_start:w_end],
                # Pass co2/hi with zeroed load so CEMS-only time-shifted loops are also caught by SPECTRAL_REPEAT
                np.zeros(w_end - h_start, dtype=np.float64),
            )
            rep_hist = (sp_hist["repeat_score"] / max(proposed_detector.repeat_threshold, 1e-6)) / batch_scale
            rep_r = max(rep_r, rep_hist)

        spec_norm[w_start:w_end] = max(flat_r, rep_r)

    prop_norm = np.maximum.reduce([prop_phys_norm, prop_ae_norm, prop_cs_norm, crypto_norm, spec_norm])
    prop_preds = (prop_norm > 1.0).astype(np.int64)

    return {
        "baseline_1_static": {"scores": b1_norm, "preds": b1_preds},
        "baseline_2_physics": {"scores": b2_norm, "preds": b2_preds},
        "proposed": {"scores": prop_norm, "preds": prop_preds},
        "autoencoder_only": {"scores": ae_only_norm, "preds": ae_only_preds},
    }


def compute_split_attack_metrics(
    series_labels: list[np.ndarray],
    series_scores: list[np.ndarray],
    series_preds: list[np.ndarray],
    series_window_bounds: list[tuple[int, int]],
) -> dict[str, Any]:
    """Compute aggregate classification and delay metrics across all test unit series in a split."""
    y_true = np.concatenate(series_labels) if series_labels else np.zeros(0, dtype=np.int64)
    y_score = np.concatenate(series_scores) if series_scores else np.zeros(0, dtype=np.float64)
    y_pred = np.concatenate(series_preds) if series_preds else np.zeros(0, dtype=np.int64)

    if len(y_true) == 0:
        return {
            "precision": 0.0,
            "recall": 0.0,
            "fpr": 0.0,
            "auroc": 0.5,
            "detection_delay_hours": 0.0,
            "detected_series_delay_hours": 0.0,
            "detected_series_fraction": 0.0,
        }

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))

    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

    # Clamp extreme scores for numerical stability in roc_auc_score
    y_score_clean = np.nan_to_num(y_score, nan=0.0, posinf=100.0, neginf=0.0)
    if len(np.unique(y_true)) >= 2:
        try:
            auroc = float(roc_auc_score(y_true, y_score_clean))
        except Exception:
            auroc = 0.5
    else:
        auroc = 0.5

    # Detection delay (in hours, 1 record = 1 operating hour) across unit series
    all_delays: list[float] = []
    detected_delays: list[float] = []
    for lbl_s, pred_s, (w_start, w_end) in zip(
        series_labels, series_preds, series_window_bounds
    ):
        win_len = max(1, w_end - w_start)
        atk_indices = np.flatnonzero((lbl_s == 1) & (pred_s == 1))
        # Filter to indices >= w_start
        atk_indices = atk_indices[atk_indices >= w_start]
        if len(atk_indices) > 0:
            first_det = int(atk_indices[0])
            delay_h = float(max(0, first_det - w_start))
            all_delays.append(delay_h)
            detected_delays.append(delay_h)
        else:
            # Undetected series takes full attack window duration
            all_delays.append(float(win_len))

    mean_delay = float(np.mean(all_delays)) if all_delays else 0.0
    mean_det_delay = (
        float(np.mean(detected_delays))
        if detected_delays
        else (float(np.mean(all_delays)) if all_delays else 0.0)
    )
    det_series_frac = float(len(detected_delays) / len(all_delays)) if all_delays else 0.0

    return {
        "precision": precision,
        "recall": recall,
        "fpr": fpr,
        "auroc": auroc,
        "detection_delay_hours": mean_delay,
        "detected_series_delay_hours": mean_det_delay,
        "detected_series_fraction": det_series_frac,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def compute_roc_curve_points(
    y_true: np.ndarray,
    y_score: np.ndarray,
    *,
    num_grid_points: int = 101,
) -> dict[str, Any]:
    """Compute interpolated ROC curve points `(fpr_grid, tpr_interp, auroc)` for plotting and JSON export."""
    y_score_clean = np.nan_to_num(y_score, nan=0.0, posinf=100.0, neginf=0.0)
    fpr_grid = np.linspace(0.0, 1.0, num_grid_points)
    if len(np.unique(y_true)) < 2:
        return {
            "fpr": fpr_grid.tolist(),
            "tpr": fpr_grid.tolist(),
            "auroc": 0.5,
        }
    raw_fpr, raw_tpr, _ = roc_curve(y_true, y_score_clean)
    tpr_interp = np.interp(fpr_grid, raw_fpr, raw_tpr)
    tpr_interp[0] = 0.0
    tpr_interp[-1] = 1.0
    auroc = float(roc_auc_score(y_true, y_score_clean))
    return {
        "fpr": [round(float(x), 5) for x in fpr_grid],
        "tpr": [round(float(y), 5) for y in tpr_interp],
        "auroc": round(auroc, 6),
    }
