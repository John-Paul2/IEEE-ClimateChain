"""Contract Verification Script for Arbitrum Sepolia (`scripts/verify_contracts.py`).

Verifies all deployed contracts on Arbiscan if ARBISCAN_API_KEY or ETHERSCAN_API_KEY is configured in .env.
If not provided, prints exact instructions and CLI commands for manual verification.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENTS_FILE = REPO_ROOT / "deployments" / "testnet.json"
FORGE_BIN = REPO_ROOT / ".venv" / "Scripts" / "forge.exe"


def verify_contracts() -> None:
    api_key = os.environ.get("ARBISCAN_API_KEY") or os.environ.get("ETHERSCAN_API_KEY")
    if not DEPLOYMENTS_FILE.exists():
        print(f"Error: {DEPLOYMENTS_FILE} not found. Deploy to testnet first.", file=sys.stderr)
        return

    deployment = json.loads(DEPLOYMENTS_FILE.read_text(encoding="utf-8"))
    contracts = deployment.get("contracts", {})
    chain_id = deployment.get("chainId", 421614)

    print("=========================================")
    print("VeriCEMS Contract Verification on Arbiscan")
    print(f"Chain ID: {chain_id}")
    print("=========================================")

    if not api_key:
        print("\n[NOTE] No ARBISCAN_API_KEY or ETHERSCAN_API_KEY detected in .env.")
        print("To verify contracts later:")
        print("1. Obtain a free API key at https://arbiscan.io/myapikey")
        print("2. Add it to .env: ARBISCAN_API_KEY=your_key_here")
        print("3. Run: python scripts/verify_contracts.py\n")
        print("Or verify individual contracts directly using forge:")
        for name, addr in contracts.items():
            print(f"  forge verify-contract {addr} src/{name}.sol:{name} "
                  f"--chain {chain_id} --verifier-url https://api-sepolia.arbiscan.io/api --watch")
        return

    print("API Key detected. Submitting contracts for verification...")
    for name, addr in contracts.items():
        print(f"\nVerifying {name} at {addr}...")
        cmd = [
            str(FORGE_BIN),
            "verify-contract",
            addr,
            f"src/{name}.sol:{name}",
            "--chain",
            str(chain_id),
            "--etherscan-api-key",
            api_key,
            "--verifier-url",
            "https://api-sepolia.arbiscan.io/api",
            "--watch",
        ]
        res = subprocess.run(cmd, cwd=REPO_ROOT / "contracts", capture_output=True, text=True)
        print(res.stdout)
        if res.returncode != 0 and "already verified" not in res.stderr.lower():
            print(f"Notice: {res.stderr}")


if __name__ == "__main__":
    verify_contracts()
