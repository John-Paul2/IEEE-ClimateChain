"""Tests for the VeriCEMS Gateway Simulator (`backend.vericems.gateway`).

Verifies:
1. Replaying real processed US EPA CAMPD records (`data/processed/units/*.parquet`) for
   chosen facilities/units produces valid signed, hash-chained packets and Merkle batches.
2. Configurable replay rate (`rate_hz` and `interval_seconds`).
3. `before_sign_hook` (**Insider case**): modifying `co2_mass_short_tons` BEFORE signing
   scales down reported CO2 while keeping ECDSA P-256 signatures and `prev_hash` links
   cryptographically valid (`verify_chain` returns `is_valid=True`).
4. `after_sign_hook` (**Man-in-the-middle case**): modifying, dropping, duplicating, or
   replaying packets AFTER signing is deterministically caught by `verify_chain`.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.vericems.crypto import (
    CHAIN_BREAK,
    SEQ_DUPLICATE,
    SEQ_GAP,
    SEQ_REORDER,
    SIG_INVALID,
    SoftwareSecureElement,
    verify_chain,
    verify_merkle_proof,
)
from backend.vericems.gateway import (
    GatewaySimulator,
    REAL_CAMPD_CHANNELS,
    SYNTHETIC_CHANNELS,
    load_unit_records,
)


def test_gateway_replays_real_campd_records_cleanly() -> None:
    """Replay real CAMPD records from Facility 1073 Unit 3 and Facility 6165 Unit 1."""
    se = SoftwareSecureElement(seed_phrase=b"test-gateway-key-1073-3")
    gw = GatewaySimulator(
        facility_id=1073,
        unit_id="3",
        secure_element=se,
        include_synthetic_channels=True,
    )

    bundle = gw.replay_batch(batch_id=1, batch_size=8, offset=0)
    packets = bundle["packets"]
    batch = bundle["batch"]
    merkle = bundle["merkle"]

    assert len(packets) == 8
    assert batch["count"] == 8
    assert batch["first_seq"] == 0
    assert batch["last_seq"] == 7
    assert batch["merkle_root"] == merkle["merkle_root"]

    # Check real and synthetic channels are populated and properly named
    for pkt in packets:
        for real_ch in REAL_CAMPD_CHANNELS:
            assert real_ch in pkt["values"]
        for synth_ch in SYNTHETIC_CHANNELS:
            assert synth_ch.startswith("synthetic_")
            assert synth_ch in pkt["values"]

    # Verify the untouched chain and all Merkle inclusion proofs
    res = verify_chain(packets, gw.public_key, batch=batch)
    assert res.is_valid is True
    assert res.problems == []

    for proof in merkle["proofs"]:
        assert verify_merkle_proof(proof, merkle_root=batch["merkle_root"]) is True


def test_gateway_before_sign_hook_insider_attack() -> None:
    """Verify insider tampering BEFORE signing passes cryptographic verification."""
    se = SoftwareSecureElement(seed_phrase=b"test-gateway-insider")
    clean_records = load_unit_records(facility_id=6165, unit_id="1", limit=8)

    def insider_scale_co2(pkt: dict[str, Any], idx: int) -> dict[str, Any]:
        if idx in (2, 3, 4):
            pkt["values"]["co2_mass_short_tons"] = round(
                pkt["values"]["co2_mass_short_tons"] * 0.70, 6
            )
        return pkt

    gw = GatewaySimulator(
        facility_id=6165,
        unit_id="1",
        secure_element=se,
        before_sign_hook=insider_scale_co2,
    )
    packets = gw.replay_packets(limit=8, records=clean_records)
    assert len(packets) == 8

    # Verify CO2 was scaled down by 30% on indices 2, 3, 4
    for i in (2, 3, 4):
        expected_scaled = round(clean_records[i]["values"]["co2_mass_short_tons"] * 0.70, 6)
        assert packets[i]["values"]["co2_mass_short_tons"] == pytest.approx(expected_scaled)

    # Because tampering happened BEFORE signing, the signature and hash chain are valid!
    res = verify_chain(packets, gw.public_key)
    assert res.is_valid is True
    assert res.problems == []
    assert res.reason_codes == []


def test_gateway_after_sign_hook_mitm_attacks() -> None:
    """Verify man-in-the-middle tampering AFTER signing is caught by `verify_chain`."""
    se = SoftwareSecureElement(seed_phrase=b"test-gateway-mitm")
    clean_records = load_unit_records(facility_id=6165, unit_id="1", limit=8)

    # 1. MITM scales CO2 on packet index 3 after signing -> SIG_INVALID + CHAIN_BREAK
    def mitm_scale_co2(pkt: dict[str, Any], idx: int) -> dict[str, Any]:
        if idx == 3:
            pkt["values"]["co2_mass_short_tons"] = round(
                pkt["values"]["co2_mass_short_tons"] * 0.70, 6
            )
        return pkt

    gw_scale = GatewaySimulator(
        facility_id=6165,
        unit_id="1",
        secure_element=se,
        after_sign_hook=mitm_scale_co2,
    )
    pkts_scale = gw_scale.replay_packets(limit=8, records=clean_records)
    res_scale = verify_chain(pkts_scale, gw_scale.public_key)
    assert res_scale.is_valid is False
    assert SIG_INVALID in res_scale.reason_codes
    assert CHAIN_BREAK in res_scale.reason_codes

    # 2. MITM drops packet index 4 after signing -> SEQ_GAP + CHAIN_BREAK
    def mitm_drop_pkt(pkt: dict[str, Any], idx: int) -> dict[str, Any] | None:
        if idx == 4:
            return None
        return pkt

    gw_drop = GatewaySimulator(
        facility_id=6165,
        unit_id="1",
        secure_element=se,
        after_sign_hook=mitm_drop_pkt,
    )
    pkts_drop = gw_drop.replay_packets(limit=8, records=clean_records)
    assert len(pkts_drop) == 7
    res_drop = verify_chain(pkts_drop, gw_drop.public_key)
    assert res_drop.is_valid is False
    assert SEQ_GAP in res_drop.reason_codes
    assert CHAIN_BREAK in res_drop.reason_codes

    # 3. MITM duplicates packet index 2 on the wire -> SEQ_DUPLICATE + CHAIN_BREAK
    def mitm_dup_pkt(pkt: dict[str, Any], idx: int) -> list[dict[str, Any]]:
        if idx == 2:
            return [pkt, pkt]
        return [pkt]

    gw_dup = GatewaySimulator(
        facility_id=6165,
        unit_id="1",
        secure_element=se,
        after_sign_hook=mitm_dup_pkt,
    )
    pkts_dup = gw_dup.replay_packets(limit=8, records=clean_records)
    assert len(pkts_dup) == 9
    res_dup = verify_chain(pkts_dup, gw_dup.public_key)
    assert res_dup.is_valid is False
    assert SEQ_DUPLICATE in res_dup.reason_codes
    assert CHAIN_BREAK in res_dup.reason_codes

    # 4. MITM stream hook reorders packets 1 and 2 -> SEQ_REORDER + CHAIN_BREAK
    def mitm_swap_stream(pkts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        pkts[1], pkts[2] = pkts[2], pkts[1]
        return pkts

    gw_swap = GatewaySimulator(
        facility_id=6165,
        unit_id="1",
        secure_element=se,
        after_sign_stream_hook=mitm_swap_stream,
    )
    pkts_swap = gw_swap.replay_packets(limit=8, records=clean_records)
    res_swap = verify_chain(pkts_swap, gw_swap.public_key)
    assert res_swap.is_valid is False
    assert SEQ_REORDER in res_swap.reason_codes
    assert CHAIN_BREAK in res_swap.reason_codes


def test_gateway_configurable_rate_and_sleep_hook() -> None:
    """Verify configurable `rate_hz` pacing invokes `sleep_fn` between emitted packets."""
    recorded_sleeps: list[float] = []
    gw = GatewaySimulator(
        facility_id=1073,
        unit_id="3",
        rate_hz=4.0,  # 0.25 seconds between packets
        sleep_fn=recorded_sleeps.append,
        include_synthetic_channels=False,
    )
    pkts = gw.replay_packets(limit=5)
    assert len(pkts) == 5
    # 4 intervals between 5 packets
    assert len(recorded_sleeps) == 4
    assert all(s == pytest.approx(0.25) for s in recorded_sleeps)
    # Without synthetic channels, no synthetic_* keys should be present
    assert all(not k.startswith("synthetic_") for k in pkts[0]["values"])
