"""VeriCEMS Adversarial Attack Library (`ml/attacks`).

Exports all 8 attack families (14 benchmark configurations) required by Guide Section 14
Appendix C and Milestone P08:
1. Constant scaling (`attack_constant_scaling`: 5%, 10%, 20%, 30% reduction)
2. Flatline injection (`attack_flatline_injection`)
3. Naive replay (`attack_naive_replay`)
4. Time-shifted replay (`attack_time_shifted_replay`)
5. Synthetic noise on a flatline (`attack_synthetic_noise_on_flatline`)
6. Slow calibration drift (`attack_slow_calibration_drift`: 0.1%, 0.3%, 0.5% per day)
7. Selective packet dropping (`attack_selective_packet_dropping`)
8. Adaptive white-box attacker:
   - Variant A (`attack_adaptive_whitebox_single_source`)
   - Variant B (`attack_adaptive_whitebox_coordinated_insider`)
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from backend.vericems.detectors.verifier import ProposedDetector
from ml.attacks.adaptive import (
    attack_adaptive_whitebox_coordinated_insider,
    attack_adaptive_whitebox_single_source,
)
from ml.attacks.base import (
    AttackResult,
    build_packets_from_dataframe,
    compute_achieved_co2_reduction_pct,
    resolve_attack_window,
)
from ml.attacks.library import (
    attack_constant_scaling,
    attack_flatline_injection,
    attack_naive_replay,
    attack_selective_packet_dropping,
    attack_slow_calibration_drift,
    attack_synthetic_noise_on_flatline,
    attack_time_shifted_replay,
)

BENCHMARK_ATTACK_SPECS: tuple[dict[str, Any], ...] = (
    {
        "attack_id": "constant_scaling_5pct",
        "attack_family": "1_constant_scaling",
        "attack_name": "1a. Constant Scaling (-5%)",
        "params": {"reduction_pct": 5.0},
    },
    {
        "attack_id": "constant_scaling_10pct",
        "attack_family": "1_constant_scaling",
        "attack_name": "1b. Constant Scaling (-10%)",
        "params": {"reduction_pct": 10.0},
    },
    {
        "attack_id": "constant_scaling_20pct",
        "attack_family": "1_constant_scaling",
        "attack_name": "1c. Constant Scaling (-20%)",
        "params": {"reduction_pct": 20.0},
    },
    {
        "attack_id": "constant_scaling_30pct",
        "attack_family": "1_constant_scaling",
        "attack_name": "1d. Constant Scaling (-30%)",
        "params": {"reduction_pct": 30.0},
    },
    {
        "attack_id": "flatline_injection",
        "attack_family": "2_flatline_injection",
        "attack_name": "2. Flatline Injection",
        "params": {},
    },
    {
        "attack_id": "naive_replay",
        "attack_family": "3_naive_replay",
        "attack_name": "3. Naive Replay (Un-resigned Loop)",
        "params": {"replay_segment_hours": 8},
    },
    {
        "attack_id": "time_shifted_replay",
        "attack_family": "4_time_shifted_replay",
        "attack_name": "4. Time-Shifted Replay (Re-signed)",
        "params": {"replay_segment_hours": 8},
    },
    {
        "attack_id": "synthetic_noise_on_flatline",
        "attack_family": "5_synthetic_noise_on_flatline",
        "attack_name": "5. Synthetic Noise on Flatline",
        "params": {"synthetic_noise_std_fraction": 0.035},
    },
    {
        "attack_id": "slow_drift_0_1pct_day",
        "attack_family": "6_slow_calibration_drift",
        "attack_name": "6a. Slow Calibration Drift (0.1%/day)",
        "params": {"drift_pct_per_day": 0.1},
    },
    {
        "attack_id": "slow_drift_0_3pct_day",
        "attack_family": "6_slow_calibration_drift",
        "attack_name": "6b. Slow Calibration Drift (0.3%/day)",
        "params": {"drift_pct_per_day": 0.3},
    },
    {
        "attack_id": "slow_drift_0_5pct_day",
        "attack_family": "6_slow_calibration_drift",
        "attack_name": "6c. Slow Calibration Drift (0.5%/day)",
        "params": {"drift_pct_per_day": 0.5},
    },
    {
        "attack_id": "selective_packet_dropping",
        "attack_family": "7_selective_packet_dropping",
        "attack_name": "7. Selective Packet Dropping (High-CO2)",
        "params": {"drop_quantile": 0.65},
    },
    {
        "attack_id": "adaptive_whitebox_a_single_source",
        "attack_family": "8_adaptive_whitebox",
        "attack_name": "8A. Adaptive White-Box (Single-Source)",
        "params": {"variant": "A"},
    },
    {
        "attack_id": "adaptive_whitebox_b_coordinated_insider",
        "attack_family": "8_adaptive_whitebox",
        "attack_name": "8B. Adaptive White-Box (Coordinated Insider)",
        "params": {"variant": "B"},
    },
)


def run_attack_by_id(
    attack_id: str,
    df: pd.DataFrame,
    *,
    detector: ProposedDetector | None = None,
    window_slice: tuple[int, int] | slice | None = None,
    attack_fraction: float = 0.40,
    seed: int = 42,
    sign_packets: bool = False,
) -> AttackResult:
    """Dispatch and execute any of the 14 benchmark attack scenarios by `attack_id`."""
    if attack_id.startswith("constant_scaling_"):
        pct_str = attack_id.replace("constant_scaling_", "").replace("pct", "")
        return attack_constant_scaling(
            df,
            window_slice=window_slice,
            reduction_pct=float(pct_str),
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "flatline_injection":
        return attack_flatline_injection(
            df,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "naive_replay":
        return attack_naive_replay(
            df,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "time_shifted_replay":
        return attack_time_shifted_replay(
            df,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "synthetic_noise_on_flatline":
        return attack_synthetic_noise_on_flatline(
            df,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            seed=seed,
            sign_packets=sign_packets,
        )
    if attack_id.startswith("slow_drift_"):
        rate_str = (
            attack_id.replace("slow_drift_", "").replace("pct_day", "").replace("_", ".")
        )
        return attack_slow_calibration_drift(
            df,
            window_slice=window_slice,
            drift_pct_per_day=float(rate_str),
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "selective_packet_dropping":
        return attack_selective_packet_dropping(
            df,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "adaptive_whitebox_a_single_source":
        if detector is None:
            raise ValueError("detector is required for adaptive_whitebox_a_single_source")
        return attack_adaptive_whitebox_single_source(
            df,
            detector=detector,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )
    if attack_id == "adaptive_whitebox_b_coordinated_insider":
        if detector is None:
            raise ValueError("detector is required for adaptive_whitebox_b_coordinated_insider")
        return attack_adaptive_whitebox_coordinated_insider(
            df,
            detector=detector,
            window_slice=window_slice,
            attack_fraction=attack_fraction,
            sign_packets=sign_packets,
        )

    raise ValueError(f"Unknown attack_id: {attack_id!r}")


__all__ = [
    "AttackResult",
    "BENCHMARK_ATTACK_SPECS",
    "attack_adaptive_whitebox_coordinated_insider",
    "attack_adaptive_whitebox_single_source",
    "attack_constant_scaling",
    "attack_flatline_injection",
    "attack_naive_replay",
    "attack_selective_packet_dropping",
    "attack_slow_calibration_drift",
    "attack_synthetic_noise_on_flatline",
    "attack_time_shifted_replay",
    "build_packets_from_dataframe",
    "compute_achieved_co2_reduction_pct",
    "resolve_attack_window",
    "run_attack_by_id",
]
