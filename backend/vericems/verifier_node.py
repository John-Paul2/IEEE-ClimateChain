"""Five independent verifier nodes and committee coordinator (`backend.vericems.verifier_node`).

Each verifier node (`verifier_1` .. `verifier_5`):
1. Holds its own EVM account address and stake in `BondVault`.
2. Loads the committed ONNX physics-informed autoencoder and threshold artifacts (`ml/artifacts/`).
3. Runs `verify_batch(packets, context)` independently on CPU.
4. Submits a sealed `commitVote` (`keccak256(abi.encode(batchId, modelHash, inputHash, scoreBp, verdict, salt))`)
   and then `revealVote` on `VerifierQuorum`.
5. Supports optional demo modes (`"honest"`, `"lazy_skip_reveal"`, `"lazy_rubber_stamp"`, `"force_fraud"`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
import hashlib
from pathlib import Path
from typing import Any, Final

from backend.vericems.chain_adapter import ChainAdapter
from backend.vericems.crypto.merkle import build_merkle_tree, compute_vote_commitment
from backend.vericems.detectors.verifier import (
    DEFAULT_ARTIFACTS_DIR,
    PHYSICS_RESIDUAL,
    ProposedDetector,
    Verdict,
    load_proposed_detector,
    verify_batch,
)
from backend.vericems.logging_utils import ScenarioError

VALID_VERIFIER_MODES: Final[frozenset[str]] = frozenset(
    {
        "honest",
        "lazy_skip_reveal",
        "lazy_rubber_stamp",
        "force_fraud",
    }
)


@dataclass
class PreparedVote:
    """Prepared off-chain evaluation and commitment for a single verifier on a batch."""

    batch_id: int
    verifier_id: str
    verifier_address: str
    mode: str
    model_hash: str
    input_hash: str
    score_bp: int
    verdict: int
    reason_codes: list[str]
    salt: str
    commitment: str
    component_scores: dict[str, float] = field(default_factory=dict)
    commit_tx_hash: str | None = None
    reveal_tx_hash: str | None = None
    committed: bool = False
    revealed: bool = False

    @property
    def reason_codes_csv(self) -> str:
        return ",".join(self.reason_codes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "batch_id": int(self.batch_id),
            "verifier_id": str(self.verifier_id),
            "verifier_address": str(self.verifier_address),
            "mode": str(self.mode),
            "model_hash": str(self.model_hash),
            "input_hash": str(self.input_hash),
            "score_bp": int(self.score_bp),
            "verdict": int(self.verdict),
            "reason_codes": list(self.reason_codes),
            "salt": str(self.salt),
            "vote_commitment": str(self.commitment),
            "component_scores": dict(self.component_scores),
            "commit_tx_hash": self.commit_tx_hash,
            "reveal_tx_hash": self.reveal_tx_hash,
            "committed": bool(self.committed),
            "revealed": bool(self.revealed),
        }


class VerifierNode:
    """Single verifier node with its own address, ONNX detector instance, and voting mode."""

    def __init__(
        self,
        verifier_id: str,
        node_index: int,
        address: str,
        *,
        artifacts_dir: Path = DEFAULT_ARTIFACTS_DIR,
        mode: str = "honest",
    ) -> None:
        if mode not in VALID_VERIFIER_MODES:
            raise ScenarioError(
                f"Invalid verifier mode={mode!r}. Expected one of {sorted(VALID_VERIFIER_MODES)}"
            )
        self.verifier_id = str(verifier_id)
        self.node_index = int(node_index)
        self.address = str(address)
        self.artifacts_dir = Path(artifacts_dir)
        self.mode = str(mode)
        self.detector: ProposedDetector = load_proposed_detector(self.artifacts_dir)
        self.batches_evaluated: int = 0
        self.last_vote: dict[str, Any] | None = None

    def set_mode(self, mode: str) -> None:
        """Update verifier behavior mode (`honest`, `lazy_skip_reveal`, `lazy_rubber_stamp`, `force_fraud`)."""
        if mode not in VALID_VERIFIER_MODES:
            raise ScenarioError(
                f"Invalid verifier mode={mode!r}. Expected one of {sorted(VALID_VERIFIER_MODES)}"
            )
        self.mode = str(mode)

    def _derive_salt(self, batch_id: int, input_hash: str) -> str:
        seed = f"VeriCEMS-VOTE-SALT-v1:{self.verifier_id}:{self.address}:{batch_id}:{input_hash}"
        return "0x" + hashlib.sha256(seed.encode("utf-8")).hexdigest()

    async def evaluate_batch_async(
        self,
        batch_id: int,
        packets: Sequence[Mapping[str, Any]],
        context: Mapping[str, Any] | None = None,
    ) -> PreparedVote:
        """Run `verify_batch` inside an async task and compute the DECISION-05 vote commitment."""
        await asyncio.sleep(0)
        ctx = dict(context) if context is not None else {}
        ctx["batch_id"] = int(batch_id)
        ctx["detector"] = self.detector
        ctx["input_hash_mode"] = "merkle_root"

        merkle_root = (
            str(ctx["batch"]["merkle_root"])
            if isinstance(ctx.get("batch"), Mapping) and "merkle_root" in ctx["batch"]
            else build_merkle_tree(packets).merkle_root
        )

        if self.mode == "lazy_rubber_stamp":
            score_bp = 0
            verdict_int = 0
            reason_codes: list[str] = []
            comp_scores: dict[str, float] = {"lazy_rubber_stamp": 1.0}
        elif self.mode == "force_fraud":
            # Used for the Overturned Challenge scenario where careless verifiers falsely flag clean data
            v_eval: Verdict = verify_batch(packets, ctx)
            score_bp = max(int(v_eval.score_bp), 7500)
            verdict_int = 1
            reason_codes = list(v_eval.reason_codes) or [PHYSICS_RESIDUAL]
            comp_scores = dict(v_eval.component_scores)
        else:
            v_eval = verify_batch(packets, ctx)
            score_bp = int(v_eval.score_bp)
            verdict_int = int(v_eval.verdict)
            reason_codes = list(v_eval.reason_codes)
            comp_scores = dict(v_eval.component_scores)

        salt_hex = self._derive_salt(batch_id, merkle_root)
        _, commitment = compute_vote_commitment(
            batch_id=int(batch_id),
            model_hash_hex=self.detector.model_hash,
            input_hash_hex=merkle_root,
            score_bp=score_bp,
            verdict=verdict_int,
            salt_hex=salt_hex,
        )

        self.batches_evaluated += 1
        pv = PreparedVote(
            batch_id=int(batch_id),
            verifier_id=self.verifier_id,
            verifier_address=self.address,
            mode=self.mode,
            model_hash=self.detector.model_hash,
            input_hash=merkle_root,
            score_bp=score_bp,
            verdict=verdict_int,
            reason_codes=reason_codes,
            salt=salt_hex,
            commitment=commitment,
            component_scores=comp_scores,
        )
        self.last_vote = pv.to_dict()
        return pv

    def commit_vote_on_chain(
        self, chain_adapter: ChainAdapter, prepared: PreparedVote
    ) -> dict[str, Any]:
        """Submit `VerifierQuorum.commitVote` on-chain."""
        tx_res = chain_adapter.commit_vote(
            batch_id=prepared.batch_id,
            commitment=prepared.commitment,
            verifier_address=self.address,
        )
        prepared.committed = True
        prepared.commit_tx_hash = tx_res["tx_hash"]
        self.last_vote = prepared.to_dict()
        return tx_res

    def reveal_vote_on_chain(
        self, chain_adapter: ChainAdapter, prepared: PreparedVote
    ) -> dict[str, Any] | None:
        """Submit `VerifierQuorum.revealVote` on-chain unless in `lazy_skip_reveal` mode."""
        if self.mode == "lazy_skip_reveal":
            prepared.revealed = False
            self.last_vote = prepared.to_dict()
            return None

        tx_res = chain_adapter.reveal_vote(
            batch_id=prepared.batch_id,
            model_hash=prepared.model_hash,
            input_hash=prepared.input_hash,
            score_bp=prepared.score_bp,
            verdict=prepared.verdict,
            salt=prepared.salt,
            reason_codes_csv=prepared.reason_codes_csv,
            verifier_address=self.address,
        )
        prepared.revealed = True
        prepared.reveal_tx_hash = tx_res["tx_hash"]
        self.last_vote = prepared.to_dict()
        return tx_res

    def to_status_dict(self, chain_adapter: ChainAdapter | None = None) -> dict[str, Any]:
        stake_wei = 0
        reward_wei = 0
        if chain_adapter is not None:
            try:
                stake_wei = chain_adapter.verifier_stake_of(self.address)
                reward_wei = chain_adapter.claimable_rewards_of(self.address)
            except Exception:
                pass
        return {
            "verifier_id": self.verifier_id,
            "node_index": self.node_index,
            "address": self.address,
            "mode": self.mode,
            "model_hash": self.detector.model_hash,
            "stake_wei": str(stake_wei),
            "claimable_rewards_wei": str(reward_wei),
            "batches_evaluated": self.batches_evaluated,
            "last_vote": self.last_vote,
        }


class VerifierCommittee:
    """Manages the 5 verifier nodes (`verifier_1` .. `verifier_5`)."""

    def __init__(
        self,
        addresses: Sequence[str],
        *,
        artifacts_dir: Path = DEFAULT_ARTIFACTS_DIR,
    ) -> None:
        if len(addresses) != 5:
            raise ValueError(f"VerifierCommittee requires 5 verifier addresses, got {len(addresses)}")
        self.nodes: list[VerifierNode] = [
            VerifierNode(
                verifier_id=f"verifier_{idx + 1}",
                node_index=idx,
                address=addr,
                artifacts_dir=artifacts_dir,
            )
            for idx, addr in enumerate(addresses)
        ]

    def get_node(self, verifier_id_or_address: str) -> VerifierNode:
        target = verifier_id_or_address.strip().lower()
        for node in self.nodes:
            if (
                node.verifier_id.lower() == target
                or node.address.lower() == target
                or str(node.node_index) == target
            ):
                return node
        raise ScenarioError(
            f"Unknown verifier node {verifier_id_or_address!r}",
            code="VERIFIER_NOT_FOUND",
            status_code=404,
        )

    def reset_modes(self, default_mode: str = "honest") -> None:
        for node in self.nodes:
            node.set_mode(default_mode)

    async def evaluate_all(
        self,
        batch_id: int,
        packets: Sequence[Mapping[str, Any]],
        context: Mapping[str, Any] | None = None,
    ) -> list[PreparedVote]:
        """Run all 5 verifier nodes concurrently as async tasks."""
        tasks = [
            asyncio.create_task(node.evaluate_batch_async(batch_id, packets, context))
            for node in self.nodes
        ]
        return list(await asyncio.gather(*tasks))

    def list_status(self, chain_adapter: ChainAdapter | None = None) -> list[dict[str, Any]]:
        return [node.to_status_dict(chain_adapter) for node in self.nodes]
