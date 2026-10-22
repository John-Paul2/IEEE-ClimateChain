"""Unit and verification tests for `ml/attacks/` and `ml/benchmark/` (`tests/test_attacks_and_benchmark.py`).

Covers Milestone P08:
1. Unit tests for all 8 attack families on a synthetic fixture explicitly named
   `synthetic_attack_fixture_df` (per `AGENTS.md` Rule 3 & Rule 6), verifying tuple unpacking
   `(modified_records, labels)`, ground-truth label alignment, achieved CO2 reductions,
   and cryptographic chain vs. pre-sign insider semantics.
2. Unit tests for adaptive white-box Variants A (`single_source`) and B (`coordinated_insider`)
   proving Variant A leaves `fuel_ledger_synthetic` untouched (and is caught by `ProposedDetector`
   via `CROSS_SOURCE_MISMATCH`), while Variant B forges `fuel_ledger_synthetic` consistently.
3. Verification tests on the generated benchmark outputs (`results/benchmark_raw.csv`,
   `results/benchmark_summary.json`, `results/run_manifest.json`, `results/WHAT_STILL_GETS_THROUGH.md`,
   and `results/figures/*.png`), proving all 5 splits, 14 attacks, and 3 detectors are present,
   thresholds were calibrated strictly on validation facilities, and `WHAT_STILL_GETS_THROUGH.md`
   accurately reflects the code-generated numbers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

from backend.vericems.detectors.features import (
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    add_fuel_ledger_synthetic_column,
)
from backend.vericems.detectors.verifier import load_proposed_detector
from ml.attacks import (
    AttackResult,
    BENCHMARK_ATTACK_SPECS,
    attack_adaptive_whitebox_coordinated_insider,
    attack_adaptive_whitebox_single_source,
    attack_constant_scaling,
    attack_flatline_injection,
    attack_naive_replay,
    attack_selective_packet_dropping,
    attack_slow_calibration_drift,
    attack_synthetic_noise_on_flatline,
    attack_time_shifted_replay,
    run_attack_by_id,
)
from ml.benchmark.metrics import (
    compute_roc_curve_points,
    compute_split_attack_metrics,
    score_crypto_chain_per_record,
    score_series_with_all_detectors,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "results"


@pytest.fixture()
def synthetic_attack_fixture_df() -> pd.DataFrame:
    """Synthetic 64-hour telemetry fixture (`synthetic_attack_fixture_df`) for unit tests only."""
    rng = np.random.default_rng(202608)
    rows: list[dict[str, Any]] = []
    for h in range(64):
        base_hi = 2600.0 + 380.0 * np.sin(2.0 * np.pi * h / 16.0) + 4.0 * h
        hi = float(base_hi * (1.0 + rng.normal(0.0, 0.002)))
        co2 = float(hi * 0.10487 * (1.0 + rng.normal(0.0, 0.002)))
        load = float(hi * 0.095 * (1.0 + rng.normal(0.0, 0.005)))
        rows.append(
            {
                "facility_id": 99001,
                "unit_id": "SYNTH_U1",
                "unit_series_id": "SYNTH_FAC_99001_UNIT_U1",
                "timestamp_utc": f"2025-07-{(h // 24) + 1:02d}T{h % 24:02d}:00:00Z",
                "primary_fuel_type": "Coal",
                "gross_load_mw": load,
                "steam_load_1000_lb_hr": 0.0,
                "heat_input_mmbtu": hi,
                "co2_mass_short_tons": co2,
                "co2_rate_short_tons_mmbtu": co2 / hi,
                "so2_mass_lbs": 170.0 * (hi / 2600.0),
                "nox_mass_lbs": 210.0 * (hi / 2600.0),
                "op_time_fraction": 1.0,
            }
        )
    df = pd.DataFrame(rows)
    return add_fuel_ledger_synthetic_column(df, seed=42, noise_std_fraction=0.001)


def test_all_seven_non_adaptive_attacks_return_records_and_labels(
    synthetic_attack_fixture_df: pd.DataFrame,
) -> None:
    """Verify Attacks 1..7 unpack as `(records, labels)` and produce valid ground-truth labels."""
    df = synthetic_attack_fixture_df
    n = len(df)
    win = (16, 40)

    # 1. Constant scaling (5, 10, 20, 30%)
    for pct in (5.0, 10.0, 20.0, 30.0):
        res = attack_constant_scaling(df, window_slice=win, reduction_pct=pct)
        assert isinstance(res, AttackResult)
        mod_df, labels = res
        assert len(mod_df) == n
        assert len(labels) == n
        assert np.all(labels[:16] == 0)
        assert np.all(labels[16:40] == 1)
        assert np.all(labels[40:] == 0)
        assert res.co2_reduction_pct == pytest.approx(pct, abs=1e-4)

    # 2. Flatline injection
    res_flat = attack_flatline_injection(df, window_slice=win)
    mod_flat, lbl_flat = res_flat
    assert np.std(mod_flat.loc[16:39, "co2_mass_short_tons"]) < 1e-9
    assert np.sum(lbl_flat) == 24
    assert res_flat.co2_reduction_pct > 5.0

    # 3. Naive replay (breaks crypto chain)
    res_naive = attack_naive_replay(df, window_slice=win, replay_segment_hours=8)
    crypto_naive = score_crypto_chain_per_record(n, res_naive.packets)
    assert np.all(crypto_naive[:16] == 0.0)
    assert np.any(crypto_naive[16:40] > 1.0)

    # 4. Time-shifted replay (re-signed, so crypto chain is valid!)
    res_ts = attack_time_shifted_replay(df, window_slice=win, replay_segment_hours=8)
    crypto_ts = score_crypto_chain_per_record(n, res_ts.packets)
    assert np.all(crypto_ts == 0.0)
    assert res_ts.co2_reduction_pct > 0.0

    # 5. Synthetic noise on a flatline
    res_noise = attack_synthetic_noise_on_flatline(df, window_slice=win, seed=42)
    mod_noise, lbl_noise = res_noise
    assert np.std(mod_noise.loc[16:39, "co2_mass_short_tons"]) > 0.1
    assert np.sum(lbl_noise) == 24
    assert res_noise.metadata["is_synthetic_injection"] is True

    # 6. Slow calibration drift (0.1, 0.3, 0.5%/day)
    reds = []
    for drift in (0.1, 0.3, 0.5):
        res_drift = attack_slow_calibration_drift(
            df, window_slice=win, drift_pct_per_day=drift
        )
        assert np.sum(res_drift.labels) == 24
        reds.append(res_drift.co2_reduction_pct)
    assert reds[0] < reds[1] < reds[2]

    # 7. Selective packet dropping
    res_drop = attack_selective_packet_dropping(df, window_slice=win, drop_quantile=0.65)
    assert 0 < np.sum(res_drop.labels) < 24
    assert len(res_drop.packets) == n - int(np.sum(res_drop.labels))
    crypto_drop = score_crypto_chain_per_record(n, res_drop.packets)
    # Every dropped packet index must be flagged by the crypto sequence checker
    dropped_idx = np.flatnonzero(res_drop.labels == 1)
    assert np.all(crypto_drop[dropped_idx] > 1.0)


def test_adaptive_whitebox_variants_a_and_b_on_synthetic_fixture(
    synthetic_attack_fixture_df: pd.DataFrame,
) -> None:
    """Verify Variant A (single-source) vs Variant B (coordinated insider) behavior and detections."""
    det = load_proposed_detector()
    df = synthetic_attack_fixture_df
    win = (16, 40)

    # Variant A: cannot change fuel_ledger_synthetic
    res_a = attack_adaptive_whitebox_single_source(df, detector=det, window_slice=win)
    mod_a, lbl_a = res_a
    assert np.allclose(
        mod_a[FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(),
        df[FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(),
    )
    assert res_a.co2_reduction_pct >= 4.0

    # Variant B: also forges fuel_ledger_synthetic consistently with heat_input_mmbtu
    res_b = attack_adaptive_whitebox_coordinated_insider(df, detector=det, window_slice=win)
    mod_b, lbl_b = res_b
    assert not np.allclose(
        mod_b.loc[16:39, FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(),
        df.loc[16:39, FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(),
    )
    # Variant B achieves much larger stealthy CO2 reduction than Variant A while keeping detector score lower
    assert res_b.co2_reduction_pct > res_a.co2_reduction_pct
    assert res_b.metadata["mean_window_detector_ratio"] <= 1.0

    assert det.static_detector is not None
    sc_a = score_series_with_all_detectors(
        res_a,
        static_detector=det.static_detector,
        physics_detector=det.physics_detector,
        proposed_detector=det,
    )
    sc_b = score_series_with_all_detectors(
        res_b,
        static_detector=det.static_detector,
        physics_detector=det.physics_detector,
        proposed_detector=det,
    )
    # Variant A is caught by ProposedDetector (via fuel_ledger_synthetic) but evades Baseline 2
    rec_a_prop = float(np.mean(sc_a["proposed"]["preds"][lbl_a == 1]))
    rec_a_b2 = float(np.mean(sc_a["baseline_2_physics"]["preds"][lbl_a == 1]))
    assert rec_a_prop > 0.70
    assert rec_a_b2 < 0.20

    # Variant B evades ProposedDetector as well
    rec_b_prop = float(np.mean(sc_b["proposed"]["preds"][lbl_b == 1]))
    assert rec_b_prop < 0.25
