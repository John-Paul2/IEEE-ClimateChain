"""Baseline 2: Deterministic Mass-Balance & Load-Consistency Physics Detector.

Implements:
- Expected CO2 = `emission_factor_ratio * heat_input_mmbtu`, with `emission_factor_ratio`
  estimated per fuel type strictly from TRAINING facilities (never hardcoded).
- Load / heat-input consistency check (`gross_load_mw` vs `heat_input_mmbtu` ratio and
  co-movement learned from TRAINING facilities).
- Residual bound tuned on VALIDATION facilities to hit `target_fpr` (`config/params.yaml`).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
import re
from typing import Any

import numpy as np
import pandas as pd

_FAC_ID_FROM_DEV_RE = re.compile(r"FAC[-_](\d+)", re.IGNORECASE)


@dataclass
class FuelPhysicsParams:
    """Learned combustion stoichiometry and load-to-heat parameters for a fuel type."""

    fuel_type: str
    co2_to_heat_ratio: float
    co2_to_heat_mean: float
    co2_to_heat_std: float
    rel_residual_scale: float
    load_to_heat_median: float
    load_to_heat_q01: float
    load_to_heat_q99: float
    load_to_heat_scale: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "fuel_type": self.fuel_type,
            "co2_to_heat_ratio": float(self.co2_to_heat_ratio),
            "co2_to_heat_mean": float(self.co2_to_heat_mean),
            "co2_to_heat_std": float(self.co2_to_heat_std),
            "rel_residual_scale": float(self.rel_residual_scale),
            "load_to_heat_median": float(self.load_to_heat_median),
            "load_to_heat_q01": float(self.load_to_heat_q01),
            "load_to_heat_q99": float(self.load_to_heat_q99),
            "load_to_heat_scale": float(self.load_to_heat_scale),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> FuelPhysicsParams:
        return cls(
            fuel_type=str(data["fuel_type"]),
            co2_to_heat_ratio=float(data["co2_to_heat_ratio"]),
            co2_to_heat_mean=float(data["co2_to_heat_mean"]),
            co2_to_heat_std=float(data["co2_to_heat_std"]),
            rel_residual_scale=float(data["rel_residual_scale"]),
            load_to_heat_median=float(data["load_to_heat_median"]),
            load_to_heat_q01=float(data["load_to_heat_q01"]),
            load_to_heat_q99=float(data["load_to_heat_q99"]),
            load_to_heat_scale=float(data["load_to_heat_scale"]),
        )


@dataclass
class MassBalancePhysicsDetector:
    """Baseline 2 detector: deterministic mass-balance and load/heat consistency rules."""

    per_fuel_params: dict[str, FuelPhysicsParams] = field(default_factory=dict)
    global_params: FuelPhysicsParams | None = None
    facility_fuel_map: dict[int, str] = field(default_factory=dict)
    trained_facility_ids: list[int] = field(default_factory=list)
    record_threshold: float = 1.0
    batch_threshold: float = 1.0
    target_fpr: float = 0.02
    val_record_fpr: float = 0.0
    val_batch_fpr: float = 0.0

    @staticmethod
    def _estimate_fuel_params(df: pd.DataFrame, fuel_label: str) -> FuelPhysicsParams:
        co2 = df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
        hi = np.maximum(df["heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6)
        ratios = co2 / hi

        ratio_med = float(np.median(ratios))
        ratio_mean = float(np.mean(ratios))
        ratio_std = max(float(np.std(ratios)), 1e-6)

        expected_co2 = ratio_med * hi
        rel_res = np.abs(co2 - expected_co2) / np.maximum(expected_co2, 1e-6)
        # Floor at 0.025 (2.5%) to accommodate natural multi-grade fuel variation (e.g. Coal 0.1025..0.1049)
        rel_scale = max(float(np.quantile(rel_res, 0.985)), 0.025)

        if "gross_load_mw" in df.columns:
            ld = df["gross_load_mw"].to_numpy(dtype=np.float64)
            valid_ld = ld > 5.0
        else:
            ld = np.zeros_like(hi)
            valid_ld = np.zeros(len(hi), dtype=bool)

        if np.any(valid_ld):
            lh = ld[valid_ld] / hi[valid_ld]
            lh_med = float(np.median(lh))
            lh_q01 = float(np.quantile(lh, 0.005))
            lh_q99 = float(np.quantile(lh, 0.995))
            lh_scale = max(float(0.5 * (lh_q99 - lh_q01)), 0.04)
        else:
            lh_med = 0.10
            lh_q01 = 0.04
            lh_q99 = 0.35
            lh_scale = 0.15

        return FuelPhysicsParams(
            fuel_type=fuel_label,
            co2_to_heat_ratio=ratio_med,
            co2_to_heat_mean=ratio_mean,
            co2_to_heat_std=ratio_std,
            rel_residual_scale=rel_scale,
            load_to_heat_median=lh_med,
            load_to_heat_q01=lh_q01,
            load_to_heat_q99=lh_q99,
            load_to_heat_scale=lh_scale,
        )

    def fit(self, train_df: pd.DataFrame, *, target_fpr: float = 0.02) -> MassBalancePhysicsDetector:
        """Estimate emission-factor ratios and load-consistency parameters from TRAINING facilities only."""
        if len(train_df) == 0:
            raise ValueError("Cannot fit MassBalancePhysicsDetector on empty DataFrame")
        self.target_fpr = float(target_fpr)

        if "facility_id" in train_df.columns:
            self.trained_facility_ids = sorted(
                int(fid) for fid in train_df["facility_id"].unique()
            )
            if "primary_fuel_type" in train_df.columns:
                for fid, grp in train_df.groupby("facility_id"):
                    self.facility_fuel_map[int(fid)] = str(
                        grp["primary_fuel_type"].mode().iloc[0]
                    )

        self.global_params = self._estimate_fuel_params(train_df, "ALL")
        self.per_fuel_params = {}
        if "primary_fuel_type" in train_df.columns:
            for fuel_type, grp in train_df.groupby("primary_fuel_type", sort=True):
                if len(grp) >= 5:
                    self.per_fuel_params[str(fuel_type)] = self._estimate_fuel_params(
                        grp, str(fuel_type)
                    )

        self.record_threshold = 1.0
        self.batch_threshold = 1.0
        return self

    def resolve_fuel_params(
        self,
        fuel_type: str | None = None,
        *,
        facility_id: int | None = None,
        device_id: str | None = None,
        observed_ratio_hint: float | None = None,
    ) -> FuelPhysicsParams:
        """Resolve learned `FuelPhysicsParams` for a given fuel type, facility, or ratio hint."""
        if self.global_params is None:
            raise RuntimeError("MassBalancePhysicsDetector has not been fitted")

        resolved_fuel = fuel_type
        if not resolved_fuel and facility_id is not None and int(facility_id) in self.facility_fuel_map:
            resolved_fuel = self.facility_fuel_map[int(facility_id)]
        if not resolved_fuel and device_id:
            m = _FAC_ID_FROM_DEV_RE.search(device_id)
            if m:
                fid = int(m.group(1))
                if fid in self.facility_fuel_map:
                    resolved_fuel = self.facility_fuel_map[fid]

        if resolved_fuel:
            if resolved_fuel in self.per_fuel_params:
                return self.per_fuel_params[resolved_fuel]
            if resolved_fuel == "Natural Gas" and "Pipeline Natural Gas" in self.per_fuel_params:
                return self.per_fuel_params["Pipeline Natural Gas"]
            if resolved_fuel == "Pipeline Natural Gas" and "Natural Gas" in self.per_fuel_params:
                return self.per_fuel_params["Natural Gas"]

        if observed_ratio_hint is not None and self.per_fuel_params:
            # Select the learned fuel parameters with the closest stoichiometric ratio
            best_params = min(
                self.per_fuel_params.values(),
                key=lambda fp: abs(fp.co2_to_heat_ratio - float(observed_ratio_hint)),
            )
            return best_params

        return self.global_params

    def _score_arrays_with_params(
        self,
        co2: np.ndarray,
        hi: np.ndarray,
        ld: np.ndarray,
        rate_opt: np.ndarray | None,
        fp: FuelPhysicsParams,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return `(combined_score, mass_balance_norm_res, load_consistency_norm_res)`."""
        hi_safe = np.maximum(hi, 1e-6)
        expected_co2 = fp.co2_to_heat_ratio * hi_safe
        rel_mb_res = np.abs(co2 - expected_co2) / np.maximum(expected_co2, 1e-6)
        mb_norm = rel_mb_res / max(fp.rel_residual_scale, 1e-6)

        # If reported co2_rate_short_tons_mmbtu is also available, check internal consistency
        if rate_opt is not None:
            internal_expected = rate_opt * hi_safe
            internal_rel_res = np.abs(co2 - internal_expected) / np.maximum(
                internal_expected, 1e-6
            )
            mb_norm = np.maximum(mb_norm, internal_rel_res / max(fp.rel_residual_scale, 1e-6))

        # Load / heat-input consistency check (when unit is generating electric load > 5 MW)
        load_norm = np.zeros_like(mb_norm)
        active_ld = ld > 5.0
        if np.any(active_ld):
            lh_ratio = ld[active_ld] / hi_safe[active_ld]
            # Exceedance outside training [q01, q99] interval normalized by scale
            low_violation = np.maximum(0.0, fp.load_to_heat_q01 - lh_ratio) / max(
                fp.load_to_heat_q01 * 0.50, 0.01
            )
            high_violation = np.maximum(0.0, lh_ratio - fp.load_to_heat_q99) / max(
                fp.load_to_heat_scale, 0.05
            )
            load_norm[active_ld] = np.maximum(low_violation, high_violation)

        combined = np.maximum(mb_norm, load_norm)
        return combined, mb_norm, load_norm

    def score_records(self, df: pd.DataFrame) -> np.ndarray:
        """Compute continuous physics residual score for each record in `df`."""
        if self.global_params is None:
            raise RuntimeError("MassBalancePhysicsDetector has not been fitted")

        co2 = df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
        hi = df["heat_input_mmbtu"].to_numpy(dtype=np.float64)
        ld = (
            df["gross_load_mw"].to_numpy(dtype=np.float64)
            if "gross_load_mw" in df.columns
            else np.zeros_like(co2)
        )
        rate_opt = (
            df["co2_rate_short_tons_mmbtu"].to_numpy(dtype=np.float64)
            if "co2_rate_short_tons_mmbtu" in df.columns
            else None
        )

        scores = np.zeros(len(df), dtype=np.float64)
        if "primary_fuel_type" in df.columns:
            fuels = df["primary_fuel_type"].astype(str).to_numpy()
            for fuel_val in np.unique(fuels):
                mask = fuels == fuel_val
                fp = self.resolve_fuel_params(str(fuel_val))
                comb, _, _ = self._score_arrays_with_params(
                    co2[mask],
                    hi[mask],
                    ld[mask],
                    rate_opt[mask] if rate_opt is not None else None,
                    fp,
                )
                scores[mask] = comb
        else:
            # Evaluate each row against nearest learned fuel type if fuel type column is absent
            if self.per_fuel_params:
                per_fuel_scores = []
                for fp in self.per_fuel_params.values():
                    comb, _, _ = self._score_arrays_with_params(co2, hi, ld, rate_opt, fp)
                    per_fuel_scores.append(comb)
                scores = np.min(np.vstack(per_fuel_scores), axis=0)
            else:
                scores, _, _ = self._score_arrays_with_params(
                    co2, hi, ld, rate_opt, self.global_params
                )
        return scores

    def score_batch_series(
        self, df: pd.DataFrame, *, window_size: int = 8, stride: int = 8
    ) -> np.ndarray:
        """Compute window-level physics scores across unit time series in `df`."""
        rec_scores = self.score_records(df)
        group_col = "unit_series_id" if "unit_series_id" in df.columns else None
        batch_scores: list[float] = []
        if group_col is not None:
            for _, grp in df.groupby(group_col, sort=True):
                idx = df.index.get_indexer(grp.index)
                s = rec_scores[idx]
                for start in range(0, len(s) - window_size + 1, stride):
                    batch_scores.append(float(np.quantile(s[start : start + window_size], 0.875)))
        else:
            for start in range(0, len(rec_scores) - window_size + 1, stride):
                batch_scores.append(
                    float(np.quantile(rec_scores[start : start + window_size], 0.875))
                )
        return np.asarray(batch_scores, dtype=np.float64)

    def calibrate(
        self,
        val_df: pd.DataFrame,
        *,
        target_fpr: float = 0.02,
        window_size: int = 8,
    ) -> dict[str, float]:
        """Calibrate residual bounds on VALIDATION facilities only to hit `target_fpr`."""
        if len(val_df) == 0:
            raise ValueError("Cannot calibrate on empty validation DataFrame")
        self.target_fpr = float(target_fpr)
        val_rec_scores = self.score_records(val_df)
        q = float(np.clip(1.0 - self.target_fpr, 0.50, 0.9999))
        self.record_threshold = max(float(np.quantile(val_rec_scores, q)), 1.0)
        self.val_record_fpr = float(np.mean(val_rec_scores > self.record_threshold))

        val_batch_scores = self.score_batch_series(val_df, window_size=window_size, stride=window_size)
        if len(val_batch_scores) > 0:
            self.batch_threshold = max(float(np.quantile(val_batch_scores, q)), 1.0)
            self.val_batch_fpr = float(np.mean(val_batch_scores > self.batch_threshold))
        else:
            self.batch_threshold = self.record_threshold
            self.val_batch_fpr = self.val_record_fpr

        return {
            "record_threshold": self.record_threshold,
            "batch_threshold": self.batch_threshold,
            "val_record_fpr": self.val_record_fpr,
            "val_batch_fpr": self.val_batch_fpr,
        }

    def predict_records(self, df: pd.DataFrame) -> np.ndarray:
        """Return binary fraud flags (`1` = flagged, `0` = clean) for each record in `df`."""
        return (self.score_records(df) > self.record_threshold).astype(np.int64)

    def evaluate_packets(
        self,
        packets: Sequence[Mapping[str, Any]],
        *,
        primary_fuel_type: str | None = None,
        facility_id: int | None = None,
        device_id: str | None = None,
    ) -> dict[str, Any]:
        """Evaluate a sequence of telemetry packets with Baseline 2 (mass-balance + load check)."""
        if not packets:
            return {
                "raw_score": 0.0,
                "normalized_score": 0.0,
                "verdict": 0,
                "reason_codes": [],
                "record_scores": [],
                "mass_balance_scores": [],
                "load_consistency_scores": [],
                "fuel_type_used": "Unknown",
                "emission_factor_ratio": 0.0,
            }

        co2 = np.array(
            [float(p.get("values", p).get("co2_mass_short_tons", 0.0)) for p in packets],
            dtype=np.float64,
        )
        hi = np.array(
            [float(p.get("values", p).get("heat_input_mmbtu", 0.0)) for p in packets],
            dtype=np.float64,
        )
        ld = np.array(
            [float(p.get("values", p).get("gross_load_mw", 0.0)) for p in packets],
            dtype=np.float64,
        )
        has_rate = all(
            "co2_rate_short_tons_mmbtu" in p.get("values", p) for p in packets
        )
        rate_opt = (
            np.array(
                [float(p.get("values", p)["co2_rate_short_tons_mmbtu"]) for p in packets],
                dtype=np.float64,
            )
            if has_rate
            else None
        )

        resolved_dev_id = device_id or str(packets[0].get("device_id", ""))
        # If fuel is not explicitly known, infer from rate_opt median or batch 75th-percentile ratio
        ratio_hint = (
            float(np.median(rate_opt))
            if rate_opt is not None
            else float(np.median(co2 / np.maximum(hi, 1e-6)))
        )
        fp = self.resolve_fuel_params(
            primary_fuel_type,
            facility_id=facility_id,
            device_id=resolved_dev_id,
            observed_ratio_hint=ratio_hint,
        )

        comb, mb_norm, ld_norm = self._score_arrays_with_params(co2, hi, ld, rate_opt, fp)

        # Also check within-batch load vs heat-input dynamic co-movement if load is varying:
        # If gross_load_mw changes significantly across the batch while heat_input_mmbtu
        # moves in the opposite direction or is scaled down out of proportion:
        if len(packets) >= 4 and np.all(ld > 5.0):
            ld_rel = ld / max(float(np.median(ld)), 1e-6)
            hi_rel = hi / max(float(np.median(hi)), 1e-6)
            dynamic_div = np.abs(ld_rel - hi_rel) / max(fp.rel_residual_scale * 4.0, 0.15)
            ld_norm = np.maximum(ld_norm, dynamic_div)
            comb = np.maximum(mb_norm, ld_norm)

        raw_batch_score = float(np.max(comb))
        ratio_to_thresh = raw_batch_score / max(self.record_threshold, 1e-6)
        norm_score = float(np.clip(0.5 * ratio_to_thresh, 0.0, 1.0))
        is_flagged = bool(raw_batch_score > self.record_threshold)

        return {
            "raw_score": raw_batch_score,
            "normalized_score": norm_score,
            "verdict": 1 if is_flagged else 0,
            "reason_codes": ["PHYSICS_RESIDUAL"] if is_flagged else [],
            "record_scores": comb.tolist(),
            "mass_balance_scores": mb_norm.tolist(),
            "load_consistency_scores": ld_norm.tolist(),
            "fuel_type_used": fp.fuel_type,
            "emission_factor_ratio": fp.co2_to_heat_ratio,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "detector_type": "baseline_2_mass_balance_physics",
            "trained_facility_ids": list(self.trained_facility_ids),
            "target_fpr": float(self.target_fpr),
            "record_threshold": float(self.record_threshold),
            "batch_threshold": float(self.batch_threshold),
            "val_record_fpr": float(self.val_record_fpr),
            "val_batch_fpr": float(self.val_batch_fpr),
            "global_params": self.global_params.to_dict() if self.global_params else None,
            "per_fuel_params": {k: v.to_dict() for k, v in self.per_fuel_params.items()},
            "facility_fuel_map": {str(k): v for k, v in self.facility_fuel_map.items()},
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> MassBalancePhysicsDetector:
        return cls(
            per_fuel_params={
                str(k): FuelPhysicsParams.from_dict(v)
                for k, v in data.get("per_fuel_params", {}).items()
            },
            global_params=(
                FuelPhysicsParams.from_dict(data["global_params"])
                if data.get("global_params")
                else None
            ),
            facility_fuel_map={
                int(k): str(v) for k, v in data.get("facility_fuel_map", {}).items()
            },
            trained_facility_ids=[int(x) for x in data.get("trained_facility_ids", [])],
            record_threshold=float(data.get("record_threshold", 1.0)),
            batch_threshold=float(data.get("batch_threshold", 1.0)),
            target_fpr=float(data.get("target_fpr", 0.02)),
            val_record_fpr=float(data.get("val_record_fpr", 0.0)),
            val_batch_fpr=float(data.get("val_batch_fpr", 0.0)),
        )
