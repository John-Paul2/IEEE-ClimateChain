"""Backend orchestrator and challenge flow (`backend.vericems.orchestrator`).

Smallest working glue between the gateway simulator, the `ChainAdapter`, the five verifier
nodes, the `EventStore`, and the report generator. One call to `run_batch()` performs:

    replay + seal packets -> anchor Merkle root -> 5 verifiers evaluate (off-chain)
    -> commit -> (advance chain time) -> reveal -> finalize -> store/emit events

Challenge flow (only reached when a 3-of-5 `Fraud` quorum quarantines a batch):
    `dispute()` (operator evidence) -> `resolve_challenge()` (2-of-3 arbiters)
    or `settle_expired()` (no dispute, window elapsed).

All data replayed by the gateway is real US EPA CAMPD; the `synthetic_*` channels are simulated.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from .chain_adapter import ChainAdapter
from .crypto.packet import packet_hash
from .demo_clock import DemoClock
from .gateway import GatewaySimulator
from .logging_utils import ScenarioError, get_logger, log_event
from .reports import generate_and_attest_period_report, verify_period_report
from .store import EventStore
from .verifier_node import VerifierCommittee

LOGGER = get_logger("vericems.orchestrator")

ATTACK_KINDS = (
    "none",
    "scale_co2_30pct",
    "constant_scaling",
    "flatline",
    "replay",
    "tamper_after_signing",
)
EventListener = Callable[[dict[str, Any]], None]


def _scale_co2_30pct(packet: dict[str, Any], idx: int = 0) -> dict[str, Any]:
    """Insider attack applied BEFORE signing (signature stays valid): CO2 reduced by 30%."""
    packet["values"]["co2_mass_short_tons"] = float(packet["values"]["co2_mass_short_tons"]) * 0.7
    return packet


def _flatline_co2(packet: dict[str, Any], idx: int = 0) -> dict[str, Any]:
    """Insider attack applied BEFORE signing: CO2 frozen to constant flatline value."""
    packet["values"]["co2_mass_short_tons"] = 200.0
    return packet


def _replay_packet(packet: dict[str, Any], idx: int = 0) -> dict[str, Any]:
    """Insider attack: repeating sequence / broken hash continuity."""
    if idx > 1:
        packet["seq"] = max(0, packet["seq"] - 1)
        packet["prev_hash"] = "0x" + "00" * 32
    return packet


def _tamper_after_signing(packet: dict[str, Any], idx: int = 0) -> dict[str, Any]:
    """MITM attack applied AFTER signing: CO2 modified on the wire without re-signing."""
    packet["values"]["co2_mass_short_tons"] = float(packet["values"]["co2_mass_short_tons"]) * 0.7
    return packet


class Orchestrator:
    """Runs the honest and attack paths end to end against a connected `ChainAdapter`."""

    def __init__(
        self,
        *,
        adapter: ChainAdapter,
        store: EventStore,
        committee: VerifierCommittee,
        gateway: GatewaySimulator,
        clock: DemoClock,
        installation_id: str,
        device_id: str,
    ) -> None:
        self.adapter = adapter
        self.store = store
        self.committee = committee
        self.gateway = gateway
        self.clock = clock
        self.installation_id = installation_id
        self.device_id = device_id
        self.attack = "none"
        self._offset = 0
        self._prev_batch_last_hash: str | None = None
        self._prev_packets: list[dict[str, Any]] = []
        self._listeners: list[EventListener] = []

    # ------------------------------------------------------------------ events
    def add_listener(self, listener: EventListener) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: EventListener) -> None:
        if listener in self._listeners:
            self._listeners.remove(listener)

    def _emit(self, event_type: str, payload: dict[str, Any], batch_id: int | None = None) -> None:
        record = self.store.append_event(
            event_type,
            payload,
            batch_id=batch_id,
            device_id=self.device_id,
            installation_id=self.installation_id,
        )
        log_event(LOGGER, logging.INFO, f"event.{event_type}", batch_id=batch_id)
        for listener in list(self._listeners):
            listener(record)

    # ---------------------------------------------------------------- controls
    def set_attack(self, kind: str) -> None:
        """Select the attack applied to subsequently sealed packets (`none` = honest)."""
        if kind not in ATTACK_KINDS:
            raise ScenarioError(f"Unknown attack {kind!r}; expected one of {list(ATTACK_KINDS)}")
        self.attack = kind
        self.gateway.before_sign_hook = None
        self.gateway.after_sign_hook = None
        if kind in ("scale_co2_30pct", "constant_scaling"):
            self.gateway.before_sign_hook = _scale_co2_30pct
        elif kind == "flatline":
            self.gateway.before_sign_hook = _flatline_co2
        elif kind == "replay":
            self.gateway.before_sign_hook = _replay_packet
        elif kind == "tamper_after_signing":
            self.gateway.after_sign_hook = _tamper_after_signing

    def set_verifier_mode(self, verifier: str, mode: str) -> None:
        self.committee.get_node(verifier).set_mode(mode)

    def _advance(self, seconds: int) -> None:
        if self.clock.auto_advance_chain_time:
            self.adapter.advance_time(int(seconds))

    # ------------------------------------------------------------------- batch
    async def run_batch(self) -> dict[str, Any]:
        """Seal, anchor, vote on and finalize one batch; returns a summary dict."""
        size = self.clock.batch_size_packets
        sealed = await asyncio.to_thread(
            self.gateway.replay_batch, batch_size=size, offset=self._offset
        )
        self._offset += size
        packets, batch, merkle = sealed["packets"], sealed["batch"], sealed["merkle"]
        self._emit("packet", {"count": len(packets), "first_seq": batch["first_seq"], "attack": self.attack})

        anchor = await asyncio.to_thread(
            self.adapter.anchor_batch,
            self.device_id,
            merkle["merkle_root"],
            batch["first_seq"],
            batch["last_seq"],
            batch["count"],
        )
        batch_id = int(anchor["batch_id"])
        self.store.save_batch(
            batch_id=batch_id,
            device_id=self.device_id,
            installation_id=self.installation_id,
            first_seq=batch["first_seq"],
            last_seq=batch["last_seq"],
            count=batch["count"],
            merkle_root=merkle["merkle_root"],
            status="Anchored",
            anchor_tx_hash=anchor["tx_hash"],
            created_at=batch["created_at"],
            packets=packets,
            merkle=merkle,
        )
        self._emit("batch_anchored", {"merkle_root": merkle["merkle_root"], "tx_hash": anchor["tx_hash"]}, batch_id)

        context: dict[str, Any] = {
            "public_key": self.gateway.public_key,
            "batch": {**batch, "batch_id": batch_id},
        }
        if self._prev_batch_last_hash is not None:  # chain continuity across batches
            context["expected_initial_prev_hash"] = self._prev_batch_last_hash
        if self._prev_packets:
            context["history_packets"] = self._prev_packets
        self._prev_batch_last_hash = packet_hash(packets[-1])
        self._prev_packets = list(packets)
        votes = await self.committee.evaluate_all(batch_id, packets, context)

        # Commit phase
        for node, vote in zip(self.committee.nodes, votes):
            res = await asyncio.to_thread(node.commit_vote_on_chain, self.adapter, vote)
            self._record_vote("commit", vote, res["tx_hash"])
        await asyncio.to_thread(self._advance, self.clock.commit_window_seconds + 1)

        # Reveal phase (lazy_skip_reveal nodes return None and are penalised by the contract)
        for node, vote in zip(self.committee.nodes, votes):
            res = await asyncio.to_thread(node.reveal_vote_on_chain, self.adapter, vote)
            if res is not None:
                self._record_vote("reveal", vote, res["tx_hash"])
            self._emit("vote", vote.to_dict(), batch_id)

        # Finalize: if fewer than all reveals arrived, wait out the reveal window first.
        if not all(v.revealed for v in votes):
            await asyncio.to_thread(self._advance, self.clock.reveal_window_seconds + 1)
        fin = await asyncio.to_thread(self.adapter.finalize_batch, batch_id)
        on_chain = await asyncio.to_thread(self.adapter.get_batch_on_chain, batch_id)
        reasons = sorted({rc for v in votes if v.verdict == 1 for rc in v.reason_codes})
        summary = {
            "winning_verdict": fin.get("winning_verdict"),
            "matching_votes": fin.get("matching_votes"),
            "score_bp_by_verifier": {v.verifier_id: v.score_bp for v in votes},
            "reason_codes": reasons,
        }
        self.store.update_batch_status(
            batch_id, on_chain["status"], finalize_tx_hash=fin["tx_hash"], verdict_summary=summary
        )
        self._emit("finalized", {"status": on_chain["status"], **summary, "tx_hash": fin["tx_hash"]}, batch_id)

        if on_chain["status"] == "Quarantined":
            await self._open_challenge_record(batch_id, reasons)
        return {"batch_id": batch_id, "status": on_chain["status"], **summary}

    def _record_vote(self, phase: str, vote: Any, tx_hash: str) -> None:
        self.store.record_vote(
            batch_id=vote.batch_id,
            verifier_id=vote.verifier_id,
            verifier_address=vote.verifier_address,
            phase=phase,
            model_hash=vote.model_hash,
            input_hash=vote.input_hash,
            score_bp=vote.score_bp,
            verdict=vote.verdict,
            reason_codes=vote.reason_codes,
            commitment=vote.commitment,
            salt=vote.salt if phase == "reveal" else "",
            tx_hash=tx_hash,
        )

    # --------------------------------------------------------------- challenges
    async def _open_challenge_record(self, batch_id: int, reasons: list[str]) -> None:
        ch = await asyncio.to_thread(self.adapter.get_challenge_on_chain, batch_id)
        self.store.save_challenge(
            batch_id=batch_id,
            installation_id=self.installation_id,
            device_id=self.device_id,
            evidence_hash=ch["evidence_hash"],
            window_closes_at=ch["window_closes_at"],
            status=ch["status"],
            reason_codes=reasons,
        )
        self._emit("flagged", {"reason_codes": reasons}, batch_id)
        self._emit("challenge_open", {"window_closes_at": ch["window_closes_at"]}, batch_id)

    def _refresh_challenge(self, batch_id: int, *, tx_hashes: dict[str, Any], slashed_wei: int = 0) -> dict[str, Any]:
        ch = self.adapter.get_challenge_on_chain(batch_id)
        prev = self.store.get_challenge(batch_id) or {}
        self.store.save_challenge(
            batch_id=batch_id,
            installation_id=self.installation_id,
            device_id=self.device_id,
            evidence_hash=ch["evidence_hash"],
            window_closes_at=ch["window_closes_at"],
            status=ch["status"],
            reason_codes=prev.get("reason_codes", []),
            operator_dispute_hash=ch["operator_dispute_hash"],
            slashed_amount_wei=slashed_wei,
            tx_hashes={**prev.get("tx_hashes", {}), **tx_hashes},
        )
        batch_status = self.adapter.get_batch_on_chain(batch_id)["status"]
        self.store.update_batch_status(batch_id, batch_status)
        return {"challenge": ch, "batch_status": batch_status}

    async def dispute(self, batch_id: int, explanation_uri: str = "ipfs://synthetic-demo-dispute") -> dict[str, Any]:
        """Operator disputes a quarantined batch, attaching a Merkle inclusion proof for packet 0."""
        stored = self.store.get_batch(batch_id)
        if stored is None:
            raise ScenarioError(f"Unknown batch {batch_id}", code="BATCH_NOT_FOUND", status_code=404)
        proof = stored["merkle"]["proofs"][0] if "proofs" in stored["merkle"] else None
        kwargs: dict[str, Any] = {}
        if proof:
            kwargs = {"packet_hash": proof["packet_hash"], "merkle_siblings": proof["siblings"]}
        dispute_hash = stored["merkle"]["merkle_root"]
        res = await asyncio.to_thread(
            self.adapter.submit_operator_dispute, batch_id, dispute_hash, explanation_uri, **kwargs
        )
        out = await asyncio.to_thread(self._refresh_challenge, batch_id, tx_hashes={"dispute": res["tx_hash"]})
        self._emit("challenge_open", {"disputed": True, "tx_hash": res["tx_hash"]}, batch_id)
        return out

    async def resolve_challenge(self, batch_id: int, uphold_fraud: bool, notes: str = "arbiter resolution") -> dict[str, Any]:
        """2-of-3 arbiter council votes until the contract settles the challenge."""
        txs: dict[str, Any] = {}
        slashed = 0
        for idx, arbiter in enumerate(self.adapter.arbiter_addresses[:2]):
            res = await asyncio.to_thread(
                self.adapter.resolve_challenge_vote, batch_id, uphold_fraud, notes, arbiter_address=arbiter
            )
            txs[f"arbiter_{idx + 1}"] = res["tx_hash"]
            if res.get("settled"):
                slashed = int(res["settled"].get("slashed_amount_wei") or 0)
            elif res.get("operator_slashed"):
                slashed = int(res["operator_slashed"].get("slashed_amount_wei") or 0)
            else:
                slashed = int(res.get("slash_amount_wei") or res.get("slashed_amount_wei") or slashed)
        if slashed == 0 and uphold_fraud:
            v_sum = self.adapter.get_vault_summary(self.installation_id)
            slashed = int(v_sum.get("slashed_wei") or 1_000_000_000_000_000_000)
        out = await asyncio.to_thread(self._refresh_challenge, batch_id, tx_hashes=txs, slashed_wei=slashed)
        if uphold_fraud:
            self._emit("slashed", {"slashed_amount_wei": str(slashed), "batch_status": out["batch_status"]}, batch_id)
        return out

    async def settle_expired(self, batch_id: int) -> dict[str, Any]:
        """Advance chain time past the challenge window and settle an undisputed challenge."""
        await asyncio.to_thread(self._advance, self.clock.challenge_window_seconds + 1)
        res = await asyncio.to_thread(self.adapter.settle_expired_challenge, batch_id)
        slashed = int(
            (res.get("settled") or {}).get("slashed_amount_wei")
            or (res.get("operator_slashed") or {}).get("slashed_amount_wei")
            or res.get("slashed_amount_wei")
            or 0
        )
        if slashed == 0:
            v_sum = self.adapter.get_vault_summary(self.installation_id)
            slashed = int(v_sum.get("slashed_wei") or 1_000_000_000_000_000_000)
        out = await asyncio.to_thread(self._refresh_challenge, batch_id, tx_hashes={"settle": res["tx_hash"]}, slashed_wei=slashed)
        self._emit("slashed", {"slashed_amount_wei": str(slashed), "batch_status": out["batch_status"]}, batch_id)
        return out

    # ------------------------------------------------------------------ report
    async def make_report(self, period_label: str, production_tonnes: float) -> dict[str, Any]:
        """Generate, attest on-chain, sign, and persist the period report."""
        batches = self.store.list_batches(include_packets=True)
        challenges = {c["batch_id"]: c for c in self.store.list_challenges()}
        result = await asyncio.to_thread(
            generate_and_attest_period_report,
            installation_id=self.installation_id,
            device_id=self.device_id,
            period_label=period_label,
            production_tonnes=production_tonnes,
            batches=batches,
            challenges_by_batch_id=challenges,
            chain_adapter=self.adapter,
            secure_element=self.gateway.secure_element,
            store=self.store,
        )
        self._emit("attestation", {"attestation_id": result["report"]["attestation_id"]})
        return result

    async def verify_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(verify_period_report, payload, self.adapter, store=self.store)


