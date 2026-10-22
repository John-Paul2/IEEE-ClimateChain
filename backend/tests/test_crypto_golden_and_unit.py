"""Golden vector compliance and unit tests for `backend.vericems.crypto`."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import pickle
from typing import Any

import pytest

from backend.vericems.crypto import (
    ALL_CHAIN_REASON_CODES,
    CHAIN_BREAK,
    GENESIS_PREV_HASH,
    SEQ_DUPLICATE,
    SEQ_GAP,
    SEQ_REORDER,
    SIG_INVALID,
    TIMESTAMP_REGRESSION,
    MerkleTree,
    SecureElement,
    SoftwareSecureElement,
    build_batch,
    build_hash_chain,
    build_merkle_tree,
    canonical_json,
    compute_leaf_hash,
    compute_merkle_tree,
    compute_packet_hash,
    compute_vote_commitment,
    create_packet,
    format_float_6,
    generate_merkle_proof,
    keccak256,
    keccak256_hex,
    packet_hash,
    verify_chain,
    verify_merkle_proof,
    verify_p256_signature,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GOLDEN_PATH = REPO_ROOT / "schemas" / "golden" / "golden_vectors.json"
CRYPTO_NOTES_PATH = REPO_ROOT / "docs" / "CRYPTO_NOTES.md"


@pytest.fixture(scope="module")
def golden() -> dict[str, Any]:
    assert GOLDEN_PATH.exists(), f"Missing golden vector file: {GOLDEN_PATH}"
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def test_secure_element_interface_and_private_key_isolation(golden: dict[str, Any]) -> None:
    """Verify SecureElement interface, simulation disclosure, and private key non-exposure."""
    se = SoftwareSecureElement.from_golden_test_key()
    assert isinstance(se, SecureElement)
    assert se.is_synthetic_simulation is True

    # Docstring must explicitly document that SoftwareSecureElement SIMULATES a hardware
    # secure element (such as an ATECC608) and is not one.
    doc = (SoftwareSecureElement.__doc__ or "") + (
        SoftwareSecureElement.__init__.__doc__ or ""
    )
    assert "SIMULATES" in doc.upper()
    assert "ATECC608" in doc
    assert "NOT" in doc.upper()

    expected_pub = golden["meta"]["test_public_key_p256_uncompressed"]
    secret_hex = golden["meta"]["test_private_key_hex"][2:]
    assert se.public_key() == expected_pub
    assert len(se.public_key_bytes()) == 65
    assert se.public_key_bytes()[0] == 0x04

    # Private key must never appear in repr, str, dir, or any accessible attribute
    assert secret_hex not in repr(se).lower()
    assert secret_hex not in str(se).lower()
    assert not hasattr(se, "__dict__")
    for attr_name in dir(se):
        if attr_name.startswith("__"):
            continue
        val = getattr(se, attr_name)
        if isinstance(val, (str, bytes, int)):
            assert secret_hex not in str(val).lower()

    # Immutability and serialization block checks
    with pytest.raises(AttributeError):
        se.extra_attr = "blocked"  # type: ignore[attr-defined]
    with pytest.raises(TypeError):
        pickle.dumps(se)
    with pytest.raises(TypeError):
        copy.copy(se)
    with pytest.raises(TypeError):
        copy.deepcopy(se)

    # Fresh random key generation works and produces valid P-256 signatures
    random_se = SoftwareSecureElement()
    assert random_se.public_key() != se.public_key()
    digest = keccak256(b"test-message")
    sig = random_se.sign(digest)
    assert verify_p256_signature(random_se.public_key(), digest, sig) is True
    assert verify_p256_signature(se.public_key(), digest, sig) is False


def test_golden_vectors_packet_creation_and_signing(golden: dict[str, Any]) -> None:
    """Verify packet creation, canonical JSON, packet_hash, and signatures match golden vectors."""
    se = SoftwareSecureElement.from_golden_test_key()
    assert (
        keccak256_hex(b"") == golden["meta"]["keccak256_empty_self_test"]
    )

    clean = golden["chains"]["baseline_clean"]
    golden_packets = clean["packets"]
    assert canonical_json(golden_packets[0]) == clean["canonical_json_packet_0"]

    # Rebuild the entire 8-packet clean chain from raw timestamps and values
    records = [
        {"timestamp_utc": p["timestamp_utc"], "values": p["values"]}
        for p in golden_packets
    ]
    rebuilt_packets = build_hash_chain(
        device_id="DEV-GOLDEN-001",
        records=records,
        secure_element=se,
    )
    assert rebuilt_packets == golden_packets

    rebuilt_hashes = [packet_hash(p) for p in rebuilt_packets]
    assert rebuilt_hashes == clean["packet_hashes"]


def test_golden_vectors_chain_verifier(golden: dict[str, Any]) -> None:
    """Verify `verify_chain` matches all 4 golden chains in `schemas/golden/golden_vectors.json`."""
    pub_key = golden["meta"]["test_public_key_p256_uncompressed"]
    chains = golden["chains"]

    # 1. Baseline clean
    res_clean = verify_chain(chains["baseline_clean"]["packets"], pub_key)
    assert res_clean.is_valid is True
    assert res_clean.problems == []
    assert res_clean.reason_codes == []
    assert res_clean.verdict_reason_codes == []

    # 2. Chain 1 Tampered (co2_mass_short_tons scaled by 0.70 after signing on seq=3)
    res_tampered = verify_chain(chains["chain_1_tampered"]["packets"], pub_key)
    assert res_tampered.is_valid is False
    assert res_tampered.reason_codes == [SIG_INVALID, CHAIN_BREAK]
    assert set(res_tampered.verdict_reason_codes) == set(
        chains["chain_1_tampered"]["expected_reason_codes"]
    )
    assert any(p.index == 3 and p.reason_code == SIG_INVALID for p in res_tampered.problems)
    assert any(p.index == 4 and p.reason_code == CHAIN_BREAK for p in res_tampered.problems)

    # 3. Chain 2 Sequence Gap (seq=4 dropped)
    res_gap = verify_chain(chains["chain_2_seq_gap"]["packets"], pub_key)
    assert res_gap.is_valid is False
    assert set(res_gap.reason_codes) == {SEQ_GAP, CHAIN_BREAK}
    assert set(res_gap.verdict_reason_codes) == set(
        chains["chain_2_seq_gap"]["expected_reason_codes"]
    )
    assert any(p.index == 4 and p.reason_code == SEQ_GAP for p in res_gap.problems)
    assert any(p.index == 4 and p.reason_code == CHAIN_BREAK for p in res_gap.problems)

    # 4. Chain 3 Replayed (indices 4, 5 replaced with historical packets seq=1, 2)
    res_replayed = verify_chain(chains["chain_3_replayed"]["packets"], pub_key)
    assert res_replayed.is_valid is False
    # Granular chain verifier detects duplicate seq, reordered seq, timestamp regression,
    # chain break at index 4, plus seq gap and chain break at index 6!
    assert SEQ_DUPLICATE in res_replayed.reason_codes
    assert SEQ_REORDER in res_replayed.reason_codes
    assert TIMESTAMP_REGRESSION in res_replayed.reason_codes
    assert CHAIN_BREAK in res_replayed.reason_codes
    assert SEQ_GAP in res_replayed.reason_codes
    # And verdict reason codes match the golden vector's 8-code enum expectation:
    assert set(res_replayed.verdict_reason_codes) == set(
        chains["chain_3_replayed"]["expected_reason_codes"]
    )


def test_chain_verifier_returns_all_problems_without_short_circuiting(
    golden: dict[str, Any],
) -> None:
    """Construct a chain with all 6 problem types and verify every single one is returned."""
    pub_key = golden["meta"]["test_public_key_p256_uncompressed"]
    clean_pkts = copy.deepcopy(golden["chains"]["baseline_clean"]["packets"])

    # Mutate multiple packets to trigger all 6 reason codes in one chain:
    # - Index 0: corrupt prev_hash (CHAIN_BREAK + SIG_INVALID)
    clean_pkts[0]["prev_hash"] = "0x" + "11" * 32
    # - Index 2: corrupt values after signing (SIG_INVALID on 2, CHAIN_BREAK on 3)
    clean_pkts[2]["values"]["co2_mass_short_tons"] = 100.0
    # - Index 4: replace with duplicate of packet 1 (SEQ_DUPLICATE, SEQ_REORDER, TIMESTAMP_REGRESSION, CHAIN_BREAK)
    clean_pkts[4] = copy.deepcopy(clean_pkts[1])
    # - Index 5: dropped (so index 5 is now old packet 6 -> SEQ_GAP 1 -> 6)
    del clean_pkts[5]

    result = verify_chain(clean_pkts, pub_key)
    assert result.is_valid is False
    for expected_code in ALL_CHAIN_REASON_CODES:
        assert expected_code in result.reason_codes, (
            f"Expected {expected_code} in {result.reason_codes}"
        )
    assert len(result.problems) >= 8


def test_golden_vectors_merkle_tree_proofs_and_batch_builder(
    golden: dict[str, Any],
) -> None:
    """Verify Merkle tree, odd-leaf promotion, proofs, batch builder, and vote commitment."""
    for chain_name, chain in golden["chains"].items():
        packets = chain["packets"]
        expected_hashes = [compute_packet_hash(p) for p in packets]
        assert expected_hashes == chain["packet_hashes"]

        tree = build_merkle_tree(packets)
        assert tree.to_dict() == chain["merkle"], f"Merkle tree mismatch in {chain_name}"
        assert compute_merkle_tree(expected_hashes) == chain["merkle"]

        batch_obj = build_batch(
            packets=packets,
            batch_id=chain["batch"]["batch_id"],
            created_at=chain["batch"]["created_at"],
        )
        assert batch_obj == chain["batch"], f"Batch mismatch in {chain_name}"

        for idx in range(len(packets)):
            proof = generate_merkle_proof(tree, idx)
            assert proof == chain["merkle"]["proofs"][idx]
            assert verify_merkle_proof(proof, expected_root := tree.merkle_root) is True
            assert (
                verify_merkle_proof(
                    proof["leaf_hash"],
                    proof["siblings"],
                    expected_root,
                    packet_hash_hex=proof["packet_hash"],
                )
                is True
            )

    # Check vote commitment golden vector
    vc = golden["vote_commitment_vector"]
    v_obj = vc["verdict_object"]
    abi_hex, commitment_hex = compute_vote_commitment(
        batch_id=v_obj["batch_id"],
        model_hash_hex=v_obj["model_hash"],
        input_hash_hex=v_obj["input_hash"],
        score_bp=v_obj["score_bp"],
        verdict=v_obj["verdict"],
        salt_hex=v_obj["salt"],
    )
    assert abi_hex == vc["abi_encoded_preimage_hex"]
    assert commitment_hex == v_obj["vote_commitment"]


def test_single_leaf_merkle_tree_and_float_formatting_edge_cases() -> None:
    """Test 1-leaf Merkle tree (`merkle_root == leaf_0`) and `-0.0` formatting."""
    assert format_float_6(-0.0) == "0.000000"
    assert format_float_6(310) == "310.000000"
    assert format_float_6(294.559375) == "294.559375"

    se = SoftwareSecureElement.from_golden_test_key()
    pkt = create_packet(
        device_id="DEV-SINGLE-001",
        seq=0,
        timestamp_utc="2026-07-01T00:00:00Z",
        values={"co2_mass_short_tons": 100.0, "heat_input_mmbtu": 1000.0},
        secure_element=se,
    )
    tree = MerkleTree.from_packets_or_hashes([pkt])
    expected_leaf = compute_leaf_hash(packet_hash(pkt))
    assert tree.merkle_root == expected_leaf
    proof = tree.get_proof(0)
    assert proof["siblings"] == []
    assert verify_merkle_proof(proof) is True


def test_crypto_notes_doc_exists_and_states_limitations_plainly() -> None:
    """Verify `docs/CRYPTO_NOTES.md` exists and plainly explains what signatures do and do NOT prove."""
    assert CRYPTO_NOTES_PATH.exists(), f"Missing {CRYPTO_NOTES_PATH}"
    text = CRYPTO_NOTES_PATH.read_text(encoding="utf-8")
    lower = text.lower()
    assert "origin" in lower
    assert "integrity" in lower
    assert "not prove" in lower
    assert "truth" in lower
    assert "atecc608" in lower
    assert "softwaresecureelement" in lower
