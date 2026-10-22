"""Baseline 1: Static Threshold Detector (`backend.vericems.detectors.baseline_static`).

Flags a record (or batch of records) if `co2_mass_short_tons` or `co2_rate_short_tons_mmbtu`
crosses fixed limits learned strictly from the TRAINING facilities only, with the decision
threshold calibrated on VALIDATION facilities to hit a configurable false-positive rate
(`config/params.yaml`).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class FuelStaticLimits:
    """Learned training-split limits for CO2 mass and CO2 rate."""

    fuel_type: str
    co2_mass_min: float
    co2_mass_max: float
    co2_mass_median: float
    co2_mass_half_span: float
    co2_rate_min: float
    co2_rate_max: float
    co2_rate_median: float
    co2_rate_half_span: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "fuel_type": self.fuel_type,
            "co2_mass_min": float(self.co2_mass_min),
            "co2_mass_max": float(self.co2_mass_max),
            "co2_mass_median": float(self.co2_mass_median),
            "co2_mass_half_span": float(self.co2_mass_half_span),
            "co2_rate_min": float(self.co2_rate_min),
            "co2_rate_max": float(self.co2_rate_max),
            "co2_rate_median": float(self.co2_rate_median),
            "co2_rate_half_span": float(self.co2_rate_half_span),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> FuelStaticLimits:
        return cls(
            fuel_type=str(data["fuel_type"]),
            co2_mass_min=float(data["co2_mass_min"]),
            co2_mass_max=float(data["co2_mass_max"]),
            co2_mass_median=float(data["co2_mass_median"]),
            co2_mass_half_span=float(data["co2_mass_half_span"]),
            co2_rate_min=float(data["co2_rate_min"]),
            co2_rate_max=float(data["co2_rate_max"]),
            co2_rate_median=float(data["co2_rate_median"]),
            co2_rate_half_span=float(data["co2_rate_half_span"]),
        )


@dataclass
class StaticThresholdDetector:
    """Baseline 1 detector: static limits on CO2 mass and CO2 rate learned on training facilities."""

    per_fuel_limits: dict[str, FuelStaticLimits] = field(default_factory=dict)
    global_limits: FuelStaticLimits | None = None
    facility_fuel_map: dict[int, str] = field(default_factory=dict)
    trained_facility_ids: list[int] = field(default_factory=list)
    record_threshold: float = 1.0
    batch_threshold: float = 1.0
    target_fpr: float = 0.02
    val_record_fpr: float = 0.0
    val_batch_fpr: float = 0.0

    @staticmethod
    def _compute_limits(
        df: pd.DataFrame, fuel_label: str, tail_prob: float
    ) -> FuelStaticLimits:
        co2_mass = df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
        if "co2_rate_short_tons_mmbtu" in df.columns:
            co2_rate = df["co2_rate_short_tons_mmbtu"].to_numpy(dtype=np.float64)
        else:
            hi = np.maximum(df["heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6)
            co2_rate = co2_mass / hi

        q_low = max(1e-4, min(0.25, tail_prob / 4.0))
        q_high = 1.0 - q_low

        m_min = float(np.quantile(co2_mass, q_low))
        m_max = float(np.quantile(co2_mass, q_high))
        m_med = float(0.5 * (m_min + m_max))
        m_span = max(float(0.5 * (m_max - m_min)), 1e-4)

        r_min = float(np.quantile(co2_rate, q_low))
        r_max = float(np.quantile(co2_rate, q_high))
        r_med = float(0.5 * (r_min + r_max))
        r_span = max(float(0.5 * (r_max - r_min)), 1e-5)

        return FuelStaticLimits(
            fuel_type=fuel_label,
            co2_mass_min=m_min,
            co2_mass_max=m_max,
            co2_mass_median=m_med,
            co2_mass_half_span=m_span,
            co2_rate_min=r_min,
            co2_rate_max=r_max,
            co2_rate_median=r_med,
            co2_rate_half_span=r_span,
        )

    def fit(self, train_df: pd.DataFrame, *, target_fpr: float = 0.02) -> StaticThresholdDetector:
        """Fit static CO2 mass and CO2 rate limits strictly on TRAINING facilities."""
        if len(train_df) == 0:
            raise ValueError("Cannot fit StaticThresholdDetector on empty DataFrame")
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

        self.global_limits = self._compute_limits(train_df, "ALL", self.target_fpr)
        self.per_fuel_limits = {}
        if "primary_fuel_type" in train_df.columns:
            for fuel_type, grp in train_df.groupby("primary_fuel_type", sort=True):
                if len(grp) >= 5:
                    self.per_fuel_limits[str(fuel_type)] = self._compute_limits(
                        grp, str(fuel_type), self.target_fpr
                    )

        self.record_threshold = 1.0
        self.batch_threshold = 1.0
        return self

    def _resolve_limits(self, fuel_type: str | None) -> FuelStaticLimits:
        if self.global_limits is None:
            raise RuntimeError("StaticThresholdDetector has not been fitted")
        if fuel_type and fuel_type in self.per_fuel_limits:
            return self.per_fuel_limits[fuel_type]
        if fuel_type == "Natural Gas" and "Pipeline Natural Gas" in self.per_fuel_limits:
            return self.per_fuel_limits["Pipeline Natural Gas"]
        if fuel_type == "Pipeline Natural Gas" and "Natural Gas" in self.per_fuel_limits:
            return self.per_fuel_limits["Natural Gas"]
        return self.global_limits

    def score_records(self, df: pd.DataFrame) -> np.ndarray:
        """Compute continuous static-limit exceedance scores for each row in `df`.

        A raw score > 1.0 means `co2_mass_short_tons` or `co2_rate_short_tons_mmbtu`
        crossed the training `[min, max]` interval for that fuel type.
        """
        if self.global_limits is None:
            raise RuntimeError("StaticThresholdDetector has not been fitted")

        co2_mass = df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
        if "co2_rate_short_tons_mmbtu" in df.columns:
            co2_rate = df["co2_rate_short_tons_mmbtu"].to_numpy(dtype=np.float64)
        else:
            hi = np.maximum(df["heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6)
            co2_rate = co2_mass / hi

        scores = np.zeros(len(df), dtype=np.float64)
        if "primary_fuel_type" in df.columns:
            fuels = df["primary_fuel_type"].astype(str).to_numpy()
            for fuel_val in np.unique(fuels):
                mask = fuels == fuel_val
                lim = self._resolve_limits(str(fuel_val))
                mass_exc = np.abs(co2_mass[mask] - lim.co2_mass_median) / lim.co2_mass_half_span
                rate_exc = np.abs(co2_rate[mask] - lim.co2_rate_median) / lim.co2_rate_half_span
                scores[mask] = np.maximum(mass_exc, rate_exc)
        else:
            lim = self.global_limits
            mass_exc = np.abs(co2_mass - lim.co2_mass_median) / lim.co2_mass_half_span
            rate_exc = np.abs(co2_rate - lim.co2_rate_median) / lim.co2_rate_half_span
            scores = np.maximum(mass_exc, rate_exc)

        return scores

    def score_batch_series(
        self, df: pd.DataFrame, *, window_size: int = 8, stride: int = 8
    ) -> np.ndarray:
        """Compute window-level static scores (90th percentile of record scores in window)."""
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
        """Calibrate record and batch thresholds on VALIDATION facilities only."""
        if len(val_df) == 0:
            raise ValueError("Cannot calibrate on empty validation DataFrame")
        self.target_fpr = float(target_fpr)
        val_rec_scores = self.score_records(val_df)
        q = float(np.clip(1.0 - self.target_fpr, 0.50, 0.9999))
        self.record_threshold = float(np.quantile(val_rec_scores, q))
        self.val_record_fpr = float(np.mean(val_rec_scores > self.record_threshold))

        val_batch_scores = self.score_batch_series(val_df, window_size=window_size, stride=window_size)
        if len(val_batch_scores) > 0:
            self.batch_threshold = float(np.quantile(val_batch_scores, q))
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
    ) -> dict[str, Any]:
        """Evaluate a sequence of telemetry packets with Baseline 1."""
        rows: list[dict[str, Any]] = []
        for pkt in packets:
            vals = pkt.get("values", pkt)
            co2 = float(vals.get("co2_mass_short_tons", 0.0))
            hi = float(vals.get("heat_input_mmbtu", 1.0))
            rate = float(vals.get("co2_rate_short_tons_mmbtu", co2 / max(hi, 1e-6)))
            row: dict[str, Any] = {
                "co2_mass_short_tons": co2,
                "heat_input_mmbtu": hi,
                "co2_rate_short_tons_mmbtu": rate,
            }
            if primary_fuel_type is not None:
                row["primary_fuel_type"] = primary_fuel_type
            rows.append(row)
        df = pd.DataFrame(rows)
        rec_scores = self.score_records(df)
        raw_batch_score = float(np.max(rec_scores)) if len(rec_scores) > 0 else 0.0
        # Map ratio (raw_batch_score / record_threshold) so threshold sits at 0.50 (5000 bp)
        ratio = raw_batch_score / max(self.record_threshold, 1e-6)
        norm_score = float(np.clip(0.5 * ratio, 0.0, 1.0))
        is_flagged = bool(raw_batch_score > self.record_threshold)
        return {
            "raw_score": raw_batch_score,
            "normalized_score": norm_score,
            "verdict": 1 if is_flagged else 0,
            "reason_codes": ["PHYSICS_RESIDUAL"] if is_flagged else [],
            "record_scores": rec_scores.tolist(),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "detector_type": "baseline_1_static_threshold",
            "trained_facility_ids": list(self.trained_facility_ids),
            "target_fpr": float(self.target_fpr),
            "record_threshold": float(self.record_threshold),
            "batch_threshold": float(self.batch_threshold),
            "val_record_fpr": float(self.val_record_fpr),
            "val_batch_fpr": float(self.val_batch_fpr),
            "global_limits": self.global_limits.to_dict() if self.global_limits else None,
            "per_fuel_limits": {k: v.to_dict() for k, v in self.per_fuel_limits.items()},
            "facility_fuel_map": {str(k): v for k, v in self.facility_fuel_map.items()},
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> StaticThresholdDetector:
        det = cls(
            per_fuel_limits={
                str(k): FuelStaticLimits.from_dict(v)
                for k, v in data.get("per_fuel_limits", {}).items()
            },
            global_limits=(
                FuelStaticLimits.from_dict(data["global_limits"])
                if data.get("global_limits")
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
        return det
