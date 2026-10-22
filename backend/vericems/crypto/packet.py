"""Canonical JSON serialization, packet creation, SHA-256 packet hashing, and chaining.

Implements Section 2 and Section 3 of `docs/INTERFACES.md` (DECISION-01, DECISION-02, DECISION-03).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN
import hashlib
import json
import re
from typing import Any, Final

from backend.vericems.crypto.secure_element import SecureElement, verify_p256_signature

GENESIS_PREV_HASH: Final[str] = "0x" + "00" * 32

_DEVICE_ID_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_TIMESTAMP_UTC_RE: Final[re.Pattern[str]] = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
)
_HASH32_HEX_RE: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")
_QUANTIZE_6: Final[Decimal] = Decimal("0.000001")


def format_float_6(val: int | float | Decimal) -> str:
    """Format a numeric channel value as a fixed 6-decimal-place ASCII string (DECISION-02).

    Rounds half-to-even via `Decimal("0.000001")` and normalizes negative zero to `"0.000000"`.
    """
    if isinstance(val, bool) or not isinstance(val, (int, float, Decimal)):
        raise TypeError(f"Channel value must be int, float, or Decimal; got {type(val).__name__}")
    try:
        d = Decimal(str(val))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid numeric value for canonical JSON: {val!r}") from exc
    if not d.is_finite():
        raise ValueError(f"Non-finite channel value not allowed in canonical JSON: {val!r}")
    quantized = d.quantize(_QUANTIZE_6, rounding=ROUND_HALF_EVEN)
    if quantized == 0:
        quantized = Decimal("0.000000")
    return f"{quantized:.6f}"


def canonical_json(packet: Mapping[str, Any]) -> str:
    """Return canonical UTF-8 JSON string of `packet` WITHOUT the `signature` field.

    Follows `docs/INTERFACES.md` Section 3:
    - Excludes `"signature"` key; requires `"device_id"`, `"prev_hash"`, `"seq"`,
      `"timestamp_utc"`, and `"values"`.
    - Keys sorted in ascending lexicographical UTF-8 code-point order at all depths.
    - No whitespace (`separators=(",", ":")`, `ensure_ascii=False`).
    - All numeric entries inside `"values"` formatted as fixed 6-decimal strings (`"0.000000"`).
    - `"seq"` formatted as a base-10 integer literal.
    """
    for req_key in ("device_id", "prev_hash", "seq", "timestamp_utc", "values"):
        if req_key not in packet:
            raise KeyError(f"Packet missing required field {req_key!r}")

    seq_val = packet["seq"]
    if isinstance(seq_val, bool) or not isinstance(seq_val, int):
        raise TypeError(f"packet['seq'] must be int, got {type(seq_val).__name__}")

    values_map = packet["values"]
    if not isinstance(values_map, Mapping) or len(values_map) == 0:
        raise ValueError("packet['values'] must be a non-empty mapping of channel values")

    formatted_values = {
        str(k): format_float_6(v)
        for k, v in sorted(values_map.items(), key=lambda kv: str(kv[0]))
    }

    preimage = {
        "device_id": str(packet["device_id"]),
        "prev_hash": str(packet["prev_hash"]),
        "seq": int(seq_val),
        "timestamp_utc": str(packet["timestamp_utc"]),
        "values": formatted_values,
    }
    return json.dumps(preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# Alias matching scripts/make_golden.py and docs/INTERFACES.md
canonical_packet_json = canonical_json


def canonical_packet_bytes(packet: Mapping[str, Any]) -> bytes:
    """Return canonical UTF-8 JSON bytes of `packet` without `signature`."""
    return canonical_json(packet).encode("utf-8")


def packet_hash(packet: Mapping[str, Any]) -> str:
    """Compute `0x`-prefixed 32-byte lowercase hex SHA-256 digest of `canonical_packet_bytes(packet)`."""
    digest = hashlib.sha256(canonical_packet_bytes(packet)).hexdigest()
    return "0x" + digest


# Alias matching scripts/make_golden.py and docs/INTERFACES.md
compute_packet_hash = packet_hash


def create_unsigned_packet(
    device_id: str,
    seq: int,
    timestamp_utc: str,
    values: Mapping[str, float | int],
    prev_hash: str = GENESIS_PREV_HASH,
) -> dict[str, Any]:
    """Create a validated unsigned telemetry packet dictionary."""
    if not isinstance(device_id, str) or not _DEVICE_ID_RE.match(device_id):
        raise ValueError(f"Invalid device_id: {device_id!r}")
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 0:
        raise ValueError(f"Invalid seq (must be non-negative int): {seq!r}")
    if not isinstance(timestamp_utc, str) or not _TIMESTAMP_UTC_RE.match(timestamp_utc):
        raise ValueError(
            f"Invalid timestamp_utc (expected YYYY-MM-DDTHH:MM:SSZ): {timestamp_utc!r}"
        )
    if not isinstance(prev_hash, str) or not _HASH32_HEX_RE.match(prev_hash):
        raise ValueError(f"Invalid prev_hash (expected 0x + 64 lowercase hex chars): {prev_hash!r}")
    if not isinstance(values, Mapping) or len(values) == 0:
        raise ValueError("values must be a non-empty mapping")

    clean_values: dict[str, float] = {}
    for k, v in sorted(values.items(), key=lambda kv: str(kv[0])):
        if not isinstance(k, str) or not k:
            raise ValueError(f"Invalid channel name: {k!r}")
        # Validate finiteness and 6-decimal quantizability
        _ = format_float_6(v)
        clean_values[str(k)] = float(v)

    return {
        "device_id": device_id,
        "seq": int(seq),
        "timestamp_utc": timestamp_utc,
        "values": clean_values,
        "prev_hash": prev_hash,
    }


def sign_packet(packet: Mapping[str, Any], secure_element: SecureElement) -> dict[str, Any]:
    """Compute `packet_hash` of `packet` and return a copy with `"signature"` populated."""
    pkt_copy: dict[str, Any] = {
        "device_id": str(packet["device_id"]),
        "seq": int(packet["seq"]),
        "timestamp_utc": str(packet["timestamp_utc"]),
        "values": {str(k): float(v) for k, v in packet["values"].items()},
        "prev_hash": str(packet["prev_hash"]),
    }
    pkt_digest_hex = packet_hash(pkt_copy)
    pkt_copy["signature"] = secure_element.sign(pkt_digest_hex)
    return pkt_copy


def create_packet(
    device_id: str,
    seq: int,
    timestamp_utc: str,
    values: Mapping[str, float | int],
    secure_element: SecureElement,
    prev_hash: str | None = None,
) -> dict[str, Any]:
    """Create and sign a telemetry packet according to `docs/INTERFACES.md` Section 2."""
    if prev_hash is None:
        if seq == 0:
            prev_hash = GENESIS_PREV_HASH
        else:
            raise ValueError("prev_hash must be provided when seq > 0")
    unsigned = create_unsigned_packet(
        device_id=device_id,
        seq=seq,
        timestamp_utc=timestamp_utc,
        values=values,
        prev_hash=prev_hash,
    )
    return sign_packet(unsigned, secure_element)


def verify_packet_signature(packet: Mapping[str, Any], public_key: str | bytes) -> bool:
    """Verify the ECDSA P-256 signature on a single packet against `public_key`."""
    try:
        sig = packet.get("signature")
        if not isinstance(sig, str):
            return False
        digest_hex = packet_hash(packet)
    except (KeyError, TypeError, ValueError):
        return False
    return verify_p256_signature(public_key, digest_hex, sig)


def build_hash_chain(
    device_id: str,
    records: Sequence[Mapping[str, Any]],
    secure_element: SecureElement,
    *,
    start_seq: int = 0,
    initial_prev_hash: str = GENESIS_PREV_HASH,
) -> list[dict[str, Any]]:
    """Build a contiguous hash-chained list of signed packets from telemetry records.

    Each element in `records` must contain `"timestamp_utc"` and `"values"` (a dict of
    channel readings).
    """
    packets: list[dict[str, Any]] = []
    prev_hash = initial_prev_hash
    for offset, rec in enumerate(records):
        seq = start_seq + offset
        ts = str(rec["timestamp_utc"])
        vals = rec["values"]
        pkt = create_packet(
            device_id=device_id,
            seq=seq,
            timestamp_utc=ts,
            values=vals,
            secure_element=secure_element,
            prev_hash=prev_hash,
        )
        packets.append(pkt)
        prev_hash = packet_hash(pkt)
    return packets
