"""VeriCEMS Edge Gateway Simulator (`backend.vericems.gateway`).

Replays real preprocessed US EPA CAMPD hourly records (`data/processed/units/*.parquet`)
for a chosen `(facility_id, unit_id)` as signed, hash-chained telemetry packets at a
configurable rate.

Provides two explicit attack injection hooks to demonstrate and test the boundary between
cryptographic tamper-evidence and physical measurement truth (`docs/CRYPTO_NOTES.md`):
1. `before_sign_hook` (**Insider case**): Applied to the unsigned packet BEFORE
   `packet_hash` and `secure_element.sign()` are computed. Because tampering occurs prior
   to sealing, the resulting packet has a valid ECDSA P-256 signature and an unbroken
   `prev_hash` chain (unless the hook deliberately breaks `seq`/`prev_hash`/`timestamp_utc`).
2. `after_sign_hook` (**Man-in-the-Middle case**): Applied to the signed packet AFTER the
   gateway has signed it and updated its internal `prev_hash` state. Any field modification,
   packet drop, duplication, reordering, or replay after signing is deterministically caught
   by `verify_chain`.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
import copy
import inspect
from pathlib import Path
import re
import time
from typing import Any, Final

import numpy as np
import pandas as pd

from backend.vericems.crypto.merkle import build_batch, build_merkle_tree
from backend.vericems.crypto.packet import (
    GENESIS_PREV_HASH,
    create_unsigned_packet,
    packet_hash,
    sign_packet,
)
from backend.vericems.crypto.secure_element import SecureElement, SoftwareSecureElement

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent
DEFAULT_PROCESSED_DIR: Final[Path] = REPO_ROOT / "data" / "processed"

REAL_CAMPD_CHANNELS: Final[tuple[str, ...]] = (
    "gross_load_mw",
    "steam_load_1000_lb_hr",
    "heat_input_mmbtu",
    "co2_mass_short_tons",
    "co2_rate_short_tons_mmbtu",
    "so2_mass_lbs",
    "nox_mass_lbs",
    "op_time_fraction",
)

SYNTHETIC_CHANNELS: Final[tuple[str, ...]] = (
    "synthetic_stack_o2_pct",
    "synthetic_flue_temp_c",
    "synthetic_stack_flow_kscfm",
    "synthetic_fuel_flow_mmbtu_indep",
)

PacketDict = dict[str, Any]
AttackHookResult = PacketDict | Sequence[PacketDict] | None
AttackHook = Callable[..., AttackHookResult]


def _sanitize_unit_id(unit_id: str | int) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(unit_id).strip())


def _invoke_hook(
    hook: AttackHook, packet: PacketDict, index: int
) -> AttackHookResult:
    """Invoke a 1-arg `(packet)` or 2-arg `(packet, index)` attack hook on a deep copy."""
    pkt_copy = copy.deepcopy(packet)
    sig = inspect.signature(hook)
    positional_params = [
        p
        for p in sig.parameters.values()
        if p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    has_varargs = any(
        p.kind == inspect.Parameter.VAR_POSITIONAL for p in sig.parameters.values()
    )
    if len(positional_params) >= 2 or has_varargs:
        res = hook(pkt_copy, index)
    else:
        res = hook(pkt_copy)
    return res


def load_unit_records(
    facility_id: int,
    unit_id: str | int,
    *,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
    limit: int | None = None,
     offset: int = 0,
    include_synthetic_channels: bool = True,
    synthetic_seed: int = 42,
) -> list[dict[str, Any]]:
    """Load real processed CAMPD hourly records for `(facility_id, unit_id)`.

    Args:
        facility_id: EPA CAMPD ORISPL facility ID (e.g., `1073`, `6165`).
        unit_id: Unit identifier within the facility (e.g., `"3"`, `"BW41"`).
        processed_dir: Directory containing `units/facility_<id>_unit_<unit>.parquet`.
        limit: Optional maximum number of hourly rows to load.
        offset: Starting row offset (`0`-indexed).
        include_synthetic_channels: If `True`, deterministically appends the 4
            `synthetic_*` channels registered in `schemas/channels.json`.
        synthetic_seed: Fixed integer seed for deterministic synthetic channel noise.
    """
    safe_unit = _sanitize_unit_id(unit_id)
    unit_parquet = processed_dir / "units" / f"facility_{int(facility_id)}_unit_{safe_unit}.parquet"

    if unit_parquet.exists():
        df = pd.read_parquet(unit_parquet)
    else:
        combined_parquet = processed_dir / "campd_hourly_processed.parquet"
        if not combined_parquet.exists():
            raise FileNotFoundError(
                f"Neither unit Parquet {unit_parquet} nor combined Parquet {combined_parquet} exists."
            )
        all_df = pd.read_parquet(combined_parquet)
        mask = (all_df["facility_id"].astype(int) == int(facility_id)) & (
            all_df["unit_id"].astype(str).str.strip() == str(unit_id).strip()
        )
        df = all_df.loc[mask].reset_index(drop=True)
        if len(df) == 0:
            raise ValueError(
                f"No processed CAMPD records found for facility_id={facility_id}, unit_id={unit_id!r}"
            )

    if offset < 0:
        raise ValueError(f"offset must be non-negative, got {offset}")
    if offset > 0:
        df = df.iloc[offset:].reset_index(drop=True)
    if limit is not None:
        if limit < 0:
            raise ValueError(f"limit must be non-negative, got {limit}")
        df = df.iloc[:limit].reset_index(drop=True)

    rng = np.random.default_rng(synthetic_seed + int(facility_id))
    records: list[dict[str, Any]] = []

    for row_idx, row in df.iterrows():
        values: dict[str, float] = {}
        for ch in REAL_CAMPD_CHANNELS:
            if ch in row and pd.notna(row[ch]):
                values[ch] = round(float(row[ch]), 6)

        if include_synthetic_channels:
            heat_mmbtu = float(values.get("heat_input_mmbtu", 0.0))
            load_mw = float(values.get("gross_load_mw", 0.0))
            # Deterministic synthetic channels explicitly prefixed with `synthetic_`
            # per AGENTS.md Rule 3 and schemas/channels.json.
            o2_noise = float(rng.normal(0.0, 0.05))
            temp_noise = float(rng.normal(0.0, 0.4))
            flow_noise = float(rng.normal(0.0, 1.5))
            fuel_noise = float(rng.normal(0.0, max(0.05, heat_mmbtu * 0.0015)))

            synth_o2 = max(1.5, min(15.0, 4.5 - 0.0005 * load_mw + o2_noise))
            synth_temp = max(90.0, 135.0 + 0.035 * load_mw + temp_noise)
            synth_flow = max(10.0, 0.285 * heat_mmbtu * (20.9 / (20.9 - synth_o2)) + flow_noise)
            synth_fuel = max(0.0, heat_mmbtu + fuel_noise)

            values["synthetic_stack_o2_pct"] = round(synth_o2, 6)
            values["synthetic_flue_temp_c"] = round(synth_temp, 6)
            values["synthetic_stack_flow_kscfm"] = round(synth_flow, 6)
            values["synthetic_fuel_flow_mmbtu_indep"] = round(synth_fuel, 6)

        records.append(
            {
                "facility_id": int(row["facility_id"]),
                "unit_id": str(row["unit_id"]),
                "timestamp_utc": str(row["timestamp_utc"]),
                "values": values,
                "row_index": int(row_idx),
            }
        )

    return records


class GatewaySimulator:
    """Simulates a CEMS edge gateway replaying real CAMPD telemetry into signed hash chains."""

    def __init__(
        self,
        facility_id: int,
        unit_id: str | int,
        secure_element: SecureElement | None = None,
        *,
        device_id: str | None = None,
        processed_dir: Path = DEFAULT_PROCESSED_DIR,
        rate_hz: float | None = None,
        interval_seconds: float = 0.0,
        before_sign_hook: AttackHook | None = None,
        after_sign_hook: AttackHook | None = None,
        after_sign_stream_hook: Callable[[list[PacketDict]], list[PacketDict]] | None = None,
        include_synthetic_channels: bool = True,
        synthetic_seed: int = 42,
        sleep_fn: Callable[[float], None] = time.sleep,
        initial_seq: int = 0,
        initial_prev_hash: str = GENESIS_PREV_HASH,
    ) -> None:
        if rate_hz is not None:
            if rate_hz <= 0:
                raise ValueError(f"rate_hz must be positive when specified, got {rate_hz}")
            self.interval_seconds = 1.0 / float(rate_hz)
        else:
            if interval_seconds < 0:
                raise ValueError(
                    f"interval_seconds must be non-negative, got {interval_seconds}"
                )
            self.interval_seconds = float(interval_seconds)

        self.facility_id = int(facility_id)
        self.unit_id = str(unit_id)
        safe_unit = _sanitize_unit_id(unit_id)
        self.device_id = (
            device_id
            if device_id is not None
            else f"DEV-FAC-{self.facility_id}-UNIT-{safe_unit}"
        )
        self.secure_element: SecureElement = (
            secure_element
            if secure_element is not None
            else SoftwareSecureElement(
                seed_phrase=f"VeriCEMS-SYNTHETIC-GATEWAY-{self.device_id}".encode("utf-8")
            )
        )
        self.processed_dir = Path(processed_dir)
        self.before_sign_hook = before_sign_hook
        self.after_sign_hook = after_sign_hook
        self.after_sign_stream_hook = after_sign_stream_hook
        self.include_synthetic_channels = include_synthetic_channels
        self.synthetic_seed = synthetic_seed
        self.sleep_fn = sleep_fn

        self._initial_seq = int(initial_seq)
        self._initial_prev_hash = str(initial_prev_hash)
        self._next_seq = int(initial_seq)
        self._prev_hash = str(initial_prev_hash)

    def reset_chain_state(
        self,
        *,
        initial_seq: int | None = None,
        initial_prev_hash: str | None = None,
    ) -> None:
        """Reset the gateway's internal `seq` counter and `prev_hash` accumulator."""
        self._next_seq = (
            int(initial_seq) if initial_seq is not None else self._initial_seq
        )
        self._prev_hash = (
            str(initial_prev_hash)
            if initial_prev_hash is not None
            else self._initial_prev_hash
        )

    @property
    def public_key(self) -> str:
        """Return the gateway's registered uncompressed SEC1 P-256 public key."""
        return self.secure_element.public_key()

    def _seal_single_record(
        self, record: Mapping[str, Any], record_idx: int
    ) -> list[PacketDict]:
        """Package a single telemetry record, applying before/after signing hooks."""
        unsigned_pkt = create_unsigned_packet(
            device_id=self.device_id,
            seq=self._next_seq,
            timestamp_utc=str(record["timestamp_utc"]),
            values=record["values"],
            prev_hash=self._prev_hash,
        )

        # 1. BEFORE SIGNING HOOK (Insider attack: modifies telemetry before hashing & signing)
        if self.before_sign_hook is not None:
            hooked_before = _invoke_hook(self.before_sign_hook, unsigned_pkt, record_idx)
            if hooked_before is None:
                # Insider dropped the reading before signing
                return []
            if isinstance(hooked_before, Mapping):
                unsigned_list = [dict(hooked_before)]
            else:
                unsigned_list = [dict(p) for p in hooked_before]
        else:
            unsigned_list = [unsigned_pkt]

        signed_packets: list[PacketDict] = []
        for u_pkt in unsigned_list:
            # If the insider did not manually override prev_hash, keep the gateway's prev_hash
            signed = sign_packet(u_pkt, self.secure_element)
            honest_hash = packet_hash(signed)
            self._prev_hash = honest_hash
            self._next_seq = int(signed["seq"]) + 1
            signed_packets.append(signed)

        # 2. AFTER SIGNING HOOK (Man-in-the-middle attack: modifies/drops/replays on the wire)
        if self.after_sign_hook is None:
            return signed_packets

        emitted: list[PacketDict] = []
        for s_pkt in signed_packets:
            hooked_after = _invoke_hook(self.after_sign_hook, s_pkt, record_idx)
            if hooked_after is None:
                # MITM dropped the signed packet in transit
                continue
            if isinstance(hooked_after, Mapping):
                emitted.append(dict(hooked_after))
            else:
                emitted.extend(dict(p) for p in hooked_after)
        return emitted

    def stream_packets(
        self,
        *,
        limit: int | None = 24,
        offset: int = 0,
        records: Sequence[Mapping[str, Any]] | None = None,
    ) -> Iterator[PacketDict]:
        """Yield signed packets one by one at the configured rate."""
        if records is None:
            loaded_records = load_unit_records(
                facility_id=self.facility_id,
                unit_id=self.unit_id,
                processed_dir=self.processed_dir,
                limit=limit,
                offset=offset,
                include_synthetic_channels=self.include_synthetic_channels,
                synthetic_seed=self.synthetic_seed,
            )
        else:
            loaded_records = list(records[offset : (offset + limit if limit is not None else None)])

        emitted_any = False
        for idx, rec in enumerate(loaded_records):
            out_pkts = self._seal_single_record(rec, idx)
            for pkt in out_pkts:
                if emitted_any and self.interval_seconds > 0.0:
                    self.sleep_fn(self.interval_seconds)
                emitted_any = True
                yield pkt

    def replay_packets(
        self,
        *,
        limit: int | None = 24,
        offset: int = 0,
        records: Sequence[Mapping[str, Any]] | None = None,
    ) -> list[PacketDict]:
        """Replay `limit` records into a list of signed packets (applying all configured hooks)."""
        packets = list(self.stream_packets(limit=limit, offset=offset, records=records))
        if self.after_sign_stream_hook is not None:
            packets = self.after_sign_stream_hook(copy.deepcopy(packets))
        return packets

    def replay_batch(
        self,
        *,
        batch_id: int = 1,
        batch_size: int = 8,
        offset: int = 0,
        created_at: str | None = None,
        records: Sequence[Mapping[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Replay a single batch of packets and compute its batch metadata and Merkle tree."""
        packets = self.replay_packets(limit=batch_size, offset=offset, records=records)
        batch_obj = build_batch(
            packets=packets,
            batch_id=batch_id,
            created_at=created_at,
            device_id=self.device_id,
        )
        merkle_tree = build_merkle_tree(packets)
        return {
            "batch": batch_obj,
            "packets": packets,
            "merkle": merkle_tree.to_dict(),
        }
