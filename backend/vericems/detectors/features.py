"""Feature extraction, synthetic fuel ledger generation, and spectral/autocorrelation checks.

Implements:
- Extraction of the 8 real CAMPD channels documented in `docs/DATA_CARD.md`.
- Deterministic generation and extraction of the synthetic cross-source channel
  `fuel_ledger_synthetic` (derived from true heat input plus calibrated meter noise,
  labelled synthetic everywhere per AGENTS.md Rule 3).
- Rolling-window spectral flatness / variance decoupling (`SPECTRAL_FLAT`) and
  repeated-segment / autocorrelation periodicity (`SPECTRAL_REPEAT`) features.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Final

import numpy as np
import pandas as pd

REAL_CHANNELS: Final[tuple[str, ...]] = (
    "gross_load_mw",
    "steam_load_1000_lb_hr",
    "heat_input_mmbtu",
    "co2_mass_short_tons",
    "co2_rate_short_tons_mmbtu",
    "so2_mass_lbs",
    "nox_mass_lbs",
    "op_time_fraction",
)

FUEL_LEDGER_SYNTHETIC_CHANNEL: Final[str] = "fuel_ledger_synthetic"
FUEL_LEDGER_SYNTHETIC_ALIAS: Final[str] = "synthetic_fuel_flow_mmbtu_indep"


def generate_fuel_ledger_synthetic(
    heat_input_mmbtu: np.ndarray | pd.Series | Sequence[float] | float,
    *,
    seed: int = 42,
    noise_std_fraction: float = 0.0015,
    min_noise_mmbtu: float = 0.05,
) -> np.ndarray:
    """Generate the SYNTHETIC `fuel_ledger_synthetic` channel from true heat input plus noise.

    Per AGENTS.md Rule 3 and Milestone P04 Task 5, this channel is explicitly named
    `fuel_ledger_synthetic` and represents a simulated independent custody-transfer
    fuel ledger (mmBtu) with calibrated Gaussian meter noise.
    """
    arr = np.asarray(heat_input_mmbtu, dtype=np.float64)
    rng = np.random.default_rng(int(seed))
    sigma = np.maximum(float(min_noise_mmbtu), np.abs(arr) * float(noise_std_fraction))
    noise = rng.normal(loc=0.0, scale=sigma, size=arr.shape)
    synth = np.clip(arr + noise, a_min=0.0, a_max=None)
    return synth.astype(np.float64)


def add_fuel_ledger_synthetic_column(
    df: pd.DataFrame,
    *,
    seed: int = 42,
    noise_std_fraction: float = 0.0015,
) -> pd.DataFrame:
    """Return a copy of `df` with `fuel_ledger_synthetic` deterministically populated per facility."""
    out = df.copy()
    if "facility_id" in out.columns:
        synth_col = np.zeros(len(out), dtype=np.float64)
        for fac_id, grp in out.groupby("facility_id", sort=False):
            idx = grp.index
            hi = grp["heat_input_mmbtu"].to_numpy(dtype=np.float64)
            synth_col[out.index.get_indexer(idx)] = generate_fuel_ledger_synthetic(
                hi,
                seed=int(seed) + int(fac_id),
                noise_std_fraction=noise_std_fraction,
            )
        out[FUEL_LEDGER_SYNTHETIC_CHANNEL] = synth_col
    else:
        hi = out["heat_input_mmbtu"].to_numpy(dtype=np.float64)
        out[FUEL_LEDGER_SYNTHETIC_CHANNEL] = generate_fuel_ledger_synthetic(
            hi,
            seed=int(seed),
            noise_std_fraction=noise_std_fraction,
        )
    return out


def extract_real_channel_matrix(
    packets_or_df: Sequence[Mapping[str, Any]] | pd.DataFrame,
    *,
    default_values: Mapping[str, float] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Extract an `(N, 8)` float64 matrix of `REAL_CHANNELS` and an `(N, 8)` presence mask.

    When extracting from packet dictionaries (which may omit optional auxiliary channels
    such as `steam_load_1000_lb_hr`, `so2_mass_lbs`, `nox_mass_lbs`, `op_time_fraction`,
    or `co2_rate_short_tons_mmbtu`), derived fields are computed deterministically:
    - `co2_rate_short_tons_mmbtu = co2_mass_short_tons / max(heat_input_mmbtu, 1e-6)`
    - `op_time_fraction = 1.0`
    - other missing auxiliary channels use `default_values[ch]` if provided, else `0.0`.
    """
    defaults = dict(default_values) if default_values is not None else {}

    if isinstance(packets_or_df, pd.DataFrame):
        df = packets_or_df
        n = len(df)
        mat = np.zeros((n, len(REAL_CHANNELS)), dtype=np.float64)
        mask = np.ones((n, len(REAL_CHANNELS)), dtype=bool)
        for j, ch in enumerate(REAL_CHANNELS):
            if ch in df.columns:
                vals = pd.to_numeric(df[ch], errors="coerce")
                present = vals.notna().to_numpy(dtype=bool)
                mask[:, j] = present
                fill_val = float(defaults.get(ch, 1.0 if ch == "op_time_fraction" else 0.0))
                mat[:, j] = vals.fillna(fill_val).to_numpy(dtype=np.float64)
            else:
                mask[:, j] = False
                mat[:, j] = float(defaults.get(ch, 1.0 if ch == "op_time_fraction" else 0.0))
        # If co2_rate was missing, compute from co2_mass / heat_input
        rate_idx = REAL_CHANNELS.index("co2_rate_short_tons_mmbtu")
        co2_idx = REAL_CHANNELS.index("co2_mass_short_tons")
        hi_idx = REAL_CHANNELS.index("heat_input_mmbtu")
        missing_rate = ~mask[:, rate_idx]
        if np.any(missing_rate):
            mat[missing_rate, rate_idx] = mat[missing_rate, co2_idx] / np.maximum(
                mat[missing_rate, hi_idx], 1e-6
            )
            mask[missing_rate, rate_idx] = mask[missing_rate, co2_idx] & mask[missing_rate, hi_idx]
        return mat, mask

    n = len(packets_or_df)
    mat = np.zeros((n, len(REAL_CHANNELS)), dtype=np.float64)
    mask = np.zeros((n, len(REAL_CHANNELS)), dtype=bool)

    for i, item in enumerate(packets_or_df):
        values_map = item.get("values", item) if isinstance(item, Mapping) else {}
        if not isinstance(values_map, Mapping):
            values_map = {}

        co2_val = float(values_map.get("co2_mass_short_tons", 0.0))
        hi_val = float(values_map.get("heat_input_mmbtu", 0.0))

        for j, ch in enumerate(REAL_CHANNELS):
            if ch in values_map and values_map[ch] is not None:
                mat[i, j] = float(values_map[ch])
                mask[i, j] = True
            elif ch == "co2_rate_short_tons_mmbtu" and (
                "co2_mass_short_tons" in values_map and "heat_input_mmbtu" in values_map
            ):
                mat[i, j] = co2_val / max(hi_val, 1e-6)
                mask[i, j] = True
            elif ch == "op_time_fraction":
                mat[i, j] = float(defaults.get(ch, 1.0))
                mask[i, j] = False
            else:
                mat[i, j] = float(defaults.get(ch, 0.0))
                mask[i, j] = False

    return mat, mask


def extract_fuel_ledger_synthetic(
    packets_or_df: Sequence[Mapping[str, Any]] | pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray]:
    """Extract `fuel_ledger_synthetic` values and a boolean availability mask.

    Checks `fuel_ledger_synthetic` first, and falls back to `synthetic_fuel_flow_mmbtu_indep`
    (the `schemas/channels.json` registry name) if `fuel_ledger_synthetic` is not present.
    """
    if isinstance(packets_or_df, pd.DataFrame):
        df = packets_or_df
        if FUEL_LEDGER_SYNTHETIC_CHANNEL in df.columns:
            s = pd.to_numeric(df[FUEL_LEDGER_SYNTHETIC_CHANNEL], errors="coerce")
            return s.fillna(0.0).to_numpy(dtype=np.float64), s.notna().to_numpy(dtype=bool)
        if FUEL_LEDGER_SYNTHETIC_ALIAS in df.columns:
            s = pd.to_numeric(df[FUEL_LEDGER_SYNTHETIC_ALIAS], errors="coerce")
            return s.fillna(0.0).to_numpy(dtype=np.float64), s.notna().to_numpy(dtype=bool)
        return np.zeros(len(df), dtype=np.float64), np.zeros(len(df), dtype=bool)

    n = len(packets_or_df)
    vals = np.zeros(n, dtype=np.float64)
    present = np.zeros(n, dtype=bool)
    for i, item in enumerate(packets_or_df):
        vmap = item.get("values", item) if isinstance(item, Mapping) else {}
        if not isinstance(vmap, Mapping):
            continue
        if FUEL_LEDGER_SYNTHETIC_CHANNEL in vmap and vmap[FUEL_LEDGER_SYNTHETIC_CHANNEL] is not None:
            vals[i] = float(vmap[FUEL_LEDGER_SYNTHETIC_CHANNEL])
            present[i] = True
        elif FUEL_LEDGER_SYNTHETIC_ALIAS in vmap and vmap[FUEL_LEDGER_SYNTHETIC_ALIAS] is not None:
            vals[i] = float(vmap[FUEL_LEDGER_SYNTHETIC_ALIAS])
            present[i] = True
    return vals, present


def compute_window_spectral_features(
    co2_series: np.ndarray,
    heat_series: np.ndarray,
    load_series: np.ndarray,
) -> dict[str, float]:
    """Compute spectral flatness/decoupling (`SPECTRAL_FLAT`) and replay/autocorr (`SPECTRAL_REPEAT`) features.

    Designed for a rolling window of length `W >= 4` (e.g., 8 or 24 packets):
    1. `flatness_score`:
       - Measures whether `co2_mass_short_tons` is abnormally flatlined (near-zero CV) OR
         injected with uncorrelated white noise on a flatline while `heat_input_mmbtu` /
         `gross_load_mw` undergoes normal dynamic variation.
       - Also checks if `co2_mass_short_tons` has literally zero variance (`std < 1e-6`)
         while `heat_input_mmbtu` or `gross_load_mw` varies (`cv_ref > 1e-3`).
    2. `repeat_score`:
       - Detects repeated segments (`L >= 2`) within the window where a non-constant sequence
         of readings is replayed verbatim or near-verbatim at a later position.
       - Also computes detrended lag autocorrelation / FFT periodicity concentration to catch
         cyclically looped windows without false-flagging smooth linear load ramps.
    """
    co2 = np.asarray(co2_series, dtype=np.float64).ravel()
    hi = np.asarray(heat_series, dtype=np.float64).ravel()
    ld = np.asarray(load_series, dtype=np.float64).ravel()
    w = len(co2)

    if w < 4:
        return {
            "flatness_score": 0.0,
            "repeat_score": 0.0,
            "co2_cv": 0.0,
            "ref_cv": 0.0,
            "spectral_flatness_wiener": 0.0,
            "max_detrended_autocorr": 0.0,
            "repeated_segment_match": 0.0,
        }

    mean_co2 = max(float(np.mean( np.abs(co2) )), 1e-6)
    mean_hi = max(float(np.mean( np.abs(hi) )), 1e-6)
    mean_ld = max(float(np.mean( np.abs(ld) )), 1e-6)

    std_co2 = float(np.std(co2))
    std_hi = float(np.std(hi))
    std_ld = float(np.std(ld))

    co2_cv = std_co2 / mean_co2
    hi_cv = std_hi / mean_hi
    ld_cv = std_ld / mean_ld if np.mean(ld > 1.0) > 0.5 else 0.0
    # Use heat-input CV as primary reference; include load CV only when load varies beyond integer-MW rounding (>2%)
    ref_cv = max(hi_cv, ld_cv if ld_cv > 0.02 else 0.0)

    # 1. Flatline / Variance suppression relative to thermal/electrical load variation
    if ref_cv > 0.003:
        cv_ratio = co2_cv / max(ref_cv, 1e-6)
        variance_suppression = float(np.clip(1.0 - (cv_ratio / 0.10), 0.0, 1.0))
    else:
        variance_suppression = 0.0

    # Compute Wiener spectral flatness of zero-mean CO2 window
    fft_vals = np.fft.rfft(co2 - np.mean(co2))[1:]
    power = np.abs(fft_vals) ** 2 + 1e-12
    geo_mean = float(np.exp(np.mean(np.log(power))))
    arith_mean = float(np.mean(power))
    wiener_flatness = geo_mean / max(arith_mean, 1e-12)

    # Check uncorrelated noise on flatline: if ref_cv > 0.01 (plant load is clearly moving)
    # and CO2 has positive variance but near-zero or negative correlation with heat input:
    decorr_score = 0.0
    if ref_cv > 0.01 and hi_cv > 0.005 and std_co2 > 1e-5:
        corr = float(np.corrcoef(co2, hi)[0, 1])
        if np.isfinite(corr) and corr < 0.50:
            decorr_score = float(np.clip((0.50 - corr) * 1.5, 0.0, 1.0)) * float(
                np.clip(wiener_flatness * 1.5, 0.3, 1.0)
            )

    # Also catch simultaneous multi-channel synthetic flatline where consecutive first-differences
    # are identically 0.0 for almost the entire window despite non-trivial plant load variation
    zero_diff_frac = float(np.mean(np.abs(np.diff(co2)) < 1e-6))
    exact_flatline_score = 0.0
    if zero_diff_frac >= 0.85 and ref_cv > 0.003:
        exact_flatline_score = 1.0

    flatness_score = float(max(variance_suppression, decorr_score, exact_flatline_score))

    # 2. Repeated segment & autocorrelation periodicity check (SPECTRAL_REPEAT)
    # (a) Exact or near-exact repeated sub-segment of length L >= 2 in a non-constant window
    repeated_segment_match = 0.0
    if co2_cv > 0.001 or ref_cv > 0.001:
        # Stack normalized [co2, hi, ld]
        norm_mat = np.column_stack(
            [
                co2 / mean_co2,
                hi / mean_hi,
                ld / mean_ld if mean_ld > 1.0 else np.zeros_like(co2),
            ]
        )
        for seg_len in range(2, max(3, w // 2 + 1)):
            for i in range(0, w - 2 * seg_len + 1):
                seg_a = norm_mat[i : i + seg_len]
                # Require the segment itself to not be a constant steady state
                seg_step = float(np.max(np.abs(np.diff(seg_a[:, 0]))))
                if seg_step < 0.001:
                    continue
                for j in range(i + seg_len, w - seg_len + 1):
                    seg_b = norm_mat[j : j + seg_len]
                    max_diff = float(np.max(np.abs(seg_a - seg_b)))
                    if max_diff < 1e-4:
                        repeated_segment_match = 1.0
                        break
                    elif max_diff < 0.001:
                        repeated_segment_match = max(
                            repeated_segment_match, float(1.0 - max_diff / 0.001)
                        )
                if repeated_segment_match >= 1.0:
                    break

    # (b) Detrended lag autocorrelation spike for periodic looped windows
    t_axis = np.arange(w, dtype=np.float64)
    slope, intercept = np.polyfit(t_axis, co2, 1)
    detrended = co2 - (slope * t_axis + intercept)
    detrended_std = float(np.std(detrended))
    max_autocorr = 0.0
    if detrended_std / mean_co2 > 0.002 and w >= 6:
        z = (detrended - np.mean(detrended)) / (detrended_std + 1e-12)
        for lag in range(2, w // 2 + 1):
            z1 = z[:-lag]
            z2 = z[lag:]
            if len(z1) >= 3:
                ac = float(np.mean(z1 * z2))
                if ac > max_autocorr:
                    max_autocorr = ac

    # Only trigger periodic autocorr score when max_autocorr is very high (> 0.85) on a non-linear signal
    autocorr_Periodic_score = (
        float(np.clip((max_autocorr - 0.82) / 0.15, 0.0, 1.0)) if max_autocorr > 0.82 else 0.0
    )
    repeat_score = float(max(repeated_segment_match, autocorr_Periodic_score))

    return {
        "flatness_score": flatness_score,
        "repeat_score": repeat_score,
        "co2_cv": co2_cv,
        "ref_cv": ref_cv,
        "spectral_flatness_wiener": wiener_flatness,
        "max_detrended_autocorr": max_autocorr,
        "repeated_segment_match": repeated_segment_match,
    }


def compute_rolling_spectral_scores(
    df: pd.DataFrame,
    *,
    window_size: int = 8,
    stride: int = 8,
) -> pd.DataFrame:
    """Compute window-level spectral flatness and repeat scores across unit time series in `df`."""
    rows: list[dict[str, Any]] = []
    group_col = "unit_series_id" if "unit_series_id" in df.columns else "facility_id"
    for series_id, grp in df.groupby(group_col, sort=True):
        co2 = grp["co2_mass_short_tons"].to_numpy(dtype=np.float64)
        hi = grp["heat_input_mmbtu"].to_numpy(dtype=np.float64)
        ld = grp["gross_load_mw"].to_numpy(dtype=np.float64)
        fac_id = int(grp["facility_id"].iloc[0]) if "facility_id" in grp.columns else -1
        n = len(co2)
        for start in range(0, n - window_size + 1, stride):
            feats = compute_window_spectral_features(
                co2[start : start + window_size],
                hi[start : start + window_size],
                ld[start : start + window_size],
            )
            rows.append(
                {
                    "facility_id": fac_id,
                    "unit_series_id": str(series_id),
                    "start_idx": start,
                    **feats,
                }
            )
    return pd.DataFrame(rows)
