"""Unit and integration tests for ScenarioEngine (`backend.vericems.scenario`).

Verifies:
1. Step-by-step execution across all 7 story steps against a local Anvil node.
2. Anvil on-chain state updates (BatchAnchor, VerifierQuorum, Challenge, BondVault slashing, Attestation).
3. Reset reliability: running the story twice in a row produces identical on-chain and off-chain results.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Iterator

import pytest

from backend.vericems.chain_adapter import AnvilProcess, ChainAdapter, find_free_port
from backend.vericems.demo_clock import DemoClock
from backend.vericems.gateway import GatewaySimulator
from backend.vericems.orchestrator import Orchestrator
from backend.vericems.scenario import ScenarioEngine
from backend.vericems.store import EventStore
from backend.vericems.verifier_node import VerifierCommittee

INSTALLATION_ID = "INST-CAMPD-1073"
DEVICE_ID = "DEV-CAMPD-1073-3"


@pytest.fixture()
def scenario_env(tmp_path: Path) -> Iterator[ScenarioEngine]:
    anvil = AnvilProcess(port=find_free_port(), log_path=tmp_path / "anvil.log")
    rpc_url = anvil.start()
    try:
        adapter = ChainAdapter(mode="anvil", rpc_url=rpc_url)
        adapter.deploy_contracts_direct(profile="demo")
        gateway = GatewaySimulator(1073, 3, device_id=DEVICE_ID)
        adapter.ensure_device_and_stakes(
            device_id=DEVICE_ID,
            installation_id=INSTALLATION_ID,
            public_key_p256=gateway.public_key,
        )
        store = EventStore(tmp_path / "scenario_test.db")
        orch = Orchestrator(
            adapter=adapter,
            store=store,
            committee=VerifierCommittee(adapter.verifier_addresses),
            gateway=gateway,
            clock=DemoClock.from_yaml(),
            installation_id=INSTALLATION_ID,
            device_id=DEVICE_ID,
        )
        engine = ScenarioEngine(orch, auto_snapshot=True)
        yield engine
        store.close()
    finally:
        anvil.stop()


def test_scenario_full_story_and_reset_repeatability(scenario_env: ScenarioEngine) -> None:
    engine = scenario_env
    orch = engine.orch
    initial_bond = orch.adapter.operator_bond_of(INSTALLATION_ID)
    assert initial_bond == 2_000_000_000_000_000_000

    async def run_story() -> dict[str, Any]:
        # Step 1: Normal batches flow
        s1 = await engine.step()
        assert s1["current_step"] == 1
        b1 = engine._step_results[1]
        assert b1["status"] == "Verified"
        assert b1["matching_votes"] >= 3

        # Step 2: Constant scaling attack injected
        s2 = await engine.step()
        assert s2["current_step"] == 2
        assert orch.attack == "constant_scaling"

        # Step 3: Attack detected & quarantined
        s3 = await engine.step()
        assert s3["current_step"] == 3
        b2 = engine._step_results[3]
        assert b2["status"] == "Quarantined"
        assert len(b2["reason_codes"]) > 0

        # Step 4: Dispute, arbiters uphold, operator bond slashed
        s4 = await engine.step()
        assert s4["current_step"] == 4
        ch = engine._step_results[4]
        assert ch["resolve"]["batch_status"] == "Slashed"
        bond_after_slash = orch.adapter.operator_bond_of(INSTALLATION_ID)
        assert bond_after_slash < initial_bond

        # Step 5: Period report generated & attested
        s5 = await engine.step()
        assert s5["current_step"] == 5
        rep = engine._step_results[5]
        assert rep["report"]["cbam_aligned"] is True
        assert rep["report"]["coverage"]["coverage_bp"] == 5000  # 1 of 2 batches verified

        # Step 6: Importer verification
        s6 = await engine.step()
        assert s6["current_step"] == 6
        v_res = engine._step_results[6]
        assert v_res["verify_valid"]["valid"] is True
        assert v_res["verify_tampered"]["valid"] is False

        # Step 7: Benchmark disclosure
        s7 = await engine.step()
        assert s7["current_step"] == 7
        assert s7["status"] == "completed"

        return {
            "b1_root": b1.get("merkle_root") or orch.store.get_batch(1)["merkle_root"],
            "b2_root": b2.get("merkle_root") or orch.store.get_batch(2)["merkle_root"],
            "b2_reasons": b2["reason_codes"],
            "bond_slashed": bond_after_slash,
            "attestation_id": rep["report"]["attestation_id"],
            "period_root": rep["report"]["merkle_roots"],
        }

    # RUN 1
    run1 = asyncio.run(run_story())

    # RESET
    reset_res = asyncio.run(engine.reset())
    assert reset_res["current_step"] == 0
    assert reset_res["status"] == "idle"
    assert len(orch.store.list_batches()) == 0
    assert orch.gateway._next_seq == 0
    assert orch.attack == "none"
    restored_bond = orch.adapter.operator_bond_of(INSTALLATION_ID)
    assert restored_bond == initial_bond, "Reset must restore initial bond via EVM revert"

    # RUN 2 (Must be identical)
    run2 = asyncio.run(run_story())

    assert run1["b1_root"] == run2["b1_root"], "Batch 1 Merkle root must match across runs"
    assert run1["b2_root"] == run2["b2_root"], "Batch 2 Merkle root must match across runs"
    assert run1["b2_reasons"] == run2["b2_reasons"], "Batch 2 quarantine reasons must match"
    assert run1["bond_slashed"] == run2["bond_slashed"], "Slashed bond amount must match"
    assert run1["attestation_id"] == run2["attestation_id"], "Attestation ID must match"
    assert run1["period_root"] == run2["period_root"], "Period roots must match"
