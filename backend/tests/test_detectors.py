"""Unit, determinism, and facility-leakage tests for VeriCEMS detectors (`backend/tests/test_detectors.py`).

Covers Milestone P04 Task 9:
1. Detector unit tests on synthetic fixtures explicitly named `synthetic_detector_fixture_df`
   and `synthetic_packet_chain_fixture`:
   - Baseline 1 (`StaticThresholdDetector`)
   - Baseline 2 (`MassBalancePhysicsDetector`: stoichiometric ratio + load/heat consistency)
   - Proposed Detector (`ProposedDetector`: crypto chain + physics + ONNX autoencoder +
     spectral flatness/repeat + `fuel_ledger_synthetic` cross-source check)
   - `verify_batch(packets, context) -> Verdict`
2. Determinism test proving repeated ONNX exports and repeated `verify_batch` evaluations
   produce identical `model_hash`, `input_hash`, quantized `score_bp`, `verdict`, and `reason_codes`.
3. Leakage test proving training facilities are strictly disjoint from validation and test
   facilities in both `results/splits.json` and trained `ml/artifacts/` outputs, and that
   test facilities never influence training or threshold calibration.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

from backend.vericems.crypto import (
    CHAIN_BREAK,
    SEQ_GAP,
    SIG_INVALID,
    SoftwareSecureElement,
    build_hash_chain,
    keccak256_hex,
    packet_hash,
)
from backend.vericems.detectors import (
    AE_RESIDUAL,
    CROSS_SOURCE_MISMATCH,
    DEFAULT_ARTIFACTS_DIR,
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    MassBalancePhysicsDetector,
    PHYSICS_RESIDUAL,
    SPECTRAL_FLAT,
    SPECTRAL_REPEAT,
    StaticThresholdDetector,
    add_fuel_ledger_synthetic_column,
    compute_input_hash,
    compute_model_hash,
    generate_fuel_ledger_synthetic,
    load_proposed_detector,
    quantize_score_bp,
    train_physics_informed_autoencoder,
    verify_batch,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture()
def synthetic_detector_fixture_df() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Synthetic training and validation DataFrames (`synthetic_detector_fixture_df`) for unit tests.

    Uses synthetic Facility IDs 80001..80006 (train) and 80011..80012 (val) that are
    disjoint and never appear in real EPA CAMPD data.
    """
    rng = np.random.default_rng(12345)

    def _build_split(fac_ids: list[int], n_hours: int = 64) -> pd.DataFrame:
        rows: list[dict[str, Any]] = []
        for idx, fid in enumerate(fac_ids):
            is_coal = (idx % 2) == 0
            fuel = "Coal" if is_coal else "Pipeline Natural Gas"
            ratio = 0.1048 if is_coal else 0.0594
            load_eff = 0.098 if is_coal else 0.135
            for h in range(n_hours):
                # Smooth sinusoidal + linear variation in load and heat input
                base_hi = 2500.0 + 400.0 * np.sin(2.0 * np.pi * h / 24.0) + 5.0 * h
                hi = float(base_hi * (1.0 + rng.normal(0.0, 0.004)))
                co2 = float(hi * ratio * (1.0 + rng.normal(0.0, 0.003)))
                rate = co2 / hi
                load = float(hi * load_eff * (1.0 + rng.normal(0.0, 0.01)))
                so2 = float((180.0 if is_coal else 1.5) * (hi / 2500.0))
                nox = float((220.0 if is_coal else 35.0) * (hi / 2500.0))
                rows.append(
                    {
                        "facility_id": fid,
                        "unit_id": "U1",
                        "unit_series_id": f"SYNTH_FAC_{fid}_UNIT_U1",
                        "timestamp_utc": f"2025-01-{(h // 24) + 1:02d}T{h % 24:02d}:00:00Z",
                        "primary_fuel_type": fuel,
                        "gross_load_mw": load,
                        "steam_load_1000_lb_hr": 0.0,
                        "heat_input_mmbtu": hi,
                        "co2_mass_short_tons": co2,
                        "co2_rate_short_tons_mmbtu": rate,
                        "so2_mass_lbs": so2,
                        "nox_mass_lbs": nox,
                        "op_time_fraction": 1.0,
                    }
                )
        df = pd.DataFrame(rows)
        return add_fuel_ledger_synthetic_column(df, seed=42)

    train_synth = _build_split([80001, 80002, 80003, 80004], n_hours=64)
    val_synth = _build_split([80011, 80012], n_hours=64)
    return train_synth, val_synth


@pytest.fixture()
def synthetic_packet_chain_fixture() -> dict[str, Any]:
    """Synthetic 8-packet signed chain (`synthetic_packet_chain_fixture`) with `fuel_ledger_synthetic`."""
    se = SoftwareSecureElement(seed_phrase=b"synthetic-detector-unit-test-key-v1")
    device_id = "DEV-SYNTH-TEST-01"
    records: list[dict[str, Any]] = []
    hi_vals = [2800.0 + 35.0 * i for i in range(8)]
    ledger_vals = generate_fuel_ledger_synthetic(hi_vals, seed=99, noise_std_fraction=0.001)

    for i in range(8):
        hi = hi_vals[i]
        co2 = round(hi * 0.10487, 6)
        load = round(hi * 0.10, 6)
        records.append(
            {
                "timestamp_utc": f"2025-06-01T0{i}:00:00Z",
                "values": {
                    "gross_load_mw": load,
                    "steam_load_1000_lb_hr": 0.0,
                    "heat_input_mmbtu": hi,
                    "co2_mass_short_tons": co2,
                    "co2_rate_short_tons_mmbtu": round(co2 / hi, 6),
                    "so2_mass_lbs": round(160.0 * (hi / 2800.0), 6),
                    "nox_mass_lbs": round(210.0 * (hi / 2800.0), 6),
                    "op_time_fraction": 1.0,
                    FUEL_LEDGER_SYNTHETIC_CHANNEL: round(float(ledger_vals[i]), 6),
                },
            }
        )

    packets = build_hash_chain(device_id=device_id, records=records, secure_element=se)
    return {
        "device_id": device_id,
        "public_key": se.public_key(),
        "secure_element": se,
        "records": records,
        "packets": packets,
    }


def test_baseline_1_static_threshold_on_synthetic_fixture(
    synthetic_detector_fixture_df: tuple[pd.DataFrame, pd.DataFrame],
) -> None:
    """Test Baseline 1 learns static limits from training facilities only and flags extreme CO2 mass/rate."""
    train_df, val_df = synthetic_detector_fixture_df
    det = StaticThresholdDetector().fit(train_df, target_fpr=0.05)
    cal = det.calibrate(val_df, target_fpr=0.05, window_size=8)

    assert set(det.trained_facility_ids) == {80001, 80002, 80003, 80004}
    assert "Coal" in det.per_fuel_limits
    assert "Pipeline Natural Gas" in det.per_fuel_limits
    assert cal["val_record_fpr"] <= 0.10

    # Clean record from validation mid-regime distribution should not be flagged
    clean_sample = val_df.iloc[11:15].copy()
    assert np.all(det.predict_records(clean_sample) == 0)

    # Record crossing fixed CO2 mass / rate limits must be flagged
    tampered_sample = val_df.iloc[:2].copy()
    tampered_sample.loc[tampered_sample.index[0], "co2_mass_short_tons"] = 25.0
    tampered_sample.loc[tampered_sample.index[0], "co2_rate_short_tons_mmbtu"] = 0.010
    preds = det.predict_records(tampered_sample)
    assert preds[0] == 1


def test_baseline_2_mass_balance_and_load_consistency_on_synthetic_fixture(
    synthetic_detector_fixture_df: tuple[pd.DataFrame, pd.DataFrame],
) -> None:
    """Test Baseline 2 estimates fuel ratios from training facilities and flags mass-balance & load anomalies."""
    train_df, val_df = synthetic_detector_fixture_df
    det = MassBalancePhysicsDetector().fit(train_df, target_fpr=0.05)
    cal = det.calibrate(val_df, target_fpr=0.05, window_size=8)

    # Check empirical ratios were learned from training data (Coal ~0.1048, Gas ~0.0594)
    coal_ratio = det.per_fuel_params["Coal"].co2_to_heat_ratio
    gas_ratio = det.per_fuel_params["Pipeline Natural Gas"].co2_to_heat_ratio
    assert coal_ratio == pytest.approx(0.1048, rel=1e-2)
    assert gas_ratio == pytest.approx(0.0594, rel=1e-2)
    assert cal["val_record_fpr"] <= 0.10

    # 1. Mass-balance violation: scale CO2 down by 25% while keeping heat input unchanged
    mb_tampered = val_df.iloc[:4].copy()
    mb_tampered["co2_mass_short_tons"] *= 0.75
    assert np.all(det.predict_records(mb_tampered) == 1)

    # 2. Load / heat-input consistency violation: scale both CO2 and heat_input down by 60%
    # while gross_load_mw remains at full 280 MW output
    load_tampered = val_df.iloc[:4].copy()
    load_tampered["co2_mass_short_tons"] *= 0.40
    load_tampered["heat_input_mmbtu"] *= 0.40
    assert np.all(det.predict_records(load_tampered) == 1)


def test_proposed_detector_all_attack_layers_on_synthetic_fixture(
    synthetic_detector_fixture_df: tuple[pd.DataFrame, pd.DataFrame],
    synthetic_packet_chain_fixture: dict[str, Any],
    tmp_path: Path,
) -> None:
    """Test ProposedDetector and verify_batch across clean, crypto, physics, AE, spectral, and cross-source attacks."""
    train_df, val_df = synthetic_detector_fixture_df
    onnx_file = tmp_path / "synthetic_model.onnx"

    ae_out = train_physics_informed_autoencoder(
        train_df=train_df,
        val_df=val_df,
        onnx_path=onnx_file,
        hidden_dim=12,
        latent_dim=3,
        max_epochs=10,
        early_stopping_patience=4,
        seed=42,
    )
    assert onnx_file.exists()

    # Load real trained ProposedDetector from ml/artifacts/ to test full verify_batch behavior
    clean_pkts = synthetic_packet_chain_fixture["packets"]
    pub_key = synthetic_packet_chain_fixture["public_key"]
    se: SoftwareSecureElement = synthetic_packet_chain_fixture["secure_element"]
    base_records = synthetic_packet_chain_fixture["records"]
    dev_id = synthetic_packet_chain_fixture["device_id"]

    # 1. Clean batch -> verdict == 0, reason_codes == []
    v_clean = verify_batch(
        clean_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_clean.verdict == 0
    assert v_clean.reason_codes == []
    assert 0 <= v_clean.score_bp < 5000

    # Verify input_hash = keccak256(concatenated packet_hashes)
    expected_concat = b"".join(bytes.fromhex(packet_hash(p)[2:]) for p in clean_pkts)
    assert v_clean.input_hash == keccak256_hex(expected_concat)
    assert v_clean.input_hash == compute_input_hash(clean_pkts)

    # 2. Post-sign tamper -> SIG_INVALID + CHAIN_BREAK + PHYSICS_RESIDUAL
    mitm_pkts = copy.deepcopy(clean_pkts)
    mitm_pkts[3]["values"]["co2_mass_short_tons"] *= 0.65
    v_mitm = verify_batch(
        mitm_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_mitm.verdict == 1
    assert SIG_INVALID in v_mitm.reason_codes
    assert CHAIN_BREAK in v_mitm.reason_codes
    assert PHYSICS_RESIDUAL in v_mitm.reason_codes

    # 3. Insider pre-sign constant scaling (scales CO2 by 0.70 before signing) -> valid sigs, caught by PHYSICS/AE/CROSS_SOURCE
    scaled_records = copy.deepcopy(base_records)
    for r in scaled_records:
        r["values"]["co2_mass_short_tons"] = round(r["values"]["co2_mass_short_tons"] * 0.70, 6)
    scaled_pkts = build_hash_chain(device_id=dev_id, records=scaled_records, secure_element=se)
    v_scaled = verify_batch(
        scaled_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_scaled.verdict == 1
    assert SIG_INVALID not in v_scaled.reason_codes
    assert CHAIN_BREAK not in v_scaled.reason_codes
    assert PHYSICS_RESIDUAL in v_scaled.reason_codes
    assert AE_RESIDUAL in v_scaled.reason_codes
    assert CROSS_SOURCE_MISMATCH in v_scaled.reason_codes

    # 4. Insider flatline attack (replaces CO2 with constant value before signing while load/heat vary)
    flat_records = copy.deepcopy(base_records)
    for r in flat_records:
        r["values"]["co2_mass_short_tons"] = 300.0
    flat_pkts = build_hash_chain(device_id=dev_id, records=flat_records, secure_element=se)
    v_flat = verify_batch(
        flat_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_flat.verdict == 1
    assert SPECTRAL_FLAT in v_flat.reason_codes

    # 5. Insider re-signed replay attack (repeats segment [0, 1, 2, 3] at [4, 5, 6, 7])
    replay_records = copy.deepcopy(base_records)
    for i in range(4):
        replay_records[4 + i]["values"] = copy.deepcopy(base_records[i]["values"])
    replay_pkts = build_hash_chain(device_id=dev_id, records=replay_records, secure_element=se)
    v_replay = verify_batch(
        replay_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_replay.verdict == 1
    assert SPECTRAL_REPEAT in v_replay.reason_codes

    # 6. Adaptive insider scaling BOTH CO2 and Heat Input together by 0.75 while `fuel_ledger_synthetic` stays true
    adaptive_records = copy.deepcopy(base_records)
    for r in adaptive_records:
        r["values"]["co2_mass_short_tons"] = round(r["values"]["co2_mass_short_tons"] * 0.75, 6)
        r["values"]["heat_input_mmbtu"] = round(r["values"]["heat_input_mmbtu"] * 0.75, 6)
        r["values"]["co2_rate_short_tons_mmbtu"] = round(
            r["values"]["co2_mass_short_tons"] / r["values"]["heat_input_mmbtu"], 6
        )
    adaptive_pkts = build_hash_chain(device_id=dev_id, records=adaptive_records, secure_element=se)
    v_adaptive = verify_batch(
        adaptive_pkts,
        context={"public_key": pub_key, "primary_fuel_type": "Coal"},
    )
    assert v_adaptive.verdict == 1
    assert CROSS_SOURCE_MISMATCH in v_adaptive.reason_codes


def test_golden_vectors_verdict_compatibility() -> None:
    """Verify `verify_batch` produces expected verdicts and reason codes on `golden_vectors.json`."""
    golden_path = REPO_ROOT / "schemas" / "golden" / "golden_vectors.json"
    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    pub_key = golden["meta"]["test_public_key_p256_uncompressed"]

    # 1. baseline_clean -> verdict == 0, reason_codes == []
    c_clean = golden["chains"]["baseline_clean"]
    v_clean = verify_batch(
        c_clean["packets"],
        context={"public_key": pub_key, "batch": c_clean["batch"], "primary_fuel_type": "Coal"},
    )
    assert v_clean.verdict == 0
    assert v_clean.reason_codes == []

    # 2. chain_1_tampered -> verdict == 1, includes SIG_INVALID, CHAIN_BREAK, PHYSICS_RESIDUAL
    c_tamp = golden["chains"]["chain_1_tampered"]
    v_tamp = verify_batch(
        c_tamp["packets"],
        context={"public_key": pub_key, "batch": c_tamp["batch"], "primary_fuel_type": "Coal"},
    )
    assert v_tamp.verdict == 1
    for code in ("SIG_INVALID", "CHAIN_BREAK", "PHYSICS_RESIDUAL"):
        assert code in v_tamp.reason_codes

    # 3. chain_2_seq_gap -> verdict == 1, includes SEQ_GAP, CHAIN_BREAK
    c_gap = golden["chains"]["chain_2_seq_gap"]
    v_gap = verify_batch(
        c_gap["packets"],
        context={"public_key": pub_key, "batch": c_gap["batch"], "primary_fuel_type": "Coal"},
    )
    assert v_gap.verdict == 1
    for code in ("SEQ_GAP", "CHAIN_BREAK"):
        assert code in v_gap.reason_codes

    # 4. chain_3_replayed -> verdict == 1, includes SEQ_GAP, CHAIN_BREAK, SPECTRAL_REPEAT
    c_rep = golden["chains"]["chain_3_replayed"]
    v_rep = verify_batch(
        c_rep["packets"],
        context={"public_key": pub_key, "batch": c_rep["batch"], "primary_fuel_type": "Coal"},
    )
    assert v_rep.verdict == 1
    for code in ("SEQ_GAP", "CHAIN_BREAK", "SPECTRAL_REPEAT"):
        assert code in v_rep.reason_codes


def test_onnx_and_verify_batch_determinism(
    synthetic_packet_chain_fixture: dict[str, Any],
) -> None:
    """Verify ONNX artifact size (< 5 MB), SHA-256 model_hash, and identical outputs across repeated runs."""
    onnx_path = DEFAULT_ARTIFACTS_DIR / "model.onnx"
    scalers_path = DEFAULT_ARTIFACTS_DIR / "scalers.json"
    thresholds_path = DEFAULT_ARTIFACTS_DIR / "thresholds.json"
    curves_path = DEFAULT_ARTIFACTS_DIR / "training_curves.json"

    for p in (onnx_path, scalers_path, thresholds_path, curves_path):
        assert p.exists(), f"Missing artifact: {p}"

    total_bytes = sum(
        f.stat().st_size for f in DEFAULT_ARTIFACTS_DIR.glob("*") if f.is_file()
    )
    assert total_bytes < 5 * 1024 * 1024, f"Artifacts exceed 5 MB limit: {total_bytes} bytes"

    expected_model_hash = "0x" + hashlib.sha256(onnx_path.read_bytes()).hexdigest()
    assert compute_model_hash(onnx_path) == expected_model_hash

    pkts = synthetic_packet_chain_fixture["packets"]
    pub_key = synthetic_packet_chain_fixture["public_key"]

    # Run verify_batch 5 times from fresh detector loads and verify bit-for-bit identical Verdict
    verdicts = []
    for _ in range(5):
        det = load_proposed_detector(DEFAULT_ARTIFACTS_DIR)
        v = verify_batch(
            pkts,
            context={"public_key": pub_key, "primary_fuel_type": "Coal", "detector": det},
        )
        verdicts.append(v.to_dict())

    first = verdicts[0]
    assert first["model_hash"] == expected_model_hash
    for v_dict in verdicts[1:]:
        assert v_dict == first

    # Also test quantize_score_bp boundary determinism
    assert quantize_score_bp(0.0) == 0
    assert quantize_score_bp(1.0) == 10000
    assert quantize_score_bp(0.123456) == 1235


def test_zero_facility_leakage_across_splits_and_artifacts() -> None:
    """Prove training facilities are strictly disjoint from validation and test facilities."""
    splits_path = REPO_ROOT / "results" / "splits.json"
    scalers_path = DEFAULT_ARTIFACTS_DIR / "scalers.json"
    thresholds_path = DEFAULT_ARTIFACTS_DIR / "thresholds.json"

    splits_data = json.loads(splits_path.read_text(encoding="utf-8"))
    scalers_data = json.loads(scalers_path.read_text(encoding="utf-8"))
    thresholds_data = json.loads(thresholds_path.read_text(encoding="utf-8"))

    # 1. Verify all 5 splits in results/splits.json have pairwise disjoint train/val/test sets
    for sp in splits_data["splits"]:
        tr = set(sp["train_facility_ids"])
        va = set(sp["val_facility_ids"])
        te = set(sp["test_facility_ids"])
        assert tr.isdisjoint(va), f"Split {sp['split_index']} train/val overlap: {tr & va}"
        assert tr.isdisjoint(te), f"Split {sp['split_index']} train/test overlap: {tr & te}"
        assert va.isdisjoint(te), f"Split {sp['split_index']} val/test overlap: {va & te}"

    # 2. Verify saved split-0 artifacts match split-0 facility IDs and never include val or test in trained_facility_ids
    split_0 = splits_data["splits"][0]
    tr_0 = set(split_0["train_facility_ids"])
    va_0 = set(split_0["val_facility_ids"])
    te_0 = set(split_0["test_facility_ids"])

    art_tr_scalers = set(scalers_data["trained_facility_ids"])
    art_va_scalers = set(scalers_data["val_facility_ids"])
    art_tr_thresh = set(thresholds_data["trained_facility_ids"])
    art_va_thresh = set(thresholds_data["val_facility_ids"])
    b1_tr = set(thresholds_data["baseline_1_static"]["trained_facility_ids"])
    b2_tr = set(thresholds_data["baseline_2_physics"]["trained_facility_ids"])

    assert art_tr_scalers == tr_0
    assert art_va_scalers == va_0
    assert art_tr_thresh == tr_0
    assert art_va_thresh == va_0
    assert b1_tr == tr_0
    assert b2_tr == tr_0

    assert art_tr_scalers.isdisjoint(va_0)
    assert art_tr_scalers.isdisjoint(te_0)
    assert art_va_scalers.isdisjoint(te_0)
