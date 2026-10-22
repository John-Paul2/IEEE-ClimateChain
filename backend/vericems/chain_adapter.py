"""Web3.py Chain Adapter for VeriCEMS smart contracts (`backend.vericems.chain_adapter`).

Supports two modes:
1. `"anvil"` (local development / automated integration tests against Foundry Anvil).
2. `"testnet"` (configurable L2 / EVM testnet RPC URL, e.g., Polygon Amoy or Arbitrum Sepolia).

Enforces `AGENTS.md` security rules:
- Refuses any mainnet chain ID (`MainnetForbiddenError`).
- Never asks for, reads from disk, or logs/prints private keys.
- Reads contract ABIs from `contracts/out/<Name>.sol/<Name>.json` and deployment addresses
  from `deployments/<network>.json`.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
from typing import Any, Final

from web3 import HTTPProvider, Web3
from web3.contract import Contract
from web3.exceptions import ContractLogicError

from backend.vericems.crypto.merkle import keccak256
from backend.vericems.logging_utils import (
    ChainAdapterError,
    MainnetForbiddenError,
    get_logger,
    log_event,
)

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent
CONTRACTS_OUT_DIR: Final[Path] = REPO_ROOT / "contracts" / "out"
DEPLOYMENTS_DIR: Final[Path] = REPO_ROOT / "deployments"
DEFAULT_PARAMS_YAML: Final[Path] = REPO_ROOT / "config" / "params.yaml"

CONTRACT_NAMES: Final[tuple[str, ...]] = (
    "DeviceRegistry",
    "BondVault",
    "BatchAnchor",
    "VerifierQuorum",
    "Challenge",
    "Attestation",
)

FORBIDDEN_MAINNET_CHAIN_IDS: Final[frozenset[int]] = frozenset(
    {
        1,       # Ethereum Mainnet
        10,      # Optimism Mainnet
        56,      # BNB Smart Chain Mainnet
        100,     # Gnosis Mainnet
        137,     # Polygon PoS Mainnet
        324,     # zkSync Era Mainnet
        1101,    # Polygon zkEVM Mainnet
        8453,    # Base Mainnet
        42161,   # Arbitrum One Mainnet
        43114,   # Avalanche C-Chain Mainnet
        59144,   # Linea Mainnet
    }
)

BATCH_STATUS_NAMES: Final[dict[int, str]] = {
    0: "None",
    1: "Anchored",
    2: "Verified",
    3: "Quarantined",
    4: "Slashed",
    5: "Cleared",
}

CHALLENGE_STATUS_NAMES: Final[dict[int, str]] = {
    0: "None",
    1: "Open",
    2: "DisputedByOperator",
    3: "UpheldSlashed",
    4: "OverturnedCleared",
    5: "ExpiredSlashed",
}

CHALLENGE_STATUS_TO_REPORT_ENUM: Final[dict[str, str]] = {
    "Open": "OPEN",
    "DisputedByOperator": "OPEN",
    "UpheldSlashed": "UPHELD_SLASHED",
    "OverturnedCleared": "OVERTURNED_CLEARED",
    "ExpiredSlashed": "EXPIRED_SLASHED",
}

DEVICE_STATUS_NAMES: Final[dict[int, str]] = {
    0: "Unregistered",
    1: "Active",
    2: "Revoked",
}

VERDICT_NAMES: Final[dict[int, str]] = {
    0: "Clean",
    1: "Fraud",
}


def id_to_bytes32(identifier: str | bytes) -> bytes:
    """Convert an ASCII identifier (`device_id` or `installation_id`) or `0x` hex to 32-byte `bytes`.

    Per `docs/INTERFACES.md` Section 8.1:
    All on-chain `deviceId` and `installationId` values are computed as
    `keccak256(utf8Bytes(string_id))` unless already provided as a 32-byte value.
    """
    if isinstance(identifier, bytes):
        if len(identifier) == 32:
            return identifier
        return keccak256(identifier)
    if not isinstance(identifier, str) or not identifier:
        raise ValueError(f"Identifier must be a non-empty str or bytes, got {identifier!r}")
    if identifier.startswith("0x") and len(identifier) == 66:
        try:
            return bytes.fromhex(identifier[2:])
        except ValueError:
            pass
    return keccak256(identifier.encode("utf-8"))


def id_to_bytes32_hex(identifier: str | bytes) -> str:
    """Convert an ASCII identifier (`device_id` or `installation_id`) to `0x`-prefixed 32-byte hex."""
    return "0x" + id_to_bytes32(identifier).hex()


def bytes32_to_hex(val: bytes | str) -> str:
    """Format a 32-byte value as `0x` + 64 lowercase hex chars."""
    if isinstance(val, bytes):
        return "0x" + val.hex()
    s = str(val)
    return s.lower() if s.startswith("0x") else ("0x" + s.lower())


def parse_bytes32(val: str | bytes) -> bytes:
    """Parse a `0x`-prefixed 32-byte hex string into 32 raw bytes."""
    if isinstance(val, bytes):
        if len(val) != 32:
            raise ValueError(f"Expected 32 bytes, got {len(val)}")
        return val
    s = str(val)
    if s.startswith(("0x", "0X")):
        s = s[2:]
    if len(s) != 64:
        raise ValueError(f"Expected 64 hex chars for bytes32, got {len(s)}: {val!r}")
    return bytes.fromhex(s)


def load_contract_artifact(
    contract_name: str, out_dir: Path = CONTRACTS_OUT_DIR
) -> dict[str, Any]:
    """Load ABI and bytecode from `contracts/out/<ContractName>.sol/<ContractName>.json`."""
    artifact_path = Path(out_dir) / f"{contract_name}.sol" / f"{contract_name}.json"
    if not artifact_path.exists():
        # Attempt automatic compilation via forge build if artifact is missing
        forge_bin = _resolve_foundry_binary("forge")
        contracts_dir = REPO_ROOT / "contracts"
        try:
            subprocess.run(
                [forge_bin, "build", "--root", str(contracts_dir)],
                cwd=str(contracts_dir),
                check=True,
                capture_output=True,
                timeout=60,
            )
        except Exception:
            pass

    if not artifact_path.exists():
        raise ChainAdapterError(
            f"Contract artifact not found at {artifact_path}. Run `forge build` in contracts/.",
            code="ABI_ARTIFACT_MISSING",
            details={"contract_name": contract_name, "path": str(artifact_path)},
        )
    data = json.loads(artifact_path.read_text(encoding="utf-8"))
    if "abi" not in data:
        raise ChainAdapterError(
            f"Contract artifact {artifact_path} is missing 'abi' field.",
            code="ABI_INVALID",
            details={"contract_name": contract_name},
        )
    return data


def load_deployment_config(
    network: str = "anvil", deployments_dir: Path = DEPLOYMENTS_DIR
) -> dict[str, Any]:
    """Load deployment metadata from `deployments/<network>.json`."""
    dep_path = Path(deployments_dir) / f"{network}.json"
    if not dep_path.exists():
        raise ChainAdapterError(
            f"Deployment file not found at {dep_path}.",
            code="DEPLOYMENT_FILE_MISSING",
            details={"network": network, "path": str(dep_path)},
        )
    return json.loads(dep_path.read_text(encoding="utf-8"))


class ChainAdapter:
    """Web3.py adapter for all six VeriCEMS smart contracts in `anvil` or `testnet` mode."""

    def __init__(
        self,
        *,
        mode: str = "anvil",
        rpc_url: str | None = None,
        network: str | None = None,
        deployments_dir: Path = DEPLOYMENTS_DIR,
        contracts_out_dir: Path = CONTRACTS_OUT_DIR,
        request_timeout: float = 15.0,
    ) -> None:
        resolved_mode = mode.strip().lower()
        if resolved_mode not in ("anvil", "local", "testnet"):
            raise ChainAdapterError(
                f"Invalid chain adapter mode={mode!r}. Expected 'anvil' or 'testnet'.",
                code="INVALID_CHAIN_MODE",
            )
        self.mode = "anvil" if resolved_mode in ("anvil", "local") else "testnet"
        self.network = network or ("anvil" if self.mode == "anvil" else os.environ.get("VERICEMS_NETWORK", "testnet"))
        self.rpc_url = (
            rpc_url
            or os.environ.get("VERICEMS_RPC_URL")
            or ("http://127.0.0.1:8545" if self.mode == "anvil" else "")
        )
        if not self.rpc_url:
            raise ChainAdapterError(
                "Testnet mode requires an explicit `rpc_url` or `VERICEMS_RPC_URL` environment variable.",
                code="MISSING_RPC_URL",
            )

        self.deployments_dir = Path(deployments_dir)
        self.contracts_out_dir = Path(contracts_out_dir)
        self.logger = get_logger("vericems.chain_adapter")

        self.w3 = Web3(HTTPProvider(self.rpc_url, request_kwargs={"timeout": request_timeout}))
        self.deployment: dict[str, Any] = {}
        self.contracts: dict[str, Contract] = {}

        # Load deployment JSON if present
        dep_file = self.deployments_dir / f"{self.network}.json"
        if dep_file.exists():
            self.reload_deployment(dep_file)

    def verify_connection_and_safety(self) -> int:
        """Verify RPC connectivity and assert the connected chain is NOT a mainnet."""
        try:
            chain_id = int(self.w3.eth.chain_id)
        except Exception as exc:
            raise ChainAdapterError(
                f"Unable to connect to EVM RPC at {self.rpc_url}: {exc}",
                code="RPC_CONNECTION_FAILED",
                details={"rpc_url": self.rpc_url, "mode": self.mode},
            ) from exc

        if chain_id in FORBIDDEN_MAINNET_CHAIN_IDS:
            raise MainnetForbiddenError(chain_id)

        return chain_id

    def reload_deployment(self, deployment_path: Path | None = None) -> dict[str, Any]:
        """Load or reload contract addresses and accounts from `deployments/<network>.json`."""
        path = deployment_path or (self.deployments_dir / f"{self.network}.json")
        self.deployment = json.loads(Path(path).read_text(encoding="utf-8"))
        contracts_map = self.deployment.get("contracts", {})
        self.contracts = {}
        for name in CONTRACT_NAMES:
            addr = contracts_map.get(name)
            if addr:
                artifact = load_contract_artifact(name, self.contracts_out_dir)
                checksum_addr = Web3.to_checksum_address(addr)
                self.contracts[name] = self.w3.eth.contract(
                    address=checksum_addr, abi=artifact["abi"]
                )
        return self.deployment

    @property
    def admin_address(self) -> str:
        return Web3.to_checksum_address(
            self.deployment.get("admin", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
        )

    @property
    def operator_address(self) -> str:
        return Web3.to_checksum_address(
            self.deployment.get(
                "operator",
                self.deployment.get("admin", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
            )
        )

    @property
    def treasury_address(self) -> str:
        return Web3.to_checksum_address(
            self.deployment.get("treasury", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")
        )

    @property
    def verifier_addresses(self) -> list[str]:
        raw = self.deployment.get(
            "verifiers",
            [
                "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
                "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
                "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
                "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
            ],
        )
        return [Web3.to_checksum_address(a) for a in raw]

    @property
    def arbiter_addresses(self) -> list[str]:
        raw = self.deployment.get(
            "arbiters",
            [
                "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
                "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
                "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
            ],
        )
        return [Web3.to_checksum_address(a) for a in raw]

    @property
    def parameters(self) -> dict[str, Any]:
        return dict(self.deployment.get("parameters", {}))

    def _get_contract(self, name: str) -> Contract:
        if name not in self.contracts:
            self.reload_deployment()
        if name not in self.contracts:
            raise ChainAdapterError(
                f"Contract {name} is not loaded in deployment {self.network}.",
                code="CONTRACT_NOT_LOADED",
                details={"contract": name, "network": self.network},
            )
        return self.contracts[name]

    def _send_tx(
        self,
        fn_call: Any,
        *,
        sender: str,
        value_wei: int = 0,
        action_label: str = "contract_tx",
    ) -> dict[str, Any]:
        """Execute a state-mutating contract call and wait for its transaction receipt."""
        chain_id = self.verify_connection_and_safety()
        checksum_sender = Web3.to_checksum_address(sender)
        tx_params: dict[str, Any] = {
            "from": checksum_sender,
            "chainId": chain_id,
        }
        if value_wei > 0:
            tx_params["value"] = int(value_wei)

        try:
            tx_hash = fn_call.transact(tx_params)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        except ContractLogicError as exc:
            raise ChainAdapterError(
                f"Contract revert during {action_label}: {exc}",
                code="CONTRACT_REVERT",
                status_code=400,
                details={"action": action_label, "sender": checksum_sender, "reason": str(exc)},
            ) from exc
        except Exception as exc:
            raise ChainAdapterError(
                f"Transaction failed during {action_label}: {exc}",
                code="TX_FAILED",
                details={"action": action_label, "sender": checksum_sender},
            ) from exc

        tx_hash_hex = "0x" + receipt["transactionHash"].hex().lstrip("0x")
        if len(tx_hash_hex) < 66:
            tx_hash_hex = "0x" + receipt["transactionHash"].hex().replace("0x", "").zfill(64)

        if int(receipt.get("status", 0)) != 1:
            raise ChainAdapterError(
                f"Transaction reverted on-chain during {action_label} (tx={tx_hash_hex})",
                code="TX_REVERTED_RECEIPT",
                details={"action": action_label, "tx_hash": tx_hash_hex},
            )

        log_event(
            self.logger,
            logging.INFO,
            f"Executed {action_label}",
            tx_hash=tx_hash_hex,
            sender=checksum_sender,
            gas_used=int(receipt.get("gasUsed", 0)),
            block_number=int(receipt.get("blockNumber", 0)),
        )
        return {
            "tx_hash": tx_hash_hex,
            "block_number": int(receipt.get("blockNumber", 0)),
            "gas_used": int(receipt.get("gasUsed", 0)),
            "receipt": receipt,
        }

    # =========================================================================
    # Anvil Time & Snapshot Controls (Local Mode)
    # =========================================================================

    def get_block_timestamp(self) -> int:
        """Return the latest block's UNIX timestamp."""
        self.verify_connection_and_safety()
        blk = self.w3.eth.get_block("latest")
        return int(blk["timestamp"])

    def advance_time(self, seconds: int) -> int:
        """Advance local Anvil block timestamp by `seconds` and mine a block."""
        if seconds <= 0:
            return self.get_block_timestamp()
        self.verify_connection_and_safety()
        if self.mode != "anvil":
            raise ChainAdapterError(
                "advance_time is only supported in local 'anvil' mode.",
                code="UNSUPPORTED_IN_TESTNET",
            )
        self.w3.provider.make_request("evm_increaseTime", [int(seconds)])  # type: ignore[arg-type]
        self.w3.provider.make_request("evm_mine", [])  # type: ignore[arg-type]
        return self.get_block_timestamp()

    # =========================================================================
    # 1. DeviceRegistry Wrappers
    # =========================================================================

    def register_device(
        self,
        device_id: str,
        installation_id: str,
        public_key_p256: str | bytes,
        *,
        operator: str | None = None,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Register a device and its 65-byte uncompressed P-256 public key in `DeviceRegistry`."""
        contract = self._get_contract("DeviceRegistry")
        op_addr = Web3.to_checksum_address(operator or self.operator_address)
        caller = Web3.to_checksum_address(sender or op_addr)
        dev_b32 = id_to_bytes32(device_id)
        inst_b32 = id_to_bytes32(installation_id)
        pub_bytes = (
            bytes.fromhex(public_key_p256[2:])
            if isinstance(public_key_p256, str)
            else bytes(public_key_p256)
        )
        res = self._send_tx(
            contract.functions.registerDevice(dev_b32, inst_b32, op_addr, pub_bytes),
            sender=caller,
            action_label="DeviceRegistry.registerDevice",
        )
        res["device_id_bytes32"] = "0x" + dev_b32.hex()
        res["installation_id_bytes32"] = "0x" + inst_b32.hex()
        return res

    def get_device(self, device_id: str | bytes) -> dict[str, Any]:
        """Query `DeviceRegistry.getDevice(deviceId)`."""
        contract = self._get_contract("DeviceRegistry")
        dev_b32 = id_to_bytes32(device_id)
        info = contract.functions.getDevice(dev_b32).call()
        status_int = int(info[3])
        return {
            "device_id_bytes32": "0x" + dev_b32.hex(),
            "installation_id_bytes32": bytes32_to_hex(info[0]),
            "operator": str(info[1]),
            "pub_key_p256": "0x" + bytes(info[2]).hex() if info[2] else "0x",
            "status_code": status_int,
            "status": DEVICE_STATUS_NAMES.get(status_int, "Unknown"),
            "registered_at": int(info[4]),
            "updated_at": int(info[5]),
        }

    def is_device_active(self, device_id: str | bytes) -> bool:
        contract = self._get_contract("DeviceRegistry")
        return bool(contract.functions.isDeviceActive(id_to_bytes32(device_id)).call())

    # =========================================================================
    # 2. BondVault Wrappers
    # =========================================================================

    def deposit_operator_bond(
        self,
        installation_id: str | bytes,
        amount_wei: int,
        *,
        sender: str | None = None,
    ) -> dict[str, Any]:
        contract = self._get_contract("BondVault")
        inst_b32 = id_to_bytes32(installation_id)
        caller = Web3.to_checksum_address(sender or self.operator_address)
        return self._send_tx(
            contract.functions.depositOperatorBond(inst_b32),
            sender=caller,
            value_wei=int(amount_wei),
            action_label="BondVault.depositOperatorBond",
        )

    def deposit_verifier_stake(
        self,
        verifier_address: str,
        amount_wei: int,
    ) -> dict[str, Any]:
        contract = self._get_contract("BondVault")
        v_addr = Web3.to_checksum_address(verifier_address)
        return self._send_tx(
            contract.functions.depositVerifierStake(),
            sender=v_addr,
            value_wei=int(amount_wei),
            action_label="BondVault.depositVerifierStake",
        )

    def operator_bond_of(self, installation_id: str | bytes) -> int:
        contract = self._get_contract("BondVault")
        return int(contract.functions.operatorBondOf(id_to_bytes32(installation_id)).call())

    def verifier_stake_of(self, verifier_address: str) -> int:
        contract = self._get_contract("BondVault")
        return int(
            contract.functions.verifierStakeOf(Web3.to_checksum_address(verifier_address)).call()
        )

    def claimable_rewards_of(self, account_address: str) -> int:
        contract = self._get_contract("BondVault")
        return int(
            contract.functions.claimableRewards(Web3.to_checksum_address(account_address)).call()
        )

    def claim_rewards(self, account_address: str) -> dict[str, Any]:
        contract = self._get_contract("BondVault")
        return self._send_tx(
            contract.functions.claimRewards(),
            sender=Web3.to_checksum_address(account_address),
            action_label="BondVault.claimRewards",
        )

    def get_vault_summary(self, installation_id: str | bytes) -> dict[str, Any]:
        contract = self._get_contract("BondVault")
        inst_b32 = id_to_bytes32(installation_id)
        op_bond = int(contract.functions.operatorBondOf(inst_b32).call())
        min_op_bond = int(contract.functions.minOperatorBondWei().call())
        min_ver_stake = int(contract.functions.minVerifierStakeWei().call())
        cum_slashed = int(contract.functions.cumulativeOperatorSlashed(inst_b32).call())
        active_challenges = int(contract.functions.activeChallengesCount(inst_b32).call())
        verifier_stakes = {
            v: int(contract.functions.verifierStakeOf(v).call())
            for v in self.verifier_addresses
        }
        verifier_rewards = {
            v: int(contract.functions.claimableRewards(v).call())
            for v in self.verifier_addresses
        }
        treasury_reward = int(
            contract.functions.claimableRewards(self.treasury_address).call()
        )
        operator_reward = int(
            contract.functions.claimableRewards(self.operator_address).call()
        )
        return {
            "installation_id_bytes32": "0x" + inst_b32.hex(),
            "operator_bond_wei": op_bond,
            "min_operator_bond_wei": min_op_bond,
            "min_verifier_stake_wei": min_ver_stake,
            "cumulative_operator_slashed_wei": cum_slashed,
            "active_challenges_count": active_challenges,
            "verifier_stakes_wei": verifier_stakes,
            "verifier_claimable_rewards_wei": verifier_rewards,
            "treasury_claimable_rewards_wei": treasury_reward,
            "operator_claimable_rewards_wei": operator_reward,
        }

    # =========================================================================
    # 3. BatchAnchor Wrappers
    # =========================================================================

    def anchor_batch(
        self,
        device_id: str | bytes,
        merkle_root: str | bytes,
        first_seq: int,
        last_seq: int,
        count: int,
        *,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Anchor a batch Merkle root in `BatchAnchor.anchorBatch`."""
        contract = self._get_contract("BatchAnchor")
        dev_b32 = id_to_bytes32(device_id)
        root_b32 = parse_bytes32(merkle_root)
        caller = Web3.to_checksum_address(sender or self.operator_address)

        res = self._send_tx(
            contract.functions.anchorBatch(
                dev_b32, root_b32, int(first_seq), int(last_seq), int(count)
            ),
            sender=caller,
            action_label="BatchAnchor.anchorBatch",
        )
        events = contract.events.BatchAnchored().process_receipt(res["receipt"])
        if events:
            batch_id = int(events[0]["args"]["batchId"])
        else:
            batch_id = int(contract.functions.nextBatchId().call()) - 1
        res["batch_id"] = batch_id
        return res

    def get_batch_on_chain(self, batch_id: int) -> dict[str, Any]:
        """Query `BatchAnchor.getBatch(batchId)`."""
        contract = self._get_contract("BatchAnchor")
        rec = contract.functions.getBatch(int(batch_id)).call()
        status_code = int(rec[8])
        return {
            "batch_id": int(rec[0]),
            "device_id_bytes32": bytes32_to_hex(rec[1]),
            "installation_id_bytes32": bytes32_to_hex(rec[2]),
            "merkle_root": bytes32_to_hex(rec[3]),
            "first_seq": int(rec[4]),
            "last_seq": int(rec[5]),
            "count": int(rec[6]),
            "anchored_at": int(rec[7]),
            "status_code": status_code,
            "status": BATCH_STATUS_NAMES.get(status_code, "Unknown"),
        }

    def verify_packet_inclusion_on_chain(
        self,
        batch_id: int,
        packet_hash: str | bytes,
        siblings: Sequence[str | bytes],
    ) -> bool:
        """Call `BatchAnchor.verifyPacketInclusion(batchId, packetHash, siblings)` on-chain."""
        contract = self._get_contract("BatchAnchor")
        pkt_b32 = parse_bytes32(packet_hash)
        sib_b32 = [parse_bytes32(s) for s in siblings]
        return bool(
            contract.functions.verifyPacketInclusion(int(batch_id), pkt_b32, sib_b32).call()
        )

    def expected_first_seq(self, device_id: str | bytes) -> int:
        contract = self._get_contract("BatchAnchor")
        return int(contract.functions.expectedFirstSeq(id_to_bytes32(device_id)).call())

    # =========================================================================
    # 4. VerifierQuorum Wrappers
    # =========================================================================

    def commit_vote(
        self,
        batch_id: int,
        commitment: str | bytes,
        *,
        verifier_address: str,
    ) -> dict[str, Any]:
        """Submit a sealed vote commitment in `VerifierQuorum.commitVote`."""
        contract = self._get_contract("VerifierQuorum")
        comm_b32 = parse_bytes32(commitment)
        v_addr = Web3.to_checksum_address(verifier_address)
        return self._send_tx(
            contract.functions.commitVote(int(batch_id), comm_b32),
            sender=v_addr,
            action_label="VerifierQuorum.commitVote",
        )

    def reveal_vote(
        self,
        batch_id: int,
        model_hash: str | bytes,
        input_hash: str | bytes,
        score_bp: int,
        verdict: int,
        salt: str | bytes,
        reason_codes_csv: str,
        *,
        verifier_address: str,
    ) -> dict[str, Any]:
        """Reveal a committed vote in `VerifierQuorum.revealVote`."""
        contract = self._get_contract("VerifierQuorum")
        v_addr = Web3.to_checksum_address(verifier_address)
        return self._send_tx(
            contract.functions.revealVote(
                int(batch_id),
                parse_bytes32(model_hash),
                parse_bytes32(input_hash),
                int(score_bp),
                int(verdict),
                parse_bytes32(salt),
                str(reason_codes_csv),
            ),
            sender=v_addr,
            action_label="VerifierQuorum.revealVote",
        )

    def finalize_batch(
        self,
        batch_id: int,
        *,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Call `VerifierQuorum.finalize(batchId)` and decode `QuorumFinalized` & `ChallengeOpened`."""
        quorum = self._get_contract("VerifierQuorum")
        challenge = self._get_contract("Challenge")
        caller = Web3.to_checksum_address(sender or self.admin_address)

        res = self._send_tx(
            quorum.functions.finalize(int(batch_id)),
            sender=caller,
            action_label="VerifierQuorum.finalize",
        )
        qf_events = quorum.events.QuorumFinalized().process_receipt(res["receipt"])
        pen_events = quorum.events.UnrevealedVerifierPenalized().process_receipt(res["receipt"])
        ch_events = challenge.events.ChallengeOpened().process_receipt(res["receipt"])

        if qf_events:
            args = qf_events[0]["args"]
            verdict_int = int(args["winningVerdict"])
            res["winning_verdict_code"] = verdict_int
            res["winning_verdict"] = VERDICT_NAMES.get(verdict_int, "Unknown")
            res["matching_votes"] = int(args["matchingVotes"])
            res["evidence_hash"] = bytes32_to_hex(args["evidenceHash"])

        res["unrevealed_penalties"] = [
            {
                "batch_id": int(e["args"]["batchId"]),
                "verifier": str(e["args"]["verifier"]),
                "penalty_amount_wei": int(e["args"]["penaltyAmount"]),
            }
            for e in pen_events
        ]

        if ch_events:
            c_args = ch_events[0]["args"]
            res["challenge_opened"] = {
                "batch_id": int(c_args["batchId"]),
                "installation_id_bytes32": bytes32_to_hex(c_args["installationId"]),
                "evidence_hash": bytes32_to_hex(c_args["evidenceHash"]),
                "window_closes_at": int(c_args["windowClosesAt"]),
            }
        else:
            res["challenge_opened"] = None

        return res

    def get_vote_on_chain(self, batch_id: int, verifier_address: str) -> dict[str, Any]:
        contract = self._get_contract("VerifierQuorum")
        v_addr = Web3.to_checksum_address(verifier_address)
        rv = contract.functions.getVote(int(batch_id), v_addr).call()
        verdict_int = int(rv[4])
        return {
            "verifier": str(rv[0]),
            "model_hash": bytes32_to_hex(rv[1]),
            "input_hash": bytes32_to_hex(rv[2]),
            "score_bp": int(rv[3]),
            "verdict_code": verdict_int,
            "verdict": VERDICT_NAMES.get(verdict_int, "Unknown"),
            "revealed": bool(rv[5]),
        }

    # =========================================================================
    # 5. Challenge Wrappers
    # =========================================================================

    def submit_operator_dispute(
        self,
        batch_id: int,
        dispute_evidence_hash: str | bytes,
        explanation_uri: str,
        *,
        packet_hash: str | bytes | None = None,
        merkle_siblings: Sequence[str | bytes] | None = None,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Submit an operator dispute on-chain (using 5-arg Merkle proof overload if `packet_hash` is given)."""
        contract = self._get_contract("Challenge")
        caller = Web3.to_checksum_address(sender or self.operator_address)
        ev_b32 = parse_bytes32(dispute_evidence_hash)

        if packet_hash is not None and merkle_siblings is not None:
            fn = contract.get_function_by_signature(
                "submitOperatorDispute(uint256,bytes32,bytes32,bytes32[],string)"
            )
            pkt_b32 = parse_bytes32(packet_hash)
            sibs_b32 = [parse_bytes32(s) for s in merkle_siblings]
            call_obj = fn(int(batch_id), ev_b32, pkt_b32, sibs_b32, str(explanation_uri))
        else:
            fn = contract.get_function_by_signature(
                "submitOperatorDispute(uint256,bytes32,string)"
            )
            call_obj = fn(int(batch_id), ev_b32, str(explanation_uri))

        return self._send_tx(
            call_obj,
            sender=caller,
            action_label="Challenge.submitOperatorDispute",
        )

    def resolve_challenge_vote(
        self,
        batch_id: int,
        uphold_fraud_flag: bool,
        resolution_notes: str,
        *,
        arbiter_address: str,
    ) -> dict[str, Any]:
        """Cast a single arbiter council vote on `Challenge.resolve`."""
        challenge = self._get_contract("Challenge")
        vault = self._get_contract("BondVault")
        arb_addr = Web3.to_checksum_address(arbiter_address)

        res = self._send_tx(
            challenge.functions.resolve(
                int(batch_id), bool(uphold_fraud_flag), str(resolution_notes)
            ),
            sender=arb_addr,
            action_label="Challenge.resolve",
        )
        vote_events = challenge.events.ArbiterVoteCast().process_receipt(res["receipt"])
        resolved_events = challenge.events.ChallengeResolved().process_receipt(res["receipt"])
        settled_events = challenge.events.ChallengeSettled().process_receipt(res["receipt"])
        op_slash_events = vault.events.OperatorSlashed().process_receipt(res["receipt"])
        ver_slash_events = vault.events.VerifierSlashed().process_receipt(res["receipt"])

        res["arbiter_vote"] = (
            {
                "batch_id": int(vote_events[0]["args"]["batchId"]),
                "arbiter": str(vote_events[0]["args"]["arbiter"]),
                "uphold_fraud_flag": bool(vote_events[0]["args"]["upholdFraudFlag"]),
                "current_votes": int(vote_events[0]["args"]["currentVotes"]),
                "required_votes": int(vote_events[0]["args"]["requiredVotes"]),
            }
            if vote_events
            else None
        )
        res["resolved"] = (
            {
                "batch_id": int(resolved_events[0]["args"]["batchId"]),
                "fraud_upheld": bool(resolved_events[0]["args"]["fraudUpheld"]),
                "arbiter": str(resolved_events[0]["args"]["arbiter"]),
                "resolution_notes": str(resolved_events[0]["args"]["resolutionNotes"]),
            }
            if resolved_events
            else None
        )
        if settled_events:
            st_code = int(settled_events[0]["args"]["finalStatus"])
            res["settled"] = {
                "batch_id": int(settled_events[0]["args"]["batchId"]),
                "final_status_code": st_code,
                "final_status": CHALLENGE_STATUS_NAMES.get(st_code, "Unknown"),
                "slashed_amount_wei": int(settled_events[0]["args"]["slashedAmount"]),
            }
        else:
            res["settled"] = None

        res["operator_slashed"] = (
            {
                "installation_id_bytes32": bytes32_to_hex(
                    op_slash_events[0]["args"]["installationId"]
                ),
                "slash_amount_wei": int(op_slash_events[0]["args"]["slashAmount"]),
                "verifier_reward_share_wei": int(
                    op_slash_events[0]["args"]["verifierRewardShare"]
                ),
                "treasury_share_wei": int(op_slash_events[0]["args"]["treasuryShare"]),
            }
            if op_slash_events
            else None
        )
        res["verifiers_slashed"] = [
            {
                "verifier": str(e["args"]["verifier"]),
                "slash_amount_wei": int(e["args"]["slashAmount"]),
                "recipient": str(e["args"]["recipient"]),
            }
            for e in ver_slash_events
        ]
        return res

    def settle_expired_challenge(
        self,
        batch_id: int,
        *,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Call `Challenge.settleExpired(batchId)` after `windowClosesAt`."""
        challenge = self._get_contract("Challenge")
        vault = self._get_contract("BondVault")
        caller = Web3.to_checksum_address(sender or self.admin_address)
        res = self._send_tx(
            challenge.functions.settleExpired(int(batch_id)),
            sender=caller,
            action_label="Challenge.settleExpired",
        )
        settled_events = challenge.events.ChallengeSettled().process_receipt(res["receipt"])
        op_slash_events = vault.events.OperatorSlashed().process_receipt(res["receipt"])
        if settled_events:
            st_code = int(settled_events[0]["args"]["finalStatus"])
            res["settled"] = {
                "batch_id": int(settled_events[0]["args"]["batchId"]),
                "final_status_code": st_code,
                "final_status": CHALLENGE_STATUS_NAMES.get(st_code, "Unknown"),
                "slashed_amount_wei": int(settled_events[0]["args"]["slashedAmount"]),
            }
        if op_slash_events:
            res["operator_slashed"] = {
                "installation_id_bytes32": bytes32_to_hex(
                    op_slash_events[0]["args"]["installationId"]
                ),
                "slash_amount_wei": int(op_slash_events[0]["args"]["slashAmount"]),
                "verifier_reward_share_wei": int(
                    op_slash_events[0]["args"]["verifierRewardShare"]
                ),
                "treasury_share_wei": int(op_slash_events[0]["args"]["treasuryShare"]),
            }
        return res

    def get_challenge_on_chain(self, batch_id: int) -> dict[str, Any]:
        """Query `Challenge.getChallenge(batchId)`."""
        contract = self._get_contract("Challenge")
        rec = contract.functions.getChallenge(int(batch_id)).call()
        st_code = int(rec[5])
        st_name = CHALLENGE_STATUS_NAMES.get(st_code, "Unknown")
        uphold_votes = int(contract.functions.upholdVotes(int(batch_id)).call())
        overturn_votes = int(contract.functions.overturnVotes(int(batch_id)).call())
        return {
            "batch_id": int(rec[0]),
            "installation_id_bytes32": bytes32_to_hex(rec[1]),
            "evidence_hash": bytes32_to_hex(rec[2]),
            "operator_dispute_hash": bytes32_to_hex(rec[3]),
            "window_closes_at": int(rec[4]),
            "status_code": st_code,
            "status": st_name,
            "report_challenge_status": CHALLENGE_STATUS_TO_REPORT_ENUM.get(st_name, "OPEN"),
            "uphold_votes": uphold_votes,
            "overturn_votes": overturn_votes,
        }

    # =========================================================================
    # 6. Attestation Wrappers
    # =========================================================================

    def record_attestation(
        self,
        installation_id: str | bytes,
        period_label: str,
        total_emissions_kg_co2e: int,
        production_kg: int,
        coverage_bp: int,
        period_merkle_root: str | bytes,
        verified_batch_ids: Sequence[int],
        *,
        sender: str | None = None,
    ) -> dict[str, Any]:
        """Record a period attestation on `Attestation.recordAttestation`."""
        contract = self._get_contract("Attestation")
        inst_b32 = id_to_bytes32(installation_id)
        root_b32 = parse_bytes32(period_merkle_root)
        batch_ids = [int(b) for b in verified_batch_ids]
        caller = Web3.to_checksum_address(sender or self.operator_address)

        res = self._send_tx(
            contract.functions.recordAttestation(
                inst_b32,
                str(period_label),
                int(total_emissions_kg_co2e),
                int(production_kg),
                int(coverage_bp),
                root_b32,
                batch_ids,
            ),
            sender=caller,
            action_label="Attestation.recordAttestation",
        )
        att_events = contract.events.AttestationRecorded().process_receipt(res["receipt"])
        if att_events:
            att_id = int(att_events[0]["args"]["attestationId"])
        else:
            att_id = int(contract.functions.nextAttestationId().call()) - 1
        res["attestation_id"] = att_id
        return res

    def get_attestation_on_chain(self, attestation_id: int) -> dict[str, Any]:
        """Query `Attestation.getAttestation(attestationId)` and `getAttestationBatchIds`."""
        contract = self._get_contract("Attestation")
        att = contract.functions.getAttestation(int(attestation_id)).call()
        batch_ids = contract.functions.getAttestationBatchIds(int(attestation_id)).call()
        return {
            "attestation_id": int(att[0]),
            "installation_id_bytes32": bytes32_to_hex(att[1]),
            "period_label": str(att[2]),
            "total_emissions_kg_co2e": int(att[3]),
            "production_kg": int(att[4]),
            "coverage_bp": int(att[5]),
            "period_merkle_root": bytes32_to_hex(att[6]),
            "attested_at": int(att[7]),
            "attested_by": str(att[8]),
            "verified_batch_ids": [int(b) for b in batch_ids],
        }

    # =========================================================================
    # Deployment & Demo Initialization Helpers
    # =========================================================================

    def deploy_contracts_direct(
        self,
        *,
        profile: str = "demo",
        commit_window_seconds: int = 30,
        reveal_window_seconds: int = 30,
        challenge_window_seconds: int = 120,
        withdrawal_delay_seconds: int = 180,
        min_operator_bond_wei: int = 1_000_000_000_000_000_000,
        min_verifier_stake_wei: int = 500_000_000_000_000_000,
        operator_slash_bps: int = 5000,
        verifier_reward_share_bps: int = 7000,
        careless_verifier_slash_bps: int = 1000,
        unrevealed_penalty_bps: int = 1000,
        required_arbiter_approvals: int = 2,
        verifier_count: int = 5,
        required_matches: int = 3,
        write_deployment_path: Path | None = None,
    ) -> dict[str, Any]:
        """Deploy and wire all 6 VeriCEMS contracts using compiled artifacts from `contracts/out/`."""
        chain_id = self.verify_connection_and_safety()
        accounts = [Web3.to_checksum_address(a) for a in self.w3.eth.accounts]
        if len(accounts) < 10:
            raise ChainAdapterError(
                f"Expected at least 10 unlocked accounts on local node, got {len(accounts)}"
            )

        admin = accounts[0]
        treasury = accounts[1]
        verifiers = accounts[2:7]
        arbiters = accounts[7:10]

        def _deploy_single(name: str, *ctor_args: Any) -> Contract:
            art = load_contract_artifact(name, self.contracts_out_dir)
            bytecode = art["bytecode"]["object"]
            factory = self.w3.eth.contract(abi=art["abi"], bytecode=bytecode)
            tx_hash = factory.constructor(*ctor_args).transact({"from": admin, "chainId": chain_id})
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            addr = Web3.to_checksum_address(receipt["contractAddress"])
            return self.w3.eth.contract(address=addr, abi=art["abi"])

        dev_reg = _deploy_single("DeviceRegistry", admin)
        bond_vault = _deploy_single(
            "BondVault",
            admin,
            dev_reg.address,
            int(min_operator_bond_wei),
            int(min_verifier_stake_wei),
            int(withdrawal_delay_seconds),
            int(verifier_reward_share_bps),
        )
        batch_anchor = _deploy_single(
            "BatchAnchor",
            admin,
            dev_reg.address,
            bond_vault.address,
        )
        quorum = _deploy_single(
            "VerifierQuorum",
            admin,
            bond_vault.address,
            batch_anchor.address,
            treasury,
            int(verifier_count),
            int(required_matches),
            int(commit_window_seconds),
            int(reveal_window_seconds),
            int(unrevealed_penalty_bps),
        )
        challenge = _deploy_single(
            "Challenge",
            admin,
            dev_reg.address,
            bond_vault.address,
            batch_anchor.address,
            quorum.address,
            treasury,
            int(challenge_window_seconds),
            int(operator_slash_bps),
            int(careless_verifier_slash_bps),
            int(required_arbiter_approvals),
        )
        attestation = _deploy_single(
            "Attestation",
            admin,
            dev_reg.address,
            batch_anchor.address,
        )

        # Wire roles identically to contracts/script/Deploy.s.sol
        ch_role_vault = bond_vault.functions.CHALLENGE_CONTRACT_ROLE().call()
        qu_role_vault = bond_vault.functions.QUORUM_CONTRACT_ROLE().call()
        self._send_tx(
            bond_vault.functions.grantRole(ch_role_vault, challenge.address),
            sender=admin,
            action_label="BondVault.grantRole(CHALLENGE)",
        )
        self._send_tx(
            bond_vault.functions.grantRole(qu_role_vault, quorum.address),
            sender=admin,
            action_label="BondVault.grantRole(QUORUM)",
        )

        qu_role_anchor = batch_anchor.functions.QUORUM_CONTRACT_ROLE().call()
        ch_role_anchor = batch_anchor.functions.CHALLENGE_CONTRACT_ROLE().call()
        self._send_tx(
            batch_anchor.functions.grantRole(qu_role_anchor, quorum.address),
            sender=admin,
            action_label="BatchAnchor.grantRole(QUORUM)",
        )
        self._send_tx(
            batch_anchor.functions.grantRole(ch_role_anchor, challenge.address),
            sender=admin,
            action_label="BatchAnchor.grantRole(CHALLENGE)",
        )

        self._send_tx(
            quorum.functions.setChallengeContract(challenge.address),
            sender=admin,
            action_label="VerifierQuorum.setChallengeContract",
        )

        ch_ver_role = challenge.functions.VERIFIER_ROLE().call()
        for v_addr in verifiers:
            self._send_tx(
                quorum.functions.registerVerifier(v_addr),
                sender=admin,
                action_label="VerifierQuorum.registerVerifier",
            )
            self._send_tx(
                challenge.functions.grantRole(ch_ver_role, v_addr),
                sender=admin,
                action_label="Challenge.grantRole(VERIFIER)",
            )

        arb_role = challenge.functions.ARBITER_ROLE().call()
        for a_addr in arbiters:
            self._send_tx(
                challenge.functions.grantRole(arb_role, a_addr),
                sender=admin,
                action_label="Challenge.grantRole(ARBITER)",
            )

        self.contracts = {
            "DeviceRegistry": dev_reg,
            "BondVault": bond_vault,
            "BatchAnchor": batch_anchor,
            "VerifierQuorum": quorum,
            "Challenge": challenge,
            "Attestation": attestation,
        }

        self.deployment = {
            "admin": admin,
            "arbiters": arbiters,
            "chainId": chain_id,
            "contracts": {k: c.address for k, c in self.contracts.items()},
            "parameters": {
                "carelessVerifierSlashBps": int(careless_verifier_slash_bps),
                "challengeWindowSeconds": int(challenge_window_seconds),
                "commitWindowSeconds": int(commit_window_seconds),
                "minOperatorBondWei": int(min_operator_bond_wei),
                "minVerifierStakeWei": int(min_verifier_stake_wei),
                "operatorSlashBps": int(operator_slash_bps),
                "requiredArbiterApprovals": int(required_arbiter_approvals),
                "requiredMatches": int(required_matches),
                "revealWindowSeconds": int(reveal_window_seconds),
                "unrevealedPenaltyBps": int(unrevealed_penalty_bps),
                "verifierCount": int(verifier_count),
                "verifierRewardShareBps": int(verifier_reward_share_bps),
                "withdrawalDelaySeconds": int(withdrawal_delay_seconds),
            },
            "profile": profile,
            "treasury": treasury,
            "verifiers": verifiers,
        }

        if write_deployment_path is not None:
            Path(write_deployment_path).parent.mkdir(parents=True, exist_ok=True)
            Path(write_deployment_path).write_text(
                json.dumps(self.deployment, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )

        return self.deployment

    def ensure_device_and_stakes(
        self,
        *,
        device_id: str,
        installation_id: str,
        public_key_p256: str,
        operator_bond_wei: int | None = None,
        verifier_stake_wei: int | None = None,
    ) -> dict[str, Any]:
        """Ensure device is registered in `DeviceRegistry` and operator + 5 verifiers are staked."""
        params = self.parameters
        target_op_bond = int(
            operator_bond_wei
            if operator_bond_wei is not None
            else int(params.get("minOperatorBondWei", 1_000_000_000_000_000_000)) * 2
        )
        target_ver_stake = int(
            verifier_stake_wei
            if verifier_stake_wei is not None
            else int(params.get("minVerifierStakeWei", 500_000_000_000_000_000)) * 2
        )

        dev_info = self.get_device(device_id)
        if dev_info["status"] == "Unregistered":
            self.register_device(
                device_id=device_id,
                installation_id=installation_id,
                public_key_p256=public_key_p256,
            )
        elif dev_info["pub_key_p256"].lower() != public_key_p256.lower() and dev_info["status"] == "Active":
            contract = self._get_contract("DeviceRegistry")
            self._send_tx(
                contract.functions.rotateKey(
                    id_to_bytes32(device_id), bytes.fromhex(public_key_p256[2:])
                ),
                sender=self.operator_address,
                action_label="DeviceRegistry.rotateKey",
            )

        curr_op_bond = self.operator_bond_of(installation_id)
        if curr_op_bond < target_op_bond:
            self.deposit_operator_bond(installation_id, target_op_bond - curr_op_bond)

        for v_addr in self.verifier_addresses:
            curr_stake = self.verifier_stake_of(v_addr)
            if curr_stake < target_ver_stake:
                self.deposit_verifier_stake(v_addr, target_ver_stake - curr_stake)

        return self.get_vault_summary(installation_id)


def find_free_port() -> int:
    """Return an available localhost TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _resolve_foundry_binary(name: str) -> str:
    local_path = REPO_ROOT / ".venv" / "Scripts" / f"{name}.exe"
    if local_path.exists():
        return str(local_path)
    which_path = shutil.which(name)
    if which_path:
        return which_path
    parent_path = REPO_ROOT.parent / ".venv" / "Scripts" / f"{name}.exe"
    if parent_path.exists():
        return str(parent_path)
    home_path = Path.home() / ".foundry" / "bin" / f"{name}.exe"
    if home_path.exists():
        return str(home_path)
    return name


@dataclass
class AnvilProcess:
    """Manages a local `anvil` subprocess for integration tests and `make demo-backend`."""

    port: int = 8545
    host: str = "127.0.0.1"
    process: subprocess.Popen[str] | None = None

    @property
    def rpc_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self, *, timeout_seconds: float = 10.0) -> str:
        """Start `anvil` if not already listening on `self.port`."""
        if self.is_listening():
            return self.rpc_url

        cmd_bin = _resolve_foundry_binary("anvil")

        self.process = subprocess.Popen(
            [cmd_bin, "--host", self.host, "--port", str(self.port), "--accounts", "10", "--balance", "10000"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )

        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self.is_listening():
                return self.rpc_url
            time.sleep(0.1)

        self.stop()
        raise ChainAdapterError(
            f"Timed out waiting for Anvil to start on {self.rpc_url}",
            code="ANVIL_START_TIMEOUT",
        )

    def is_listening(self) -> bool:
        try:
            w3 = Web3(HTTPProvider(self.rpc_url, request_kwargs={"timeout": 1.5}))
            return int(w3.eth.chain_id) == 31337
        except Exception:
            return False

    def run_forge_deploy(self, *, profile: str = "demo") -> None:
        """Run `forge script script/Deploy.s.sol:Deploy --broadcast --unlocked` against this Anvil."""
        cmd_bin = _resolve_foundry_binary("forge")
        env = dict(os.environ)
        env["VERICEMS_PROFILE"] = profile
        proc = subprocess.run(
            [
                cmd_bin,
                "script",
                "script/Deploy.s.sol:Deploy",
                "--rpc-url",
                self.rpc_url,
                "--broadcast",
                "--unlocked",
                "--sender",
                "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            ],
            cwd=str(REPO_ROOT / "contracts"),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise ChainAdapterError(
                f"Forge deployment script failed (exit={proc.returncode}): {proc.stderr or proc.stdout}",
                code="FORGE_DEPLOY_FAILED",
            )

    def stop(self) -> None:
        if self.process is not None:
            try:
                self.process.terminate()
                self.process.wait(timeout=5.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            finally:
                self.process = None
