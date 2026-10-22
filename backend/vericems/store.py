"""SQLite persistence layer for VeriCEMS live events, batches, votes, challenges, and reports (`backend.vericems.store`).

Provides durable storage so the Operator, Verifier, and Importer UI views can reload
full history after page refreshes or reconnections.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
from typing import Any, Final

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH: Final[Path] = REPO_ROOT / "data" / "vericems_demo.db"

VALID_EVENT_TYPES: Final[frozenset[str]] = frozenset(
    {
        "packet",
        "batch_anchored",
        "vote",
        "finalized",
        "flagged",
        "challenge_open",
        "slashed",
        "attestation",
        "scenario_step",
        "scenario_reset",
    }
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class EventStore:
    """Thread-safe SQLite store for events, batches, verifier votes, challenges, and period reports."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path_str = str(db_path)
        if self.db_path_str != ":memory:":
            p = Path(self.db_path_str)
            p.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path_str, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    timestamp_utc TEXT NOT NULL,
                    batch_id INTEGER,
                    device_id TEXT,
                    installation_id TEXT,
                    payload_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
                CREATE INDEX IF NOT EXISTS idx_events_batch ON events(batch_id);

                CREATE TABLE IF NOT EXISTS batches (
                    batch_id INTEGER PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    installation_id TEXT NOT NULL,
                    first_seq INTEGER NOT NULL,
                    last_seq INTEGER NOT NULL,
                    count INTEGER NOT NULL,
                    merkle_root TEXT NOT NULL,
                    status TEXT NOT NULL,
                    anchor_tx_hash TEXT,
                    finalize_tx_hash TEXT,
                    created_at TEXT NOT NULL,
                    packets_json TEXT NOT NULL,
                    merkle_json TEXT NOT NULL,
                    verdict_summary_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    batch_id INTEGER NOT NULL,
                    verifier_id TEXT NOT NULL,
                    verifier_address TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    model_hash TEXT NOT NULL,
                    input_hash TEXT NOT NULL,
                    score_bp INTEGER NOT NULL,
                    verdict INTEGER NOT NULL,
                    reason_codes_json TEXT NOT NULL,
                    commitment TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    tx_hash TEXT,
                    timestamp_utc TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_votes_batch ON votes(batch_id);

                CREATE TABLE IF NOT EXISTS challenges (
                    batch_id INTEGER PRIMARY KEY,
                    installation_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    evidence_hash TEXT NOT NULL,
                    operator_dispute_hash TEXT,
                    explanation_uri TEXT,
                    window_closes_at INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    reason_codes_json TEXT NOT NULL,
                    slashed_amount_wei TEXT NOT NULL,
                    arbiter_votes_json TEXT NOT NULL,
                    tx_hashes_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reports (
                    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    attestation_id INTEGER NOT NULL,
                    installation_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    period_label TEXT NOT NULL,
                    report_json TEXT NOT NULL,
                    envelope_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    def clear_all(self) -> None:
        """Reset all stored tables (used between fresh demo scenario runs)."""
        with self._lock, self._conn:
            self._conn.executescript(
                """
                DELETE FROM events;
                DELETE FROM batches;
                DELETE FROM votes;
                DELETE FROM challenges;
                DELETE FROM reports;
                """
            )

    def append_event(
        self,
        event_type: str,
        payload: Mapping[str, Any],
        *,
        batch_id: int | None = None,
        device_id: str | None = None,
        installation_id: str | None = None,
        timestamp_utc: str | None = None,
    ) -> dict[str, Any]:
        """Persist an event and return its canonical event record."""
        if event_type not in VALID_EVENT_TYPES:
            raise ValueError(
                f"Invalid event_type={event_type!r}. Must be one of {sorted(VALID_EVENT_TYPES)}"
            )
        ts = timestamp_utc or _utc_now_iso()
        resolved_batch_id = (
            int(batch_id)
            if batch_id is not None
            else (
                int(payload["batch_id"])
                if "batch_id" in payload and payload["batch_id"] is not None
                else None
            )
        )
        resolved_device_id = (
            str(device_id)
            if device_id is not None
            else (str(payload["device_id"]) if "device_id" in payload else None)
        )
        resolved_inst_id = (
            str(installation_id)
            if installation_id is not None
            else (str(payload["installation_id"]) if "installation_id" in payload else None)
        )
        payload_dict = dict(payload)

        with self._lock, self._conn:
            cur = self._conn.execute(
                """
                INSERT INTO events (event_type, timestamp_utc, batch_id, device_id, installation_id, payload_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_type,
                    ts,
                    resolved_batch_id,
                    resolved_device_id,
                    resolved_inst_id,
                    json.dumps(payload_dict, sort_keys=True),
                ),
            )
            event_id = int(cur.lastrowid or 0)

        return {
            "id": event_id,
            "type": event_type,
            "timestamp_utc": ts,
            "batch_id": resolved_batch_id,
            "device_id": resolved_device_id,
            "installation_id": resolved_inst_id,
            "data": payload_dict,
        }

    def list_events(
        self,
        *,
        event_type: str | None = None,
        batch_id: int | None = None,
        since_id: int = 0,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        """Return historical events ordered by ascending `id`."""
        clauses = ["id > ?"]
        params: list[Any] = [int(since_id)]
        if event_type is not None:
            clauses.append("event_type = ?")
            params.append(str(event_type))
        if batch_id is not None:
            clauses.append("batch_id = ?")
            params.append(int(batch_id))
        where_sql = " AND ".join(clauses)
        params.append(int(limit))

        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT id, event_type, timestamp_utc, batch_id, device_id, installation_id, payload_json
                FROM events
                WHERE {where_sql}
                ORDER BY id ASC
                LIMIT ?
                """,
                params,
            ).fetchall()

        return [
            {
                "id": int(r["id"]),
                "type": str(r["event_type"]),
                "timestamp_utc": str(r["timestamp_utc"]),
                "batch_id": int(r["batch_id"]) if r["batch_id"] is not None else None,
                "device_id": str(r["device_id"]) if r["device_id"] is not None else None,
                "installation_id": (
                    str(r["installation_id"]) if r["installation_id"] is not None else None
                ),
                "data": json.loads(r["payload_json"]),
            }
            for r in rows
        ]

    def save_batch(
        self,
        *,
        batch_id: int,
        device_id: str,
        installation_id: str,
        first_seq: int,
        last_seq: int,
        count: int,
        merkle_root: str,
        status: str,
        anchor_tx_hash: str | None,
        finalize_tx_hash: str | None = None,
        created_at: str,
        packets: Sequence[Mapping[str, Any]],
        merkle: Mapping[str, Any],
        verdict_summary: Mapping[str, Any] | None = None,
    ) -> None:
        """Insert or update a batch record."""
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO batches (
                    batch_id, device_id, installation_id, first_seq, last_seq, count,
                    merkle_root, status, anchor_tx_hash, finalize_tx_hash, created_at,
                    packets_json, merkle_json, verdict_summary_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(batch_id) DO UPDATE SET
                    status = excluded.status,
                    anchor_tx_hash = COALESCE(excluded.anchor_tx_hash, batches.anchor_tx_hash),
                    finalize_tx_hash = COALESCE(excluded.finalize_tx_hash, batches.finalize_tx_hash),
                    verdict_summary_json = excluded.verdict_summary_json
                """,
                (
                    int(batch_id),
                    str(device_id),
                    str(installation_id),
                    int(first_seq),
                    int(last_seq),
                    int(count),
                    str(merkle_root),
                    str(status),
                    anchor_tx_hash,
                    finalize_tx_hash,
                    str(created_at),
                    json.dumps(list(packets), sort_keys=True),
                    json.dumps(dict(merkle), sort_keys=True),
                    json.dumps(dict(verdict_summary or {}), sort_keys=True),
                ),
            )

    def update_batch_status(
        self,
        batch_id: int,
        status: str,
        *,
        finalize_tx_hash: str | None = None,
        verdict_summary: Mapping[str, Any] | None = None,
    ) -> None:
        """Update batch status and optional verdict summary."""
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT verdict_summary_json, finalize_tx_hash FROM batches WHERE batch_id = ?",
                (int(batch_id),),
            ).fetchone()
            if row is None:
                return
            merged_summary = json.loads(row["verdict_summary_json"])
            if verdict_summary is not None:
                merged_summary.update(dict(verdict_summary))
            fin_tx = finalize_tx_hash if finalize_tx_hash is not None else row["finalize_tx_hash"]
            self._conn.execute(
                """
                UPDATE batches
                SET status = ?, finalize_tx_hash = ?, verdict_summary_json = ?
                WHERE batch_id = ?
                """,
                (
                    str(status),
                    fin_tx,
                    json.dumps(merged_summary, sort_keys=True),
                    int(batch_id),
                ),
            )

    def get_batch(self, batch_id: int, *, include_packets: bool = True) -> dict[str, Any] | None:
        """Retrieve a stored batch by `batch_id`."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM batches WHERE batch_id = ?", (int(batch_id),)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_batch_dict(row, include_packets=include_packets)

    def list_batches(self, *, include_packets: bool = False) -> list[dict[str, Any]]:
        """List all batches ordered by `batch_id` ascending."""
        with self._lock:
            rows = self._conn.execute("SELECT * FROM batches ORDER BY batch_id ASC").fetchall()
        return [self._row_to_batch_dict(r, include_packets=include_packets) for r in rows]

    def _row_to_batch_dict(
        self, row: sqlite3.Row, *, include_packets: bool = False
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "batch_id": int(row["batch_id"]),
            "device_id": str(row["device_id"]),
            "installation_id": str(row["installation_id"]),
            "first_seq": int(row["first_seq"]),
            "last_seq": int(row["last_seq"]),
            "count": int(row["count"]),
            "merkle_root": str(row["merkle_root"]),
            "status": str(row["status"]),
            "anchor_tx_hash": row["anchor_tx_hash"],
            "finalize_tx_hash": row["finalize_tx_hash"],
            "created_at": str(row["created_at"]),
            "verdict_summary": json.loads(row["verdict_summary_json"]),
        }
        if include_packets:
            out["packets"] = json.loads(row["packets_json"])
            out["merkle"] = json.loads(row["merkle_json"])
        return out

    def record_vote(
        self,
        *,
        batch_id: int,
        verifier_id: str,
        verifier_address: str,
        phase: str,
        model_hash: str,
        input_hash: str,
        score_bp: int,
        verdict: int,
        reason_codes: Sequence[str],
        commitment: str,
        salt: str,
        tx_hash: str | None,
        timestamp_utc: str | None = None,
    ) -> dict[str, Any]:
        """Record a commit or reveal vote action by a verifier node."""
        ts = timestamp_utc or _utc_now_iso()
        reasons_list = [str(c) for c in reason_codes]
        with self._lock, self._conn:
            cur = self._conn.execute(
                """
                INSERT INTO votes (
                    batch_id, verifier_id, verifier_address, phase, model_hash, input_hash,
                    score_bp, verdict, reason_codes_json, commitment, salt, tx_hash, timestamp_utc
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(batch_id),
                    str(verifier_id),
                    str(verifier_address),
                    str(phase),
                    str(model_hash),
                    str(input_hash),
                    int(score_bp),
                    int(verdict),
                    json.dumps(reasons_list),
                    str(commitment),
                    str(salt),
                    tx_hash,
                    ts,
                ),
            )
            vote_id = int(cur.lastrowid or 0)
        return {
            "id": vote_id,
            "batch_id": int(batch_id),
            "verifier_id": str(verifier_id),
            "verifier_address": str(verifier_address),
            "phase": str(phase),
            "model_hash": str(model_hash),
            "input_hash": str(input_hash),
            "score_bp": int(score_bp),
            "verdict": int(verdict),
            "reason_codes": reasons_list,
            "commitment": str(commitment),
            "salt": str(salt),
            "tx_hash": tx_hash,
            "timestamp_utc": ts,
        }

    def list_votes(self, batch_id: int | None = None) -> list[dict[str, Any]]:
        """List stored verifier votes, optionally filtered by `batch_id`."""
        with self._lock:
            if batch_id is not None:
                rows = self._conn.execute(
                    "SELECT * FROM votes WHERE batch_id = ? ORDER BY id ASC",
                    (int(batch_id),),
                ).fetchall()
            else:
                rows = self._conn.execute("SELECT * FROM votes ORDER BY id ASC").fetchall()
        return [
            {
                "id": int(r["id"]),
                "batch_id": int(r["batch_id"]),
                "verifier_id": str(r["verifier_id"]),
                "verifier_address": str(r["verifier_address"]),
                "phase": str(r["phase"]),
                "model_hash": str(r["model_hash"]),
                "input_hash": str(r["input_hash"]),
                "score_bp": int(r["score_bp"]),
                "verdict": int(r["verdict"]),
                "reason_codes": json.loads(r["reason_codes_json"]),
                "commitment": str(r["commitment"]),
                "salt": str(r["salt"]),
                "tx_hash": r["tx_hash"],
                "timestamp_utc": str(r["timestamp_utc"]),
            }
            for r in rows
        ]

    def save_challenge(
        self,
        *,
        batch_id: int,
        installation_id: str,
        device_id: str,
        evidence_hash: str,
        window_closes_at: int,
        status: str,
        reason_codes: Sequence[str],
        operator_dispute_hash: str | None = None,
        explanation_uri: str | None = None,
        slashed_amount_wei: int | str = 0,
        arbiter_votes: Sequence[Mapping[str, Any]] = (),
        tx_hashes: Mapping[str, Any] | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        """Insert or update a challenge record."""
        ts = updated_at or _utc_now_iso()
        reasons_list = [str(c) for c in reason_codes]
        arb_list = [dict(v) for v in arbiter_votes]
        tx_map = dict(tx_hashes or {})

        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO challenges (
                    batch_id, installation_id, device_id, evidence_hash,
                    operator_dispute_hash, explanation_uri, window_closes_at, status,
                    reason_codes_json, slashed_amount_wei, arbiter_votes_json,
                    tx_hashes_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(batch_id) DO UPDATE SET
                    operator_dispute_hash = COALESCE(excluded.operator_dispute_hash, challenges.operator_dispute_hash),
                    explanation_uri = COALESCE(excluded.explanation_uri, challenges.explanation_uri),
                    status = excluded.status,
                    slashed_amount_wei = excluded.slashed_amount_wei,
                    arbiter_votes_json = excluded.arbiter_votes_json,
                    tx_hashes_json = excluded.tx_hashes_json,
                    updated_at = excluded.updated_at
                """,
                (
                    int(batch_id),
                    str(installation_id),
                    str(device_id),
                    str(evidence_hash),
                    operator_dispute_hash,
                    explanation_uri,
                    int(window_closes_at),
                    str(status),
                    json.dumps(reasons_list),
                    str(slashed_amount_wei),
                    json.dumps(arb_list, sort_keys=True),
                    json.dumps(tx_map, sort_keys=True),
                    ts,
                ),
            )
        return self.get_challenge(batch_id) or {}

    def get_challenge(self, batch_id: int) -> dict[str, Any] | None:
        """Retrieve a stored challenge record by `batch_id`."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM challenges WHERE batch_id = ?", (int(batch_id),)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_challenge_dict(row)

    def list_challenges(self) -> list[dict[str, Any]]:
        """List all stored challenges ordered by `batch_id` ascending."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM challenges ORDER BY batch_id ASC"
            ).fetchall()
        return [self._row_to_challenge_dict(r) for r in rows]

    def _row_to_challenge_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "batch_id": int(row["batch_id"]),
            "installation_id": str(row["installation_id"]),
            "device_id": str(row["device_id"]),
            "evidence_hash": str(row["evidence_hash"]),
            "operator_dispute_hash": row["operator_dispute_hash"],
            "explanation_uri": row["explanation_uri"],
            "window_closes_at": int(row["window_closes_at"]),
            "status": str(row["status"]),
            "reason_codes": json.loads(row["reason_codes_json"]),
            "slashed_amount_wei": str(row["slashed_amount_wei"]),
            "arbiter_votes": json.loads(row["arbiter_votes_json"]),
            "tx_hashes": json.loads(row["tx_hashes_json"]),
            "updated_at": str(row["updated_at"]),
        }

    def save_report(
        self,
        *,
        attestation_id: int,
        installation_id: str,
        device_id: str,
        period_label: str,
        report: Mapping[str, Any],
        envelope: Mapping[str, Any],
        created_at: str | None = None,
    ) -> dict[str, Any]:
        """Persist a signed period report and its verification envelope."""
        ts = created_at or _utc_now_iso()
        with self._lock, self._conn:
            cur = self._conn.execute(
                """
                INSERT INTO reports (
                    attestation_id, installation_id, device_id, period_label,
                    report_json, envelope_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(attestation_id),
                    str(installation_id),
                    str(device_id),
                    str(period_label),
                    json.dumps(dict(report), sort_keys=True),
                    json.dumps(dict(envelope), sort_keys=True),
                    ts,
                ),
            )
            report_id = int(cur.lastrowid or 0)
        return self.get_report(report_id) or {}

    def get_report(self, report_id: int) -> dict[str, Any] | None:
        """Retrieve a stored period report by `report_id` (or `attestation_id` fallback)."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM reports WHERE report_id = ? OR attestation_id = ? ORDER BY report_id DESC LIMIT 1",
                (int(report_id), int(report_id)),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_report_dict(row)

    def list_reports(self) -> list[dict[str, Any]]:
        """List all stored period reports ordered by `report_id` ascending."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM reports ORDER BY report_id ASC"
            ).fetchall()
        return [self._row_to_report_dict(r) for r in rows]

    def _row_to_report_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "report_id": int(row["report_id"]),
            "attestation_id": int(row["attestation_id"]),
            "installation_id": str(row["installation_id"]),
            "device_id": str(row["device_id"]),
            "period_label": str(row["period_label"]),
            "report": json.loads(row["report_json"]),
            "envelope": json.loads(row["envelope_json"]),
            "created_at": str(row["created_at"]),
        }

    def close(self) -> None:
        with self._lock:
            self._conn.close()
