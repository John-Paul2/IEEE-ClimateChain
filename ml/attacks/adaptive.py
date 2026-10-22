"""Attack 8: Adaptive White-Box Attacker (Variants A and B) in `ml/attacks/adaptive.py`.

Implements constrained white-box optimization against `ProposedDetector` (and baselines):
- **Variant A (`attack_adaptive_whitebox_single_source`)**:
  Knows the exact ONNX autoencoder weights/scaler, learned fuel mass-balance ratios, load-to-heat
  bounds, rolling spectral window `W`, and validation-calibrated thresholds. Uses projected
  constrained optimization to minimize reported CO2 subject to detector scores staying below
  threshold and physical bounds, **without** being able to modify `fuel_ledger_synthetic` or
  `gross_load_mw`.
- **Variant B (`attack_adaptive_whitebox_coordinated_insider`)**:
  Same white-box knowledge and optimization as Variant A, **and** also forges the synthetic
  fuel ledger (`fuel_ledger_synthetic`) consistently with the forged `heat_input_mmbtu` channel.

See `docs/ADAPTIVE_ATTACKER.md` for the complete formal specification of knowledge, capabilities,
objective function, constraints, and optimization algorithm.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from backend.vericems.crypto.secure_element import SecureElement
from backend.vericems.detectors.features import (
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    REAL_CHANNELS,
    compute_window_spectral_features,
)
from backend.vericems.detectors.verifier import ProposedDetector
from ml.attacks.base import (
    AttackResult,
    build_packets_from_dataframe,
    compute_achieved_co2_reduction_pct,
    resolve_attack_window,
)


def _evaluate_candidate_window_ratios(
    window_df_clean: pd.DataFrame,
    alpha: np.ndarray,
    beta: np.ndarray,
    detector: ProposedDetector,
    *,
    forge_fuel_ledger: bool,
) -> dict[str, float]:
    """Evaluate exact white-box detector component ratios on a candidate forged window `(alpha, beta)`.

    Args:
        window_df_clean: Clean DataFrame slice of length `W`.
        alpha: Multiplicative scale vector on `co2_mass_short_tons` in `(0, 1]^W`.
        beta: Multiplicative scale vector on `heat_input_mmbtu` in `(0, 1]^W`.
        detector: Trained and calibrated `ProposedDetector`.
        forge_fuel_ledger: `False` for Variant A (single-source), `True` for Variant B (coordinated insider).
    """
    cand_df = window_df_clean.copy()
    co2_orig = cand_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
    hi_orig = cand_df["heat_input_mmbtu"].to_numpy(dtype=np.float64)
    ld_orig = (
        cand_df["gross_load_mw"].to_numpy(dtype=np.float64)
        if "gross_load_mw" in cand_df.columns
        else np.zeros_like(co2_orig)
    )

    co2_new = np.maximum(co2_orig * alpha, 1e-4)
    hi_new = np.maximum(hi_orig * beta, 1e-4)
    rate_new = co2_new / np.maximum(hi_new, 1e-6)

    cand_df["co2_mass_short_tons"] = co2_new
    cand_df["heat_input_mmbtu"] = hi_new
    if "co2_rate_short_tons_mmbtu" in cand_df.columns:
        cand_df["co2_rate_short_tons_mmbtu"] = rate_new
    if "so2_mass_lbs" in cand_df.columns:
        cand_df["so2_mass_lbs"] = cand_df["so2_mass_lbs"].to_numpy(dtype=np.float64) * beta
    if "nox_mass_lbs" in cand_df.columns:
        cand_df["nox_mass_lbs"] = cand_df["nox_mass_lbs"].to_numpy(dtype=np.float64) * beta

    if forge_fuel_ledger and FUEL_LEDGER_SYNTHETIC_CHANNEL in cand_df.columns:
        # Variant B: coordinated insider scales synthetic fuel ledger consistently with heat input
        cand_df[FUEL_LEDGER_SYNTHETIC_CHANNEL] = (
            cand_df[FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(dtype=np.float64) * beta
        )

    # 1. Physics detector score ratio
    phys_scores = detector.physics_detector.score_records(cand_df)
    phys_ratio = float(np.max(phys_scores)) / max(detector.physics_threshold, 1e-6)

    # 2. Autoencoder ONNX score ratio
    ae_scores = detector.ae_runner.score_records(cand_df)
    ae_ratio = float(np.max(ae_scores)) / max(detector.ae_threshold, 1e-6)

    # 3. Cross-source fuel ledger score ratio
    _, cs_norm = detector.score_cross_source_records(cand_df)
    cs_ratio = float(np.max(cs_norm)) if len(cs_norm) > 0 else 0.0

    # 4. Spectral flatness & repeat score ratios
    spec = compute_window_spectral_features(co2_new, hi_new, ld_orig)
    flat_ratio = (spec["flatness_score"] / max(detector.flatness_threshold, 1e-6)) / max(
        detector.combined_batch_threshold, 1.0
    )
    rep_ratio = (spec["repeat_score"] / max(detector.repeat_threshold, 1e-6)) / max(
        detector.combined_batch_threshold, 1.0
    )

    max_ratio = float(max(phys_ratio, ae_ratio, cs_ratio, flat_ratio, rep_ratio))
    return {
        "max_ratio": max_ratio,
        "phys_ratio": float(phys_ratio),
        "ae_ratio": float(ae_ratio),
        "cs_ratio": float(cs_ratio),
        "flat_ratio": float(flat_ratio),
        "rep_ratio": float(rep_ratio),
    }


def _optimize_window_whitebox(
    window_df_clean: pd.DataFrame,
    detector: ProposedDetector,
    *,
    forge_fuel_ledger: bool,
    target_reduction_pct: float | None = None,
    safety_margin: float = 0.88,
    min_reduction_pct: float = 4.5,
    max_reduction_pct: float = 30.0,
) -> tuple[np.ndarray, np.ndarray, dict[str, float]]:
    """Run white-box projected optimization on a single window of length `W`.

    To preserve natural temporal correlation (`corr(CO2, HI) >= 0.99`) and avoid triggering
    `SPECTRAL_FLAT` or `SPECTRAL_REPEAT` or within-batch dynamic load divergence, the attacker
    parameterizes the window forgery with smooth coupled multipliers `alpha_t` and `beta_t`
    and optimizes:
    - In **target-reduction mode** (`target_reduction_pct` specified): fixes `alpha = 1 - target_reduction_pct/100`
      and finds the optimal `beta in [alpha, 1.0]` that minimizes `ProposedDetector`'s max score ratio.
    - In **constrained evasion mode** (`target_reduction_pct is None`): searches for the smallest
      `alpha in [1 - max_reduction_pct/100, 1 - min_reduction_pct/100]` (maximum CO2 reduction)
      and optimal `beta in [alpha, 1.0]` such that `max_ratio <= safety_margin` (or minimizes
      `max_ratio` at `1 - min_reduction_pct/100` if no reduction >= `min_reduction_pct` is feasible).
    """
    w = len(window_df_clean)
    if w == 0:
        return np.ones(0), np.ones(0), {"max_ratio": 0.0}

    # Tiny deterministic smooth modulation across the window so repeated windows never look identical
    t_idx = np.arange(w, dtype=np.float64)
    smooth_profile = 1.0 + 0.0015 * np.sin(2.0 * np.pi * t_idx / max(w, 2))
    smooth_profile /= float(np.mean(smooth_profile))

    def _best_beta_for_scalar_alpha(a_scalar: float) -> tuple[float, dict[str, float]]:
        alpha_vec = np.clip(a_scalar * smooth_profile, 0.40, 1.0)
        if forge_fuel_ledger:
            # Variant B: setting beta == alpha preserves exact CO2/HI stoichiometry AND fuel ledger consistency
            res_eq = _evaluate_candidate_window_ratios(
                window_df_clean, alpha_vec, alpha_vec, detector, forge_fuel_ledger=True
            )
            return a_scalar, res_eq

        # Variant A: fuel ledger cannot be changed. Scaling beta down reduces PHYSICS_RESIDUAL
        # and AE_RESIDUAL (so Baseline 2 is fooled!), up to the point where `1.5 * |hi - ledger|/ledger`
        # matches `|co2 - ratio*ledger|/(ratio*ledger)`.
        # Specifically, `1.5 * (1 - beta) <= (1 - alpha)` => `beta >= 1 - (1 - alpha) / 1.5`,
        # or if the attacker prioritizes evading mass-balance/AE checks while minimizing total score:
        candidates_b = [
            a_scalar,
            1.0 - 0.85 * (1.0 - a_scalar),
            1.0 - (1.0 - a_scalar) / 1.5,
            1.0,
        ]
        best_b = a_scalar
        best_eval: dict[str, float] | None = None
        best_obj = float("inf")
        for b_cand in candidates_b:
            b_clamped = float(np.clip(b_cand, a_scalar, 1.0))
            beta_vec = np.clip(b_clamped * smooth_profile, 0.40, 1.0)
            ev = _evaluate_candidate_window_ratios(
                window_df_clean, alpha_vec, beta_vec, detector, forge_fuel_ledger=False
            )
            # Attacker minimizes max detector ratio + secondary penalty on physics/AE residual
            obj = ev["max_ratio"] + 0.15 * max(ev["phys_ratio"], ev["ae_ratio"])
            if obj < best_obj:
                best_obj = obj
                best_b = b_clamped
                best_eval = ev
        assert best_eval is not None
        return best_b, best_eval

    if target_reduction_pct is not None:
        a_target = float(np.clip(1.0 - float(target_reduction_pct) / 100.0, 0.50, 0.999))
        b_opt, ev_opt = _best_beta_for_scalar_alpha(a_target)
        alpha_out = np.clip(a_target * smooth_profile, 0.40, 1.0)
        beta_out = np.clip(b_opt * smooth_profile, 0.40, 1.0)
        return alpha_out, beta_out, ev_opt

    # Constrained evasion mode: find largest reduction in [min_reduction_pct, max_reduction_pct]
    # keeping max_ratio <= safety_margin
    a_min = float(np.clip(1.0 - float(max_reduction_pct) / 100.0, 0.50, 0.99))
    a_max = float(np.clip(1.0 - float(min_reduction_pct) / 100.0, a_min, 0.995))

    # Coarse-to-fine projected search over alpha in [a_min, a_max]
    grid_alphas = np.linspace(a_min, a_max, 15)
    feasible_alpha: float | None = None
    feasible_beta: float = a_max
    feasible_eval: dict[str, float] | None = None

    min_violation_alpha: float = a_max
    min_violation_beta: float = a_max
    min_violation_eval: dict[str, float] | None = None
    min_violation_score = float("inf")

    for a_cand in grid_alphas:
        b_cand, ev = _best_beta_for_scalar_alpha(float(a_cand))
        if ev["max_ratio"] < min_violation_score:
            min_violation_score = ev["max_ratio"]
            min_violation_alpha = float(a_cand)
            min_violation_beta = b_cand
            min_violation_eval = ev
        if ev["max_ratio"] <= float(safety_margin):
            # Because grid_alphas is ascending (smallest alpha = largest CO2 reduction first),
            # the first feasible alpha on the grid is near the maximum feasible reduction!
            feasible_alpha = float(a_cand)
            feasible_beta = b_cand
            feasible_eval = ev
            break

    if feasible_alpha is not None and feasible_eval is not None:
        # Refine with bisection between previous grid point and feasible_alpha
        low_a = max(a_min, feasible_alpha - (a_max - a_min) / 14.0)
        high_a = feasible_alpha
        for _ in range(6):
            mid_a = 0.5 * (low_a + high_a)
            b_mid, ev_mid = _best_beta_for_scalar_alpha(mid_a)
            if ev_mid["max_ratio"] <= float(safety_margin):
                high_a = mid_a
                feasible_alpha = mid_a
                feasible_beta = b_mid
                feasible_eval = ev_mid
            else:
                low_a = mid_a
        alpha_out = np.clip(feasible_alpha * smooth_profile, 0.40, 1.0)
        beta_out = np.clip(feasible_beta * smooth_profile, 0.40, 1.0)
        return alpha_out, beta_out, feasible_eval

    # If even at `a_max` (min_reduction_pct) the detector score exceeds `safety_margin`
    # (which occurs in Variant A because `fuel_ledger_synthetic` catches reductions >= ~3.6%),
    # use the best projected point at `min_violation_alpha`
    assert min_violation_eval is not None
    alpha_out = np.clip(min_violation_alpha * smooth_profile, 0.40, 1.0)
    beta_out = np.clip(min_violation_beta * smooth_profile, 0.40, 1.0)
    return alpha_out, beta_out, min_violation_eval


def attack_adaptive_whitebox_single_source(
    df: pd.DataFrame,
    detector: ProposedDetector,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    target_reduction_pct: float | None = None,
    safety_margin: float = 0.88,
    min_reduction_pct: float = 4.5,
    max_reduction_pct: float = 30.0,
    window_size: int = 8,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 8A: Adaptive white-box attacker — Single-Source Forging.

    Knows the ONNX model weights, scalers, learned fuel stoichiometric ratio, load-to-heat bounds,
    spectral window `W`, and all validation-calibrated thresholds. Optimizes CEMS channels
    (`co2_mass_short_tons`, `heat_input_mmbtu`, `co2_rate_short_tons_mmbtu`, `so2_mass_lbs`,
    `nox_mass_lbs`) before signing, but **cannot** alter `fuel_ledger_synthetic` or `gross_load_mw`.
    """
    clean_df = df.copy().reset_index(drop=True)
    n = len(clean_df)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction, align_to=window_size
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    out_df = clean_df.copy()
    window_max_ratios: list[float] = []

    for w_start in range(start, end, window_size):
        w_end = min(end, w_start + window_size)
        w_slice = clean_df.iloc[w_start:w_end]
        alpha_w, beta_w, ev_w = _optimize_window_whitebox(
            w_slice,
            detector,
            forge_fuel_ledger=False,
            target_reduction_pct=target_reduction_pct,
            safety_margin=safety_margin,
            min_reduction_pct=min_reduction_pct,
            max_reduction_pct=max_reduction_pct,
        )
        window_max_ratios.append(ev_w["max_ratio"])

        co2_new = out_df.loc[w_start : w_end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64) * alpha_w
        hi_new = out_df.loc[w_start : w_end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64) * beta_w
        out_df.loc[w_start : w_end - 1, "co2_mass_short_tons"] = co2_new
        out_df.loc[w_start : w_end - 1, "heat_input_mmbtu"] = hi_new
        if "co2_rate_short_tons_mmbtu" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "co2_rate_short_tons_mmbtu"] = co2_new / np.maximum(
                hi_new, 1e-6
            )
        if "so2_mass_lbs" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "so2_mass_lbs"] = (
                out_df.loc[w_start : w_end - 1, "so2_mass_lbs"].to_numpy(dtype=np.float64) * beta_w
            )
        if "nox_mass_lbs" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "nox_mass_lbs"] = (
                out_df.loc[w_start : w_end - 1, "nox_mass_lbs"].to_numpy(dtype=np.float64) * beta_w
            )

    packets = build_packets_from_dataframe(
        out_df, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(clean_df, out_df, labels)

    return AttackResult(
        out_df,
        labels,
        packets=packets,
        metadata={
            "attack_id": "adaptive_whitebox_a_single_source",
            "attack_family": "adaptive_whitebox",
            "variant": "A_single_source",
            "attack_name": "Adaptive White-Box A (Single-Source Forging)",
            "is_synthetic_injection": True,
            "forges_fuel_ledger_synthetic": False,
            "safety_margin": float(safety_margin),
            "min_reduction_pct": float(min_reduction_pct),
            "target_reduction_pct": float(target_reduction_pct) if target_reduction_pct is not None else None,
            "mean_window_detector_ratio": float(np.mean(window_max_ratios)) if window_max_ratios else 0.0,
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )


def attack_adaptive_whitebox_coordinated_insider(
    df: pd.DataFrame,
    detector: ProposedDetector,
    window_slice: tuple[int, int] | slice | None = None,
    *,
    target_reduction_pct: float | None = None,
    safety_margin: float = 0.88,
    min_reduction_pct: float = 4.5,
    max_reduction_pct: float = 25.0,
    window_size: int = 8,
    attack_fraction: float = 0.40,
    sign_packets: bool = False,
    secure_element: SecureElement | None = None,
) -> AttackResult:
    """Attack 8B: Adaptive white-box attacker — Coordinated Insider (forges `fuel_ledger_synthetic`).

    Same white-box knowledge and constrained optimization as Variant A, **plus** the capability
    to forge the synthetic custody-transfer fuel ledger (`fuel_ledger_synthetic`) consistently
    with `heat_input_mmbtu`. Bounded only by the electrical load-to-heat efficiency envelope
    (`gross_load_mw / heat_input_mmbtu`) and the 8-channel physics-informed autoencoder manifold.
    """
    clean_df = df.copy().reset_index(drop=True)
    n = len(clean_df)
    start, end = resolve_attack_window(
        n, window_slice=window_slice, attack_fraction=attack_fraction, align_to=window_size
    )
    labels = np.zeros(n, dtype=np.int64)
    labels[start:end] = 1

    out_df = clean_df.copy()
    window_max_ratios: list[float] = []

    for w_start in range(start, end, window_size):
        w_end = min(end, w_start + window_size)
        w_slice = clean_df.iloc[w_start:w_end]
        alpha_w, beta_w, ev_w = _optimize_window_whitebox(
            w_slice,
            detector,
            forge_fuel_ledger=True,
            target_reduction_pct=target_reduction_pct,
            safety_margin=safety_margin,
            min_reduction_pct=min_reduction_pct,
            max_reduction_pct=max_reduction_pct,
        )
        window_max_ratios.append(ev_w["max_ratio"])

        co2_new = out_df.loc[w_start : w_end - 1, "co2_mass_short_tons"].to_numpy(dtype=np.float64) * alpha_w
        hi_new = out_df.loc[w_start : w_end - 1, "heat_input_mmbtu"].to_numpy(dtype=np.float64) * beta_w
        out_df.loc[w_start : w_end - 1, "co2_mass_short_tons"] = co2_new
        out_df.loc[w_start : w_end - 1, "heat_input_mmbtu"] = hi_new
        if "co2_rate_short_tons_mmbtu" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "co2_rate_short_tons_mmbtu"] = co2_new / np.maximum(
                hi_new, 1e-6
            )
        if "so2_mass_lbs" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "so2_mass_lbs"] = (
                out_df.loc[w_start : w_end - 1, "so2_mass_lbs"].to_numpy(dtype=np.float64) * beta_w
            )
        if "nox_mass_lbs" in out_df.columns:
            out_df.loc[w_start : w_end - 1, "nox_mass_lbs"] = (
                out_df.loc[w_start : w_end - 1, "nox_mass_lbs"].to_numpy(dtype=np.float64) * beta_w
            )
        if FUEL_LEDGER_SYNTHETIC_CHANNEL in out_df.columns:
            out_df.loc[w_start : w_end - 1, FUEL_LEDGER_SYNTHETIC_CHANNEL] = (
                out_df.loc[w_start : w_end - 1, FUEL_LEDGER_SYNTHETIC_CHANNEL].to_numpy(
                    dtype=np.float64
                )
                * beta_w
            )

    packets = build_packets_from_dataframe(
        out_df, sign_packets=sign_packets, secure_element=secure_element
    )
    achieved_red = compute_achieved_co2_reduction_pct(clean_df, out_df, labels)

    return AttackResult(
        out_df,
        labels,
        packets=packets,
        metadata={
            "attack_id": "adaptive_whitebox_b_coordinated_insider",
            "attack_family": "adaptive_whitebox",
            "variant": "B_coordinated_insider",
            "attack_name": "Adaptive White-Box B (Coordinated Insider + Fuel Ledger Forgery)",
            "is_synthetic_injection": True,
            "forges_fuel_ledger_synthetic": True,
            "safety_margin": float(safety_margin),
            "min_reduction_pct": float(min_reduction_pct),
            "max_reduction_pct": float(max_reduction_pct),
            "target_reduction_pct": float(target_reduction_pct) if target_reduction_pct is not None else None,
            "mean_window_detector_ratio": float(np.mean(window_max_ratios)) if window_max_ratios else 0.0,
            "window_start": int(start),
            "window_end": int(end),
            "co2_reduction_achieved_pct": achieved_red,
        },
    )
