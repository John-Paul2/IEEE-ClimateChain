"""Record the importer-portal fixtures from a real local-anvil run (`scripts/make_importer_fixtures.py`).

What this produces (all under `web/`, consumed by the importer portal and its Playwright tests):

- `web/e2e/fixtures/valid_report_payload.json`  `{report, envelope}` from `Orchestrator.make_report`
  (one honest batch + one attacked batch, so the report has a quarantined batch with reason codes).
- `web/e2e/fixtures/anvil_state.json`           `anvil_dumpState` of the chain after that run, so the
  Playwright tests can start a *real* local anvil holding exactly the on-chain data the report refers to.
- `web/public/offline_snapshot.json`            recorded reads of `BatchAnchor` / `Attestation` used by
  the portal's "OFFLINE SNAPSHOT" mode.

Data origin: the telemetry is real US EPA CAMPD data (facility 1073, unit 3) replayed by the gateway; the
`synthetic_*` channels, the secure element, the attack and `production_tonnes` are SYNTHETIC / simulated.
The chain is a local anvil node (chain id 31337). Nothing here is a mainnet or testnet record.

Run from the repository root:  `.venv/Scripts/python.exe scripts/make_importer_fixtures.py`
"""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.vericems.chain_adapter import AnvilProcess, ChainAdapter, find_free_port  # noqa: E402
from backend.vericems.demo_clock import DemoClock  # noqa: E402
from backend.vericems.gateway import GatewaySimulator  # noqa: E402
from backend.vericems.orchestrator import Orchestrator  # noqa: E402
from backend.vericems.store import EventStore  # noqa: E402
from backend.vericems.verifier_node import VerifierCommittee  # noqa: E402

INSTALLATION_ID = "INST-CAMPD-1073"
DEVICE_ID = "DEV-CAMPD-1073-3"
PERIOD_LABEL = "2026-Q3"
SYNTHETIC_PRODUCTION_TONNES = 500.0  # SYNTHETIC input: CAMPD is a power plant, it has no product mass.

FIXTURES_DIR = REPO_ROOT / "web" / "e2e" / "fixtures"
PUBLIC_DIR = REPO_ROOT / "web" / "public"
STATUS_NAMES = {0: "None", 1: "Anchored", 2: "Verified", 3: "Quarantined", 4: "Slashed", 5: "Cleared"}


def rpc_call(rpc_url: str, method: str, params: list[Any]) -> Any:
    """Plain JSON-RPC call against the local anvil node."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    if "error" in payload:
        raise RuntimeError(f"{method} failed: {payload['error']}")
    return payload["result"]


async def run_scenario(orch: Orchestrator) -> dict[str, Any]:
    honest = await orch.run_batch()
    orch.set_attack("scale_co2_30pct")
    attacked = await orch.run_batch()
    orch.set_attack("none")
    await orch.resolve_challenge(attacked["batch_id"], uphold_fraud=True)
    payload = await orch.make_report(PERIOD_LABEL, production_tonnes=SYNTHETIC_PRODUCTION_TONNES)
    verification = await orch.verify_report(payload)
    return {"honest": honest, "attacked": attacked, "payload": payload, "verification": verification}


def record_snapshot(
    adapter: ChainAdapter, rpc_url: str, payload: dict[str, Any], batch_ids: list[int]
) -> dict[str, Any]:
    """Read BatchAnchor / Attestation state and the proof checks into a snapshot object."""
    report = payload["report"]
    attestation_id = int(report["attestation_id"])
    attestation = adapter.get_attestation_on_chain(attestation_id)
    batches: dict[str, Any] = {}
    for batch_id in batch_ids:
        rec = adapter.get_batch_on_chain(batch_id)
        batches[str(batch_id)] = {
            "batchId": str(rec["batch_id"]),
            "deviceId": rec["device_id_bytes32"],
            "installationId": rec["installation_id_bytes32"],
            "merkleRoot": rec["merkle_root"],
            "firstSeq": str(rec["first_seq"]),
            "lastSeq": str(rec["last_seq"]),
            "count": rec["count"],
            "anchoredAt": str(rec["anchored_at"]),
            "status": rec["status"],
        }
    inclusion: list[dict[str, Any]] = []
    for bundle in payload["envelope"].get("merkle_proofs", []):
        proof = bundle["sample_proof"]
        inclusion.append(
            {
                "batchId": str(bundle["batch_id"]),
                "packetHash": proof["packet_hash"],
                "siblings": list(proof["siblings"]),
                "result": bool(
                    adapter.verify_packet_inclusion_on_chain(
                        int(bundle["batch_id"]), proof["packet_hash"], proof["siblings"]
                    )
                ),
            }
        )
    return {
        "snapshot_version": "1.0.0",
        "label": "OFFLINE SNAPSHOT (recorded from a local anvil node; not live chain data)",
        "recorded_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "chain_id": int(rpc_call(rpc_url, "eth_chainId", []), 16),
        "network": "local-anvil",
        "block_number": int(rpc_call(rpc_url, "eth_blockNumber", []), 16),
        "contracts": {
            "BatchAnchor": adapter.contracts["BatchAnchor"].address,
            "Attestation": adapter.contracts["Attestation"].address,
        },
        "data_origin": {
            "telemetry": "real: US EPA CAMPD hourly data (facility 1073, unit 3), replayed",
            "synthetic_channels": "synthetic: synthetic_* channels are simulated",
            "production_tonnes": "synthetic: operator-supplied input, not measured",
            "signing": "synthetic: software-simulated secure element, not hardware",
        },
        "attestations": {
            str(attestation_id): {
                "attestationId": str(attestation["attestation_id"]),
                "installationId": attestation["installation_id_bytes32"],
                "periodLabel": attestation["period_label"],
                "totalEmissionsKgCo2e": str(attestation["total_emissions_kg_co2e"]),
                "productionKg": str(attestation["production_kg"]),
                "coverageBp": attestation["coverage_bp"],
                "periodMerkleRoot": attestation["period_merkle_root"],
                "attestedAt": str(attestation["attested_at"]),
                "attestedBy": attestation["attested_by"],
                "batchIds": [str(b) for b in attestation["verified_batch_ids"]],
            }
        },
        "batches": batches,
        "packet_inclusion": inclusion,
    }


def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    anvil = AnvilProcess(port=find_free_port())
    rpc_url = anvil.start()
    try:
        adapter = ChainAdapter(mode="anvil", rpc_url=rpc_url)
        deployment = adapter.deploy_contracts_direct(profile="demo")
        gateway = GatewaySimulator(1073, 3, device_id=DEVICE_ID)
        adapter.ensure_device_and_stakes(
            device_id=DEVICE_ID, installation_id=INSTALLATION_ID, public_key_p256=gateway.public_key
        )
        with tempfile.TemporaryDirectory() as tmp:
            store = EventStore(Path(tmp) / "fixtures.db")
            orch = Orchestrator(
                adapter=adapter,
                store=store,
                committee=VerifierCommittee(adapter.verifier_addresses),
                gateway=gateway,
                clock=DemoClock.from_yaml(),
                installation_id=INSTALLATION_ID,
                device_id=DEVICE_ID,
            )
            result = asyncio.run(run_scenario(orch))
            store.close()

        payload = result["payload"]
        if not result["verification"].get("valid"):
            raise SystemExit(f"Backend verification of the fresh report failed: {result['verification']}")

        batch_ids = sorted(
            {int(q["batch_id"]) for q in payload["report"]["quarantined_batches"]}
            | set(payload["envelope"]["verified_batch_ids"])
        )
        snapshot = record_snapshot(adapter, rpc_url, payload, batch_ids)
        state_hex = rpc_call(rpc_url, "anvil_dumpState", [])

        contracts = deployment.get("contracts", deployment) if isinstance(deployment, dict) else {}
        (FIXTURES_DIR / "valid_report_payload.json").write_text(
            json.dumps({"report": payload["report"], "envelope": payload["envelope"]}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (FIXTURES_DIR / "anvil_state.json").write_text(
            json.dumps(
                {
                    "note": "anvil_dumpState output; load with anvil_loadState on a fresh local anvil (chain id 31337).",
                    "contracts": snapshot["contracts"],
                    "state_hex": state_hex,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (PUBLIC_DIR / "offline_snapshot.json").write_text(
            json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print("deployed contracts:", json.dumps(contracts, sort_keys=True)[:400])
        print("report coverage:", payload["report"]["coverage"])
        print("report totals:", payload["report"]["totals"])
        print("quarantined:", payload["report"]["quarantined_batches"])
        print("attestation_id:", payload["report"]["attestation_id"])
        print("snapshot block:", snapshot["block_number"], "contracts:", snapshot["contracts"])
        print("state_hex bytes:", len(state_hex))
    finally:
        anvil.stop()


if __name__ == "__main__":
    main()
