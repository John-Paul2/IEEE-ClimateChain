"""Cryptographic hash-chain and sequence verifier for VeriCEMS telemetry packets.

Checks every packet in a chain and returns ALL problems found (never short-circuiting
on the first error), using the reason codes:
- `CHAIN_BREAK`: `packet[i].prev_hash != packet_hash(packet[i - 1])` (or non-zero genesis `prev_hash`).
- `SEQ_GAP`: One or more sequence numbers were skipped/dropped (`seq > expected_seq` with missing sequence numbers absent from the chain, or truncated chain vs. expected count/last_seq).
- `SEQ_DUPLICATE`: A packet's `seq` value has already appeared earlier in the chain.
- `SEQ_REORDER`: Packets appear out of ascending `seq` order (`seq < prev_seq` or displaced earlier packet appearing later).
- `SIG_INVALID`: ECDSA P-256 signature verification against the device's public key fails (or packet schema/fields are malformed).
- `TIMESTAMP_REGRESSION`: `packet[i].timestamp_utc < packet[i - 1].timestamp_utc` (or malformed UTC timestamp).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any, Final

from backend.vericems.crypto.packet import (
    GENESIS_PREV_HASH,
    packet_hash,
    verify_packet_signature,
)

CHAIN_BREAK: Final[str] = "CHAIN_BREAK"
SEQ_GAP: Final[str] = "SEQ_GAP"
SEQ_DUPLICATE: Final[str] = "SEQ_DUPLICATE"
SEQ_REORDER: Final[str] = "SEQ_REORDER"
SIG_INVALID: Final[str] = "SIG_INVALID"
TIMESTAMP_REGRESSION: Final[str] = "TIMESTAMP_REGRESSION"

ALL_CHAIN_REASON_CODES: Final[tuple[str, ...]] = (
    CHAIN_BREAK,
    SEQ_GAP,
    SEQ_DUPLICATE,
    SEQ_REORDER,
    SIG_INVALID,
    TIMESTAMP_REGRESSION,
)

_REQUIRED_PACKET_KEYS: Final[frozenset[str]] = frozenset(
    {"device_id", "seq", "timestamp_utc", "values", "prev_hash", "signature"}
)
_DEVICE_ID_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_TIMESTAMP_UTC_RE: Final[re.Pattern[str]] = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
)


def _parse_utc_timestamp(ts_str: Any) -> datetime | None:
    """Parse strict `YYYY-MM-DDTHH:MM:SSZ` UTC timestamp string into a `datetime`."""
    if not isinstance(ts_str, str) or not _TIMESTAMP_UTC_RE.match(ts_str):
        return None
    try:
        return datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


@dataclass(frozen=True)
class ChainProblem:
    """A single cryptographic, sequence, or timestamp problem detected on a packet chain."""

    index: int
    seq: int | None
    reason_code: str
    message: str

    @property
    def code(self) -> str:
        """Alias for `reason_code`."""
        return self.reason_code

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "seq": self.seq,
            "reason_code": self.reason_code,
            "message": self.message,
        }

    def __getitem__(self, key: str) -> Any:
        if key == "code":
            return self.reason_code
        return self.to_dict()[key]


@dataclass(frozen=True)
class ChainVerificationResult:
    """Complete verification report for a packet chain."""

    is_valid: bool
    problems: list[ChainProblem] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)
    verdict_reason_codes: list[str] = field(default_factory=list)

    def __bool__(self) -> bool:
        return self.is_valid

    def __len__(self) -> int:
        return len(self.problems)

    def __iter__(self) -> Iterator[ChainProblem]:
        return iter(self.problems)

    def __contains__(self, item: object) -> bool:
        if isinstance(item, str):
            return item in self.reason_codes or item in self.verdict_reason_codes
        if isinstance(item, ChainProblem):
            return item in self.problems
        return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "reason_codes": list(self.reason_codes),
            "verdict_reason_codes": list(self.verdict_reason_codes),
            "problems": [p.to_dict() for p in self.problems],
        }


def _to_verdict_reason_code(reason_code: str) -> str:
    """Map granular chain reason codes to the 8-code `schemas/verdict.schema.json` enum."""
    if reason_code in (SEQ_GAP, SEQ_DUPLICATE, SEQ_REORDER, TIMESTAMP_REGRESSION):
        return SEQ_GAP
    return reason_code


def verify_chain(
    packets: Sequence[Mapping[str, Any]],
    public_key: str | bytes,
    *,
    expected_initial_prev_hash: str = GENESIS_PREV_HASH,
    expected_first_seq: int | None = 0,
    expected_last_seq: int | None = None,
    expected_count: int | None = None,
    expected_device_id: str | None = None,
    batch: Mapping[str, Any] | None = None,
) -> ChainVerificationResult:
    """Verify a chain of signed packets and return ALL problems found.

    Args:
        packets: Sequence of packet dictionaries to verify.
        public_key: Registered 65-byte uncompressed SEC1 P-256 public key (`0x04...`).
        expected_initial_prev_hash: Expected `prev_hash` on `packets[0]` (defaults to
            `GENESIS_PREV_HASH`, 32 zero bytes).
        expected_first_seq: Expected `seq` on `packets[0]` (defaults to `0` when
            `expected_initial_prev_hash == GENESIS_PREV_HASH`, or `batch["first_seq"]`).
        expected_last_seq: Optional expected `seq` of the final packet in the chain.
        expected_count: Optional expected number of packets in the chain.
        expected_device_id: Optional expected `device_id` for all packets in the chain.
        batch: Optional batch metadata object (`first_seq`, `last_seq`, `count`, `device_id`).

    Returns:
        `ChainVerificationResult` containing `is_valid`, all `problems`, unique
        `reason_codes` (`CHAIN_BREAK`, `SEQ_GAP`, `SEQ_DUPLICATE`, `SEQ_REORDER`,
        `SIG_INVALID`, `TIMESTAMP_REGRESSION`), and canonical `verdict_reason_codes`.
    """
    if batch is not None:
        if expected_first_seq is None and "first_seq" in batch:
            expected_first_seq = int(batch["first_seq"])
        if expected_last_seq is None and "last_seq" in batch:
            expected_last_seq = int(batch["last_seq"])
        if expected_count is None and "count" in batch:
            expected_count = int(batch["count"])
        if expected_device_id is None and "device_id" in batch:
            expected_device_id = str(batch["device_id"])

    problems: list[ChainProblem] = []

    if len(packets) == 0:
        if (expected_count is not None and expected_count > 0) or (
            expected_last_seq is not None
        ):
            problems.append(
                ChainProblem(
                    index=0,
                    seq=None,
                    reason_code=SEQ_GAP,
                    message="Packet chain is empty, but non-empty chain was expected.",
                )
            )
        return _finalize_result(problems)

    # Pre-scan sequence numbers at each index to distinguish dropped packets (SEQ_GAP)
    # from displaced packets that appear later in the list (SEQ_REORDER).
    seq_by_index: list[int | None] = []
    for pkt in packets:
        raw_seq = pkt.get("seq") if isinstance(pkt, Mapping) else None
        if isinstance(raw_seq, int) and not isinstance(raw_seq, bool) and raw_seq >= 0:
            seq_by_index.append(raw_seq)
        else:
            seq_by_index.append(None)

    all_present_seqs: set[int] = {s for s in seq_by_index if s is not None}

    seen_seqs: dict[int, int] = {}  # seq -> first index where seen
    expected_prev_hash = expected_initial_prev_hash
    prev_seq: int | None = None
    prev_dt: datetime | None = None
    inferred_device_id: str | None = expected_device_id

    for idx, pkt in enumerate(packets):
        if not isinstance(pkt, Mapping):
            problems.append(
                ChainProblem(
                    index=idx,
                    seq=None,
                    reason_code=SIG_INVALID,
                    message=f"Packet at index {idx} is not a mapping.",
                )
            )
            continue

        curr_seq = seq_by_index[idx]
        pkt_keys = set(pkt.keys())

        # 1. Structural & Signature Check (SIG_INVALID)
        missing_keys = _REQUIRED_PACKET_KEYS - pkt_keys
        extra_keys = pkt_keys - _REQUIRED_PACKET_KEYS
        dev_id = pkt.get("device_id")
        device_id_valid = isinstance(dev_id, str) and bool(_DEVICE_ID_RE.match(dev_id))
        if inferred_device_id is None and device_id_valid:
            inferred_device_id = str(dev_id)

        device_mismatch = (
            inferred_device_id is not None
            and isinstance(dev_id, str)
            and dev_id != inferred_device_id
        )

        computed_hash: str | None = None
        try:
            computed_hash = packet_hash(pkt)
        except (KeyError, TypeError, ValueError):
            computed_hash = None

        sig_ok = (
            not missing_keys
            and not extra_keys
            and curr_seq is not None
            and device_id_valid
            and not device_mismatch
            and computed_hash is not None
            and verify_packet_signature(pkt, public_key)
        )
        if not sig_ok:
            problems.append(
                ChainProblem(
                    index=idx,
                    seq=curr_seq,
                    reason_code=SIG_INVALID,
                    message=f"Invalid ECDSA P-256 signature or malformed packet at index {idx} (seq={curr_seq}).",
                )
            )

        # 2. Hash-Chain Link Check (CHAIN_BREAK)
        actual_prev_hash = pkt.get("prev_hash")
        if actual_prev_hash != expected_prev_hash:
            problems.append(
                ChainProblem(
                    index=idx,
                    seq=curr_seq,
                    reason_code=CHAIN_BREAK,
                    message=(
                        f"Hash chain break at index {idx} (seq={curr_seq}): "
                        f"prev_hash={actual_prev_hash!r} != expected {expected_prev_hash!r}."
                    ),
                )
            )

        # 3. Sequence Continuity, Duplicate, and Reorder Checks
        if curr_seq is None:
            problems.append(
                ChainProblem(
                    index=idx,
                    seq=None,
                    reason_code=SEQ_GAP,
                    message=f"Invalid or missing integer sequence number at index {idx}.",
                )
            )
        else:
            is_duplicate = curr_seq in seen_seqs
            if is_duplicate:
                first_idx = seen_seqs[curr_seq]
                problems.append(
                    ChainProblem(
                        index=idx,
                        seq=curr_seq,
                        reason_code=SEQ_DUPLICATE,
                        message=(
                            f"Duplicate sequence number seq={curr_seq} at index {idx} "
                            f"(previously seen at index {first_idx})."
                        ),
                    )
                )

            if idx == 0:
                if expected_first_seq is not None and curr_seq != expected_first_seq:
                    if curr_seq > expected_first_seq:
                        missing_initial = set(range(expected_first_seq, curr_seq))
                        # If any of the skipped initial seqs appear later in the chain,
                        # the chain start was reordered; if any are absent from the chain,
                        # there is a sequence gap.
                        if missing_initial & all_present_seqs:
                            problems.append(
                                ChainProblem(
                                    index=idx,
                                    seq=curr_seq,
                                    reason_code=SEQ_REORDER,
                                    message=(
                                        f"Initial packet at index 0 has seq={curr_seq}, "
                                        f"while earlier seq in {sorted(missing_initial & all_present_seqs)} "
                                        f"appears later in the chain."
                                    ),
                                )
                            )
                        if missing_initial - all_present_seqs:
                            problems.append(
                                ChainProblem(
                                    index=idx,
                                    seq=curr_seq,
                                    reason_code=SEQ_GAP,
                                    message=(
                                        f"Initial packet at index 0 has seq={curr_seq} != "
                                        f"expected_first_seq={expected_first_seq}."
                                    ),
                                )
                            )
                    else:
                        problems.append(
                            ChainProblem(
                                index=idx,
                                seq=curr_seq,
                                reason_code=SEQ_REORDER,
                                message=(
                                    f"Initial packet at index 0 has seq={curr_seq} < "
                                    f"expected_first_seq={expected_first_seq}."
                                ),
                            )
                        )
            elif prev_seq is not None:
                expected_seq = prev_seq + 1
                if curr_seq < prev_seq:
                    problems.append(
                        ChainProblem(
                            index=idx,
                            seq=curr_seq,
                            reason_code=SEQ_REORDER,
                            message=(
                                f"Sequence regression at index {idx}: "
                                f"seq={curr_seq} < previous seq={prev_seq}."
                            ),
                        )
                    )
                elif curr_seq > expected_seq:
                    skipped_range = set(range(expected_seq, curr_seq))
                    later_seqs = {
                        s for s in seq_by_index[idx + 1 :] if s is not None
                    }
                    # Any skipped sequence number that is completely absent from the chain
                    # (or was overwritten by a replay) is a SEQ_GAP.
                    missing_seqs = skipped_range - all_present_seqs
                    displaced_later = skipped_range & later_seqs
                    if missing_seqs or not displaced_later:
                        problems.append(
                            ChainProblem(
                                index=idx,
                                seq=curr_seq,
                                reason_code=SEQ_GAP,
                                message=(
                                    f"Sequence gap at index {idx}: expected seq={expected_seq}, "
                                    f"got seq={curr_seq}."
                                ),
                            )
                        )
                    if displaced_later:
                        problems.append(
                            ChainProblem(
                                index=idx,
                                seq=curr_seq,
                                reason_code=SEQ_REORDER,
                                message=(
                                    f"Out-of-order jump at index {idx}: seq={curr_seq} appears "
                                    f"before seq={sorted(displaced_later)}."
                                ),
                            )
                        )

            if not is_duplicate:
                seen_seqs[curr_seq] = idx
            prev_seq = curr_seq

        # 4. Timestamp Format & Monotonicity Check (TIMESTAMP_REGRESSION)
        curr_dt = _parse_utc_timestamp(pkt.get("timestamp_utc"))
        if curr_dt is None:
            problems.append(
                ChainProblem(
                    index=idx,
                    seq=curr_seq,
                    reason_code=TIMESTAMP_REGRESSION,
                    message=(
                        f"Malformed UTC timestamp at index {idx} (seq={curr_seq}): "
                        f"{pkt.get('timestamp_utc')!r}."
                    ),
                )
            )
        else:
            if prev_dt is not None and curr_dt < prev_dt:
                problems.append(
                    ChainProblem(
                        index=idx,
                        seq=curr_seq,
                        reason_code=TIMESTAMP_REGRESSION,
                        message=(
                            f"Timestamp regression at index {idx} (seq={curr_seq}): "
                            f"{pkt.get('timestamp_utc')} < previous { prev_dt.strftime('%Y-%m-%dT%H:%M:%SZ') }."
                        ),
                    )
                )
            prev_dt = curr_dt

        if computed_hash is not None:
            expected_prev_hash = computed_hash

    # 5. End-of-chain completeness check (when expected_count or expected_last_seq is provided)
    last_idx = len(packets) - 1
    last_seq = seq_by_index[last_idx]
    has_seq_anomaly = any(
        p.reason_code in (SEQ_GAP, SEQ_DUPLICATE, SEQ_REORDER) for p in problems
    )
    if expected_count is not None and len(packets) != expected_count and not has_seq_anomaly:
        problems.append(
            ChainProblem(
                index=last_idx,
                seq=last_seq,
                reason_code=SEQ_GAP,
                message=(
                    f"Packet count mismatch: got {len(packets)} packets, "
                    f"expected {expected_count}."
                ),
            )
        )
    elif (
        expected_last_seq is not None
        and last_seq is not None
        and last_seq != expected_last_seq
        and not has_seq_anomaly
    ):
        problems.append(
            ChainProblem(
                index=last_idx,
                seq=last_seq,
                reason_code=SEQ_GAP,
                message=(
                    f"Final packet seq={last_seq} != expected_last_seq={expected_last_seq}."
                ),
            )
        )

    return _finalize_result(problems)


def _finalize_result(problems: list[ChainProblem]) -> ChainVerificationResult:
    reason_codes: list[str] = []
    verdict_codes: list[str] = []
    for p in problems:
        if p.reason_code not in reason_codes:
            reason_codes.append(p.reason_code)
        v_code = _to_verdict_reason_code(p.reason_code)
        if v_code not in verdict_codes:
            verdict_codes.append(v_code)
    return ChainVerificationResult(
        is_valid=(len(problems) == 0),
        problems=problems,
        reason_codes=reason_codes,
        verdict_reason_codes=verdict_codes,
    )
