"""Merkle tree builder, inclusion proof generator/verifier, and batch builder.

Implements Section 4, Section 5, and Section 6.2 of `docs/INTERFACES.md`:
- Original Ethereum `keccak256` (`0x01` domain padding, NOT NIST FIPS-202 SHA3-256).
- Leaf construction: `leaf_i = keccak256(bytes32(packet_hash_i))`.
- Internal node construction: `keccak256(min(a, b) || max(a, b))` (sorted 32-byte big-endian pairs).
- Odd-node promotion (DECISION-04): unpaired trailing node at any level with `2k + 1` nodes
  (`k >= 1`) is promoted unchanged to index `k` of the next level with no sibling emitted.
- Batch builder producing the `schemas/batch.schema.json` object.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Final

from backend.vericems.crypto.packet import packet_hash

_HASH32_HEX_RE: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")
_TIMESTAMP_UTC_RE: Final[re.Pattern[str]] = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
)

# ============================================================================
# 1. Original Ethereum Keccak-256 (0x01 padding)
# ============================================================================

_RC: Final[tuple[int, ...]] = (
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
)

_ROT: Final[tuple[tuple[int, ...], ...]] = (
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
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError(f"keccak256 expects bytes-like object, got {type(data).__name__}")
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
            c = [
                state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]
                for x in range(5)
            ]
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


def keccak256_hex(data: bytes) -> str:
    """Compute `0x`-prefixed 64-character lowercase hex Ethereum Keccak-256 digest."""
    return "0x" + keccak256(data).hex()


# ============================================================================
# 2. Merkle Tree Construction & Inclusion Proofs
# ============================================================================

def _parse_bytes32_hex(val: str | bytes, name: str = "hash") -> bytes:
    """Parse a `0x`-prefixed 32-byte hex string or 32-byte `bytes` into `bytes`."""
    if isinstance(val, bytes):
        if len(val) != 32:
            raise ValueError(f"{name} must be 32 bytes, got {len(val)}")
        return val
    if isinstance(val, str):
        if not _HASH32_HEX_RE.match(val):
            raise ValueError(
                f"{name} must be a 0x-prefixed 64-char lowercase hex string, got {val!r}"
            )
        return bytes.fromhex(val[2:])
    raise TypeError(f"{name} must be str or bytes, got {type(val).__name__}")


def compute_leaf_hash(packet_hash_val: str | bytes) -> str:
    """Compute domain-separated leaf hash `keccak256(bytes32(packet_hash))` as `0x` hex."""
    pkt_bytes = _parse_bytes32_hex(packet_hash_val, "packet_hash")
    return "0x" + keccak256(pkt_bytes).hex()


def hash_sorted_pair(a: bytes, b: bytes) -> bytes:
    """Hash two 32-byte nodes using OpenZeppelin's commutative sorted-pair Keccak-256 rule."""
    if len(a) != 32 or len(b) != 32:
        raise ValueError("Merkle tree nodes must be 32 bytes each")
    combined = (a + b) if a <= b else (b + a)
    return keccak256(combined)


def _extract_packet_hashes(
    packets_or_hashes: Sequence[Mapping[str, Any] | str | bytes],
) -> list[str]:
    """Normalize a non-empty sequence of packet dicts or 32-byte packet hashes into `0x` hex strings."""
    if not packets_or_hashes:
        raise ValueError("Cannot build Merkle tree from empty packet list")
    hashes: list[str] = []
    for idx, item in enumerate(packets_or_hashes):
        if isinstance(item, Mapping):
            hashes.append(packet_hash(item))
        elif isinstance(item, (str, bytes)):
            b32 = _parse_bytes32_hex(item, f"packet_hashes[{idx}]")
            hashes.append("0x" + b32.hex())
        else:
            raise TypeError(
                f"Expected packet dict or 32-byte hash at index {idx}, got {type(item).__name__}"
            )
    return hashes


@dataclass(frozen=True)
class MerkleTree:
    """Binary Keccak-256 Merkle tree with sorted pairs and odd-node promotion (DECISION-04)."""

    packet_hashes: list[str]
    leaves: list[str]
    levels: list[list[str]]
    merkle_root: str
    proofs: list[dict[str, Any]]

    @classmethod
    def from_packets_or_hashes(
        cls, packets_or_hashes: Sequence[Mapping[str, Any] | str | bytes]
    ) -> MerkleTree:
        pkt_hashes = _extract_packet_hashes(packets_or_hashes)
        leaves_bytes = [keccak256(bytes.fromhex(h[2:])) for h in pkt_hashes]
        levels_bytes: list[list[bytes]] = [leaves_bytes]

        current = leaves_bytes
        while len(current) > 1:
            next_level: list[bytes] = []
            for i in range(0, len(current) - 1, 2):
                next_level.append(hash_sorted_pair(current[i], current[i + 1]))
            if len(current) % 2 == 1:
                # DECISION-04: Odd trailing node is promoted unchanged without self-hashing
                next_level.append(current[-1])
            levels_bytes.append(next_level)
            current = next_level

        root_hex = "0x" + levels_bytes[-1][0].hex()
        proofs: list[dict[str, Any]] = []
        for leaf_idx, (pkt_hash_hex, leaf_bytes) in enumerate(zip(pkt_hashes, leaves_bytes)):
            siblings: list[str] = []
            idx = leaf_idx
            for level in levels_bytes[:-1]:
                if idx % 2 == 0:
                    if idx + 1 < len(level):
                        siblings.append("0x" + level[idx + 1].hex())
                    # else: odd trailing node promoted unchanged -> no sibling emitted
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

        return cls(
            packet_hashes=pkt_hashes,
            leaves=["0x" + l.hex() for l in leaves_bytes],
            levels=[["0x" + n.hex() for n in lvl] for lvl in levels_bytes],
            merkle_root=root_hex,
            proofs=proofs,
        )

    def get_proof(self, leaf_index: int) -> dict[str, Any]:
        """Return the Merkle inclusion proof dictionary for `leaf_index`."""
        if not (0 <= leaf_index < len(self.proofs)):
            raise IndexError(
                f"leaf_index {leaf_index} out of range for tree with {len(self.proofs)} leaves"
            )
        proof = self.proofs[leaf_index]
        return {
            "leaf_index": proof["leaf_index"],
            "packet_hash": proof["packet_hash"],
            "leaf_hash": proof["leaf_hash"],
            "siblings": list(proof["siblings"]),
            "merkle_root": proof["merkle_root"],
        }

    def to_dict(self) -> dict[str, Any]:
        """Return the canonical dictionary representation matching `golden_vectors.json`."""
        return {
            "leaves": list(self.leaves),
            "levels": [list(lvl) for lvl in self.levels],
            "merkle_root": self.merkle_root,
            "proofs": [self.get_proof(i) for i in range(len(self.proofs))],
        }

    def __getitem__(self, key: str) -> Any:
        return self.to_dict()[key]


def build_merkle_tree(
    packets_or_hashes: Sequence[Mapping[str, Any] | str | bytes],
) -> MerkleTree:
    """Build a `MerkleTree` from a sequence of packets or 32-byte packet hashes."""
    return MerkleTree.from_packets_or_hashes(packets_or_hashes)


# Alias matching scripts/make_golden.py
def compute_merkle_tree(
    packets_or_hashes: Sequence[Mapping[str, Any] | str | bytes],
) -> dict[str, Any]:
    """Compute Merkle tree dictionary (`leaves`, `levels`, `merkle_root`, `proofs`)."""
    return MerkleTree.from_packets_or_hashes(packets_or_hashes).to_dict()


def generate_merkle_proof(
    tree_or_items: MerkleTree | Mapping[str, Any] | Sequence[Mapping[str, Any] | str | bytes],
    leaf_index: int,
) -> dict[str, Any]:
    """Generate the OpenZeppelin-compatible Merkle proof for `leaf_index`."""
    if isinstance(tree_or_items, MerkleTree):
        return tree_or_items.get_proof(leaf_index)
    if isinstance(tree_or_items, Mapping) and "proofs" in tree_or_items:
        proofs = tree_or_items["proofs"]
        if not (0 <= leaf_index < len(proofs)):
            raise IndexError(f"leaf_index {leaf_index} out of range")
        p = proofs[leaf_index]
        return {
            "leaf_index": p["leaf_index"],
            "packet_hash": p["packet_hash"],
            "leaf_hash": p["leaf_hash"],
            "siblings": list(p["siblings"]),
            "merkle_root": p["merkle_root"],
        }
    if isinstance(tree_or_items, Sequence):
        tree = MerkleTree.from_packets_or_hashes(tree_or_items)
        return tree.get_proof(leaf_index)
    raise TypeError(f"Unsupported input type for generate_merkle_proof: {type(tree_or_items).__name__}")


def verify_merkle_proof(
    leaf_or_proof: Mapping[str, Any] | str | bytes,
    siblings: Sequence[str | bytes] | str | bytes | None = None,
    merkle_root: str | bytes | None = None,
    *,
    packet_hash_hex: str | bytes | None = None,
) -> bool:
    """Verify a Merkle inclusion proof using OpenZeppelin's sorted-pair folding rule.

    Can be called in two ways:
    1. `verify_merkle_proof(proof_dict, expected_root)` or `verify_merkle_proof(proof_dict, merkle_root="0x...")`
       or `verify_merkle_proof(proof_dict)`.
       Also verifies `leaf_hash == keccak256(packet_hash)` when `packet_hash` is present in `proof_dict`.
    2. `verify_merkle_proof(leaf_hash_hex, siblings_list, merkle_root_hex, packet_hash_hex=...)`.
    """
    try:
        if isinstance(leaf_or_proof, Mapping):
            proof_map = leaf_or_proof
            if "leaf_hash" not in proof_map or "siblings" not in proof_map:
                return False
            leaf_bytes = _parse_bytes32_hex(proof_map["leaf_hash"], "leaf_hash")
            if isinstance(siblings, (str, bytes)) and merkle_root is None:
                # Called as verify_merkle_proof(proof_dict, expected_root)
                merkle_root = siblings
                sib_seq: Any = proof_map.get("siblings")
            else:
                sib_seq = siblings if siblings is not None else proof_map.get("siblings")
            if not isinstance(sib_seq, Sequence) or isinstance(sib_seq, (str, bytes)):
                return False

            proof_root_raw = proof_map.get("merkle_root")
            if merkle_root is not None and proof_root_raw is not None:
                expected_root_bytes = _parse_bytes32_hex(merkle_root, "merkle_root")
                proof_root_bytes = _parse_bytes32_hex(proof_root_raw, "proof.merkle_root")
                if expected_root_bytes != proof_root_bytes:
                    return False
                root_bytes = expected_root_bytes
            elif merkle_root is not None:
                root_bytes = _parse_bytes32_hex(merkle_root, "merkle_root")
            elif proof_root_raw is not None:
                root_bytes = _parse_bytes32_hex(proof_root_raw, "proof.merkle_root")
            else:
                return False

            pkt_hash_to_check = (
                packet_hash_hex
                if packet_hash_hex is not None
                else proof_map.get("packet_hash")
            )
            if pkt_hash_to_check is not None:
                pkt_bytes = _parse_bytes32_hex(pkt_hash_to_check, "packet_hash")
                if keccak256(pkt_bytes) != leaf_bytes:
                    return False

            leaf_idx = proof_map.get("leaf_index")
            if leaf_idx is not None and (
                isinstance(leaf_idx, bool) or not isinstance(leaf_idx, int) or leaf_idx < 0
            ):
                return False
        else:
            if siblings is None or merkle_root is None:
                return False
            if not isinstance(siblings, Sequence) or isinstance(siblings, (str, bytes)):
                return False
            leaf_bytes = _parse_bytes32_hex(leaf_or_proof, "leaf_hash")
            sib_seq = siblings
            root_bytes = _parse_bytes32_hex(merkle_root, "merkle_root")
            if packet_hash_hex is not None:
                pkt_bytes = _parse_bytes32_hex(packet_hash_hex, "packet_hash")
                if keccak256(pkt_bytes) != leaf_bytes:
                    return False

        computed = leaf_bytes
        for idx, sib in enumerate(sib_seq):
            sib_bytes = _parse_bytes32_hex(sib, f"siblings[{idx}]")
            computed = hash_sorted_pair(computed, sib_bytes)

        return computed == root_bytes
    except (KeyError, TypeError, ValueError):
        return False


# ============================================================================
# 3. Batch Object Builder & Vote Commitment Helper
# ============================================================================

def _default_batch_created_at(last_packet_timestamp_utc: str) -> str:
    """Compute a deterministic `created_at` timestamp (`last_packet_timestamp_utc + 1s`)."""
    dt = datetime.strptime(last_packet_timestamp_utc, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )
    return (dt + timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_batch(
    packets: Sequence[Mapping[str, Any]],
    batch_id: int,
    created_at: str | None = None,
    *,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Build a batch summary object conforming to `schemas/batch.schema.json`.

    Args:
        packets: Non-empty sequence of telemetry packets in the batch.
        batch_id: Non-negative integer batch ID (`uint256` on-chain).
        created_at: Optional ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`). If omitted,
            deterministically defaults to `packets[-1]["timestamp_utc"] + 1 second`.
        device_id: Optional explicit device_id; defaults to `packets[0]["device_id"]`.
    """
    if not packets:
        raise ValueError("Cannot build a batch from an empty packet sequence")
    if isinstance(batch_id, bool) or not isinstance(batch_id, int) or batch_id < 0:
        raise ValueError(f"batch_id must be a non-negative integer, got {batch_id!r}")

    resolved_device_id = str(device_id if device_id is not None else packets[0]["device_id"])
    for idx, pkt in enumerate(packets):
        if str(pkt.get("device_id")) != resolved_device_id:
            raise ValueError(
                f"Packet at index {idx} has device_id={pkt.get('device_id')!r} != {resolved_device_id!r}"
            )

    first_seq = int(packets[0]["seq"])
    last_seq = int(packets[-1]["seq"])
    if first_seq < 0 or last_seq < 0:
        raise ValueError("Packet sequence numbers in a batch must be non-negative")

    if created_at is None:
        created_at = _default_batch_created_at(str(packets[-1]["timestamp_utc"]))
    elif not _TIMESTAMP_UTC_RE.match(created_at):
        raise ValueError(
            f"created_at must match YYYY-MM-DDTHH:MM:SSZ, got {created_at!r}"
        )

    tree = MerkleTree.from_packets_or_hashes(packets)
    return {
        "device_id": resolved_device_id,
        "batch_id": int(batch_id),
        "first_seq": first_seq,
        "last_seq": last_seq,
        "count": len(packets),
        "merkle_root": tree.merkle_root,
        "created_at": created_at,
    }


def compute_vote_commitment(
    batch_id: int,
    model_hash_hex: str,
    input_hash_hex: str,
    score_bp: int,
    verdict: int,
    salt_hex: str,
) -> tuple[str, str]:
    """Compute ABI-encoded 192-byte preimage and `keccak256` vote commitment (DECISION-05)."""
    if isinstance(batch_id, bool) or not isinstance(batch_id, int) or batch_id < 0:
        raise ValueError(f"batch_id must be a non-negative integer: {batch_id!r}")
    if isinstance(score_bp, bool) or not isinstance(score_bp, int) or not (0 <= score_bp <= 10000):
        raise ValueError(f"score_bp out of bounds [0, 10000]: {score_bp!r}")
    if isinstance(verdict, bool) or verdict not in (0, 1):
        raise ValueError(f"verdict must be 0 or 1: {verdict!r}")

    word0 = int(batch_id).to_bytes(32, "big")
    word1 = _parse_bytes32_hex(model_hash_hex, "model_hash")
    word2 = _parse_bytes32_hex(input_hash_hex, "input_hash")
    word3 = int(score_bp).to_bytes(32, "big")
    word4 = int(verdict).to_bytes(32, "big")
    word5 = _parse_bytes32_hex(salt_hex, "salt")

    abi_encoded = word0 + word1 + word2 + word3 + word4 + word5
    commitment = "0x" + keccak256(abi_encoded).hex()
    return ("0x" + abi_encoded.hex(), commitment)
