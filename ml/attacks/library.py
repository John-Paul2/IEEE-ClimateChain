"""Implementation of Attacks 1 through 7 in `ml/attacks/library.py`.

Reads and follows `VeriCEMS_Project_Guide.md` Section 14 Appendix C and `docs/DATA_CARD.md`:
1. Constant scaling (`attack_constant_scaling`: CO2 reduced by 5, 10, 20, 30 percent)
2. Flatline injection (`attack_flatline_injection`: constant "clean" value)
3. Naive replay (`attack_naive_replay`: loop earlier clean signed packets without re-signing)
4. Time-shifted replay (`attack_time_shifted_replay`: earlier clean data re-signed with new seq & timestamps)
5. Synthetic noise on a flatline (`attack_synthetic_noise_on_flatline`: constant value + synthetic noise)
6. Slow calibration drift (`attack_slow_calibration_drift`: 0.1, 0.3, 0.5 percent per day)
7. Selective packet dropping (`attack_selective_packet_dropping`: remove highest-emission records)
"""

from __future__ import annotations

import copy
from typing import Any

import numpy as np
import pandas as pd

from backend.vericems.crypto.packet import GENESIS_PREV_HASH, packet_hash
from backend.vericems.crypto.secure_element import SecureElement
from ml.attacks.base import (
    AttackResult,
    build_packets_from_dataframe,
    compute_achieved_co2_reduction_pct,
    resolve_attack_window,
)


def attack_constant_scaling(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    reduction_pct: float = 20.0,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 1: Constant scaling (reduce `co2_mass_short_tons` by `reduction_pct`% before signing).

    Supported benchmark levels: `reduction_pct in {5.0, 10.0, 20.0, 30.0}`.
    The insider scales down `co2_mass_short_tons` (and `co2_rate_short_tons_mmbtu` so the internal
    packet fields remain self-consistent) by `factor = 1.0 - reduction_pct / 100.0` before signing,
    while `heat_input_mmbtu`, `gross_load_mw`, and `fuel_ledger_synthetic` remain at their true values.
    """
    if not (0.0 <= reduction_pct < 100.0):
        raise ValueError(f"reduction_pct must be in [0, 100), got {reduction_pct}")

    out = df.copy().reset_index(drop=True)
    n = len(out)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    scale_factor = 1.0 - float(reduction_pct) / 100.0
    out.loc[start : end - 1, "co2_mass_short_tons"] = (
        out.loc[start : end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64) * scale_factor
    )
    if "co2_rate_short_tons_mmbtu" in out.columns:
        hi = np.maximum(
            out.loc[start : end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6
        )
        out.loc[start : end - 1, "co2_rate_short_tons_mmbtu"] = (
            out.loc[start : end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64) / hi
        )

    packets = build_packets_from_dataframe(
        out, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(df.reset_index(drop=True), out, labels)

    return AttackResult(
        out,
        labels,
        packets=packets,
        metadata={
            "attack_id": f"constant_scaling_{int(round(reduction_pct))}pct",
            "attack_family": "constant_scaling",
            "attack_name": f"Constant Scaling (-{reduction_pct:g}%)",
            "is_synthetic_injection": True,
            "reduction_pct_target": float(reduction_pct),
            "scale_factor": float(scale_factor),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_flatline_injection(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    clean_quantile: float = 0.20,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 2: Flatline injection (replace CO2 mass with a constant 'clean' low-load value).

    Replaces `co2_mass_short_tons` across `[start, end)` with a constant value equal to the
    `clean_quantile` (default 20th percentile) of the pre-attack clean series, scaled by 0.85
    if the pre-attack series had low variance so it always represents an under-reporting tamper.
    """
    out = df.copy().reset_index(drop=True)
    n = len(out)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    ref_slice = out.iloc[:start] if start >= 8 else out
    ref_co2 = ref_slice["co2_mass_short_tons"].to_numpy(dtype=np.float64)
    win_co2 = out.loc[start : end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64)
    q_val = float(np.quantile(ref_co2, float(np.clip(clean_quantile, 0.05, 0.50))))
    win_mean = float(np.mean(win_co2)) if len(win_co2) > 0 else q_val
    flat_value = min(q_val, 0.78 * win_mean)

    out.loc[start : end - 1, "co2_mass_short_tons"] = flat_value
    if "co2_rate_short_tons_mmbtu" in out.columns:
        hi = np.maximum(
            out.loc[start : end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6
        )
        out.loc[start : end - 1, "co2_rate_short_tons_mmbtu"] = flat_value / hi

    packets = build_packets_from_dataframe(
        out, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(df.reset_index(drop=True), out, labels)

    return AttackResult(
        out,
        labels,
        packets=packets,
        metadata={
            "attack_id": "flatline_injection",
            "attack_family": "flatline_injection",
            "attack_name": "Flatline Injection",
            "is_synthetic_injection": True,
            "flatline_co2_short_tons": float(flat_value),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_naive_replay(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    replay_segment_hours: int = 8,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 3: Naive replay (loop earlier clean packets without re-signing or updating seq/prev_hash).

    The attacker captures a clean low-emission segment of `replay_segment_hours` signed packets
    prior to the attack window and splices them repeatedly into `[start, end)`.
    Because the packets are replayed verbatim:
    - Their physical values (`co2_mass_short_tons`, `heat_input_mmbtu`, `gross_load_mw`) came from
      genuine historical operation and satisfy single-record static and mass-balance rules.
    - However, their `seq`, `timestamp_utc`, and `prev_hash` fields do not match the current position
      in the stream, causing `SEQ_GAP`, `CHAIN_BREAK`, and `SPECTRAL_REPEAT`.
    """
    clean_df = df.copy().reset_index(drop=True)
    n = len(clean_df)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    seg_len = max(4, min(int(replay_segment_hours), max(4, start)))
    # Choose the lowest-CO2 contiguous segment of length `seg_len` before `start`
    best_src_start = max(0, start - seg_len)
    if start >= seg_len:
        co2_pre = clean_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)[:start]
        best_sum = float("inf")
        for s_idx in range(0, start - seg_len + 1, max(1, seg_len // 2)):
            c_sum = float(np.sum(co2_pre[s_idx : s_idx + seg_len]))
            if c_sum < best_sum:
                best_sum = c_sum
                best_src_start = s_idx

    # Build clean packet chain first so naive replay copies the exact earlier signed packets
    clean_packets = build_packets_from_dataframe(
        clean_df, sign_packets=sign_packets, secure_element=secure_element
    )
    out_packets = copy.deepcopy(clean_packets)
    out_df = clean_df.copy()

    replay_cols = [
        c
        for c in (
            "gross_load_mw",
            "steam_load_1000_lb_hr",
            "heat_input_mmbtu",
            "co2_mass_short_tons",
            "co2_rate_short_tons_mmbtu",
            "so2_mass_lbs",
            "nox_mass_lbs",
            "op_time_fraction",
            "fuel_ledger_synthetic",
        )
        if c in out_df.columns
    ]

    for offset_idx, target_idx in enumerate(range(start, end)):
        src_idx = best_src_start + (offset_idx % seg_len)
        out_packets[target_idx] = copy.deepcopy(clean_packets[src_idx])
        for col in replay_cols:
            out_df.loc[target_idx, col] = clean_df.loc[src_idx, col]

    achieved_red = compute_achieved_co2_reduction_pct(clean_df, out_df, labels)

    return AttackResult(
        out_df,
        labels,
        packets=out_packets,
        metadata={
            "attack_id": "naive_replay",
            "attack_family": "naive_replay",
            "attack_name": "Naive Replay (Un-resigned Loop)",
            "is_synthetic_injection": True,
            "replay_segment_hours": int(seg_len),
            "source_start_index": int(best_src_start),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_time_shifted_replay(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    replay_segment_hours: int = 8,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 4: Time-shifted replay (earlier CEMS data re-signed with new seq and timestamps).

    An insider replays an earlier low-emission CEMS analyzer segment (`co2_mass_short_tons`,
    `co2_rate_short_tons_mmbtu`, `heat_input_mmbtu`, `so2_mass_lbs`, `nox_mass_lbs`) into `[start, end)`
    and re-signs every packet with valid new sequence numbers, current timestamps, and valid
    `prev_hash` links. However, the plant's independent electrical load (`gross_load_mw`) and
    independent custody-transfer fuel ledger (`fuel_ledger_synthetic`) remain at their actual
    current operating values.
    """
    clean_df = df.copy().reset_index(drop=True)
    n = len(clean_df)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    seg_len = max(4, min(int(replay_segment_hours), max(4, start)))
    best_src_start = max(0, start - seg_len)
    if start >= seg_len:
        co2_pre = clean_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)[:start]
        best_sum = float("inf")
        for s_idx in range(0, start - seg_len + 1, max(1, seg_len // 2)):
            c_sum = float(np.sum(co2_pre[s_idx : s_idx + seg_len]))
            if c_sum < best_sum:
                best_sum = c_sum
                best_src_start = s_idx

    out_df = clean_df.copy()
    cems_analyzer_cols = [
        c
        for c in (
            "heat_input_mmbtu",
            "co2_mass_short_tons",
            "co2_rate_short_tons_mmbtu",
            "so2_mass_lbs",
            "nox_mass_lbs",
        )
        if c in out_df.columns
    ]

    win_co2_mean = float(np.mean(clean_df.loc[start : end - 1, "co2_mass_short_tons"]))
    src_co2_mean = float(
        np.mean(clean_df.loc[best_src_start : best_src_start + seg_len - 1, "co2_mass_short_tons"])
    )
    # If the unit had flat historical load so the lowest earlier segment was nearly identical in magnitude,
    # apply a 0.82 scaling to the replayed segment so time-shifted replay always represents an emission under-report
    replay_scale = 0.82 if src_co2_mean >= 0.92 * win_co2_mean else 1.0

    for offset_idx, target_idx in enumerate(range(start, end)):
        src_idx = best_src_start + (offset_idx % seg_len)
        for col in cems_analyzer_cols:
            val = float(clean_df.loc[src_idx, col])
            if col in ("heat_input_mmbtu", "co2_mass_short_tons", "so2_mass_lbs", "nox_mass_lbs"):
                val *= replay_scale
            out_df.loc[target_idx, col] = val

    # Re-sign the entire chain with valid seq, timestamps, and prev_hash
    packets = build_packets_from_dataframe(
        out_df, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(clean_df, out_df, labels)

    return AttackResult(
        out_df,
        labels,
        packets=packets,
        metadata={
            "attack_id": "time_shifted_replay",
            "attack_family": "time_shifted_replay",
            "attack_name": "Time-Shifted Replay (Re-Signed)",
            "is_synthetic_injection": True,
            "replay_segment_hours": int(seg_len),
            "source_start_index": int(best_src_start),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_synthetic_noise_on_flatline(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    clean_quantile: float = 0.20,
    synthetic_noise_std_fraction: float = 0.035,
    attack_fraction: float = 0.40,
    seed: int = 42,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 5: Synthetic noise on a flatline (`attack_synthetic_noise_on_flatline`).

    Flattens `co2_mass_short_tons` to a constant lower baseline and adds deterministic
    zero-mean Gaussian synthetic noise (`synthetic_noise_std_fraction` of baseline) so
    that simple zero-variance detectors are bypassed, while `heat_input_mmbtu` and
    `gross_load_mw` continue their real dynamic plant variations.
    """
    out = df.copy().reset_index(drop=True)
    n = len(out)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    ref_slice = out.iloc[:start] if start >= 8 else out
    ref_co2 = ref_slice["co2_mass_short_tons"].to_numpy(dtype=np.float64)
    win_co2 = out.loc[start : end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64)
    q_val = float(np.quantile(ref_co2, float(np.clip(clean_quantile, 0.05, 0.50))))
    win_mean = float(np.mean(win_co2)) if len(win_co2) > 0 else q_val
    base_flat = min(q_val, 0.78 * win_mean)

    fac_id = int(out["facility_id"].iloc[0]) if "facility_id" in out.columns else 0
    rng = np.random.default_rng(int(seed) + fac_id + 500)
    win_len = end - start
    synth_noise = rng.normal(
        loc=0.0,
        scale=max(0.1, base_flat * float(synthetic_noise_std_fraction)),
        size=win_len,
    )
    noisy_flat = np.clip(base_flat + synth_noise, a_min=0.1, a_max=None)

    out.loc[start : end - 1, "co2_mass_short_tons"] = noisy_flat
    if "co2_rate_short_tons_mmbtu" in out.columns:
        hi = np.maximum(
            out.loc[start : end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6
        )
        out.loc[start : end - 1, "co2_rate_short_tons_mmbtu"] = noisy_flat / hi

    packets = build_packets_from_dataframe(
        out, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(df.reset_index(drop=True), out, labels)

    return AttackResult(
        out,
        labels,
        packets=packets,
        metadata={
            "attack_id": "synthetic_noise_on_flatline",
            "attack_family": "synthetic_noise_on_flatline",
            "attack_name": "Synthetic Noise on Flatline",
            "is_synthetic_injection": True,
            "flatline_base_co2_short_tons": float(base_flat),
            "synthetic_noise_std_fraction": float(synthetic_noise_std_fraction),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_slow_calibration_drift(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    drift_pct_per_day: float = 0.3,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 6: Slow calibration drift (`0.1`, `0.3`, `0.5` percent per day).

    Gradually shaves `drift_pct_per_day`% per 24 operating hours from `co2_mass_short_tons`
    (and `co2_rate_short_tons_mmbtu`) across the contiguous attack window `[start, end)`.
    """
    if drift_pct_per_day < 0.0:
        raise ValueError(f"drift_pct_per_day must be non-negative, got {drift_pct_per_day}")

    out = df.copy().reset_index(drop=True)
    n = len(out)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    win_len = end - start
    hours_elapsed = np.arange(1, win_len + 1, dtype=np.float64)
    days_elapsed = hours_elapsed / 24.0
    drift_frac = np.clip((float(drift_pct_per_day) / 100.0) * days_elapsed, 0.0, 0.50)
    multipliers = 1.0 - drift_frac

    orig_co2 = out.loc[start : end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64)
    drifted_co2 = orig_co2 * multipliers
    out.loc[start : end - 1, "co2_mass_short_tons"] = drifted_co2

    if "co2_rate_short_tons_mmbtu" in out.columns:
        hi = np.maximum(
            out.loc[start : end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6
        )
        out.loc[start : end - 1, "co2_rate_short_tons_mmbtu"] = drifted_co2 / hi

    packets = build_packets_from_dataframe(
        out, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(df.reset_index(drop=True), out, labels)
    tag = str(drift_pct_per_day).replace(".", "_")

    return AttackResult(
        out,
        labels,
        packets=packets,
        metadata={
            "attack_id": f"slow_drift_{tag}pct_day",
            "attack_family": "slow_calibration_drift",
            "attack_name": f"Slow Calibration Drift ({drift_pct_per_day:g}%/day)",
            "is_synthetic_injection": True,
            "drift_pct_per_day": float(drift_pct_per_day),
            "max_drift_pct_at_window_end": float(drift_frac[-1] * 100.0) if win_len > 0 else 0.0,
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_selective_packet_dropping(
    df: pd.DataFrame,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    drop_quantile: float = 0.65,
    window_size: int = 8,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 7: Selective packet dropping (remove the highest-emission records in the attack window).

    Within each batch/window of `[start, end)`, drops the highest-emission packets (records with
    `co2_mass_short_tons` above `drop_quantile`, or at least the top 2 highest-CO2 packets per
    8-packet batch).
    - In the transmitted `packets` list, dropped packets are removed without re-signing subsequent
      packets, creating `SEQ_GAP` and `CHAIN_BREAK` that chain-aware verifiers (`ProposedDetector`)
      immediately catch.
    - In the aligned `records` DataFrame of length `N`, dropped positions hold the preceding
      transmitted clean record's values (and `synthetic_packet_dropped = True`), while `labels[i] = 1`
      marks every dropped high-emission record. Non-cryptographic detectors that only inspect
      received telemetry values see normal clean readings and fail to catch the omission.
    """
    clean_df = df.copy().reset_index(drop=True)
    n = len(clean_df)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction, align_to=window_size
    )

    clean_packets = build_packets_from_dataframe(
        clean_df, sign_packets=sign_packets, secure_element=secure_element
    )

    dropped_mask = np.zeros(n, dtype=bool)
    co2_all = clean_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)

    for b_start in range(start, end, window_size):
        b_end = min(end, b_start + window_size)
        b_co2 = co2_all[b_start:b_end]
        if len(b_co2) == 0:
            continue
        thresh = float(np.quantile(b_co2, float(np.clip(drop_quantile, 0.30, 0.90))))
        local_drop = b_co2 >= thresh
        if not np.any(local_drop):
            local_drop[int(np.argmax(b_co2))] = True
        # Keep at least 1 packet in the batch so the batch is non-empty
        if np.all(local_drop) and len(local_drop) > 1:
            local_drop[int(np.argmin(b_co2))] = False
        dropped_mask[b_start:b_end] = local_drop

    labels = dropped_mask.astype(np.int64)
    out_df = clean_df.copy()
    out_df["synthetic_packet_dropped"] = dropped_mask

    # For value-only detectors that do not check sequence numbers, a dropped packet is either
    # unobserved or imputed from the last received clean packet:
    value_cols = [
        c
        for c in (
            "gross_load_mw",
            "steam_load_1000_lb_hr",
            "heat_input_mmbtu",
            "co2_mass_short_tons",
            "co2_rate_short_tons_mmbtu",
            "so2_mass_lbs",
            "nox_mass_lbs",
            "op_time_fraction",
            "fuel_ledger_synthetic",
        )
        if c in out_df.columns
    ]
    last_clean_idx = max(0, start - 1)
    for idx in range(start, end):
        if dropped_mask[idx]:
            for col in value_cols:
                out_df.loc[idx, col] = out_df.loc[last_clean_idx, col]
        else:
            last_clean_idx = idx

    # Transmitted packet stream omits the dropped packets (preserving their original seq and prev_hash)
    transmitted_packets = [
        copy.deepcopy(pkt) for idx, pkt in enumerate(clean_packets) if not dropped_mask[idx]
    ]

    achieved_red = compute_achieved_co2_reduction_pct(
        clean_df, clean_df, np.ones(n, dtype=np.int64) * ((np.arange(n) >= start) & (np.arange(n) < end)),
        dropped_mask=dropped_mask,
    )

    return AttackResult(
        out_df,
        labels,
        packets=transmitted_packets,
        metadata={
            "attack_id": "selective_packet_dropping",
            "attack_family": "selective_packet_dropping",
            "attack_name": "Selective Packet Dropping (High-CO2 Omission)",
            "is_synthetic_injection": True,
            "drop_quantile": float(drop_quantile),
            "dropped_packets_count": int(np.sum(dropped_mask)),
            "dropped_indices": np.flatnonzero(dropped_mask).tolist(),
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )
