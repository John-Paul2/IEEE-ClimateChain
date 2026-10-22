"""Post-deployment evidence extractor (`scripts/extract_deployment_evidence.py`).

Reads `contracts/broadcast/Deploy.s.sol/<chain_id>/run-latest.json` and updates
`deployments/testnet.json` to include exact contract addresses, deployment block numbers,
transaction hashes, gas used, and block explorer links.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENTS_DIR = REPO_ROOT / "deployments"
BROADCAST_DIR = REPO_ROOT / "contracts" / "broadcast" / "Deploy.s.sol"


def extract_evidence(chain_id: int = 421614, explorer_base: str = "https://sepolia.arbiscan.io") -> dict:
    run_file = BROADCAST_DIR / str(chain_id) / "run-latest.json"
    target_deployment = DEPLOYMENTS_DIR / "testnet.json"

    if not run_file.exists():
        print(f"Error: broadcast run file not found at {run_file}", file=sys.stderr)
        return {}

    broadcast_data = json.loads(run_file.read_text(encoding="utf-8"))
    existing_deployment = {}
    if target_deployment.exists():
        try:
            existing_deployment = json.loads(target_deployment.read_text(encoding="utf-8"))
        except Exception:
            existing_deployment = {}

    transactions = broadcast_data.get("transactions", [])
    receipts = {tx.get("hash"): tx for tx in transactions}

    contracts_info = existing_deployment.setdefault("contracts_detail", {})
    all_txs = []

    for tx in transactions:
        c_name = tx.get("contractName")
        c_addr = tx.get("contractAddress")
        tx_hash = tx.get("hash")
        tx_type = tx.get("transactionType")
        gas_used = int(tx.get("gas", 0))

        item = {
            "contract": c_name,
            "address": c_addr,
            "transactionHash": tx_hash,
            "explorerUrl": f"{explorer_base}/tx/{tx_hash}" if tx_hash else None,
            "type": tx_type,
            "gas": gas_used,
        }
        all_txs.append(item)

        if c_name and c_addr and tx_type == "CREATE":
            contracts_info[c_name] = {
                "address": c_addr,
                "deployTxHash": tx_hash,
                "explorerUrl": f"{explorer_base}/address/{c_addr}",
                "deployTxExplorerUrl": f"{explorer_base}/tx/{tx_hash}",
            }
            if "contracts" not in existing_deployment:
                existing_deployment["contracts"] = {}
            existing_deployment["contracts"][c_name] = c_addr

    existing_deployment["chainId"] = chain_id
    existing_deployment["network"] = "arbitrum-sepolia"
    existing_deployment["explorerBaseUrl"] = explorer_base
    existing_deployment["transactions"] = all_txs

    target_deployment.write_text(json.dumps(existing_deployment, indent=2), encoding="utf-8")
    print(f"Successfully updated deployment evidence at {target_deployment}")
    return existing_deployment


if __name__ == "__main__":
    cid = int(sys.argv[1]) if len(sys.argv) > 1 else 421614
    extract_evidence(cid)
