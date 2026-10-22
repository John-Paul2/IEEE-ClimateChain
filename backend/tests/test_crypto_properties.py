"""Property-based tests (`hypothesis`) for VeriCEMS cryptographic telemetry and Merkle trees.

Verifies (Task 6):
1. Any untouched valid hash-chained packet sequence always verifies (`is_valid == True`).
2. Changing ANY single field (`device_id`, `seq`, `timestamp_utc`, any entry in `values`,
   `prev_hash`, or `signature`) of ANY packet in a chain is detected.
3. Deleting ANY packet from a chain is detected (`SEQ_GAP`, plus `CHAIN_BREAK` for non-final).
4. Duplicating ANY packet in a chain is detected (`SEQ_DUPLICATE`, `CHAIN_BREAK`).
5. Reordering ANY packets in a chain is detected (`SEQ_REORDER`, `CHAIN_BREAK`).
6. Replaying ANY historical packet(s) later in a chain is detected (`SEQ_DUPLICATE`,
   `SEQ_REORDER`, `TIMESTAMP_REGRESSION`, `CHAIN_BREAK`).
7. Timestamp regression (even when re-signed with the device key) is detected
   (`TIMESTAMP_REGRESSION`).
8. Merkle proofs verify for EVERY leaf of any batch size (including odd-node promotion)
   and FAIL for any altered leaf hash, packet hash, sibling hash, or Merkle root.
"""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from typing import Any

from hypothesis import given, settings, strategies as st

from backend.vericems.crypto import (
    CHAIN_BREAK,
    SEQ_DUPLICATE,
    SEQ_GAP,
    SEQ_REORDER,
    SIG_INVALID,
    TIMESTAMP_REGRESSION,
    SoftwareSecureElement,
    build_batch,
    build_hash_chain,
    build_merkle_tree,
    format_float_6,
    packet_hash,
    verify_chain,
    verify_merkle_proof,
)

# Shared deterministic test key for fast property-based testing across hundreds of examples
_PROP_SE = SoftwareSecureElement.from_golden_test_key()
_PROP_PUB = _PROP_SE.public_key()

PROPERTY_EXAMPLE_COUNTS: dict[str, int] = {}


def _record_example(test_name: str) -> None:
    PROPERTY_EXAMPLE_COUNTS[test_name] = PROPERTY_EXAMPLE_COUNTS.get(test_name, 0) + 1


# ============================================================================
# Hypothesis Strategies for Telemetry Chains
# ============================================================================

_CHANNEL_NAMES = [
    "co2_mass_short_tons",
    "gross_load_mw",
    "heat_input_mmbtu",
    "so2_mass_lbs",
    "nox_mass_lbs",
    "synthetic_flue_temp_c",
    "synthetic_fuel_flow_mmbtu_indep",
    "synthetic_stack_flow_kscfm",
    "synthetic_stack_o2_pct",
]

st_device_id = st.from_regex(r"^DEV-[A-Z0-9]{3,10}$", fullmatch=True)

st_channel_values = st.dictionaries(
    keys=st.sampled_from(_CHANNEL_NAMES),
    values=st.floats(
        min_value=0.0,
        max_value=50000.0,
        allow_nan=False,
        allow_infinity=False,
        width=32,
    ),
    min_size=1,
    max_size=6,
)


@st.composite
def st_valid_chain(
    draw: st.DrawFn, min_len: int = 1, max_len: int = 10
) -> list[dict[str, Any]]:
    """Generate a valid signed, hash-chained list of packets with ascending timestamps."""
    length = draw(st.integers(min_value=min_len, max_value=max_len))
    device_id = draw(st_device_id)
    base_dt = datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
    elapsed_sec = 0
    records: list[dict[str, Any]] = []
    for _ in range(length):
        step = draw(st.integers(min_value=1, max_value=3600))
        elapsed_sec += step
        ts = (base_dt + timedelta(seconds=elapsed_sec)).strftime("%Y-%m-%dT%H:%M:%SZ")
        vals = draw(st_channel_values)
        records.append({"timestamp_utc": ts, "values": vals})
    return build_hash_chain(
        device_id=device_id,
        records=records,
        secure_element=_PROP_SE,
    )


def _flip_hex_char(hex_str: str, pos_offset: int) -> str:
    """Flip one hex nibble in a `0x`-prefixed lowercase hex string."""
    body = list(hex_str[2:])
    idx = pos_offset % len(body)
    orig = body[idx]
    body[idx] = "1" if orig != "1" else "2"
    return "0x" + "".join(body)


# ============================================================================
# Property Tests
# ============================================================================

@settings(max_examples=100, deadline=None, derandomize=True)
@given(chain=st_valid_chain(min_len=1, max_len=10))
def test_prop_untouched_chain_always_verifies(chain: list[dict[str, Any]]) -> None:
    """Property 1: Every untouched chain produced by `build_hash_chain` verifies cleanly."""
    _record_example("untouched_chain_verifies")
    batch = build_batch(chain, batch_id=1)
    res = verify_chain(chain, _PROP_PUB, batch=batch)
    assert res.is_valid is True
    assert res.problems == []
    assert res.reason_codes == []


@settings(max_examples=120, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=1, max_len=8),
    idx_seed=st.integers(min_value=0, max_value=1000),
    field_name=st.sampled_from(
        ["device_id", "seq", "timestamp_utc", "values", "prev_hash", "signature"]
    ),
    delta_int=st.integers(min_value=1, max_value=1000),
)
def test_prop_changing_any_single_field_is_detected(
    chain: list[dict[str, Any]],
    idx_seed: int,
    field_name: str,
    delta_int: int,
) -> None:
    """Property 2: Mutating ANY single field of ANY packet in a valid chain is detected."""
    _record_example("single_field_tamper_detected")
    target_idx = idx_seed % len(chain)
    mutated = copy.deepcopy(chain)
    pkt = mutated[target_idx]

    if field_name == "device_id":
        pkt["device_id"] = pkt["device_id"] + "-TAMPER"
    elif field_name == "seq":
        pkt["seq"] = pkt["seq"] + delta_int
    elif field_name == "timestamp_utc":
        dt = datetime.strptime(pkt["timestamp_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
        pkt["timestamp_utc"] = (dt + timedelta(seconds=delta_int)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    elif field_name == "values":
        first_ch = sorted(pkt["values"].keys())[0]
        orig_val = float(pkt["values"][first_ch])
        new_val = round(orig_val + max(0.01, delta_int * 0.125), 6)
        if format_float_6(new_val) == format_float_6(orig_val):
            new_val = orig_val + 1.0
        pkt["values"][first_ch] = new_val
    elif field_name == "prev_hash":
        pkt["prev_hash"] = _flip_hex_char(pkt["prev_hash"], delta_int)
    elif field_name == "signature":
        pkt["signature"] = _flip_hex_char(pkt["signature"], delta_int)

    res = verify_chain(mutated, _PROP_PUB, expected_count=len(chain))
    assert res.is_valid is False
    assert SIG_INVALID in res.reason_codes
    if field_name != "signature" and target_idx + 1 < len(chain):
        assert CHAIN_BREAK in res.reason_codes
    if field_name == "prev_hash":
        assert CHAIN_BREAK in res.reason_codes


@settings(max_examples=100, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=2, max_len=10),
    del_seed=st.integers(min_value=0, max_value=1000),
)
def test_prop_deleting_any_packet_is_detected(
    chain: list[dict[str, Any]], del_seed: int
) -> None:
    """Property 3: Deleting any packet from a chain is always detected."""
    _record_example("delete_packet_detected")
    del_idx = del_seed % len(chain)
    original_batch = build_batch(chain, batch_id=1)
    shortened = [copy.deepcopy(p) for i, p in enumerate(chain) if i != del_idx]

    # When deleted from index < len(chain) - 1, detected even without batch metadata;
    # when deleted from the tail (del_idx == len(chain) - 1), detected against batch metadata.
    res = verify_chain(shortened, _PROP_PUB, batch=original_batch)
    assert res.is_valid is False
    assert SEQ_GAP in res.reason_codes
    if del_idx < len(chain) - 1:
        res_no_batch = verify_chain(shortened, _PROP_PUB)
        assert res_no_batch.is_valid is False
        assert SEQ_GAP in res_no_batch.reason_codes
        assert CHAIN_BREAK in res_no_batch.reason_codes


@settings(max_examples=100, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=1, max_len=10),
    src_seed=st.integers(min_value=0, max_value=1000),
    ins_seed=st.integers(min_value=0, max_value=1000),
)
def test_prop_duplicating_any_packet_is_detected(
    chain: list[dict[str, Any]], src_seed: int, ins_seed: int
) -> None:
    """Property 4: Duplicating any packet at any position in a chain is detected."""
    _record_example("duplicate_packet_detected")
    src_idx = src_seed % len(chain)
    ins_idx = ins_seed % (len(chain) + 1)
    duplicated = copy.deepcopy(chain)
    duplicated.insert(ins_idx, copy.deepcopy(chain[src_idx]))

    res = verify_chain(duplicated, _PROP_PUB)
    assert res.is_valid is False
    assert SEQ_DUPLICATE in res.reason_codes
    assert CHAIN_BREAK in res.reason_codes


@settings(max_examples=100, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=2, max_len=10),
    idx_a_seed=st.integers(min_value=0, max_value=1000),
    offset_seed=st.integers(min_value=1, max_value=1000),
)
def test_prop_reordering_packets_is_detected(
    chain: list[dict[str, Any]], idx_a_seed: int, offset_seed: int
) -> None:
    """Property 5: Swapping/reordering any two distinct packets in a chain is detected."""
    _record_example("reorder_packets_detected")
    n = len(chain)
    i = idx_a_seed % n
    j = (i + (offset_seed % (n - 1)) + 1) % n
    reordered = copy.deepcopy(chain)
    reordered[i], reordered[j] = reordered[j], reordered[i]

    res = verify_chain(reordered, _PROP_PUB)
    assert res.is_valid is False
    assert SEQ_REORDER in res.reason_codes
    assert CHAIN_BREAK in res.reason_codes
    assert TIMESTAMP_REGRESSION in res.reason_codes


@settings(max_examples=100, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=3, max_len=10),
    old_seed=st.integers(min_value=0, max_value=1000),
    target_seed=st.integers(min_value=0, max_value=1000),
)
def test_prop_replaying_historical_packets_is_detected(
    chain: list[dict[str, Any]], old_seed: int, target_seed: int
) -> None:
    """Property 6: Replacing a later packet with an earlier historical packet is detected."""
    _record_example("replay_packets_detected")
    n = len(chain)
    old_idx = old_seed % (n - 1)
    later_idx = old_idx + 1 + (target_seed % (n - 1 - old_idx))

    replayed = copy.deepcopy(chain)
    replayed[later_idx] = copy.deepcopy(chain[old_idx])

    res = verify_chain(replayed, _PROP_PUB)
    assert res.is_valid is False
    assert SEQ_DUPLICATE in res.reason_codes
    assert CHAIN_BREAK in res.reason_codes
    if later_idx > old_idx + 1:
        assert SEQ_REORDER in res.reason_codes
        assert TIMESTAMP_REGRESSION in res.reason_codes
    if later_idx < n - 1:
        assert SEQ_GAP in res.reason_codes


@settings(max_examples=80, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=2, max_len=8),
    reg_seed=st.integers(min_value=1, max_value=1000),
)
def test_prop_timestamp_regression_with_valid_signatures_is_detected(
    chain: list[dict[str, Any]], reg_seed: int
) -> None:
    """Property 7: Even if re-signed with the device key, timestamp regression is detected."""
    _record_example("timestamp_regression_detected")
    reg_idx = 1 + (reg_seed % (len(chain) - 1))
    records = [
        {"timestamp_utc": p["timestamp_utc"], "values": p["values"]} for p in chain
    ]
    prev_dt = datetime.strptime(
        records[reg_idx - 1]["timestamp_utc"], "%Y-%m-%dT%H:%M:%SZ"
    ).replace(tzinfo=timezone.utc)
    records[reg_idx]["timestamp_utc"] = (prev_dt - timedelta(seconds=10)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    resigned_chain = build_hash_chain(
        device_id=chain[0]["device_id"],
        records=records,
        secure_element=_PROP_SE,
    )
    res = verify_chain(resigned_chain, _PROP_PUB)
    assert res.is_valid is False
    assert TIMESTAMP_REGRESSION in res.reason_codes
    assert SIG_INVALID not in res.reason_codes


@settings(max_examples=100, deadline=None, derandomize=True)
@given(
    chain=st_valid_chain(min_len=1, max_len=15),
    leaf_seed=st.integers(min_value=0, max_value=1000),
    nibble_seed=st.integers(min_value=0, max_value=1000),
)
def test_prop_merkle_proofs_verify_and_reject_any_tamper(
    chain: list[dict[str, Any]], leaf_seed: int, nibble_seed: int
) -> None:
    """Property 8: Merkle proofs verify for all leaves and fail on any altered leaf/sibling/root."""
    _record_example("merkle_proof_integrity")
    tree = build_merkle_tree(chain)

    # Every leaf proof in the batch must verify
    for idx in range(len(chain)):
        proof = tree.get_proof(idx)
        assert verify_merkle_proof(proof, merkle_root=tree.merkle_root) is True

    target_idx = leaf_seed % len(chain)
    valid_proof = tree.get_proof(target_idx)

    # 1. Altered leaf_hash must fail
    bad_leaf_proof = copy.deepcopy(valid_proof)
    bad_leaf_proof["leaf_hash"] = _flip_hex_char(bad_leaf_proof["leaf_hash"], nibble_seed)
    assert verify_merkle_proof(bad_leaf_proof, merkle_root=tree.merkle_root) is False

    # 2. Altered packet_hash must fail
    bad_pkt_proof = copy.deepcopy(valid_proof)
    bad_pkt_proof["packet_hash"] = _flip_hex_char(bad_pkt_proof["packet_hash"], nibble_seed)
    assert verify_merkle_proof(bad_pkt_proof, merkle_root=tree.merkle_root) is False

    # 3. Altered merkle_root must fail
    bad_root = _flip_hex_char(tree.merkle_root, nibble_seed)
    assert verify_merkle_proof(valid_proof, merkle_root=bad_root) is False

    # 4. Altered sibling or dropped sibling (when tree has >= 2 leaves) must fail
    if len(valid_proof["siblings"]) > 0:
        sib_idx = nibble_seed % len(valid_proof["siblings"])
        bad_sib_proof = copy.deepcopy(valid_proof)
        bad_sib_proof["siblings"][sib_idx] = _flip_hex_char(
            bad_sib_proof["siblings"][sib_idx], nibble_seed
        )
        assert verify_merkle_proof(bad_sib_proof, merkle_root=tree.merkle_root) is False

        dropped_sib_proof = copy.deepcopy(valid_proof)
        del dropped_sib_proof["siblings"][sib_idx]
        assert verify_merkle_proof(dropped_sib_proof, merkle_root=tree.merkle_root) is False

    # 5. Added extra sibling must fail
    extra_sib_proof = copy.deepcopy(valid_proof)
    extra_sib_proof["siblings"].append(packet_hash(chain[0]))
    assert verify_merkle_proof(extra_sib_proof, merkle_root=tree.merkle_root) is False


def test_total_property_examples_summary() -> None:
    """Verify that all 8 property-based tests executed their full example budgets."""
    total_examples = sum(PROPERTY_EXAMPLE_COUNTS.values())
    assert len(PROPERTY_EXAMPLE_COUNTS) == 8
    assert total_examples >= 800, (
        f"Expected at least 800 property test examples across 8 properties, got {total_examples}"
    )
