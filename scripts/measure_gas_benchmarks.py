"""Submit 20 anchorBatch transactions on Arbitrum Sepolia, aggregate gas metrics,
and generate results/gas_measured.json and docs/TESTNET_EVIDENCE.md.
"""

from __future__ import annotations

import json
from pathlib import Path
import statistics
import time
from typing import Any

from Crypto.Hash import keccak
from eth_account import Account
from web3 import Web3

REPO_ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENTS_FILE = REPO_ROOT / "deployments" / "testnet.json"
RESULTS_FILE = REPO_ROOT / "results" / "gas_measured.json"
DOCS_EVIDENCE_FILE = REPO_ROOT / "docs" / "TESTNET_EVIDENCE.md"
PASSWORD_FILE = REPO_ROOT / ".keystore_password"
KEYSTORE_FILE = Path.home() / ".foundry" / "keystores" / "vericems-deployer"
CONTRACTS_OUT = REPO_ROOT / "contracts" / "out"

EXPLORER_BASE = "https://sepolia.arbiscan.io"
RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc"
CHAIN_ID = 421614


def load_abi(contract_name: str) -> list[dict[str, Any]]:
    path = CONTRACTS_OUT / f"{contract_name}.sol" / f"{contract_name}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["abi"]


def send_tx(w3: Web3, contract_fn: Any, account: Any, value: int = 0) -> dict[str, Any]:
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    base_fee = w3.eth.gas_price
    gas_price = int(base_fee * 1.35) if base_fee > 0 else 150_000_000
    tx_params = {
        "from": account.address,
        "nonce": nonce,
        "gasPrice": gas_price,
        "chainId": CHAIN_ID,
        "value": value,
    }
    try:
        gas_est = contract_fn.estimate_gas(tx_params)
        tx_params["gas"] = int(gas_est * 1.4) + 40000
    except Exception:
        tx_params["gas"] = 350000

    built = contract_fn.build_transaction(tx_params)
    signed = account.sign_transaction(built)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if int(receipt.get("status", 0)) != 1:
        raise RuntimeError(f"Transaction reverted on-chain: tx_hash={tx_hash.hex()}")
    return receipt


def main() -> None:
    print("==================================================")
    print("VeriCEMS Testnet Gas Benchmarker (20 anchorBatch)")
    print("Arbitrum Sepolia (Chain ID: 421614)")
    print("==================================================")

    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 60}))
    assert w3.is_connected(), "Failed to connect to Arbitrum Sepolia RPC"

    password = PASSWORD_FILE.read_text(encoding="utf-8").strip()
    keystore_json = json.loads(KEYSTORE_FILE.read_text(encoding="utf-8"))
    admin_priv = Account.decrypt(keystore_json, password)
    admin_account = Account.from_key(admin_priv)
    admin_addr = admin_account.address
    print(f"Deployer (Operator): {admin_addr}")
    print(f"Deployer Balance: {w3.eth.get_balance(admin_addr) / 1e18:.6f} ETH")

    dep = json.loads(DEPLOYMENTS_FILE.read_text(encoding="utf-8"))
    contracts_map = {k: Web3.to_checksum_address(v) for k, v in dep["contracts"].items()}
    batch_anchor = w3.eth.contract(address=contracts_map["BatchAnchor"], abi=load_abi("BatchAnchor"))

    device_id_b32 = bytes.fromhex("11" * 32)

    # 1. Submit 20 sequential anchorBatch transactions
    print("\n--- Submitting 20 sequential anchorBatch calls to Arbitrum Sepolia ---")
    anchor_samples: list[int] = []
    anchor_receipts: list[dict[str, Any]] = []

    for k in range(20):
        s_start = batch_anchor.functions.expectedFirstSeq(device_id_b32).call()
        c_len = 10
        s_end = s_start + c_len - 1
        b_root = keccak.new(digest_bits=256).update(f"bench_batch_{k}_{s_start}_{time.time()}".encode("utf-8")).digest()
        r = send_tx(
            w3,
            batch_anchor.functions.anchorBatch(device_id_b32, b_root, s_start, s_end, c_len),
            admin_account,
        )
        g = int(r["gasUsed"])
        anchor_samples.append(g)
        anchor_receipts.append(r)
        tx_h = r["transactionHash"].hex()
        b_num = r["blockNumber"]
        print(f"anchorBatch [{k+1:02d}/20]: block={b_num} gas={g:,} tx={EXPLORER_BASE}/tx/{tx_h}")

    # 2. Existing On-Chain Transactions for Protocol Functions
    evidence_txs = [
        # Setup
        ("DeviceRegistry.registerDevice", "0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce", "CEMS device registered"),
        ("BondVault.depositOperatorBond", "0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621", "Operator bonded 0.002 ETH"),
        ("BondVault.depositVerifierStake[V0]", "0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd", "Verifier 0 bonded 0.0005 ETH"),
        ("BondVault.depositVerifierStake[V1]", "0x51151074c274888636aa56a112a8ba4f4b73cee3d5c2860743c8d521d50fc904", "Verifier 1 bonded 0.0005 ETH"),
        ("BondVault.depositVerifierStake[V2]", "0x04bcb069f85fd07c35e709cbca64f546cf41f7d802a9090dd0965a4c5fcd3604", "Verifier 2 bonded 0.0005 ETH"),
        # Honest Path (Batch 4)
        ("BatchAnchor.anchorBatch (Honest #4)", "0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22", "Anchored Batch #4"),
        ("VerifierQuorum.commitVote (Honest V0)", "0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5", "V0 sealed commitment"),
        ("VerifierQuorum.commitVote (Honest V1)", "0xe2c3a560ef6b18318bc883a68a55c34640cba33f4b9cc70d59deb938f7c6fb1a", "V1 sealed commitment"),
        ("VerifierQuorum.commitVote (Honest V2)", "0x0c30600033232ac0b6e4632d1a88d1111f6c5357ed5f10ffe0cbbb72ff40383f", "V2 sealed commitment"),
        ("VerifierQuorum.revealVote (Honest V0)", "0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f", "V0 revealed Clean (score=0bp)"),
        ("VerifierQuorum.revealVote (Honest V1)", "0x52f236196386c69a50fc894682a9df4a4a387f6111578c8fd19c05f171556b51", "V1 revealed Clean (score=0bp)"),
        ("VerifierQuorum.revealVote (Honest V2)", "0xcef8dec16d2275758f6a9a3d3f9d008bf5c7619398d15ba367d3d2a5091e3eba", "V2 revealed Clean (score=0bp)"),
        ("VerifierQuorum.finalize (Honest)", "0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722", "Quorum finalized Clean -> Status=Verified"),
        ("Attestation.recordAttestation", "0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd", "Recorded EU CBAM Attestation for Batch #4"),
        # Attack Path (Batch 6)
        ("BatchAnchor.anchorBatch (Attack Injection #6)", "0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9", "Anchored Tampered Batch #6"),
        ("VerifierQuorum.commitVote (Attack V0)", "0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100", "V0 sealed Fraud commitment"),
        ("VerifierQuorum.commitVote (Attack V1)", "0xf0d74c40b5712f845920a5ad228aaf9d4ffbb0fbc1ea3a00f849831c8e349bc5", "V1 sealed Fraud commitment"),
        ("VerifierQuorum.commitVote (Attack V2)", "0x2d95ed6647721313d10c678c2632907ab0532ef96cbab069f6d267f94996f887", "V2 sealed Fraud commitment"),
        ("VerifierQuorum.revealVote (Attack V0)", "0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80", "V0 revealed Fraud (score=8500bp, reasons=E01,E03)"),
        ("VerifierQuorum.revealVote (Attack V1)", "0x7fd4ee06cea972e95876de38de982b5ae8b2e10b70a04955fcfc9a3afa9495b8", "V1 revealed Fraud (score=8500bp, reasons=E01,E03)"),
        ("VerifierQuorum.revealVote (Attack V2)", "0x1a081e098cec5136a192366329af3fd666c8a75dc770b93451f06787a9285ec8", "V2 revealed Fraud (score=8500bp, reasons=E01,E03)"),
        ("VerifierQuorum.finalize (Quarantine + openChallenge)", "0x2ee068a31e36f7685d0eb87abc5787ae0b8b417bd1b60052d91cb5c82e7a31a2", "Quorum finalized Fraud -> Batch #6 Quarantined & openChallenge invoked"),
        ("Challenge.submitOperatorDispute", "0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4", "Operator lodged dispute with verified Merkle proof"),
        ("Challenge.resolve (Arbiter 0 Vote)", "0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049", "Arbiter 0 cast vote 1 of 2 (UPHELD_FRAUD)"),
        ("Challenge.resolve (Arbiter 1 Resolution & Slash)", "0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540", "Arbiter 1 reached 2-of-3 quorum: Slashed 50% operator bond"),
        ("Challenge.settleExpired (Batch #5)", "0xcf769c0141964062a3abd780c5b7148bfe8c0d503aec8d1bfe9797273dd6d2a7", "Settled expired challenge on Batch #5"),
        ("BondVault.depositOperatorBond (Top-up)", "0x9d511c6cc4a8e3c8c4797f3aa88518460def3bb154bfa25ebbe8bb46ed0b66d6", "Operator topped up bond by 0.002 ETH"),
    ]

    receipt_map: dict[str, dict[str, Any]] = {}
    for label, tx_h, note in evidence_txs:
        r = w3.eth.get_transaction_receipt(tx_h)
        receipt_map[label] = {
            "receipt": r,
            "tx_hash": tx_h,
            "block_number": r["blockNumber"],
            "gas_used": r["gasUsed"],
            "note": note,
        }

    # Extract sample pools
    commit_gas_samples = [
        receipt_map["VerifierQuorum.commitVote (Honest V0)"]["gas_used"],
        receipt_map["VerifierQuorum.commitVote (Honest V1)"]["gas_used"],
        receipt_map["VerifierQuorum.commitVote (Honest V2)"]["gas_used"],
        receipt_map["VerifierQuorum.commitVote (Attack V0)"]["gas_used"],
        receipt_map["VerifierQuorum.commitVote (Attack V1)"]["gas_used"],
        receipt_map["VerifierQuorum.commitVote (Attack V2)"]["gas_used"],
    ]

    reveal_gas_samples = [
        receipt_map["VerifierQuorum.revealVote (Honest V0)"]["gas_used"],
        receipt_map["VerifierQuorum.revealVote (Honest V1)"]["gas_used"],
        receipt_map["VerifierQuorum.revealVote (Honest V2)"]["gas_used"],
        receipt_map["VerifierQuorum.revealVote (Attack V0)"]["gas_used"],
        receipt_map["VerifierQuorum.revealVote (Attack V1)"]["gas_used"],
        receipt_map["VerifierQuorum.revealVote (Attack V2)"]["gas_used"],
    ]

    fin_honest_gas = receipt_map["VerifierQuorum.finalize (Honest)"]["gas_used"]
    fin_quarantine_gas = receipt_map["VerifierQuorum.finalize (Quarantine + openChallenge)"]["gas_used"]
    finalize_gas_samples = [fin_honest_gas, fin_quarantine_gas]

    # openChallenge gas: net incremental gas executed inside finalize to invoke Challenge.openChallenge and store challenge record
    open_challenge_gas_samples = [fin_quarantine_gas - fin_honest_gas]

    resolve_gas_samples = [
        receipt_map["Challenge.resolve (Arbiter 0 Vote)"]["gas_used"],
        receipt_map["Challenge.resolve (Arbiter 1 Resolution & Slash)"]["gas_used"],
    ]

    attestation_gas_samples = [
        receipt_map["Attestation.recordAttestation"]["gas_used"],
    ]

    dispute_gas_samples = [
        receipt_map["Challenge.submitOperatorDispute"]["gas_used"],
    ]

    def get_stats(samples: list[int]) -> dict[str, Any]:
        return {
            "count": len(samples),
            "min": min(samples),
            "median": int(statistics.median(samples)),
            "max": max(samples),
        }

    gas_results = {
        "network": "arbitrum-sepolia",
        "chain_id": CHAIN_ID,
        "sample_timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gas_price_gwei_input": None,
        "token_price_usd_input": None,
        "cost_formula": "Cost_EUR = (Gas_Used * Gas_Price_Gwei * 1e-9) * ETH_EUR_Exchange_Rate",
        "measurements": {
            "anchorBatch": get_stats(anchor_samples),
            "commitVote": get_stats(commit_gas_samples),
            "revealVote": get_stats(reveal_gas_samples),
            "finalize": get_stats(finalize_gas_samples),
            "openChallenge": get_stats(open_challenge_gas_samples),
            "submitOperatorDispute": get_stats(dispute_gas_samples),
            "resolve": get_stats(resolve_gas_samples),
            "recordAttestation": get_stats(attestation_gas_samples),
        },
        "all_anchorBatch_samples": anchor_samples,
    }

    RESULTS_FILE.write_text(json.dumps(gas_results, indent=2), encoding="utf-8")
    print(f"\nSaved gas measurement results to {RESULTS_FILE}")

    # Generate TESTNET_EVIDENCE.md
    md_lines = [
        "# VeriCEMS Testnet Evidence & Transaction Proofs",
        "",
        "**Target Network:** Arbitrum Sepolia (`Chain ID: 421614`)  ",
        f"**Block Explorer:** [{EXPLORER_BASE}]({EXPLORER_BASE})  ",
        f"**Deployer / Operator Address:** [`{admin_addr}`]({EXPLORER_BASE}/address/{admin_addr})  ",
        f"**Execution Timestamp (UTC):** `{gas_results['sample_timestamp_utc']}`  ",
        "",
        "---",
        "",
        "## 1. Deployed Smart Contracts",
        "",
        "| Contract | Address | Deployment Tx | Explorer Link |",
        "| :--- | :--- | :--- | :--- |",
    ]
    for c_name, c_addr in contracts_map.items():
        detail = dep.get("contracts_detail", {}).get(c_name, {})
        tx_h = detail.get("deployTxHash", "N/A")
        md_lines.append(f"| **{c_name}** | [`{c_addr}`]({EXPLORER_BASE}/address/{c_addr}) | [`{tx_h[:14]}...`]({EXPLORER_BASE}/tx/{tx_h}) | [View Contract]({EXPLORER_BASE}/address/{c_addr}#code) |")

    md_lines.extend([
        "",
        "---",
        "",
        "## 2. Live Honest Flow (Full Lifecycle)",
        "",
        "| Action | Role | Gas Used | Block | Transaction Hash | Explorer Link | Notes |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ])
    for label, item in receipt_map.items():
        if "Attack" not in label and "Arbiter" not in label and "Dispute" not in label and "settleExpired" not in label and "Top-up" not in label:
            tx_h = item["tx_hash"]
            g = item["gas_used"]
            b_num = item["block_number"]
            url = f"{EXPLORER_BASE}/tx/{tx_h}"
            note = item["note"]
            md_lines.append(f"| {label} | Operator / Verifier | {g:,} | {b_num} | [`{tx_h[:14]}...`]({url}) | [View Tx]({url}) | {note} |")

    md_lines.extend([
        "",
        "---",
        "",
        "## 3. Live Attack & Slashing Flow (Fraud Injection & Arbiter Council Resolution)",
        "",
        "| Action | Role | Gas Used | Block | Transaction Hash | Explorer Link | Notes |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ])
    for label, item in receipt_map.items():
        if "Attack" in label or "Arbiter" in label or "Dispute" in label or "settleExpired" in label or "Top-up" in label:
            tx_h = item["tx_hash"]
            g = item["gas_used"]
            b_num = item["block_number"]
            url = f"{EXPLORER_BASE}/tx/{tx_h}"
            note = item["note"]
            md_lines.append(f"| {label} | Operator / Verifier / Arbiter | {g:,} | {b_num} | [`{tx_h[:14]}...`]({url}) | [View Tx]({url}) | {note} |")

    md_lines.extend([
        "",
        "---",
        "",
        "## 4. Gas Measurement Summary (Empirical Benchmarks)",
        "",
        "Empirically measured on Arbitrum Sepolia EVM testnet. Per `AGENTS.md` rules, gas price and token prices are configuration inputs (kept null) and never assumed or invented.",
        "",
        "**Cost Formula:**  ",
        "$$\\text{Cost} = \\text{Gas Used} \\times \\text{Gas Price (ETH)} \\times \\text{ETH Price (EUR)}$$",
        "",
        "| Operation | Sample Count | Min Gas | Median Gas | Max Gas |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ])
    for op_name, stats in gas_results["measurements"].items():
        md_lines.append(f"| **{op_name}** | {stats['count']} | {stats['min']:,} | {stats['median']:,} | {stats['max']:,} |")

    md_lines.extend([
        "",
        "### 20 anchorBatch Gas Benchmark Samples",
        "",
        "| Call # | Gas Used | Block Number | Transaction Hash | Explorer Link |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ])
    for idx, r in enumerate(anchor_receipts):
        tx_h = r["transactionHash"].hex()
        if not tx_h.startswith("0x"):
            tx_h = "0x" + tx_h
        g = r["gasUsed"]
        b_num = r["blockNumber"]
        url = f"{EXPLORER_BASE}/tx/{tx_h}"
        md_lines.append(f"| Sample #{idx+1:02d} | {g:,} | {b_num} | [`{tx_h[:14]}...`]({url}) | [View Tx]({url}) |")

    DOCS_EVIDENCE_FILE.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"\nGenerated testnet evidence documentation at {DOCS_EVIDENCE_FILE}")


if __name__ == "__main__":
    main()
