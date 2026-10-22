"""Proposed Detector and Verifier Node `verify_batch(packets, context) -> Verdict`.

Implements Milestone P04 Tasks 3, 4, 5, 6, and 7:
- Cryptographic chain checks (`CHAIN_BREAK`, `SEQ_GAP`, `SIG_INVALID`) from `backend.vericems.crypto`.
- Physics mass-balance and load-consistency check (`PHYSICS_RESIDUAL`).
- Physics-informed autoencoder ONNX CPU reconstruction check (`AE_RESIDUAL`).
- Rolling-window spectral flatness (`SPECTRAL_FLAT`) and repeated-segment / autocorrelation
  periodicity (`SPECTRAL_REPEAT`) checks.
- Cross-source check comparing reported CO2 (and heat input) against the SYNTHETIC
  `fuel_ledger_synthetic` channel (`CROSS_SOURCE_MISMATCH`).
- Deterministic score quantization to integer basis points (`0..10000`) and discretized
  verdict (`0` = clean, `1` = fraud), with `input_hash = keccak256(concatenated packet_hashes)`
  and `model_hash = SHA-256(ml/artifacts/model.onnx)`.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_EVEN
import json
from pathlib import Path
from typing import Any, Final

import numpy as np
import pandas as pd

from backend.vericems.crypto.chain import (
    CHAIN_BREAK,
    SEQ_DUPLICATE,
    SEQ_GAP,
    SEQ_REORDER,
    SIG_INVALID,
    TIMESTAMP_REGRESSION,
    verify_chain,
)
from backend.vericems.crypto.merkle import (
    build_merkle_tree,
    compute_vote_commitment,
    keccak256_hex,
)
from backend.vericems.crypto.packet import GENESIS_PREV_HASH, packet_hash
from backend.vericems.detectors.autoencoder import (
    ChannelScaler,
    OnnxAutoencoderRunner,
    compute_model_hash,
)
from backend.vericems.detectors.baseline_physics import MassBalancePhysicsDetector
from backend.vericems.detectors.baseline_static import StaticThresholdDetector
from backend.vericems.detectors.features import (
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    add_fuel_ledger_synthetic_column,
    compute_rolling_spectral_scores,
    compute_window_spectral_features,
    extract_fuel_ledger_synthetic,
)

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_ARTIFACTS_DIR: Final[Path] = REPO_ROOT / "ml" / "artifacts"

PHYSICS_RESIDUAL: Final[str] = "PHYSICS_RESIDUAL"
AE_RESIDUAL: Final[str] = "AE_RESIDUAL"
SPECTRAL_FLAT: Final[str] = "SPECTRAL_FLAT"
SPECTRAL_REPEAT: Final[str] = "SPECTRAL_REPEAT"
CROSS_SOURCE_MISMATCH: Final[str] = "CROSS_SOURCE_MISMATCH"

CANONICAL_REASON_ORDER: Final[tuple[str, ...]] = (
    SIG_INVALID,
    CHAIN_BREAK,
    SEQ_GAP,
    PHYSICS_RESIDUAL,
    AE_RESIDUAL,
    SPECTRAL_FLAT,
    SPECTRAL_REPEAT,
    CROSS_SOURCE_MISMATCH,
)

_QUANTIZE_1: Final[Decimal] = Decimal("1")


def quantize_score_bp(score: float) -> int:
    """Deterministically quantize a float anomaly score in `[0.0, 1.0]` to integer basis points `0..10000`."""
    if not np.isfinite(score):
        return 10000
    clamped = min(1.0, max(0.0, float(score)))
    scaled = Decimal(f"{clamped * 10000.0:.8f}").quantize(_QUANTIZE_1, rounding=ROUND_HALF_EVEN)
    return min(10000, max(0, int(scaled)))


def compute_input_hash(packets: Sequence[Mapping[str, Any]]) -> str:
    """Compute `input_hash = keccak256` of the concatenated 32-byte packet hashes.

    If a packet dict lacks `"prev_hash"` or `"device_id"` (e.g., raw synthetic test record),
    normalizes with default fields before computing `packet_hash`.
    """
    if not packets:
        return keccak256_hex(b"")
    concat_bytes = bytearray()
    for idx, pkt in enumerate(packets):
        if (
            isinstance(pkt, Mapping)
            and "device_id" in pkt
            and "prev_hash" in pkt
            and "seq" in pkt
            and "timestamp_utc" in pkt
            and "values" in pkt
        ):
            h_hex = packet_hash(pkt)
        else:
            vals = pkt.get("values", pkt) if isinstance(pkt, Mapping) else {}
            norm_pkt = {
                "device_id": str(pkt.get("device_id", "DEV-SYNTHETIC-001")),
                "prev_hash": str(pkt.get("prev_hash", GENESIS_PREV_HASH)),
                "seq": int(pkt.get("seq", idx)),
                "timestamp_utc": str(pkt.get("timestamp_utc", f"2025-01-01T{idx % 24:02d}:00:00Z")),
                "values": {str(k): float(v) for k, v in vals.items() if isinstance(v, (int, float))},
            }
            h_hex = packet_hash(norm_pkt)
        concat_bytes.extend(bytes.fromhex(h_hex[2:]))
    return keccak256_hex(bytes(concat_bytes))


@dataclass(frozen=True)
class Verdict:
    """Deterministic verifier evaluation verdict for a batch of telemetry packets."""

    score_bp: int
    verdict: int
    reason_codes: list[str]
    model_hash: str
    input_hash: str
    merkle_root: str = ""
    batch_id: int = 0
    component_scores: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score_bp": int(self.score_bp),
            "verdict": int(self.verdict),
            "reason_codes": list(self.reason_codes),
            "model_hash": str(self.model_hash),
            "input_hash": str(self.input_hash),
            "merkle_root": str(self.merkle_root),
            "batch_id": int(self.batch_id),
            "component_scores": {str(k): float(v) for k, v in self.component_scores.items()},
        }

    def to_schema_dict(
        self,
        verifier_address: str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        salt: str = "0x" + "11" * 32,
        *,
        use_merkle_root_as_input_hash: bool = False,
    ) -> dict[str, Any]:
        """Build a dictionary conforming to `schemas/verdict.schema.json` with `vote_commitment`."""
        ih = (
            self.merkle_root
            if (use_merkle_root_as_input_hash and self.merkle_root)
            else self.input_hash
        )
        _, vote_comm = compute_vote_commitment(
            batch_id=self.batch_id,
            model_hash_hex=self.model_hash,
            input_hash_hex=ih,
            score_bp=self.score_bp,
            verdict=self.verdict,
            salt_hex=salt,
        )
        return {
            "batch_id": int(self.batch_id),
            "verifier_address": str(verifier_address),
            "model_hash": str(self.model_hash),
            "input_hash": str(ih),
            "score_bp": int(self.score_bp),
            "verdict": int(self.verdict),
            "reason_codes": list(self.reason_codes),
            "salt": str(salt),
            "vote_commitment": vote_comm,
        }

    def __getitem__(self, key: str) -> Any:
        return self.to_dict()[key]


def _verify_chain_structure_without_pubkey(
    packets: Sequence[Mapping[str, Any]],
    *,
    expected_initial_prev_hash: str | None = None,
    expected_first_seq: int | None = None,
    expected_last_seq: int | None = None,
    expected_count: int | None = None,
) -> list[str]:
    """Check `prev_hash` links and `seq` continuity even when `public_key` is not in `context`."""
    codes: list[str] = []
    if not packets:
        if expected_count and expected_count > 0:
            codes.append(SEQ_GAP)
        return codes

    # Only run structural chain check if packets actually carry seq / prev_hash fields
    if not all(isinstance(p, Mapping) and "seq" in p and "prev_hash" in p for p in packets):
        return codes

    prev_h = expected_initial_prev_hash
    prev_seq: int | None = None
    seen_seqs: set[int] = set()

    for idx, pkt in enumerate(packets):
        curr_seq = int(pkt["seq"])
        actual_prev = str(pkt["prev_hash"])

        if idx == 0:
            if prev_h is not None and actual_prev != prev_h:
                codes.append(CHAIN_BREAK)
            elif prev_h is None and curr_seq == 0 and actual_prev != GENESIS_PREV_HASH:
                codes.append(CHAIN_BREAK)
            if expected_first_seq is not None and curr_seq != expected_first_seq:
                codes.append(SEQ_GAP)
        else:
            if prev_h is not None and actual_prev != prev_h:
                codes.append(CHAIN_BREAK)
            if prev_seq is not None and curr_seq != prev_seq + 1:
                codes.append(SEQ_GAP)

        if curr_seq in seen_seqs:
            codes.append(SEQ_GAP)
        seen_seqs.add(curr_seq)
        prev_seq = curr_seq

        try:
            prev_h = packet_hash(pkt)
        except Exception:
            codes.append(SIG_INVALID)
            prev_h = None

    if expected_count is not None and len(packets) != expected_count:
        codes.append(SEQ_GAP)
    if expected_last_seq is not None and prev_seq is not None and prev_seq != expected_last_seq:
        codes.append(SEQ_GAP)

    dedup: list[str] = []
    for c in codes:
        if c not in dedup:
            dedup.append(c)
    return dedup


@dataclass
class ProposedDetector:
    """Proposed multi-layer detector combining crypto chain checks, physics, ONNX AE, spectral, and cross-source checks."""

    physics_detector: MassBalancePhysicsDetector
    ae_runner: OnnxAutoencoderRunner
    static_detector: StaticThresholdDetector | None = None
    trained_facility_ids: list[int] = field(default_factory=list)
    val_facility_ids: list[int] = field(default_factory=list)
    target_fpr: float = 0.02
    window_size: int = 8
    physics_threshold: float = 1.0
    ae_threshold: float = 1.0
    flatness_threshold: float = 0.75
    repeat_threshold: float = 0.75
    cross_source_rel_threshold: float = 0.035
    combined_batch_threshold: float = 1.0
    fraud_threshold_bp: int = 5000
    val_record_fpr: float = 0.0
    val_batch_fpr: float = 0.0

    @property
    def model_hash(self) -> str:
        return self.ae_runner.model_hash

    def score_cross_source_records(
        self,
        packets_or_df: Sequence[Mapping[str, Any]] | pd.DataFrame,
        *,
        primary_fuel_type: str | None = None,
        facility_id: int | None = None,
        device_id: str | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Compare reported CO2 and heat input against `fuel_ledger_synthetic`.

        Returns `(raw_rel_discrepancy, normalized_cross_source_score)` where normalized score > 1.0
        triggers `CROSS_SOURCE_MISMATCH`.
        """
        ledger_vals, present = extract_fuel_ledger_synthetic(packets_or_df)
        n = len(ledger_vals)
        if n == 0 or not np.any(present):
            return np.zeros(n, dtype=np.float64), np.zeros(n, dtype=np.float64)

        if isinstance(packets_or_df, pd.DataFrame):
            co2 = packets_or_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
            hi = packets_or_df["heat_input_mmbtu"].to_numpy(dtype=np.float64)
            ratios = np.zeros(n, dtype=np.float64)
            if "primary_fuel_type" in packets_or_df.columns:
                fuels = packets_or_df["primary_fuel_type"].astype(str).to_numpy()
                for f_val in np.unique(fuels):
                    mask = fuels == f_val
                    fp = self.physics_detector.resolve_fuel_params(str(f_val))
                    ratios[mask] = fp.co2_to_heat_ratio
            else:
                fp = self.physics_detector.resolve_fuel_params(
                    primary_fuel_type,
                    facility_id=facility_id,
                    device_id=device_id,
                    observed_ratio_hint=float(np.median(co2 / np.maximum(hi, 1e-6))),
                )
                ratios[:] = fp.co2_to_heat_ratio
        else:
            co2 = np.array(
                [float(p.get("values", p).get("co2_mass_short_tons", 0.0)) for p in packets_or_df],
                dtype=np.float64,
            )
            hi = np.array(
                [float(p.get("values", p).get("heat_input_mmbtu", 0.0)) for p in packets_or_df],
                dtype=np.float64,
            )
            hint = float(np.median(co2 / np.maximum(hi, 1e-6)))
            fp = self.physics_detector.resolve_fuel_params(
                primary_fuel_type,
                facility_id=facility_id,
                device_id=device_id,
                observed_ratio_hint=hint,
            )
            ratios = np.full(n, fp.co2_to_heat_ratio, dtype=np.float64)

        ledger_safe = np.maximum(ledger_vals, 1e-6)
        expected_co2_from_ledger = ratios * ledger_safe
        co2_vs_ledger_rel = np.abs(co2 - expected_co2_from_ledger) / np.maximum(
            expected_co2_from_ledger, 1e-6
        )
        hi_vs_ledger_rel = np.abs(hi - ledger_vals) / ledger_safe

        # Weight direct heat-input-vs-fuel-ledger mismatch (which catches adaptive insiders scaling
        # both CO2 and heat input together!) and CO2-vs-ledger mismatch
        raw_rel = np.where(
            present,
            np.maximum(co2_vs_ledger_rel, hi_vs_ledger_rel * 1.5),
            0.0,
        )
        norm_score = raw_rel / max(self.cross_source_rel_threshold, 1e-6)
        return raw_rel, norm_score

    def score_records(self, df: pd.DataFrame) -> np.ndarray:
        """Compute record-level combined anomaly score on `df`."""
        phys_norm = self.physics_detector.score_records(df) / max(self.physics_threshold, 1e-6)
        ae_norm = self.ae_runner.score_records(df) / max(self.ae_threshold, 1e-6)
        _, cs_norm = self.score_cross_source_records(df)
        return np.maximum.reduce([phys_norm, ae_norm, cs_norm])

    def calibrate(
        self,
        val_df: pd.DataFrame,
        *,
        target_fpr: float = 0.02,
        window_size: int = 8,
        seed: int = 42,
    ) -> dict[str, Any]:
        """Calibrate component and combined thresholds on VALIDATION facilities only.

        Chooses component thresholds so that the combined Proposed Detector achieves an
        empirical false-positive rate close to `target_fpr` on clean validation data.
        """
        if len(val_df) == 0:
            raise ValueError("Cannot calibrate ProposedDetector on empty validation DataFrame")

        self.target_fpr = float(target_fpr)
        self.window_size = int(window_size)
        if "facility_id" in val_df.columns:
            self.val_facility_ids = sorted(int(f) for f in val_df["facility_id"].unique())
            overlap = set(self.trained_facility_ids) & set(self.val_facility_ids)
            if overlap:
                raise ValueError(f"Leakage between train and val facilities: {overlap}")

        # Ensure validation DataFrame has synthetic fuel_ledger_synthetic channel for calibration
        if FUEL_LEDGER_SYNTHETIC_CHANNEL not in val_df.columns:
            val_with_ledger = add_fuel_ledger_synthetic_column(val_df, seed=seed)
        else:
            val_with_ledger = val_df

        # Allocate per-component quantile so union of flags on clean validation data hits ~target_fpr
        comp_tail = max(1e-4, min(0.10, self.target_fpr / 2.2))
        q_comp = float(np.clip(1.0 - comp_tail, 0.50, 0.9999))

        phys_rec = self.physics_detector.score_records(val_with_ledger)
        ae_rec = self.ae_runner.score_records(val_with_ledger)
        cs_raw, _ = self.score_cross_source_records(val_with_ledger)

        self.physics_threshold = max(float(np.quantile(phys_rec, q_comp)), 1.0)
        self.ae_threshold = max(float(np.quantile(ae_rec, q_comp)), 0.05)
        self.cross_source_rel_threshold = max(float(np.quantile(cs_raw, q_comp)), 0.030)

        # Calibrate window-level spectral flatness and repeat thresholds on validation windows
        spec_df = compute_rolling_spectral_scores(
            val_with_ledger, window_size=self.window_size, stride=self.window_size
        )
        if len(spec_df) > 0:
            self.flatness_threshold = float(
                np.clip(np.quantile(spec_df["flatness_score"].to_numpy(), q_comp), 0.70, 0.90)
            )
            self.repeat_threshold = float(
                np.clip(np.quantile(spec_df["repeat_score"].to_numpy(), q_comp), 0.70, 0.90)
            )
        else:
            self.flatness_threshold = 0.75
            self.repeat_threshold = 0.75

        # Now compute combined record and batch scores on validation data and fine-tune scale
        # so that empirical validation FPR does not exceed target_fpr
        comb_rec = self.score_records(val_with_ledger)
        q_target = float(np.clip(1.0 - self.target_fpr, 0.50, 0.9999))
        rec_scale = max(float(np.quantile(comb_rec, q_target)), 1.0)
        self.physics_threshold *= rec_scale
        self.ae_threshold *= rec_scale
        self.cross_source_rel_threshold *= rec_scale

        comb_rec_after = self.score_records(val_with_ledger)
        self.val_record_fpr = float(np.mean(comb_rec_after > 1.0))

        # Measure batch-level FPR across validation windows
        batch_flags: list[int] = []
        group_col = "unit_series_id" if "unit_series_id" in val_with_ledger.columns else "facility_id"
        raw_batch_maxes: list[float] = []
        for _, grp in val_with_ledger.groupby(group_col, sort=True):
            idx = val_with_ledger.index.get_indexer(grp.index)
            r_scores = comb_rec_after[idx]
            co2_arr = grp["co2_mass_short_tons"].to_numpy(dtype=np.float64)
            hi_arr = grp["heat_input_mmbtu"].to_numpy(dtype=np.float64)
            ld_arr = grp["gross_load_mw"].to_numpy(dtype=np.float64)
            for start in range(0, len(r_scores) - self.window_size + 1, self.window_size):
                w_rec = float(np.quantile(r_scores[start : start + self.window_size], 0.875))
                sp = compute_window_spectral_features(
                    co2_arr[start : start + self.window_size],
                    hi_arr[start : start + self.window_size],
                    ld_arr[start : start + self.window_size],
                )
                w_flat = sp["flatness_score"] / max(self.flatness_threshold, 1e-6)
                w_rep = sp["repeat_score"] / max(self.repeat_threshold, 1e-6)
                raw_batch_maxes.append(max(w_rec, w_flat, w_rep))

        if raw_batch_maxes:
            arr_b = np.asarray(raw_batch_maxes, dtype=np.float64)
            self.combined_batch_threshold = max(float(np.quantile(arr_b, q_target)), 1.0)
            batch_flags = (arr_b > self.combined_batch_threshold).astype(int).tolist()
            self.val_batch_fpr = float(np.mean(batch_flags))
        else:
            self.combined_batch_threshold = 1.0
            self.val_batch_fpr = self.val_record_fpr

        self.fraud_threshold_bp = 5000

        return {
            "target_fpr": self.target_fpr,
            "physics_threshold": self.physics_threshold,
            "ae_threshold": self.ae_threshold,
            "flatness_threshold": self.flatness_threshold,
            "repeat_threshold": self.repeat_threshold,
            "cross_source_rel_threshold": self.cross_source_rel_threshold,
            "combined_batch_threshold": self.combined_batch_threshold,
            "fraud_threshold_bp": self.fraud_threshold_bp,
            "val_record_fpr": self.val_record_fpr,
            "val_batch_fpr": self.val_batch_fpr,
        }

    def verify_batch(
        self,
        packets: Sequence[Mapping[str, Any]],
        context: Mapping[str, Any] | None = None,
    ) -> Verdict:
        """Run all cryptographic, physics, ONNX autoencoder, spectral, and cross-source checks."""
        ctx = dict(context) if context is not None else {}
        batch_meta = ctx.get("batch") if isinstance(ctx.get("batch"), Mapping) else None
        batch_id = int(
            ctx.get(
                "batch_id",
                batch_meta.get("batch_id", 0) if batch_meta is not None else 0,
            )
        )
        public_key = ctx.get("public_key")
        primary_fuel_type = ctx.get("primary_fuel_type")
        facility_id = ctx.get("facility_id")
        device_id = ctx.get("device_id")
        if device_id is None and packets and isinstance(packets[0], Mapping):
            device_id = packets[0].get("device_id")

        expected_initial_prev_hash = ctx.get("expected_initial_prev_hash")
        expected_first_seq = ctx.get(
            "expected_first_seq",
            batch_meta.get("first_seq") if batch_meta is not None else None,
        )
        expected_last_seq = ctx.get(
            "expected_last_seq",
            batch_meta.get("last_seq") if batch_meta is not None else None,
        )
        expected_count = ctx.get(
            "expected_count",
            batch_meta.get("count") if batch_meta is not None else None,
        )

        # 1. Compute input_hash = keccak256(concatenated packet_hashes) and merkle_root
        inp_hash = compute_input_hash(packets)
        try:
            merkle_root = build_merkle_tree(packets).merkle_root if packets else ("0x" + "00" * 32)
        except Exception:
            merkle_root = inp_hash

        if ctx.get("input_hash_mode") == "merkle_root":
            inp_hash = merkle_root

        triggered_reasons: set[str] = set()

        # 2. Cryptographic & Hash-Chain Checks
        if public_key is not None:
            init_prev = (
                str(expected_initial_prev_hash)
                if expected_initial_prev_hash is not None
                else (
                    str(packets[0].get("prev_hash", GENESIS_PREV_HASH))
                    if (
                        packets
                        and isinstance(packets[0], Mapping)
                        and int(packets[0].get("seq", 0)) > 0
                    )
                    else GENESIS_PREV_HASH
                )
            )
            first_seq_arg = (
                int(expected_first_seq)
                if expected_first_seq is not None
                else (
                    int(packets[0].get("seq", 0))
                    if (packets and isinstance(packets[0], Mapping))
                    else 0
                )
            )
            chain_res = verify_chain(
                packets,
                public_key,
                expected_initial_prev_hash=init_prev,
                expected_first_seq=first_seq_arg,
                expected_last_seq=expected_last_seq,
                expected_count=expected_count,
                expected_device_id=str(device_id) if device_id else None,
                batch=batch_meta,
            )
            for v_code in chain_res.verdict_reason_codes:
                triggered_reasons.add(v_code)
        else:
            struct_codes = _verify_chain_structure_without_pubkey(
                packets,
                expected_initial_prev_hash=expected_initial_prev_hash,
                expected_first_seq=expected_first_seq,
                expected_last_seq=expected_last_seq,
                expected_count=expected_count,
            )
            for c in struct_codes:
                triggered_reasons.add(c)

        crypto_score = 1.0 if triggered_reasons else 0.0

        if not packets:
            score_bp = quantize_score_bp(crypto_score)
            verdict_int = 1 if (triggered_reasons or score_bp >= self.fraud_threshold_bp) else 0
            ordered_codes = [c for c in CANONICAL_REASON_ORDER if c in triggered_reasons]
            return Verdict(
                score_bp=score_bp,
                verdict=verdict_int,
                reason_codes=ordered_codes if verdict_int == 1 else [],
                model_hash=self.model_hash,
                input_hash=inp_hash,
                merkle_root=merkle_root,
                batch_id=batch_id,
                component_scores={"crypto": crypto_score},
            )

        # 3. Physics Mass-Balance & Load-Consistency Check (PHYSICS_RESIDUAL)
        phys_eval = self.physics_detector.evaluate_packets(
            packets,
            primary_fuel_type=primary_fuel_type,
            facility_id=facility_id,
            device_id=str(device_id) if device_id else None,
        )
        phys_rec_scores = np.asarray(phys_eval["record_scores"], dtype=np.float64)
        phys_ratio = float(np.max(phys_rec_scores)) / max(self.physics_threshold, 1e-6)
        if phys_ratio > 1.0:
            triggered_reasons.add(PHYSICS_RESIDUAL)

        # 4. Physics-Informed Autoencoder ONNX Check (AE_RESIDUAL)
        ae_rec_scores = self.ae_runner.score_records(
            packets,
            primary_fuel_type=phys_eval["fuel_type_used"]
            if phys_eval["fuel_type_used"] != "ALL"
            else primary_fuel_type,
        )
        ae_ratio = float(np.max(ae_rec_scores)) / max(self.ae_threshold, 1e-6)
        if ae_ratio > 1.0:
            triggered_reasons.add(AE_RESIDUAL)

        # 5. Rolling-Window Spectral Flatness & Autocorrelation / Replay Checks
        history_pkts = ctx.get("history_packets", [])
        window_pkts = list(history_pkts) + list(packets) if history_pkts else list(packets)
        co2_w = np.array(
            [float(p.get("values", p).get("co2_mass_short_tons", 0.0)) for p in window_pkts],
            dtype=np.float64,
        )
        hi_w = np.array(
            [float(p.get("values", p).get("heat_input_mmbtu", 0.0)) for p in window_pkts],
            dtype=np.float64,
        )
        ld_w = np.array(
            [float(p.get("values", p).get("gross_load_mw", 0.0)) for p in window_pkts],
            dtype=np.float64,
        )
        spec_feats = compute_window_spectral_features(co2_w, hi_w, ld_w)
        flat_ratio = spec_feats["flatness_score"] / max(self.flatness_threshold, 1e-6)
        rep_ratio = spec_feats["repeat_score"] / max(self.repeat_threshold, 1e-6)

        if flat_ratio > 1.0:
            triggered_reasons.add(SPECTRAL_FLAT)
        if rep_ratio > 1.0:
            triggered_reasons.add(SPECTRAL_REPEAT)

        # 6. Cross-Source Consistency Check against `fuel_ledger_synthetic`
        _, cs_norm_scores = self.score_cross_source_records(
            packets,
            primary_fuel_type=phys_eval["fuel_type_used"]
            if phys_eval["fuel_type_used"] != "ALL"
            else primary_fuel_type,
            facility_id=facility_id,
            device_id=str(device_id) if device_id else None,
        )
        cs_ratio = float(np.max(cs_norm_scores)) if len(cs_norm_scores) > 0 else 0.0
        if cs_ratio > 1.0:
            triggered_reasons.add(CROSS_SOURCE_MISMATCH)

        # 7. Combine into quantized score_bp (0..10000) and discretized verdict (0 or 1)
        # Map max ratio so that threshold (ratio == 1.0) maps to 0.50 (5000 bp)
        max_non_crypto_ratio = max(phys_ratio, ae_ratio, flat_ratio, rep_ratio, cs_ratio)
        if max_non_crypto_ratio <= 1.0:
            continuous_score = 0.50 * max_non_crypto_ratio
        else:
            # Smoothly saturate from 0.50 toward 1.00 above threshold
            continuous_score = 0.50 + 0.50 * (1.0 - 1.0 / (1.0 + (max_non_crypto_ratio - 1.0)))

        if crypto_score >= 1.0:
            continuous_score = max(continuous_score, 0.95)

        score_bp = quantize_score_bp(continuous_score)
        verdict_int = 1 if (len(triggered_reasons) > 0 or score_bp >= self.fraud_threshold_bp) else 0
        if verdict_int == 1 and score_bp < self.fraud_threshold_bp:
            score_bp = self.fraud_threshold_bp

        ordered_codes = (
            [c for c in CANONICAL_REASON_ORDER if c in triggered_reasons]
            if verdict_int == 1
            else []
        )

        return Verdict(
            score_bp=score_bp,
            verdict=verdict_int,
            reason_codes=ordered_codes,
            model_hash=self.model_hash,
            input_hash=inp_hash,
            merkle_root=merkle_root,
            batch_id=batch_id,
            component_scores={
                "crypto_score": float(crypto_score),
                "physics_ratio": float(phys_ratio),
                "ae_ratio": float(ae_ratio),
                "spectral_flat_ratio": float(flat_ratio),
                "spectral_repeat_ratio": float(rep_ratio),
                "cross_source_ratio": float(cs_ratio),
            },
        )

    def to_thresholds_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0.0",
            "model_hash": self.model_hash,
            "target_fpr": float(self.target_fpr),
            "window_size": int(self.window_size),
            "fraud_threshold_bp": int(self.fraud_threshold_bp),
            "trained_facility_ids": list(self.trained_facility_ids),
            "val_facility_ids": list(self.val_facility_ids),
            "proposed": {
                "physics_threshold": float(self.physics_threshold),
                "ae_threshold": float(self.ae_threshold),
                "flatness_threshold": float(self.flatness_threshold),
                "repeat_threshold": float(self.repeat_threshold),
                "cross_source_rel_threshold": float(self.cross_source_rel_threshold),
                "combined_batch_threshold": float(self.combined_batch_threshold),
                "val_record_fpr": float(self.val_record_fpr),
                "val_batch_fpr": float(self.val_batch_fpr),
            },
            "baseline_1_static": (
                self.static_detector.to_dict() if self.static_detector is not None else None
            ),
            "baseline_2_physics": self.physics_detector.to_dict(),
        }


_CACHED_DETECTOR: tuple[str, str, ProposedDetector] | None = None


def load_proposed_detector(
    artifacts_dir: Path = DEFAULT_ARTIFACTS_DIR,
) -> ProposedDetector:
    """Load `ProposedDetector` from `ml/artifacts/` (`model.onnx`, `scalers.json`, `thresholds.json`)."""
    global _CACHED_DETECTOR
    artifacts_dir = Path(artifacts_dir)
    onnx_path = artifacts_dir / "model.onnx"
    scalers_path = artifacts_dir / "scalers.json"
    thresholds_path = artifacts_dir / "thresholds.json"

    if not (onnx_path.exists() and scalers_path.exists() and thresholds_path.exists()):
        raise FileNotFoundError(
            f"Missing trained detector artifacts in {artifacts_dir}. "
            "Run `python -m ml.train --split 0` first."
        )

    m_hash = compute_model_hash(onnx_path)
    t_bytes_hash = keccak256_hex(thresholds_path.read_bytes())
    if (
        _CACHED_DETECTOR is not None
        and _CACHED_DETECTOR[0] == m_hash
        and _CACHED_DETECTOR[1] == t_bytes_hash
    ):
        return _CACHED_DETECTOR[2]

    scalers_data = json.loads(scalers_path.read_text(encoding="utf-8"))
    thresholds_data = json.loads(thresholds_path.read_text(encoding="utf-8"))

    scaler = ChannelScaler.from_dict(scalers_data["channel_scaler"])
    fuel_ratios = {str(k): float(v) for k, v in scalers_data["fuel_ratios"].items()}
    global_ratio = float(scalers_data["global_ratio"])
    phys_weight = float(scalers_data.get("physics_penalty_weight", 0.50))

    prop_cfg = thresholds_data["proposed"]
    ae_runner = OnnxAutoencoderRunner(
        onnx_path=onnx_path,
        scaler=scaler,
        fuel_ratios=fuel_ratios,
        global_ratio=global_ratio,
        physics_penalty_weight=phys_weight,
        record_threshold=float(prop_cfg["ae_threshold"]),
        batch_threshold=float(prop_cfg["ae_threshold"]),
    )
    phys_det = MassBalancePhysicsDetector.from_dict(thresholds_data["baseline_2_physics"])
    stat_det = (
        StaticThresholdDetector.from_dict(thresholds_data["baseline_1_static"])
        if thresholds_data.get("baseline_1_static")
        else None
    )

    detector = ProposedDetector(
        physics_detector=phys_det,
        ae_runner=ae_runner,
        static_detector=stat_det,
        trained_facility_ids=[int(x) for x in thresholds_data.get("trained_facility_ids", [])],
        val_facility_ids=[int(x) for x in thresholds_data.get("val_facility_ids", [])],
        target_fpr=float(thresholds_data.get("target_fpr", 0.02)),
        window_size=int(thresholds_data.get("window_size", 8)),
        physics_threshold=float(prop_cfg["physics_threshold"]),
        ae_threshold=float(prop_cfg["ae_threshold"]),
        flatness_threshold=float(prop_cfg["flatness_threshold"]),
        repeat_threshold=float(prop_cfg["repeat_threshold"]),
        cross_source_rel_threshold=float(prop_cfg["cross_source_rel_threshold"]),
        combined_batch_threshold=float(prop_cfg.get("combined_batch_threshold", 1.0)),
        fraud_threshold_bp=int(thresholds_data.get("fraud_threshold_bp", 5000)),
        val_record_fpr=float(prop_cfg.get("val_record_fpr", 0.0)),
        val_batch_fpr=float(prop_cfg.get("val_batch_fpr", 0.0)),
    )
    _CACHED_DETECTOR = (m_hash, t_bytes_hash, detector)
    return detector


def verify_batch(
    packets: Sequence[Mapping[str, Any]],
    context: Mapping[str, Any] | None = None,
) -> Verdict:
    """Verifier entry point: evaluate `packets` with `context` and return a deterministic `Verdict`.

    Args:
        packets: Sequence of telemetry packet dictionaries.
        context: Optional dictionary containing:
            - `public_key`: Registered P-256 uncompressed public key (`0x04...`).
            - `batch`: Optional batch metadata object (`batch_id`, `first_seq`, `last_seq`, `count`).
            - `primary_fuel_type`: Optional fuel type (`"Coal"`, `"Pipeline Natural Gas"`, etc.).
            - `facility_id`: Optional integer ORISPL facility ID.
            - `history_packets`: Optional preceding packets for rolling spectral checks.
            - `detector`: Optional pre-instantiated `ProposedDetector`.
            - `artifacts_dir`: Optional path to trained artifacts (defaults to `ml/artifacts/`).

    Returns:
        `Verdict` with `(score_bp, verdict, reason_codes, model_hash, input_hash)`.
    """
    ctx = dict(context) if context is not None else {}
    if isinstance(ctx.get("detector"), ProposedDetector):
        detector: ProposedDetector = ctx["detector"]
    else:
        artifacts_dir = Path(ctx.get("artifacts_dir", DEFAULT_ARTIFACTS_DIR))
        detector = load_proposed_detector(artifacts_dir=artifacts_dir)
    return detector.verify_batch(packets, ctx)
