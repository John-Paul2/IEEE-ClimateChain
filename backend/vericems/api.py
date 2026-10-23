"""REST and WebSocket API (`backend.vericems.api`).

`create_app(orchestrator)` exposes the orchestrator to the web UI:

REST
    GET  /api/health                     status + chain id + demo clock
    GET  /api/state                      bond/stake summary, attack mode, counts
    GET  /api/batches[/{id}]             stored batches (packets only on the detail route)
    GET  /api/verifiers                  five verifier nodes (mode, stake, last vote)
    GET  /api/events?limit=              recent events
    GET  /api/challenges                 stored challenges
    POST /api/scenario/batch             seal + anchor + vote + finalize one batch
    POST /api/scenario/attack            {"kind": "none" | "scale_co2_30pct"}
    POST /api/verifiers/{id}/mode        {"mode": "honest" | ...}
    POST /api/challenges/{id}/dispute | resolve | settle
    POST /api/report                     {"period_label", "production_tonnes"}
    POST /api/report/verify              report payload from POST /api/report
WebSocket
    /ws/events                           every stored event as JSON, live
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .logging_utils import VeriCEMSError
from .orchestrator import Orchestrator
from .scenario import ScenarioEngine


class AttackBody(BaseModel):
    kind: str


class ModeBody(BaseModel):
    mode: str


class ResolveBody(BaseModel):
    uphold_fraud: bool
    notes: str = "arbiter resolution"


class ReportBody(BaseModel):
    period_label: str
    production_tonnes: float


class SpeedBody(BaseModel):
    speed: float


class PlayBody(BaseModel):
    speed: float | None = None


def create_app(orch: Orchestrator, scenario: ScenarioEngine | None = None) -> FastAPI:
    app = FastAPI(title="VeriCEMS backend", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    engine = scenario if scenario is not None else ScenarioEngine(orch)
    run_lock = asyncio.Lock()  # one on-chain scenario step at a time (single nonce stream)

    @app.exception_handler(VeriCEMSError)
    async def _domain_error(_: Request, exc: VeriCEMSError) -> JSONResponse:
        return JSONResponse(status_code=getattr(exc, "status_code", 400), content=exc.to_dict())

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "chain_id": orch.adapter.w3.eth.chain_id, "clock": orch.clock.to_dict()}

    @app.get("/api/state")
    async def state() -> dict[str, Any]:
        return {
            "attack": orch.attack,
            "installation_id": orch.installation_id,
            "device_id": orch.device_id,
            "vault": orch.adapter.get_vault_summary(orch.installation_id),
            "batches": len(orch.store.list_batches()),
        }

    @app.get("/api/batches")
    async def batches() -> list[dict[str, Any]]:
        return orch.store.list_batches(include_packets=False)

    @app.get("/api/batches/{batch_id}")
    async def batch(batch_id: int) -> dict[str, Any]:
        found = orch.store.get_batch(batch_id, include_packets=True)
        if found is None:
            return JSONResponse(status_code=404, content={"error": "BATCH_NOT_FOUND"})  # type: ignore[return-value]
        return found

    @app.get("/api/verifiers")
    async def verifiers() -> list[dict[str, Any]]:
        return orch.committee.list_status(orch.adapter)

    @app.get("/api/events")
    async def events(limit: int = 100) -> list[dict[str, Any]]:
        return orch.store.list_events(limit=limit)

    @app.get("/api/challenges")
    async def challenges() -> list[dict[str, Any]]:
        return orch.store.list_challenges()

    @app.post("/api/scenario/batch")
    async def run_batch() -> dict[str, Any]:
        async with run_lock:
            return await orch.run_batch()

    @app.post("/api/scenario/attack")
    async def set_attack(body: AttackBody) -> dict[str, Any]:
        orch.set_attack(body.kind)
        return {"attack": orch.attack}

    @app.get("/api/scenario/status")
    async def scenario_status() -> dict[str, Any]:
        return engine.get_status()

    @app.post("/api/scenario/step")
    async def scenario_step() -> dict[str, Any]:
        async with run_lock:
            return await engine.step()

    @app.post("/api/scenario/play")
    async def scenario_play(body: PlayBody | None = None) -> dict[str, Any]:
        spd = body.speed if body else None
        return await engine.play(spd)

    @app.post("/api/scenario/pause")
    async def scenario_pause() -> dict[str, Any]:
        return await engine.pause()

    @app.post("/api/scenario/reset")
    async def scenario_reset() -> dict[str, Any]:
        async with run_lock:
            return await engine.reset()

    @app.post("/api/scenario/speed")
    async def scenario_speed(body: SpeedBody) -> dict[str, Any]:
        return engine.set_speed(body.speed)

    @app.get("/api/report/latest")
    async def report_latest() -> dict[str, Any]:
        reports = orch.store.list_reports()
        if not reports:
            return JSONResponse(status_code=404, content={"error": "NO_REPORTS_FOUND"})  # type: ignore[return-value]
        return reports[-1]

    @app.post("/api/verifiers/{verifier_id}/mode")
    async def set_mode(verifier_id: str, body: ModeBody) -> dict[str, Any]:
        orch.set_verifier_mode(verifier_id, body.mode)
        return {"verifier_id": verifier_id, "mode": body.mode}

    @app.post("/api/challenges/{batch_id}/dispute")
    async def dispute(batch_id: int) -> dict[str, Any]:
        async with run_lock:
            return await orch.dispute(batch_id)

    @app.post("/api/challenges/{batch_id}/resolve")
    async def resolve(batch_id: int, body: ResolveBody) -> dict[str, Any]:
        async with run_lock:
            return await orch.resolve_challenge(batch_id, body.uphold_fraud, body.notes)

    @app.post("/api/challenges/{batch_id}/settle")
    async def settle(batch_id: int) -> dict[str, Any]:
        async with run_lock:
            return await orch.settle_expired(batch_id)

    @app.post("/api/report")
    async def report(body: ReportBody) -> dict[str, Any]:
        async with run_lock:
            return await orch.make_report(body.period_label, body.production_tonnes)

    @app.post("/api/report/verify")
    async def report_verify(payload: dict[str, Any]) -> dict[str, Any]:
        return await orch.verify_report(payload)

    @app.websocket("/ws/events")
    async def ws_events(ws: WebSocket) -> None:
        await ws.accept()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        def listener(record: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, record)

        orch.add_listener(listener)
        try:
            while True:
                await ws.send_json(await queue.get())
        except (WebSocketDisconnect, asyncio.CancelledError, Exception):
            pass
        finally:
            orch.remove_listener(listener)

    return app
