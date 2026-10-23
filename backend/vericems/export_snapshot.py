"""Export a recorded real run for the web UI (`backend.vericems.export_snapshot`).

Runs the honest path (one clean batch) and the attack path (one batch with a
constant-scaling insider attack, quarantine, operator dispute, arbiter slash),
then the period report and its verification, against the real backend and a real
EVM node. Everything is written to one JSON file that the UI replays.

Chain selection: this exporter uses a local anvil node. `ChainAdapter` signs through
node-unlocked accounts (`transact`), which a public testnet does not provide, so the
orchestrator cannot drive a public testnet. The snapshot records the chain it really
ran on; the UI never assumes a network name.

Usage:
    python -m backend.vericems.export_snapshot [--out web/public/snapshots/real-run.json]
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
from typing import Any

from backend.vericems.chain_adapter import AnvilProcess, ChainAdapter
from backend.vericems.demo_clock import DemoClock
from backend.vericems.gateway import GatewaySimulator
from backend.vericems.orchestrator import Orchestrator
from backend.vericems.store import EventStore
from backend.vericems.verifier_node import VerifierCommittee

INSTALLATION_ID = "INST-CAMPD-1073"
DEVICE_ID = "DEV-CAMPD-1073-3"
FACILITY_ID = 1073
UNIT_ID = 3
REPORT_PERIOD_LABEL = "2026-Q3"
REPORT_PRODUCTION_TONNES = 500.0
SNAPSHOT_SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUT = REPO_ROOT / "web" / "public" / "snapshots" / "real-run.json"


def build_chain_meta(adapter: ChainAdapter, chain_id: int) -> dict[str, Any]:
    """Chain identity taken from the adapter and its deployments file (no literals)."""
    deployment = adapter.deployment
    return {
        "name": deployment.get("chainName") or f"local {adapter.network}",
        "chain_id": chain_id,
        "mode": adapter.mode,
        "explorer_base_url": deployment.get("explorerBaseUrl"),
        "contracts": deployment.get("contracts", {}),
    }


def collect_tx_hashes(
    events: list[dict[str, Any]], challenges: list[dict[str, Any]], batches: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Every transaction hash seen in the run, labelled by where it came from."""
    found: list[dict[str, Any]] = []
    for ev in events:
        tx = (ev.get("data") or {}).get("tx_hash")
        if tx:
            found.append({"label": ev["type"], "batch_id": ev.get("batch_id"), "tx_hash": tx})
    for batch in batches:
        for key in ("anchor_tx_hash", "finalize_tx_hash"):
            if batch.get(key):
                found.append({"label": key, "batch_id": batch["batch_id"], "tx_hash": batch[key]})
    for ch in challenges:
        for label, tx in (ch.get("tx_hashes") or {}).items():
            found.append({"label": f"challenge_{label}", "batch_id": ch["batch_id"], "tx_hash": tx})
    unique: dict[str, dict[str, Any]] = {}
    for item in found:
        unique.setdefault(item["tx_hash"], item)
    return list(unique.values())


async def run_real_path(orch: Orchestrator) -> dict[str, Any]:
    """Honest batch, attacked batch, dispute, slash, report, verification (valid and tampered)."""
    orch.set_attack("none")
    honest = await orch.run_batch()
    orch.set_attack("constant_scaling")
    attacked = await orch.run_batch()
    await orch.dispute(attacked["batch_id"])
    await orch.resolve_challenge(attacked["batch_id"], uphold_fraud=True)
    report = await orch.make_report(REPORT_PERIOD_LABEL, REPORT_PRODUCTION_TONNES)
    verify_valid = await orch.verify_report(report)
    tampered = json.loads(json.dumps(report))
    tampered["report"]["totals"]["verified_emissions_tco2e"] = 100.0
    verify_tampered = await orch.verify_report(tampered)
    return {
        "honest": honest,
        "attacked": attacked,
        "report": report,
        "verify_valid": verify_valid,
        "verify_tampered": verify_tampered,
    }


def export_snapshot(out_path: Path, *, anvil_port: int = 8545) -> dict[str, Any]:
    anvil = AnvilProcess(port=anvil_port)
    rpc_url = anvil.start()
    try:
        adapter = ChainAdapter(mode="anvil", rpc_url=rpc_url)
        adapter.deploy_contracts_direct(profile="demo")
        gateway = GatewaySimulator(FACILITY_ID, UNIT_ID, device_id=DEVICE_ID)
        adapter.ensure_device_and_stakes(
            device_id=DEVICE_ID, installation_id=INSTALLATION_ID, public_key_p256=gateway.public_key
        )
        with tempfile.TemporaryDirectory() as tmp:
            store = EventStore(Path(tmp) / "export.db")
            orch = Orchestrator(
                adapter=adapter,
                store=store,
                committee=VerifierCommittee(adapter.verifier_addresses),
                gateway=gateway,
                clock=DemoClock.from_yaml(),
                installation_id=INSTALLATION_ID,
                device_id=DEVICE_ID,
            )
            run = asyncio.run(run_real_path(orch))
            chain_id = adapter.w3.eth.chain_id
            events = store.list_events(limit=10_000)
            batches = store.list_batches(include_packets=False)
            challenges = store.list_challenges()
            snapshot: dict[str, Any] = {
                "schema_version": SNAPSHOT_SCHEMA_VERSION,
                "kind": "real-run",
                "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
                "chain": build_chain_meta(adapter, chain_id),
                "events": events,
                "batches": batches,
                "batch_details": {
                    str(b["batch_id"]): store.get_batch(b["batch_id"], include_packets=True)
                    for b in batches
                },
                "verifiers": orch.committee.list_status(adapter),
                "challenges": challenges,
                "state": {
                    "attack": orch.attack,
                    "installation_id": orch.installation_id,
                    "device_id": orch.device_id,
                    "vault": adapter.get_vault_summary(orch.installation_id),
                    "batches": len(batches),
                },
                "roots": {str(b["batch_id"]): b["merkle_root"] for b in batches},
                "tx_hashes": collect_tx_hashes(events, challenges, batches),
                "report": run["report"],
                "report_verification": {
                    "valid": run["verify_valid"],
                    "tampered": run["verify_tampered"],
                },
                "run_summary": {"honest": run["honest"], "attacked": run["attacked"]},
            }
            store.close()
    finally:
        anvil.stop()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=2, sort_keys=True, default=str), encoding="utf-8")
    return snapshot


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export a recorded real run for the web UI")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--anvil-port", type=int, default=8545)
    args = parser.parse_args()
    snap = export_snapshot(Path(args.out), anvil_port=args.anvil_port)
    print(f"events={len(snap['events'])} batches={len(snap['batches'])} txs={len(snap['tx_hashes'])}")
    print(f"chain={snap['chain']['name']} id={snap['chain']['chain_id']} -> {args.out}")
