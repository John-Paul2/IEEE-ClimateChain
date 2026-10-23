"""Backend Scenario Engine (`backend.vericems.scenario`).

Provides deterministic step-by-step and timed play/pause/reset execution of the
complete VeriCEMS story for video recording and automated end-to-end testing:

Story Steps:
    1. Normal batches flow and coverage rises.
    2. An insider injects a constant-scaling attack before signing.
    3. Verifiers detect it and vote; the batch is quarantined; reasons explained.
    4. The operator disputes; arbiters uphold; bond is slashed.
    5. Period report is generated and on-chain attestation recorded.
    6. Switch to Importer view: upload report, verification succeeds, tampered copy fails,
       cost comparison shown.
    7. Show Benchmark page with 'What still gets through' disclosure.

Determinism & Reset:
    Uses Anvil EVM snapshot/revert to instantly roll back blockchain state,
    resets SQLite EventStore tables, resets edge gateway sequences and seed.
    Running the scenario multiple times in a row produces identical on-chain and UI results.
"""

from __future__ import annotations

import asyncio
import copy
from dataclasses import asdict, dataclass
import logging
from pathlib import Path
import re
from typing import Any, Final

from .logging_utils import ScenarioError, get_logger, log_event
from .orchestrator import Orchestrator

LOGGER = get_logger("vericems.scenario")
REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent

DEFAULT_CAPTIONS: Final[dict[int, str]] = {
    1: "Step 1/7: Normal telemetry batches flow and verifier quorum confirms clean emissions.",
    2: "Step 2/7: Insider injects constant-scaling attack (-30% CO2) at edge before signing.",
    3: "Step 3/7: Verifier committee flags combustion & autoencoder residuals; batch quarantined.",
    4: "Step 4/7: Operator disputes with inclusion proof; arbiters uphold; bond slashed on-chain.",
    5: "Step 5/7: Period report generated; CBAM attestation recorded on EVM Layer-2.",
    6: "Step 6/7: EU Importer portal verifies genuine report; catches tampered copy; computes € savings.",
    7: "Step 7/7: Benchmark suite discloses empirical evasion limits and 'What still gets through'.",
}

STEP_PAGES: Final[dict[int, str]] = {
    1: "/operator",
    2: "/operator",
    3: "/verifier",
    4: "/verifier",
    5: "/importer",
    6: "/importer",
    7: "/benchmark",
}

STEP_NAMES: Final[dict[int, str]] = {
    1: "Normal Batches Flow",
    2: "Insider Attack Injection",
    3: "Verifier Detection & Quarantine",
    4: "Dispute & Arbiter Slashing",
    5: "Period Report & On-Chain Attestation",
    6: "Importer Verification & Cost Savings",
    7: "Benchmark & Residual Weaknesses",
}

# Base durations per step in seconds for a ~2.5 minute demo (150s total) at speed 1.0x
STEP_BASE_DELAYS: Final[dict[int, float]] = {
    1: 20.0,
    2: 15.0,
    3: 25.0,
    4: 25.0,
    5: 20.0,
    6: 25.0,
    7: 20.0,
}


def load_script_captions(script_path: Path | str | None = None) -> dict[int, str]:
    """Load step captions from custom path if present, or fall back to canonical defaults."""
    captions = dict(DEFAULT_CAPTIONS)
    if script_path is None:
        return captions
    path = Path(script_path)
    if not path.is_file():
        return captions

    try:
        content = path.read_text(encoding="utf-8")
        for step_num in range(1, 8):
            # Matches patterns like:
            # Step 1: Caption text
            # 1. Caption text
            # ### Step 1: Caption text
            pattern = rf"(?:Step\s*{step_num}[:\s\-]+|###\s*{step_num}\.?\s*)([^\r\n]+)"
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                clean_text = match.group(1).strip()
                if clean_text:
                    captions[step_num] = f"Step {step_num}/7: {clean_text}"
    except Exception as exc:
        LOGGER.warning(f"Could not parse VIDEO_SCRIPT.md captions: {exc}")

    return captions


@dataclass(frozen=True)
class StepInfo:
    step: int
    name: str
    caption: str
    page: str
    base_delay_seconds: float


class ScenarioEngine:
    """Deterministic scenario player for VeriCEMS video demos and automated end-to-end tests."""

    def __init__(self, orch: Orchestrator, *, auto_snapshot: bool = True) -> None:
        self.orch = orch
        self.total_steps: Final[int] = 7
        self.current_step = 0
        self.status = "idle"  # "idle" | "playing" | "paused" | "completed" | "error"
        self.speed = 1.0
        self.error: str | None = None
        self.captions = load_script_captions()
        self._step_results: dict[int, Any] = {}
        self._snapshot_id: str | None = None
        self._play_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

        # Capture initial Anvil EVM snapshot for instant deterministic reset
        if auto_snapshot and self.orch.adapter.mode == "anvil":
            self._take_snapshot()

    def _take_snapshot(self) -> None:
        try:
            res = self.orch.adapter.w3.provider.make_request("evm_snapshot", [])  # type: ignore[arg-type]
            self._snapshot_id = res.get("result")
            log_event(LOGGER, logging.DEBUG, "scenario.snapshot_created", snapshot_id=self._snapshot_id)
        except Exception as exc:
            LOGGER.warning(f"Anvil snapshot could not be created: {exc}")

    def get_step_info_list(self) -> list[dict[str, Any]]:
        return [
            asdict(
                StepInfo(
                    step=i,
                    name=STEP_NAMES[i],
                    caption=self.captions.get(i, DEFAULT_CAPTIONS[i]),
                    page=STEP_PAGES[i],
                    base_delay_seconds=STEP_BASE_DELAYS[i],
                )
            )
            for i in range(1, self.total_steps + 1)
        ]

    def get_status(self) -> dict[str, Any]:
        """Return the current scenario engine status and progress metadata."""
        current_caption = (
            self.captions.get(self.current_step, DEFAULT_CAPTIONS.get(self.current_step, ""))
            if self.current_step > 0
            else "Demo Ready · Press Play or Next Step to begin the VeriCEMS story."
        )
        recommended_page = STEP_PAGES.get(self.current_step, "/operator") if self.current_step > 0 else "/operator"
        return {
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "status": self.status,
            "speed": self.speed,
            "current_caption": current_caption,
            "recommended_page": recommended_page,
            "step_info": self.get_step_info_list(),
            "last_result": self._step_results.get(self.current_step),
            "error": self.error,
        }

    # ---------------------------------------------------------------- controls
    def set_speed(self, speed: float) -> dict[str, Any]:
        if speed <= 0:
            raise ScenarioError(f"Speed must be positive; got {speed}")
        self.speed = float(speed)
        return self.get_status()

    async def step(self) -> dict[str, Any]:
        """Advance exactly one step."""
        async with self._lock:
            if self.current_step >= self.total_steps:
                return self.get_status()
            target_step = self.current_step + 1
            return await self._execute_step_locked(target_step)

    async def play(self, speed: float | None = None) -> dict[str, Any]:
        """Start or resume automatic story playback."""
        if speed is not None:
            self.set_speed(speed)

        if self.status == "playing":
            return self.get_status()

        if self.current_step >= self.total_steps:
            await self.reset()

        self.status = "playing"
        self._play_task = asyncio.create_task(self._run_playback())
        return self.get_status()

    async def pause(self) -> dict[str, Any]:
        """Pause ongoing automatic playback."""
        if self._play_task and not self._play_task.done():
            self._play_task.cancel()
            try:
                await self._play_task
            except asyncio.CancelledError:
                pass
            self._play_task = None

        if self.status == "playing":
            self.status = "paused" if self.current_step < self.total_steps else "completed"

        return self.get_status()

    async def reset(self) -> dict[str, Any]:
        """Reliably reset scenario, chain state, database, gateway and step back to 0."""
        async with self._lock:
            # 1. Stop playback task
            if self._play_task and not self._play_task.done():
                self._play_task.cancel()
                try:
                    await self._play_task
                except asyncio.CancelledError:
                    pass
                self._play_task = None

            # 2. Revert Anvil state to initial post-deployment snapshot
            if self._snapshot_id and self.orch.adapter.mode == "anvil":
                try:
                    self.orch.adapter.w3.provider.make_request("evm_revert", [self._snapshot_id])  # type: ignore[arg-type]
                    # Snapshots are consumed on revert; take a fresh one for the next run
                    self._take_snapshot()
                    log_event(LOGGER, logging.INFO, "scenario.reverted_chain", snapshot_id=self._snapshot_id)
                except Exception as exc:
                    LOGGER.warning(f"Error reverting Anvil snapshot: {exc}")

            # 3. Truncate SQLite EventStore tables
            self.orch.store.clear_all()

            # 4. Reset gateway counters, hashes, hooks, and seeds
            self.orch.gateway.reset_chain_state(initial_seq=0, initial_prev_hash="0x" + "00" * 32)
            self.orch.gateway.before_sign_hook = None
            self.orch.gateway.after_sign_hook = None
            self.orch.gateway.synthetic_seed = 42

            # 5. Reset orchestrator in-memory state
            self.orch.attack = "none"
            self.orch._offset = 0
            self.orch._prev_batch_last_hash = None
            self.orch._prev_packets = []
            for node in self.orch.committee.nodes:
                node.set_mode("honest")

            # 6. Reset engine fields
            self.current_step = 0
            self.status = "idle"
            self.error = None
            self._step_results.clear()

            # Emit scenario_reset to listeners
            self.orch._emit("scenario_reset", {"current_step": 0, "status": "idle"})
            log_event(LOGGER, logging.INFO, "scenario.reset_completed")
            return self.get_status()

    # ---------------------------------------------------------------- execution
    async def _run_playback(self) -> None:
        """Background playback loop advancing steps according to demo timings."""
        try:
            while self.current_step < self.total_steps and self.status == "playing":
                next_step = self.current_step + 1
                async with self._lock:
                    await self._execute_step_locked(next_step)

                if self.current_step >= self.total_steps:
                    self.status = "completed"
                    break

                delay = STEP_BASE_DELAYS.get(next_step, 20.0) / max(0.01, self.speed)
                await asyncio.sleep(delay)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            LOGGER.exception("Scenario playback failed")
            self.status = "error"
            self.error = str(exc)

    async def _execute_step_locked(self, step_num: int) -> dict[str, Any]:
        """Execute a single scenario step while holding `_lock`."""
        try:
            log_event(LOGGER, logging.INFO, "scenario.step_start", step=step_num, name=STEP_NAMES.get(step_num))

            if step_num == 1:
                # 1. Normal batches flow and coverage rises
                self.orch.set_attack("none")
                batch_res = await self.orch.run_batch()
                self._step_results[1] = batch_res

            elif step_num == 2:
                # 2. An insider injects a constant-scaling attack before signing
                self.orch.set_attack("constant_scaling")
                self._step_results[2] = {"attack": "constant_scaling"}

            elif step_num == 3:
                # 3. Verifiers detect it and vote; batch quarantined; reasons explained
                batch_res = await self.orch.run_batch()
                self._step_results[3] = batch_res

            elif step_num == 4:
                # 4. Operator disputes; arbiters uphold; bond is slashed
                quarantined_batch_id = self._step_results.get(3, {}).get("batch_id", 2)
                dispute_res = await self.orch.dispute(quarantined_batch_id)
                resolve_res = await self.orch.resolve_challenge(quarantined_batch_id, uphold_fraud=True)
                self._step_results[4] = {
                    "batch_id": quarantined_batch_id,
                    "dispute": dispute_res,
                    "resolve": resolve_res,
                }

            elif step_num == 5:
                # 5. Period report generated and attestation recorded
                rep_res = await self.orch.make_report("2026-Q3", production_tonnes=500.0)
                self._step_results[5] = rep_res

            elif step_num == 6:
                # 6. Switch to Importer view: upload report, verification succeeds,
                # tampered copy fails, cost comparison shown.
                valid_rep = self._step_results.get(5)
                if valid_rep is None:
                    valid_rep = await self.orch.make_report("2026-Q3", production_tonnes=500.0)
                    self._step_results[5] = valid_rep

                verify_valid = await self.orch.verify_report(valid_rep)

                # Construct tampered copy with modified verified emissions
                tampered = copy.deepcopy(valid_rep)
                if "report" in tampered and "totals" in tampered["report"]:
                    tampered["report"]["totals"]["verified_emissions_tco2e"] = 100.0
                verify_tampered = await self.orch.verify_report(tampered)

                self._step_results[6] = {
                    "valid_report": valid_rep,
                    "verify_valid": verify_valid,
                    "verify_tampered": verify_tampered,
                }

            elif step_num == 7:
                # 7. Show Benchmark page with 'What still gets through'
                self._step_results[7] = {
                    "completed": True,
                    "disclosure_section": "3. Prominent Disclosure: What Still Gets Through",
                }
                self.status = "completed"

            self.current_step = step_num
            status_data = self.get_status()

            # Emit scenario event to web UI
            self.orch._emit(
                "scenario_step",
                {
                    "step": step_num,
                    "name": STEP_NAMES[step_num],
                    "caption": self.captions.get(step_num, DEFAULT_CAPTIONS[step_num]),
                    "page": STEP_PAGES[step_num],
                    "data": self._step_results[step_num],
                },
            )
            log_event(LOGGER, logging.INFO, "scenario.step_complete", step=step_num)
            return status_data

        except Exception as exc:
            LOGGER.exception(f"Step {step_num} execution failed")
            self.status = "error"
            self.error = str(exc)
            return self.get_status()
