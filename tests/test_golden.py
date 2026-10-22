"""Golden vector and interface compliance tests for VeriCEMS (Milestone P02).

Verifies:
1. Channel registry structure and synthetic/TODO rules (schemas/channels.json).
2. JSON Schema definitions in schemas/ (packet, batch, verdict, report).
3. Canonical JSON determinism (UTF-8, sorted keys, no whitespace, fixed 6-decimal strings).
4. Packet hash (SHA-256 without signature), genesis 32-zero-byte prev_hash, and ECDSA P-256 signatures.
5. Detection of tampered, sequence-gap, and replayed chains in schemas/golden/golden_vectors.json.
6. Merkle tree roots, odd-node promotion, and OpenZeppelin-compatible inclusion proofs.
7. Vote commitment ABI encoding and keccak256 hash.
8. Period report schema compliance, "cbam_aligned": true, and absence of the word "official".
9. Parameter profiles ("demo" and "benchmark") in config/params.yaml.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.make_golden import (  # noqa: E402
    GENESIS_PREV_HASH,
    TEST_KEY_NAME,
    canonical_packet_json,
    compute_merkle_tree,
    compute_packet_hash,
    compute_vote_commitment,
    generate_golden_vectors,
    keccak256,
    verify_p256_digest,
)

GOLDEN_PATH = REPO_ROOT / "schemas" / "golden" / "golden_vectors.json"
CHANNELS_PATH = REPO_ROOT / "schemas" / "channels.json"
PARAMS_PATH = REPO_ROOT / "config" / "params.yaml"
INTERFACES_DOC_PATH = REPO_ROOT / "docs" / "INTERFACES.md"

ALLOWED_REASON_CODES = {
    "CHAIN_BREAK",
    "SEQ_GAP",
    "SIG_INVALID",
    "PHYSICS_RESIDUAL",
    "AE_RESIDUAL",
    "SPECTRAL_FLAT",
    "SPECTRAL_REPEAT",
    "CROSS_SOURCE_MISMATCH",
}


@pytest.fixture(scope="module")
def golden() -> dict[str, Any]:
    assert GOLDEN_PATH.exists(), f"Missing golden vector file: {GOLDEN_PATH}"
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def evaluate_chain_crypto(packets: list[dict[str, Any]], pub_key_hex: str) -> list[str]:
    """Run deterministic cryptographic checks (SIG_INVALID, SEQ_GAP, CHAIN_BREAK) on a packet list."""
    reasons: list[str] = []
    expected_prev_hash = GENESIS_PREV_HASH
    expected_seq = 0

    for idx, pkt in enumerate(packets):
        pkt_hash = compute_packet_hash(pkt)
        sig_ok = verify_p256_digest(pub_key_hex, bytes.fromhex(pkt_hash[2:]), pkt["signature"])
        if not sig_ok and "SIG_INVALID" not in reasons:
            reasons.append("SIG_INVALID")
        if idx == 0:
            expected_seq = pkt["seq"]
        else:
            if pkt["seq"] != expected_seq and "SEQ_GAP" not in reasons:
                reasons.append("SEQ_GAP")
        if pkt["prev_hash"] != expected_prev_hash and "CHAIN_BREAK" not in reasons:
            reasons.append("CHAIN_BREAK")

        expected_prev_hash = pkt_hash
        expected_seq = pkt["seq"] + 1

    return reasons


def verify_oz_merkle_proof(leaf_hash_hex: str, siblings_hex: list[str], root_hex: str) -> bool:
    """Recompute root using OpenZeppelin MerkleProof.processProof sorted-pair rule."""
    computed = bytes.fromhex(leaf_hash_hex[2:])
    for sib_hex in siblings_hex:
        sib = bytes.fromhex(sib_hex[2:])
        combined = (computed + sib) if computed <= sib else (sib + computed)
        computed = keccak256(combined)
    return ("0x" + computed.hex()) == root_hex


def test_keccak256_reference_vectors() -> None:
    """Ensure Ethereum Keccak-256 (0x01 padding) matches standard reference vectors."""
    assert (
        "0x" + keccak256(b"").hex()
        == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    )
    assert (
        "0x" + keccak256(b"abc").hex()
        == "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    )


def test_deliverable_files_and_decisions_exist() -> None:
    """Verify all required schema files, docs/INTERFACES.md, and DECISION tags exist."""
    assert INTERFACES_DOC_PATH.exists()
    doc_text = INTERFACES_DOC_PATH.read_text(encoding="utf-8")
    assert "DECISION-01" in doc_text
    assert "DECISION-02" in doc_text
    for contract_name in (
        "DeviceRegistry",
        "BondVault",
        "BatchAnchor",
        "VerifierQuorum",
        "Challenge",
        "Attestation",
    ):
        assert contract_name in doc_text

    for schema_name in (
        "channels.json",
        "packet.schema.json",
        "batch.schema.json",
        "verdict.schema.json",
        "report.schema.json",
    ):
        path = REPO_ROOT / "schemas" / schema_name
        assert path.exists(), f"Missing schema file: {path}"
        parsed = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(parsed, dict)


def test_channel_registry_structure() -> None:
    """Check schemas/channels.json has real TODO channels and synthetic-labelled channels."""
    registry = json.loads(CHANNELS_PATH.read_text(encoding="utf-8"))
    channels = registry["channels"]
    assert len(channels) >= 8

    real_channels = [c for c in channels if c["source"] == "real"]
    synth_channels = [c for c in channels if c["source"] == "synthetic"]
    assert len(real_channels) >= 4
    assert len(synth_channels) >= 3

    for ch in channels:
        assert set(ch.keys()) >= {"name", "unit", "source", "description"}
        assert ch["source"] in ("real", "synthetic")
        if ch["source"] == "real":
            assert ch["status"] in ("TODO_P03_DATA_CARD", "DEFINED")
            assert isinstance(ch.get("campd_column"), str) and len(ch["campd_column"]) > 0
        else:
            assert ch["name"].startswith("synthetic_"), (
                f"Synthetic channel {ch['name']} must be explicitly named synthetic_*"
            )


def test_params_yaml_profiles() -> None:
    """Verify config/params.yaml defines demo and benchmark profiles and real-world comments."""
    raw = PARAMS_PATH.read_text(encoding="utf-8")
    assert "demo:" in raw
    assert "benchmark:" in raw
    assert "batch_size_packets: 8" in raw
    assert "challenge_window_seconds: 120" in raw
    assert "packet_interval_seconds: 1" in raw
    assert "batch_size_packets: 24" in raw
    assert "packet_interval_seconds: 3600" in raw
    assert "24 hours" in raw  # real-world comment check


def test_golden_vectors_deterministic_regeneration(golden: dict[str, Any]) -> None:
    """Ensure scripts/make_golden.py is 100% deterministic and matches the file on disk."""
    regenerated = generate_golden_vectors()
    assert regenerated == golden
    assert golden["meta"]["test_key_name"] == TEST_KEY_NAME


def test_canonical_json_and_packet_format(golden: dict[str, Any]) -> None:
    """Check canonical JSON rules: sorted keys, no whitespace, 6-decimal float strings."""
    clean_chain = golden["chains"]["baseline_clean"]
    pkt0 = clean_chain["packets"][0]
    canon0 = canonical_packet_json(pkt0)

    assert canon0 == clean_chain["canonical_json_packet_0"]
    assert " " not in canon0 and "\n" not in canon0
    assert '"signature"' not in canon0
    assert '"seq":0' in canon0
    assert '"gross_load_mw":"300.000000"' in canon0

    # Check top-level keys appear in sorted order
    parsed = json.loads(canon0)
    assert list(parsed.keys()) == sorted(parsed.keys())
    assert list(parsed["values"].keys()) == sorted(parsed["values"].keys())


def test_golden_chains_cryptographic_rules(golden: dict[str, Any]) -> None:
    """Verify clean, tampered, gap, and replayed packet chains against all crypto rules."""
    pub_key = golden["meta"]["test_public_key_p256_uncompressed"]
    chains = golden["chains"]

    # 0. Baseline clean chain
    clean = chains["baseline_clean"]
    assert clean["packets"][0]["prev_hash"] == GENESIS_PREV_HASH
    assert evaluate_chain_crypto(clean["packets"], pub_key) == []

    # 1. Tampered chain (packet index 3 modified after signing)
    tampered = chains["chain_1_tampered"]
    tampered_reasons = evaluate_chain_crypto(tampered["packets"], pub_key)
    assert "SIG_INVALID" in tampered_reasons
    assert "CHAIN_BREAK" in tampered_reasons
    assert set(tampered_reasons) == set(tampered["expected_reason_codes"])

    # 2. Sequence gap chain (packet seq=4 dropped -> 7 packets total)
    gap = chains["chain_2_seq_gap"]
    assert len(gap["packets"]) == 7
    gap_reasons = evaluate_chain_crypto(gap["packets"], pub_key)
    assert "SEQ_GAP" in gap_reasons
    assert "CHAIN_BREAK" in gap_reasons
    assert set(gap_reasons) == set(gap["expected_reason_codes"])

    # 3. Replayed chain (packets at indices 4, 5 are replayed from seq=1, 2)
    replayed = chains["chain_3_replayed"]
    replayed_reasons = evaluate_chain_crypto(replayed["packets"], pub_key)
    assert "SEQ_GAP" in replayed_reasons
    assert "CHAIN_BREAK" in replayed_reasons
    assert set(replayed_reasons) == set(replayed["expected_reason_codes"])


def test_merkle_roots_and_proofs_with_odd_promotion(golden: dict[str, Any]) -> None:
    """Verify Merkle roots and OpenZeppelin proofs for all chains, including 7-leaf odd promotion."""
    for chain_name, chain in golden["chains"].items():
        pkt_hashes = [compute_packet_hash(p) for p in chain["packets"]]
        assert pkt_hashes == chain["packet_hashes"], f"Packet hash mismatch in {chain_name}"

        tree = compute_merkle_tree(pkt_hashes)
        assert tree["merkle_root"] == chain["batch"]["merkle_root"]
        assert tree["merkle_root"] == chain["merkle"]["merkle_root"]

        for proof in chain["merkle"]["proofs"]:
            expected_leaf = "0x" + keccak256(bytes.fromhex(proof["packet_hash"][2:])).hex()
            assert proof["leaf_hash"] == expected_leaf
            assert verify_oz_merkle_proof(
                proof["leaf_hash"], proof["siblings"], chain["batch"]["merkle_root"]
            ), f"Merkle proof failed for {chain_name} leaf {proof['leaf_index']}"

    # Specifically verify odd-node promotion on the 7-packet chain:
    # Level 0 has 7 nodes (index 6 promoted -> 0 siblings at level 0),
    # Level 1 has 4 nodes (paired -> 1 sibling), Level 2 has 2 nodes (paired -> 1 sibling) => 2 siblings total.
    gap_proofs = golden["chains"]["chain_2_seq_gap"]["merkle"]["proofs"]
    assert len(gap_proofs) == 7
    assert len(gap_proofs[0]["siblings"]) == 3
    assert len(gap_proofs[6]["siblings"]) == 2


def test_vote_commitment_and_verdict_rules(golden: dict[str, Any]) -> None:
    """Verify vote commitment matches keccak256(abi.encode(...)) and verdict constraints."""
    vc = golden["vote_commitment_vector"]
    v_obj = vc["verdict_object"]

    assert v_obj["verdict"] in (0, 1)
    assert 0 <= v_obj["score_bp"] <= 10000
    assert set(v_obj["reason_codes"]).issubset(ALLOWED_REASON_CODES)

    abi_hex, commitment_hex = compute_vote_commitment(
        batch_id=v_obj["batch_id"],
        model_hash_hex=v_obj["model_hash"],
        input_hash_hex=v_obj["input_hash"],
        score_bp=v_obj["score_bp"],
        verdict=v_obj["verdict"],
        salt_hex=v_obj["salt"],
    )
    assert abi_hex == vc["abi_encoded_preimage_hex"]
    assert len(bytes.fromhex(abi_hex[2:])) == 192  # 6 * 32-byte ABI words
    assert commitment_hex == v_obj["vote_commitment"]


def test_period_report_rules_and_honesty_constraints(golden: dict[str, Any]) -> None:
    """Verify period report structure, cbam_aligned == True, and absence of 'official'."""
    report = golden["report_vector"]
    assert report["cbam_aligned"] is True
    assert report["installation_id"]
    assert report["attestation_id"] >= 0
    assert 0 <= report["coverage"]["coverage_bp"] <= 10000
    assert len(report["merkle_roots"]) >= 1
    assert re.match(r"^0x[0-9a-f]{64}$", report["transaction_hashes"]["attestation_tx"])

    serialized = json.dumps(report)
    assert "official" not in serialized.lower(), "Report must never contain the word 'official'"
