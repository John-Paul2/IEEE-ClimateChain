"""VeriCEMS Demo Server Runner (`backend.vericems.server`).

Starts a local Anvil process (or connects to an existing one), deploys the 6 smart
contracts with demo parameters, registers the edge gateway device and stakes bonds,
and runs the FastAPI REST/WebSocket application with the ScenarioEngine.

Usage:
    python -m backend.vericems.server [--port 8000] [--anvil-port 8545]
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
import uvicorn

from backend.vericems.api import create_app
from backend.vericems.chain_adapter import AnvilProcess, ChainAdapter
from backend.vericems.demo_clock import DemoClock
from backend.vericems.gateway import GatewaySimulator
from backend.vericems.orchestrator import Orchestrator
from backend.vericems.scenario import ScenarioEngine
from backend.vericems.store import EventStore
from backend.vericems.verifier_node import VerifierCommittee

INSTALLATION_ID = "INST-CAMPD-1073"
DEVICE_ID = "DEV-CAMPD-1073-3"
FACILITY_ID = 1073
UNIT_ID = 3


def run_server(
    *,
    host: str = "127.0.0.1",
    port: int = 8000,
    anvil_port: int = 8545,
    db_path: Path | str | None = None,
) -> None:
    anvil = AnvilProcess(port=anvil_port)
    rpc_url = anvil.start()
    print(f"[*] Anvil node running at {rpc_url}")

    adapter = ChainAdapter(mode="anvil", rpc_url=rpc_url)
    adapter.deploy_contracts_direct(profile="demo")
    print("[*] Contracts deployed and verified on Anvil")

    gateway = GatewaySimulator(FACILITY_ID, UNIT_ID, device_id=DEVICE_ID)
    adapter.ensure_device_and_stakes(
        device_id=DEVICE_ID,
        installation_id=INSTALLATION_ID,
        public_key_p256=gateway.public_key,
    )
    print(f"[*] Device {DEVICE_ID} and stakes ensured on-chain")

    store_file = Path(db_path) if db_path else Path("data") / "vericems_demo.db"
    store_file.parent.mkdir(parents=True, exist_ok=True)
    store = EventStore(store_file)

    clock = DemoClock.from_yaml()
    committee = VerifierCommittee(adapter.verifier_addresses)

    orch = Orchestrator(
        adapter=adapter,
        store=store,
        committee=committee,
        gateway=gateway,
        clock=clock,
        installation_id=INSTALLATION_ID,
        device_id=DEVICE_ID,
    )

    scenario = ScenarioEngine(orch, auto_snapshot=True)
    app = create_app(orch, scenario=scenario)

    print(f"[*] Starting VeriCEMS API & WebSocket server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VeriCEMS Backend Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--anvil-port", type=int, default=8545, help="Anvil RPC port (default: 8545)")
    parser.add_argument("--db-path", default=None, help="SQLite database path")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port, anvil_port=args.anvil_port, db_path=args.db_path)
