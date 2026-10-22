"""VeriCEMS cryptographic telemetry layer (`backend.vericems.crypto`).

Provides:
- `SecureElement` and `SoftwareSecureElement` (simulated ECDSA P-256 signing element).
- Canonical JSON, packet creation, `packet_hash` (SHA-256), and hash chaining.
- `verify_chain` returning all detected problems (`CHAIN_BREAK`, `SEQ_GAP`,
  `SEQ_DUPLICATE`, `SEQ_REORDER`, `SIG_INVALID`, `TIMESTAMP_REGRESSION`).
- `MerkleTree`, `build_merkle_tree`, `generate_merkle_proof`, `verify_merkle_proof`,
  `build_batch`, and `compute_vote_commitment`.
"""

from backend.vericems.crypto.chain import (
    ALL_CHAIN_REASON_CODES,
    CHAIN_BREAK,
    SEQ_DUPLICATE,
    SEQ_GAP,
    SEQ_REORDER,
    SIG_INVALID,
    TIMESTAMP_REGRESSION,
    ChainProblem,
    ChainVerificationResult,
    verify_chain,
)
from backend.vericems.crypto.merkle import (
    MerkleTree,
    build_batch,
    build_merkle_tree,
    compute_leaf_hash,
    compute_merkle_tree,
    compute_vote_commitment,
    generate_merkle_proof,
    hash_sorted_pair,
    keccak256,
    keccak256_hex,
    verify_merkle_proof,
)
from backend.vericems.crypto.packet import (
    GENESIS_PREV_HASH,
    build_hash_chain,
    canonical_json,
    canonical_packet_bytes,
    canonical_packet_json,
    compute_packet_hash,
    create_packet,
    create_unsigned_packet,
    format_float_6,
    packet_hash,
    sign_packet,
    verify_packet_signature,
)
from backend.vericems.crypto.secure_element import (
    GOLDEN_TEST_KEY_SEED_PHRASE,
    P256_G,
    P256_N,
    P256_P,
    SecureElement,
    SoftwareSecureElement,
    verify_p256_signature,
)

__all__ = [
    "ALL_CHAIN_REASON_CODES",
    "CHAIN_BREAK",
    "GENESIS_PREV_HASH",
    "GOLDEN_TEST_KEY_SEED_PHRASE",
    "MerkleTree",
    "P256_G",
    "P256_N",
    "P256_P",
    "SEQ_DUPLICATE",
    "SEQ_GAP",
    "SEQ_REORDER",
    "SIG_INVALID",
    " SecureElement",
    "SecureElement",
    "SoftwareSecureElement",
    "TIMESTAMP_REGRESSION",
    "ChainProblem",
    "ChainVerificationResult",
    "build_batch",
    "build_hash_chain",
    "build_merkle_tree",
    "canonical_json",
    "canonical_packet_bytes",
    "canonical_packet_json",
    "compute_leaf_hash",
    "compute_merkle_tree",
    "compute_packet_hash",
    "compute_vote_commitment",
    "create_packet",
    "create_unsigned_packet",
    "format_float_6",
    "generate_merkle_proof",
    "hash_sorted_pair",
    "keccak256",
    "keccak256_hex",
    "packet_hash",
    "sign_packet",
    "verify_chain",
    "verify_merkle_proof",
    "verify_p256_signature",
    "verify_packet_signature",
]
