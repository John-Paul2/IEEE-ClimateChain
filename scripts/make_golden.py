#!/usr/bin/env python3
"""Deterministic generator for VeriCEMS golden test vectors (schemas/golden/).

Follows docs/INTERFACES.md v1.0.0:
- Fixed seed and a dedicated test key named "TEST KEY" (never reused outside golden vectors).
- Canonical JSON with sorted keys, no whitespace, and fixed 6-decimal-place strings for floats.
- Packet hash = SHA-256(canonical_json(packet_without_signature)).
- Signature = deterministic RFC 6979 ECDSA P-256 (low-S normalized) over packet_hash.
- Merkle tree = leaf is keccak256(packet_hash_bytes), internal node is keccak256(min(a,b) || max(a,b)),
  odd trailing node promoted unchanged.
- Vote commitment = keccak256(abi.encode(batch_id, model_hash, input_hash, score_bp, verdict, salt)).
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN
import hashlib
import hmac
import json
from pathlib import Path
from typing import Any


# ============================================================================
# 1. Ethereum Keccak-256 (0x01 padding, distinct from NIST FIPS-202 SHA3-256)
# ============================================================================

_RC: tuple[int, ...] = (
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
)

_ROT: tuple[tuple[int, ...], ...] = (
    (0, 36, 3, 41, 18),
    (1, 44, 10, 45, 2),
    (62, 6, 43, 15, 61),
    (28, 55, 25, 21, 56),
    (27, 20, 39, 8, 14),
)


def _rol64(val: int, shift: int) -> int:
    return ((val << shift) | (val >> (64 - shift))) & 0xFFFFFFFFFFFFFFFF if shift else val


def keccak256(data: bytes) -> bytes:
    """Compute original Ethereum Keccak-256 digest (32 bytes, 0x01 padding)."""
    rate = 136  # 1088 bits
    state = [[0] * 5 for _ in range(5)]
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % rate != 0:
        padded.append(0x00)
    padded[-1] |= 0x80

    for offset in range(0, len(padded), rate):
        block = padded[offset : offset + rate]
        for i in range(rate // 8):
            lane = int.from_bytes(block[i * 8 : (i + 1) * 8], "little")
            state[i % 5][i // 5] ^= lane

        for rc in _RC:
            c = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
            d = [c[(x - 1) % 5] ^ _rol64(c[(x + 1) % 5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    state[x][y] ^= d[x]
            b = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    b[y][(2 * x + 3 * y) % 5] = _rol64(state[x][y], _ROT[x][y])
            for x in range(5):
                for y in range(5):
                    state[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y])
            state[0][0] ^= rc

    out = bytearray()
    for y in range(5):
        for x in range(5):
            if len(out) < 32:
                out.extend(state[x][y].to_bytes(8, "little"))
    return bytes(out[:32])


# ============================================================================
# 2. NIST P-256 (secp256r1) + RFC 6979 Deterministic ECDSA (Low-S)
# ============================================================================

P256_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
P256_A = P256_P - 3
P256_B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
P256_GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296
P256_GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5
P256_G: tuple[int, int] = (P256_GX, P256_GY)

# Fixed test key named TEST KEY (never used outside golden vectors)
TEST_KEY_NAME = "TEST KEY"
TEST_KEY_SEED_PHRASE = b"VeriCEMS-GOLDEN-TEST-KEY-DO-NOT-REUSE-IN-PRODUCTION-v1"
TEST_PRIVATE_KEY_INT = int.from_bytes(hashlib.sha256(TEST_KEY_SEED_PHRASE).digest(), "big") % (P256_N - 1) + 1


def _point_add(p1: tuple[int, int] | None, p2: tuple[int, int] | None) -> tuple[int, int] | None:
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 + y2) % P256_P == 0:
        return None
    if x1 == x2 and y1 == y2:
        lam = (3 * x1 * x1 + P256_A) * pow(2 * y1, P256_P - 2, P256_P) % P256_P
    else:
        lam = (y2 - y1) * pow(x2 - x1, P256_P - 2, P256_P) % P256_P
    x3 = (lam * lam - x1 - x2) % P256_P
    y3 = (lam * (x1 - x3) - y1) % P256_P
    return (x3, y3)


def _scalar_mult(k: int, point: tuple[int, int] | None) -> tuple[int, int] | None:
    result: tuple[int, int] | None = None
    addend = point
    while k > 0:
        if k & 1:
            result = _point_add(result, addend)
        addend = _point_add(addend, addend)
        k >>= 1
    return result


def derive_p256_public_key_hex(private_key_int: int) -> str:
    """Return 0x-prefixed 65-byte uncompressed SEC1 public key (0x04 || X || Y)."""
    pt = _scalar_mult(private_key_int, P256_G)
    assert pt is not None
    x_bytes = pt[0].to_bytes(32, "big")
    y_bytes = pt[1].to_bytes(32, "big")
    return "0x04" + x_bytes.hex() + y_bytes.hex()


def _rfc6979_generate_k(private_key_int: int, digest32: bytes) -> int:
    """Deterministic k generation per RFC 6979 Section 3.2 (HMAC-SHA256, P-256)."""
    assert len(digest32) == 32
    x_bytes = private_key_int.to_bytes(32, "big")
    h1_int = int.from_bytes(digest32, "big") % P256_N
    h1_bytes = h1_int.to_bytes(32, "big")

    v = b"\x01" * 32
    k = b"\x00" * 32
    k = hmac.new(k, v + b"\x00" + x_bytes + h1_bytes, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    k = hmac.new(k, v + b"\x01" + x_bytes + h1_bytes, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()

    while True:
        v = hmac.new(k, v, hashlib.sha256).digest()
        candidate = int.from_bytes(v, "big")
        if 1 <= candidate < P256_N:
            return candidate
        k = hmac.new(k, v + b"\x00", hashlib.sha256).digest()
        v = hmac.new(k, v, hashlib.sha256).digest()


def sign_p256_digest(private_key_int: int, digest32: bytes) -> str:
    """Sign a 32-byte packet_hash digest with RFC 6979 ECDSA P-256 and low-S normalization."""
    k = _rfc6979_generate_k(private_key_int, digest32)
    pt = _scalar_mult(k, P256_G)
    assert pt is not None
    r = pt[0] % P256_N
    assert r != 0
    z = int.from_bytes(digest32, "big")
    s = (pow(k, P256_N - 2, P256_N) * (z + r * private_key_int)) % P256_N
    assert s != 0
    if s > P256_N // 2:
        s = P256_N - s
    return "0x" + r.to_bytes(32, "big").hex() + s.to_bytes(32, "big").hex()


def verify_p256_digest(pub_key_hex: str, digest32: bytes, signature_hex: str) -> bool:
    """Verify a 64-byte (r || s) low-S ECDSA P-256 signature over a 32-byte digest."""
    if not pub_key_hex.startswith("0x04") or len(pub_key_hex) != 132:
        return False
    if not signature_hex.startswith("0x") or len(signature_hex) != 130:
        return False
    pub_bytes = bytes.fromhex(pub_key_hex[4:])
    qx = int.from_bytes(pub_bytes[:32], "big")
    qy = int.from_bytes(pub_bytes[32:], "big")
    sig_bytes = bytes.fromhex(signature_hex[2:])
    r = int.from_bytes(sig_bytes[:32], "big")
    s = int.from_bytes(sig_bytes[32:], "big")

    if not (1 <= r < P256_N and 1 <= s <= P256_N // 2):
        return False
    z = int.from_bytes(digest32, "big")
    w = pow(s, P256_N - 2, P256_N)
    u1 = (z * w) % P256_N
    u2 = (r * w) % P256_N
    pt = _point_add(_scalar_mult(u1, P256_G), _scalar_mult(u2, (qx, qy)))
    if pt is None:
        return False
    return (pt[0] % P256_N) == r


# ============================================================================
# 3. Canonical JSON, Packet Hashing, Merkle Tree, and Vote Commitment
# ============================================================================

GENESIS_PREV_HASH = "0x" + "00" * 32


def format_float_6(val: int | float | Decimal) -> str:
    """Format a numeric channel value as a fixed 6-decimal-place string (DECISION-02)."""
    d = Decimal(str(val)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
    return f"{d:.6f}"


def canonical_packet_json(packet: dict[str, Any]) -> str:
    """Return canonical UTF-8 JSON string of packet WITHOUT the signature field."""
    preimage = {
        "device_id": str(packet["device_id"]),
        "prev_hash": str(packet["prev_hash"]),
        "seq": int(packet["seq"]),
        "timestamp_utc": str(packet["timestamp_utc"]),
        "values": {
            str(k): format_float_6(v)
            for k, v in sorted(packet["values"].items(), key=lambda kv: kv[0])
        },
    }
    return json.dumps(preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_packet_hash(packet: dict[str, Any]) -> str:
    """Compute 0x-prefixed 32-byte SHA-256 digest of canonical_packet_json(packet)."""
    canon_bytes = canonical_packet_json(packet).encode("utf-8")
    return "0x" + hashlib.sha256(canon_bytes).hexdigest()


def compute_merkle_tree(packet_hashes_hex: list[str]) -> dict[str, Any]:
    """Compute Merkle leaves, levels, root, and OpenZeppelin-compatible proofs."""
    if not packet_hashes_hex:
        raise ValueError("Cannot build Merkle tree from empty packet list")

    leaves_bytes = [keccak256(bytes.fromhex(h[2:])) for h in packet_hashes_hex]
    levels: list[list[bytes]] = [leaves_bytes]

    current = leaves_bytes
    while len(current) > 1:
        next_level: list[bytes] = []
        for i in range(0, len(current) - 1, 2):
            a, b = current[i], current[i + 1]
            combined = (a + b) if a <= b else (b + a)
            next_level.append(keccak256(combined))
        if len(current) % 2 == 1:
            # Odd node promoted unchanged (DECISION-04)
            next_level.append(current[-1])
        levels.append(next_level)
        current = next_level

    root_hex = "0x" + levels[-1][0].hex()
    proofs: list[dict[str, Any]] = []
    for leaf_idx, (pkt_hash_hex, leaf_bytes) in enumerate(zip(packet_hashes_hex, leaves_bytes)):
        siblings: list[str] = []
        idx = leaf_idx
        for level in levels[:-1]:
            if idx % 2 == 0:
                if idx + 1 < len(level):
                    siblings.append("0x" + level[idx + 1].hex())
                # else: odd trailing node promoted unchanged -> no sibling at this level
            else:
                siblings.append("0x" + level[idx - 1].hex())
            idx //= 2
        proofs.append(
            {
                "leaf_index": leaf_idx,
                "packet_hash": pkt_hash_hex,
                "leaf_hash": "0x" + leaf_bytes.hex(),
                "siblings": siblings,
                "merkle_root": root_hex,
            }
        )

    return {
        "leaves": ["0x" + l.hex() for l in leaves_bytes],
        "levels": [["0x" + n.hex() for n in lvl] for lvl in levels],
        "merkle_root": root_hex,
        "proofs": proofs,
    }


def compute_vote_commitment(
    batch_id: int,
    model_hash_hex: str,
    input_hash_hex: str,
    score_bp: int,
    verdict: int,
    salt_hex: str,
) -> tuple[str, str]:
    """Compute ABI-encoded preimage (192 bytes) and keccak256 vote commitment."""
    if not (0 <= score_bp <= 10000):
        raise ValueError(f"score_bp out of bounds: {score_bp}")
    if verdict not in (0, 1):
        raise ValueError(f"verdict must be 0 or 1: {verdict}")

    word0 = int(batch_id).to_bytes(32, "big")
    word1 = bytes.fromhex(model_hash_hex[2:])
    word2 = bytes.fromhex(input_hash_hex[2:])
    word3 = int(score_bp).to_bytes(32, "big")
    word4 = int(verdict).to_bytes(32, "big")
    word5 = bytes.fromhex(salt_hex[2:])
    assert len(word1) == 32 and len(word2) == 32 and len(word5) == 32

    abi_encoded = word0 + word1 + word2 + word3 + word4 + word5
    commitment = "0x" + keccak256(abi_encoded).hex()
    return ("0x" + abi_encoded.hex(), commitment)


# ============================================================================
# 4. Deterministic Telemetry Generator for Golden Chains
# ============================================================================

def _make_clean_packets(device_id: str, count: int = 8) -> tuple[list[dict[str, Any]], list[str]]:
    """Build a deterministic 8-packet clean chain signed by TEST KEY."""
    packets: list[dict[str, Any]] = []
    packet_hashes: list[str] = []
    prev_hash = GENESIS_PREV_HASH

    for seq in range(count):
        # Deterministic synthetic telemetry progression for golden test vectors
        load_mw = round(300.0 + seq * 2.5, 6)
        heat_mmbtu = round(load_mw * 9.5, 6)
        co2_tons = round(heat_mmbtu * 0.1025, 6)
        pkt: dict[str, Any] = {
            "device_id": device_id,
            "seq": seq,
            "timestamp_utc": f"2026-07-01T00:00:0{seq}Z",
            "values": {
                "co2_mass_short_tons": co2_tons,
                "gross_load_mw": load_mw,
                "heat_input_mmbtu": heat_mmbtu,
                "synthetic_flue_temp_c": round(145.0 + seq * 0.4, 6),
                "synthetic_fuel_flow_mmbtu_indep": round(heat_mmbtu - 0.5, 6),
                "synthetic_stack_flow_kscfm": round(820.0 + seq * 5.0, 6),
                "synthetic_stack_o2_pct": round(4.2 - seq * 0.02, 6),
            },
            "prev_hash": prev_hash,
        }
        pkt_hash = compute_packet_hash(pkt)
        pkt["signature"] = sign_p256_digest(TEST_PRIVATE_KEY_INT, bytes.fromhex(pkt_hash[2:]))
        packets.append(pkt)
        packet_hashes.append(pkt_hash)
        prev_hash = pkt_hash

    return packets, packet_hashes


def generate_golden_vectors() -> dict[str, Any]:
    """Generate the complete golden vector suite for VeriCEMS."""
    device_id = "DEV-GOLDEN-001"
    installation_id = "INST-GOLDEN-STEEL-01"
    pub_key_hex = derive_p256_public_key_hex(TEST_PRIVATE_KEY_INT)

    # Base clean 8-packet chain
    clean_packets, clean_hashes = _make_clean_packets(device_id, count=8)
    clean_merkle = compute_merkle_tree(clean_hashes)
    clean_batch = {
        "device_id": device_id,
        "batch_id": 1,
        "first_seq": 0,
        "last_seq": 7,
        "count": 8,
        "merkle_root": clean_merkle["merkle_root"],
        "created_at": "2026-07-01T00:00:08Z",
    }

    # Chain 1 (Tampered): packet seq=3 has co2_mass_short_tons scaled by 0.70 AFTER signing
    tampered_packets = json.loads(json.dumps(clean_packets))
    tampered_packets[3]["values"]["co2_mass_short_tons"] = round(
        tampered_packets[3]["values"]["co2_mass_short_tons"] * 0.70, 6
    )
    tampered_hashes = [compute_packet_hash(p) for p in tampered_packets]
    tampered_merkle = compute_merkle_tree(tampered_hashes)
    tampered_batch = {
        "device_id": device_id,
        "batch_id": 2,
        "first_seq": 0,
        "last_seq": 7,
        "count": 8,
        "merkle_root": tampered_merkle["merkle_root"],
        "created_at": "2026-07-01T00:00:08Z",
    }

    # Chain 2 (Sequence Gap / Selective Dropping): packet seq=4 dropped (7 packets total -> tests odd leaf promotion)
    gap_packets = [json.loads(json.dumps(p)) for i, p in enumerate(clean_packets) if i != 4]
    gap_hashes = [compute_packet_hash(p) for p in gap_packets]
    gap_merkle = compute_merkle_tree(gap_hashes)
    gap_batch = {
        "device_id": device_id,
        "batch_id": 3,
        "first_seq": 0,
        "last_seq": 7,
        "count": 7,
        "merkle_root": gap_merkle["merkle_root"],
        "created_at": "2026-07-01T00:00:08Z",
    }

    # Chain 3 (Replayed): indices 4 and 5 replaced with naive replay of packets seq=1 and seq=2
    replayed_packets = json.loads(json.dumps(clean_packets))
    replayed_packets[4] = json.loads(json.dumps(clean_packets[1]))
    replayed_packets[5] = json.loads(json.dumps(clean_packets[2]))
    replayed_hashes = [compute_packet_hash(p) for p in replayed_packets]
    replayed_merkle = compute_merkle_tree(replayed_hashes)
    replayed_batch = {
        "device_id": device_id,
        "batch_id": 4,
        "first_seq": 0,
        "last_seq": 7,
        "count": 8,
        "merkle_root": replayed_merkle["merkle_root"],
        "created_at": "2026-07-01T00:00:08Z",
    }

    # Golden verdict & vote commitment (evaluating Chain 1 Tampered as fraud = 1)
    model_hash_hex = "0x" + hashlib.sha256(b"VeriCEMS-detector-v1.0.0-golden").hexdigest()
    salt_hex = "0x" + hashlib.sha256(b"VeriCEMS-golden-vote-salt-verifier-1").hexdigest()
    score_bp = 9450
    verdict_val = 1
    abi_encoded_hex, vote_commitment_hex = compute_vote_commitment(
        batch_id=tampered_batch["batch_id"],
        model_hash_hex=model_hash_hex,
        input_hash_hex=tampered_batch["merkle_root"],
        score_bp=score_bp,
        verdict=verdict_val,
        salt_hex=salt_hex,
    )
    golden_verdict = {
        "batch_id": tampered_batch["batch_id"],
        "verifier_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "model_hash": model_hash_hex,
        "input_hash": tampered_batch["merkle_root"],
        "score_bp": score_bp,
        "verdict": verdict_val,
        "reason_codes": ["SIG_INVALID", "CHAIN_BREAK", "PHYSICS_RESIDUAL"],
        "salt": salt_hex,
        "vote_commitment": vote_commitment_hex,
    }

    # Golden Period Report JSON (CBAM-aligned, never "official")
    golden_report = {
        "report_version": "1.0.0",
        "cbam_aligned": True,
        "installation_id": installation_id,
        "device_id": device_id,
        "period": {
            "label": "2026-Q3-DEMO",
            "start_utc": "2026-07-01T00:00:00Z",
            "end_utc": "2026-07-01T00:00:08Z",
        },
        "totals": {
            "verified_emissions_tco2e": 2.41634,
            "production_tonnes": 1.271758,
            "specific_embedded_emissions_tco2e_per_t": 1.9,
            "heat_input_mmbtu": 23574.0,
        },
        "coverage": {
            "total_batches": 4,
            "verified_batches": 1,
            "quarantined_batches_count": 3,
            "coverage_bp": 2500,
        },
        "quarantined_batches": [
            {
                "batch_id": 2,
                "first_seq": 0,
                "last_seq": 7,
                "merkle_root": tampered_batch["merkle_root"],
                "reason_codes": ["SIG_INVALID", "CHAIN_BREAK", "PHYSICS_RESIDUAL"],
                "challenge_status": "UPHELD_SLASHED",
            },
            {
                "batch_id": 3,
                "first_seq": 0,
                "last_seq": 7,
                "merkle_root": gap_batch["merkle_root"],
                "reason_codes": ["SEQ_GAP", "CHAIN_BREAK"],
                "challenge_status": "UPHELD_SLASHED",
            },
            {
                "batch_id": 4,
                "first_seq": 0,
                "last_seq": 7,
                "merkle_root": replayed_batch["merkle_root"],
                "reason_codes": ["SEQ_GAP", "CHAIN_BREAK", "SPECTRAL_REPEAT"],
                "challenge_status": "UPHELD_SLASHED",
            },
        ],
        "merkle_roots": [clean_batch["merkle_root"]],
        "transaction_hashes": {
            "batch_anchors": [
                "0x" + keccak256(b"golden-tx-anchor-batch-1").hex(),
            ],
            "attestation_tx": "0x" + keccak256(b"golden-tx-attestation-1").hex(),
        },
        "attestation_id": 1,
    }

    return {
        "meta": {
            "version": "1.0.0",
            "generator": "scripts/make_golden.py",
            "test_key_name": TEST_KEY_NAME,
            "test_key_warning": "TEST KEY ONLY — deterministic golden vector key; never reuse in any non-test context.",
            "test_private_key_hex": "0x" + TEST_PRIVATE_KEY_INT.to_bytes(32, "big").hex(),
            "test_public_key_p256_uncompressed": pub_key_hex,
            "keccak256_empty_self_test": "0x" + keccak256(b"").hex(),
        },
        "chains": {
            "baseline_clean": {
                "description": "Valid 8-packet hash chain with unbroken prev_hash links, sequential seq 0..7, and valid P-256 signatures.",
                "expected_verdict": 0,
                "expected_reason_codes": [],
                "batch": clean_batch,
                "packets": clean_packets,
                "canonical_json_packet_0": canonical_packet_json(clean_packets[0]),
                "packet_hashes": clean_hashes,
                "merkle": clean_merkle,
            },
            "chain_1_tampered": {
                "description": "Tampered packet chain: packet at index 3 (seq=3) has co2_mass_short_tons scaled by 0.70 after signing, invalidating signature on seq=3 and breaking prev_hash on seq=4.",
                "expected_verdict": 1,
                "expected_reason_codes": ["SIG_INVALID", "CHAIN_BREAK"],
                "tampered_packet_index": 3,
                "batch": tampered_batch,
                "packets": tampered_packets,
                "packet_hashes": tampered_hashes,
                "merkle": tampered_merkle,
            },
            "chain_2_seq_gap": {
                "description": "Gap packet chain: packet seq=4 was selectively dropped, leaving 7 packets (seq 0,1,2,3,5,6,7). Triggers SEQ_GAP and CHAIN_BREAK at index 4 and exercises odd-node promotion in the 7-leaf Merkle tree.",
                "expected_verdict": 1,
                "expected_reason_codes": ["SEQ_GAP", "CHAIN_BREAK"],
                "gap_at_index": 4,
                "batch": gap_batch,
                "packets": gap_packets,
                "packet_hashes": gap_hashes,
                "merkle": gap_merkle,
            },
            "chain_3_replayed": {
                "description": "Replayed packet chain: packets at indices 4 and 5 are naive replays of historical packets seq=1 and seq=2. Signatures are valid for the old packets, but seq regresses (3->1) and prev_hash breaks at index 4 and index 6.",
                "expected_verdict": 1,
                "expected_reason_codes": ["SEQ_GAP", "CHAIN_BREAK"],
                "replayed_indices": [4, 5],
                "batch": replayed_batch,
                "packets": replayed_packets,
                "packet_hashes": replayed_hashes,
                "merkle": replayed_merkle,
            },
        },
        "vote_commitment_vector": {
            "verdict_object": golden_verdict,
            "abi_encoded_preimage_hex": abi_encoded_hex,
        },
        "report_vector": golden_report,
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    golden_dir = repo_root / "schemas" / "golden"
    golden_dir.mkdir(parents=True, exist_ok=True)

    vectors = generate_golden_vectors()
    out_path = golden_dir / "golden_vectors.json"
    out_path.write_text(json.dumps(vectors, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(f"Wrote golden vectors to {out_path}")
    print(f"  TEST KEY pubkey : {vectors['meta']['test_public_key_p256_uncompressed'][:34]}...")
    for name, chain in vectors["chains"].items():
        print(f"  {name:18s}: count={chain['batch']['count']} merkle_root={chain['batch']['merkle_root']}")
    print(f"  vote_commitment : {vectors['vote_commitment_vector']['verdict_object']['vote_commitment']}")


if __name__ == "__main__":
    main()
