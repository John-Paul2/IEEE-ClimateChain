"""Base data structures and packet-chain helpers for the VeriCEMS adversarial attack library.

All simulated attack injections and synthetic channels are explicitly labelled as synthetic/simulated
in accordance with `AGENTS.md` Rule 3. Every attack function returns an `AttackResult` object
which is a 2-tuple `(modified_records, labels)` (supporting standard Python tuple unpacking
`records, labels = attack_fn(...)`) while also exposing `.records`, `.labels`, `.packets`,
and `.metadata` attributes.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import copy
from typing import Any

import numpy as np
import pandas as pd

from backend.vericems.crypto.packet import (
    GENESIS_PREV_HASH,
    create_unsigned_packet,
    packet_hash,
    sign_packet,
)
from backend.vericems.crypto.secure_element import SecureElement, SoftwareSecureElement
from backend.vericems.detectors.features import (
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    REAL_CHANNELS,
)


class AttackResult(tuple):
    """Return type for all functions in `ml/attacks/`.

    Subclasses `tuple` of length 2 `(modified_records, labels)` so callers can unpack
    `modified_records, labels = attack_fn(...)`, while also providing structured attributes:
    - `records`: Modified `pd.DataFrame` of telemetry records.
    - `labels`: 1-D `np.ndarray` of binary ground-truth labels (`0` = clean, `1` = attacked).
    - `packets`: Optional list of signed telemetry packet dicts (for cryptographic chain checks).
    - `metadata`: Dictionary describing the attack parameters and achieved CO2 reduction.
    """

    records: pd.DataFrame
    labels: np.ndarray
    packets: list[dict[str, Any]]
    metadata: dict[str, Any]

    def __new__(
        cls,
        records: pd.DataFrame,
        labels: np.ndarray,
        *,
        packets: list[dict[str, Any]] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> AttackResult:
        label_arr = np.asarray(labels, dtype=np.int64)
        if len(records) != len(label_arr):
            raise ValueError(
                f"Length mismatch between records ({len(records)}) and labels ({len(label_arr)})"
            )
        instance = super().__new__(cls, (records, label_arr))
        instance.records = records
        instance.labels = label_arr
        instance.packets = list(packets) if packets is not None else []
        instance.metadata = dict(metadata) if metadata is not None else {}
        return instance

    @property
    def co2_reduction_pct(self) -> float:
        """Percentage reduction in reported CO2 within the attacked window."""
        return float(self.metadata.get("co2_reduction_achieved_pct", 0.0))


def resolve_attack_window(
    n_rows: int,
    *,
    window_slice: tuple[int, int] | slice | None = None,
    attack_fraction: float = 0.40,
    align_to: int = 8,
) -> tuple[int, int]:
    """Resolve a deterministic contiguous `[start, end)` window inside a series of length `n_rows`.

    Places the contiguous attack window in the middle-to-later portion of the series so there
    is always clean historical context before the attack window (needed for replay attacks,
    flatline quantile estimation, and rolling spectral history).
    """
    if n_rows <= 0:
        return 0, 0

    if isinstance(window_slice, slice):
        start, stop, _ = window_slice.indices(n_rows)
        return int(start), int(stop)
    if isinstance(window_slice, tuple) and len(window_slice) == 2:
        start = max(0, min(n_rows, int(window_slice[0])))
        end = max(start, min(n_rows, int(window_slice[1])))
        return start, end

    frac = float(np.clip(attack_fraction, 0.05, 0.90))
    raw_len = max(align_to, int(round(n_rows * frac)))
    if raw_len >= n_rows:
        return 0, n_rows

    if align_to > 1 and n_rows >= 2 * align_to:
        win_len = max(align_to, (raw_len // align_to) * align_to)
        # Start after ~1/3 of the series, aligned to `align_to`
        raw_start = max(align_to, int((n_rows - win_len) * 0.40))
        start = (raw_start // align_to) * align_to
        if start + win_len > n_rows:
            start = max(0, ((n_rows - win_len) // align_to) * align_to)
        end = min(n_rows, start + win_len)
        return int(start), int(end)

    start = max(1, (n_rows - raw_len) // 2)
    return int(start), int(min(n_rows, start + raw_len))


def compute_achieved_co2_reduction_pct(
    clean_df: pd.DataFrame,
    attacked_df: pd.DataFrame,
    labels: np.ndarray,
    *,
    dropped_mask: np.ndarray | None = None,
) -> float:
    """Compute percentage reduction in reported CO2 mass across the attacked window.

    For packet-dropping attacks where `dropped_mask` indicates records removed from reporting,
    dropped records contribute 0 reported CO2 to the period total.
    """
    mask = np.asarray(labels, dtype=bool)
    if not np.any(mask):
        return 0.0

    clean_co2 = clean_df.loc[mask, "co2_mass_short_tons"].to_numpy(dtype=np.float64)
    total_clean = float(np.sum(clean_co2))
    if total_clean <= 1e-9:
        return 0.0

    atk_co2 = attacked_df.loc[mask, "co2_mass_short_tons"].to_numpy(dtype=np.float64).copy()
    if dropped_mask is not None:
        drop_sub = np.asarray(dropped_mask, dtype=bool)[mask]
        atk_co2[drop_sub] = 0.0

    total_reported = float(np.sum(atk_co2))
    reduction_pct = 100.0 * (total_clean - total_reported) / total_clean
    return float(reduction_pct)


def build_packets_from_dataframe(
    df: pd.DataFrame,
    *,
    device_id: str | None = None,
    secure_element: SecureElement | None = None,
    sign_packets: bool = True,
) -> list[dict[str, Any]]:
    """Build a contiguous hash-chained packet list from a DataFrame of telemetry records.

    When `sign_packets=False` (used in fast benchmark evaluation where cryptographic structural
    checks verify `seq` and `prev_hash` links directly), skips the per-packet ECDSA scalar
    multiplication while computing exact canonical `packet_hash` and `prev_hash` chains.
    """
    if len(df) == 0:
        return []

    fac_id = int(df["facility_id"].iloc[0]) if "facility_id" in df.columns else 0
    unit_id = str(df["unit_id"].iloc[0]) if "unit_id" in df.columns else "U1"
    resolved_dev_id = device_id or f"DEV-FAC-{fac_id}-UNIT-{unit_id}"

    se = secure_element
    if sign_packets and se is None:
        se = SoftwareSecureElement(
            seed_phrase=f"VeriCEMS-SYNTHETIC-BENCHMARK-{resolved_dev_id}".encode("utf-8")
        )

    cols_to_pack = [c for c in (*REAL_CHANNELS, FUEL_LEDGER_SYNTHETIC_CHANNEL) if c in df.columns]
    col_arrays = {c: df[c].to_numpy(dtype=np.float64) for c in cols_to_pack}
    ts_array = (
        df["timestamp_utc"].astype(str).to_numpy()
        if "timestamp_utc" in df.columns
        else np.array([f"2025-01-01T{i % 24:02d}:00:00Z" for i in range(len(df))])
    )

    packets: list[dict[str, Any]] = []
    prev_h = GENESIS_PREV_HASH

    for i in range(len(df)):
        values = {c: round(float(col_arrays[c][i]), 6) for c in cols_to_pack}
        unsigned = create_unsigned_packet(
            device_id=resolved_dev_id,
            seq=i,
            timestamp_utc=str(ts_array[i]),
            values=values,
            prev_hash=prev_h,
        )
        if sign_packets and se is not None:
            pkt = sign_packet(unsigned, se)
            prev_h = packet_hash(pkt)
        else:
            p_hash = packet_hash(unsigned)
            pkt = dict(unsigned)
            pkt["signature"] = "0x" + "00" * 64
            prev_h = p_hash
        packets.append(pkt)

    return packets


def copy_packets_deep(packets: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return a deep-copied list of packet dictionaries."""
    return [copy.deepcopy(dict(p)) for p in packets]
