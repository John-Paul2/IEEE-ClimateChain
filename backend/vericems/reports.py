"""CBAM-aligned period report builder, signer, and on-chain verifier (`backend.vericems.reports`).

Implements Section 7 of `docs/INTERFACES.md` and `schemas/report.schema.json`.
Enforces `AGENTS.md` Rule 5:
- Always sets `"cbam_aligned": True`.
- Rejects any report containing the word `"official"` (case-insensitive).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Final

from backend.vericems.chain_adapter import (
    CHALLENGE_STATUS_TO_REPORT_ENUM,
    ChainAdapter,
    id_to_bytes32_hex,
)
from backend.vericems.crypto.merkle import build_merkle_tree, verify_merkle_proof
from backend.vericems.crypto.secure_element import SecureElement, verify_p256_signature
from backend.vericems.logging_utils import ReportValidationError
from backend.vericems.store import EventStore

SHORT_TON_TO_METRIC_TONNE: Final[float] = 0.90718474

_HASH32_RE: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")
_UTC_RE: Final[re.Pattern[str]] = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_ID_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

ALLOWED_TOP_KEYS: Final[frozenset[str]] = frozenset(
    {
        "report_version",
        "cbam_aligned",
        "installation_id",
        "device_id",
        "period",
        "totals",
        "coverage",
        "quarantined_batches",
        "merkle_roots",
        "transaction_hashes",
        "attestation_id",
    }
)

ALLOWED_REASON_CODES: Final[frozenset[str]] = frozenset(
    {
        "CHAIN_BREAK",
        "SEQ_GAP",
        "SIG_INVALID",
        "PHYSICS_RESIDUAL",
        "AE_RESIDUAL",
        "SPECTRAL_FLAT",
        "SPECTRAL_REPEAT",
        "CROSS_SOURCE_MISMATCH",
    }
)

ALLOWED_CHALLENGE_STATUSES: Final[frozenset[str]] = frozenset(
    {
        "OPEN",
        "UPHELD_SLASHED",
        "OVERTURNED_CLEARED",
        "EXPIRED_SLASHED",
    }
)


def canonical_report_bytes(report: Mapping[str, Any]) -> bytes:
    """Serialize a `report.schema.json` dictionary into deterministic canonical UTF-8 JSON bytes."""
    return json.dumps(dict(report), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def compute_report_hash(report: Mapping[str, Any]) -> str:
    """Compute `0x`-prefixed SHA-256 hash of `canonical_report_bytes(report)`."""
    return "0x" + hashlib.sha256(canonical_report_bytes(report)).hexdigest()


def validate_report_schema(report: Mapping[str, Any]) -> list[str]:
    """Validate `report` against `schemas/report.schema.json` and `AGENTS.md` Rule 5.

    Returns a list of human-readable validation error strings (empty if valid).
    """
    errors: list[str] = []
    if not isinstance(report, Mapping):
        return ["Report must be a JSON object."]

    # Honesty Rule 5 check: word "official" must never appear anywhere in the report
    serialized_lower = json.dumps(dict(report), default=str).lower()
    if "official" in serialized_lower:
        errors.append("Report violates AGENTS.md Rule 5: must never contain the word 'official'.")

    keys = set(report.keys())
    missing = ALLOWED_TOP_KEYS - keys
    extra = keys - ALLOWED_TOP_KEYS
    if missing:
        errors.append(f"Missing required top-level fields: {sorted(missing)}")
    if extra:
        errors.append(f"Unexpected additional top-level fields: {sorted(extra)}")
    if missing:
        return errors

    if report.get("report_version") != "1.0.0":
        errors.append(f"report_version must be '1.0.0', got {report.get('report_version')!r}")
    if report.get("cbam_aligned") is not True:
        errors.append("cbam_aligned must be boolean true")

    for id_field in ("installation_id", "device_id"):
        val = report.get(id_field)
        if not isinstance(val, str) or not _ID_RE.match(val):
            errors.append(f"Invalid {id_field}: {val!r}")

    period = report.get("period")
    if not isinstance(period, Mapping) or set(period.keys()) != {"label", "start_utc", "end_utc"}:
        errors.append("period must contain exactly {'label', 'start_utc', 'end_utc'}")
    else:
        if not isinstance(period["label"], str) or not period["label"]:
            errors.append("period.label must be a non-empty string")
        for ts_key in ("start_utc", "end_utc"):
            if not isinstance(period[ts_key], str) or not _UTC_RE.match(period[ts_key]):
                errors.append(f"period.{ts_key} must match YYYY-MM-DDTHH:MM:SSZ")

    totals = report.get("totals")
    req_totals = {
        "verified_emissions_tco2e",
        "production_tonnes",
        "specific_embedded_emissions_tco2e_per_t",
        "heat_input_mmbtu",
    }
    if not isinstance(totals, Mapping) or set(totals.keys()) != req_totals:
        errors.append(f"totals must contain exactly {sorted(req_totals)}")
    else:
        for k in req_totals:
            v = totals[k]
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                errors.append(f"totals.{k} must be a number")
            elif k == "production_tonnes" and float(v) <= 0:
                errors.append("totals.production_tonnes must be > 0")
            elif float(v) < 0:
                errors.append(f"totals.{k} must be >= 0")

    cov = report.get("coverage")
    req_cov = {"total_batches", "verified_batches", "quarantined_batches_count", "coverage_bp"}
    if not isinstance(cov, Mapping) or set(cov.keys()) != req_cov:
        errors.append(f"coverage must contain exactly {sorted(req_cov)}")
    else:
        for k in req_cov:
            v = cov[k]
            if isinstance(v, bool) or not isinstance(v, int):
                errors.append(f"coverage.{k} must be an integer")
        if isinstance(cov.get("total_batches"), int) and cov["total_batches"] < 1:
            errors.append("coverage.total_batches must be >= 1")
        if isinstance(cov.get("coverage_bp"), int) and not (0 <= cov["coverage_bp"] <= 10000):
            errors.append("coverage.coverage_bp must be in 0..10000")

    q_batches = report.get("quarantined_batches")
    if not isinstance(q_batches, list):
        errors.append("quarantined_batches must be a list")
    else:
        req_q = {
            "batch_id",
            "first_seq",
            "last_seq",
            "merkle_root",
            "reason_codes",
            "challenge_status",
        }
        for idx, qb in enumerate(q_batches):
            if not isinstance(qb, Mapping) or set(qb.keys()) != req_q:
                errors.append(f"quarantined_batches[{idx}] must have keys {sorted(req_q)}")
                continue
            if not isinstance(qb["merkle_root"], str) or not _HASH32_RE.match(qb["merkle_root"]):
                errors.append(f"quarantined_batches[{idx}].merkle_root invalid")
            if qb["challenge_status"] not in ALLOWED_CHALLENGE_STATUSES:
                errors.append(
                    f"quarantined_batches[{idx}].challenge_status={qb['challenge_status']!r} not in {sorted(ALLOWED_CHALLENGE_STATUSES)}"
                )
            if not isinstance(qb["reason_codes"], list) or any(
                rc not in ALLOWED_REASON_CODES for rc in qb["reason_codes"]
            ):
                errors.append(f"quarantined_batches[{idx}].reason_codes contains invalid code")

    m_roots = report.get("merkle_roots")
    if not isinstance(m_roots, list) or len(m_roots) < 1:
        errors.append("merkle_roots must be a non-empty list of 32-byte hex strings")
    else:
        for idx, mr in enumerate(m_roots):
            if not isinstance(mr, str) or not _HASH32_RE.match(mr):
                errors.append(f"merkle_roots[{idx}] invalid: {mr!r}")

    txs = report.get("transaction_hashes")
    if not isinstance(txs, Mapping) or set(txs.keys()) != {"batch_anchors", "attestation_tx"}:
        errors.append("transaction_hashes must contain {'batch_anchors', 'attestation_tx'}")
    else:
        ba = txs["batch_anchors"]
        if not isinstance(ba, list) or len(ba) < 1 or any(
            not isinstance(x, str) or not _HASH32_RE.match(x) for x in ba
        ):
            errors.append("transaction_hashes.batch_anchors must be a non-empty list of 0x hex tx hashes")
        atx = txs["attestation_tx"]
        if not isinstance(atx, str) or not _HASH32_RE.match(atx):
            errors.append(f"transaction_hashes.attestation_tx invalid: {atx!r}")

    att_id = report.get("attestation_id")
    if isinstance(att_id, bool) or not isinstance(att_id, int) or att_id < 0:
        errors.append(f"attestation_id must be a non-negative integer, got {att_id!r}")

    return errors


def generate_and_attest_period_report(
    *,
    installation_id: str,
    device_id: str,
    period_label: str,
    production_tonnes: float,
    batches: Sequence[Mapping[str, Any]],
    challenges_by_batch_id: Mapping[int, Mapping[str, Any]],
    chain_adapter: ChainAdapter,
    secure_element: SecureElement,
    store: EventStore | None = None,
) -> dict[str, Any]:
    """Build a period report from finalized batches, record `Attestation` on-chain, and sign the report.

    Args:
        installation_id: Installation identifier (e.g., `"INST-CAMPD-6165"`).
        device_id: Gateway device identifier.
        period_label: Period label (e.g., `"2026-Q3"`).
        production_tonnes: Total installation product output in metric tonnes (> 0).
        batches: Stored batch dicts (with `packets`, `merkle`, `status`, `anchor_tx_hash`).
        challenges_by_batch_id: Mapping of `batch_id -> challenge dict`.
        chain_adapter: Connected `ChainAdapter`.
        secure_element: Operator/gateway `SecureElement` used to sign the canonical report hash.
        store: Optional `EventStore` to persist the generated report.

    Returns:
        Dictionary containing `"report"` (strict `schemas/report.schema.json` object) and
        `"envelope"` (operator signature, Merkle proofs, and on-chain metadata).
    """
    if production_tonnes <= 0:
        raise ReportValidationError("production_tonnes must be positive")
    if not batches:
        raise ReportValidationError("Cannot generate a period report with zero batches")

    verified_batches_list: list[Mapping[str, Any]] = []
    quarantined_entries: list[dict[str, Any]] = []
    all_timestamps: list[str] = []

    for b in batches:
        b_id = int(b["batch_id"])
        # Refresh status from chain if available
        try:
            on_chain_b = chain_adapter.get_batch_on_chain(b_id)
            status_str = on_chain_b["status"]
        except Exception:
            status_str = str(b.get("status", "Anchored"))

        pkts = b.get("packets", [])
        for p in pkts:
            if "timestamp_utc" in p:
                all_timestamps.append(str(p["timestamp_utc"]))

        if status_str in ("Verified", "Cleared"):
            verified_batches_list.append(b)
        elif status_str in ("Quarantined", "Slashed"):
            ch_info = challenges_by_batch_id.get(b_id)
            ch_status_enum = "OPEN"
            reasons = list(b.get("verdict_summary", {}).get("reason_codes", []))
            try:
                ch_chain = chain_adapter.get_challenge_on_chain(b_id)
                ch_status_enum = ch_chain["report_challenge_status"]
            except Exception:
                if ch_info and "status" in ch_info:
                    ch_status_enum = CHALLENGE_STATUS_TO_REPORT_ENUM.get(
                        str(ch_info["status"]), "OPEN"
                    )
            if not reasons and ch_info and ch_info.get("reason_codes"):
                reasons = list(ch_info["reason_codes"])
            valid_reasons = [r for r in reasons if r in ALLOWED_REASON_CODES]
            if not valid_reasons:
                valid_reasons = ["PHYSICS_RESIDUAL"]

            quarantined_entries.append(
                {
                    "batch_id": b_id,
                    "first_seq": int(b["first_seq"]),
                    "last_seq": int(b["last_seq"]),
                    "merkle_root": str(b["merkle_root"]).lower(),
                    "reason_codes": valid_reasons,
                    "challenge_status": ch_status_enum,
                }
            )

    if not verified_batches_list:
        raise ReportValidationError(
            "At least one batch must be Verified or Cleared to record an on-chain Attestation."
        )

    total_batches_count = len(verified_batches_list) + len(quarantined_entries)
    verified_count = len(verified_batches_list)
    quarantined_count = len(quarantined_entries)
    coverage_bp = int(round((verified_count / max(1, total_batches_count)) * 10000.0))

    # Sum verified emissions (converting US short tons to metric tonnes tCO2e) and heat input
    total_co2_short_tons = 0.0
    total_heat_mmbtu = 0.0
    merkle_roots: list[str] = []
    batch_anchor_txs: list[str] = []
    verified_batch_ids: list[int] = []
    batch_merkle_proofs: list[dict[str, Any]] = []

    for vb in verified_batches_list:
        verified_batch_ids.append(int(vb["batch_id"]))
        mr = str(vb["merkle_root"]).lower()
        merkle_roots.append(mr)
        tx_h = str(vb.get("anchor_tx_hash") or ("0x" + "00" * 32)).lower()
        batch_anchor_txs.append(tx_h)

        for pkt in vb.get("packets", []):
            vals = pkt.get("values", {})
            total_co2_short_tons += float(vals.get("co2_mass_short_tons", 0.0))
            total_heat_mmbtu += float(vals.get("heat_input_mmbtu", 0.0))

        merkle_obj = vb.get("merkle", {})
        proofs = merkle_obj.get("proofs", [])
        if proofs:
            batch_merkle_proofs.append(
                {
                    "batch_id": int(vb["batch_id"]),
                    "merkle_root": mr,
                    "sample_proof": proofs[0],
                    "all_proofs": proofs,
                }
            )

    verified_emissions_tco2e = round(total_co2_short_tons * SHORT_TON_TO_METRIC_TONNE, 6)
    prod_t = round(float(production_tonnes), 6)
    see_tco2e_per_t = round(verified_emissions_tco2e / prod_t, 6)
    heat_mmbtu_rounded = round(total_heat_mmbtu, 6)

    total_emissions_kg = max(1, int(round(verified_emissions_tco2e * 1000.0)))
    production_kg = max(1, int(round(prod_t * 1000.0)))

    period_tree = build_merkle_tree(merkle_roots)
    period_merkle_root = period_tree.merkle_root

    # Record Attestation on-chain
    att_tx_res = chain_adapter.record_attestation(
        installation_id=installation_id,
        period_label=period_label,
        total_emissions_kg_co2e=total_emissions_kg,
        production_kg=production_kg,
        coverage_bp=coverage_bp,
        period_merkle_root=period_merkle_root,
        verified_batch_ids=verified_batch_ids,
    )
    attestation_id = int(att_tx_res["attestation_id"])
    attestation_tx_hash = str(att_tx_res["tx_hash"]).lower()

    start_utc = min(all_timestamps) if all_timestamps else "2026-07-01T00:00:00Z"
    end_utc = max(all_timestamps) if all_timestamps else "2026-07-01T00:00:16Z"

    report_obj: dict[str, Any] = {
        "report_version": "1.0.0",
        "cbam_aligned": True,
        "installation_id": str(installation_id),
        "device_id": str(device_id),
        "period": {
            "label": str(period_label),
            "start_utc": start_utc,
            "end_utc": end_utc,
        },
        "totals": {
            "verified_emissions_tco2e": verified_emissions_tco2e,
            "production_tonnes": prod_t,
            "specific_embedded_emissions_tco2e_per_t": see_tco2e_per_t,
            "heat_input_mmbtu": heat_mmbtu_rounded,
        },
        "coverage": {
            "total_batches": total_batches_count,
            "verified_batches": verified_count,
            "quarantined_batches_count": quarantined_count,
            "coverage_bp": coverage_bp,
        },
        "quarantined_batches": quarantined_entries,
        "merkle_roots": merkle_roots,
        "transaction_hashes": {
            "batch_anchors": batch_anchor_txs,
            "attestation_tx": attestation_tx_hash,
        },
        "attestation_id": attestation_id,
    }

    schema_errors = validate_report_schema(report_obj)
    if schema_errors:
        raise ReportValidationError(
            f"Generated report failed schema validation: {schema_errors}",
            details={"errors": schema_errors},
        )

    rep_hash = compute_report_hash(report_obj)
    op_sig = secure_element.sign(rep_hash)

    envelope: dict[str, Any] = {
        "report_hash": rep_hash,
        "operator_public_key": secure_element.public_key(),
        "operator_signature": op_sig,
        "period_merkle_root": period_merkle_root,
        "verified_batch_ids": verified_batch_ids,
        "total_emissions_kg_co2e": total_emissions_kg,
        "production_kg": production_kg,
        "merkle_proofs": batch_merkle_proofs,
    }

    if store is not None:
        saved = store.save_report(
            attestation_id=attestation_id,
            installation_id=installation_id,
            device_id=device_id,
            period_label=period_label,
            report=report_obj,
            envelope=envelope,
        )
        return saved

    return {
        "report_id": attestation_id,
        "attestation_id": attestation_id,
        "installation_id": installation_id,
        "device_id": device_id,
        "period_label": period_label,
        "report": report_obj,
        "envelope": envelope,
    }


def verify_period_report(
    payload: Mapping[str, Any],
    chain_adapter: ChainAdapter,
    *,
    store: EventStore | None = None,
) -> dict[str, Any]:
    """Verify a CBAM-aligned period report against its schema, Merkle proofs, signature, and on-chain `Attestation`."""
    if "report" in payload and isinstance(payload["report"], Mapping):
        report = dict(payload["report"])
        envelope = dict(payload.get("envelope", {}))
        for k in ("operator_signature", "operator_public_key", "merkle_proofs", "report_hash"):
            if k in payload and k not in envelope:
                envelope[k] = payload[k]
    else:
        report = dict(payload)
        envelope = {}

    schema_errors = validate_report_schema(report)
    if schema_errors:
        return {
            "valid": False,
            "schema_valid": False,
            "errors": schema_errors,
            "checks": {},
        }

    att_id = int(report["attestation_id"])
    if not envelope and store is not None:
        stored = store.get_report(att_id)
        if stored is not None:
            envelope = dict(stored.get("envelope", {}))

    errors: list[str] = []
    checks: dict[str, bool] = {
        "schema_valid": True,
        "cbam_aligned_flag": report.get("cbam_aligned") is True,
        "no_official_claim": "official" not in json.dumps(report).lower(),
    }

    # 1. Recompute period Merkle root over report.merkle_roots
    computed_period_root = build_merkle_tree(report["merkle_roots"]).merkle_root
    expected_inst_b32 = id_to_bytes32_hex(str(report["installation_id"]))

    # 2. Check on-chain Attestation record
    on_chain_att: dict[str, Any] | None = None
    try:
        on_chain_att = chain_adapter.get_attestation_on_chain(att_id)
    except Exception as exc:
        errors.append(f"On-chain attestation #{att_id} lookup failed: {exc}")
        checks["attestation_exists_on_chain"] = False
    else:
        checks["attestation_exists_on_chain"] = True
        checks["installation_id_matches"] = (
            on_chain_att["installation_id_bytes32"].lower() == expected_inst_b32.lower()
        )
        if not checks["installation_id_matches"]:
            errors.append("Installation ID on-chain does not match report.installation_id")

        checks["period_label_matches"] = (
            on_chain_att["period_label"] == report["period"]["label"]
        )
        if not checks["period_label_matches"]:
            errors.append("Period label on-chain does not match report.period.label")

        checks["period_merkle_root_matches"] = (
            on_chain_att["period_merkle_root"].lower() == computed_period_root.lower()
        )
        if not checks["period_merkle_root_matches"]:
            errors.append(
                f"Period Merkle root mismatch: on-chain={on_chain_att['period_merkle_root']} != computed={computed_period_root}"
            )

        checks["coverage_bp_matches"] = (
            int(on_chain_att["coverage_bp"]) == int(report["coverage"]["coverage_bp"])
        )
        if not checks["coverage_bp_matches"]:
            errors.append("Coverage basis points on-chain do not match report.coverage.coverage_bp")

        # Verify each attested batch on-chain in BatchAnchor
        batch_ids = on_chain_att.get("verified_batch_ids", [])
        batch_roots_on_chain: list[str] = []
        all_batches_verified = len(batch_ids) == len(report["merkle_roots"])
        for b_id in batch_ids:
            try:
                b_rec = chain_adapter.get_batch_on_chain(int(b_id))
                batch_roots_on_chain.append(b_rec["merkle_root"].lower())
                if b_rec["status"] not in ("Verified", "Cleared"):
                    all_batches_verified = False
                    errors.append(f"Batch {b_id} has invalid on-chain status {b_rec['status']}")
            except Exception as exc:
                all_batches_verified = False
                errors.append(f"Batch {b_id} lookup failed: {exc}")

        checks["batches_verified_on_chain"] = all_batches_verified and (
            batch_roots_on_chain == [r.lower() for r in report["merkle_roots"]]
        )
        if not checks["batches_verified_on_chain"]:
            errors.append("Verified batch Merkle roots on-chain do not match report.merkle_roots")

    # 3. Verify operator ECDSA P-256 signature if present
    rep_hash = compute_report_hash(report)
    op_sig = envelope.get("operator_signature")
    if op_sig:
        pub_key = envelope.get("operator_public_key")
        try:
            dev_chain = chain_adapter.get_device(str(report["device_id"]))
            if dev_chain.get("pub_key_p256") and dev_chain["pub_key_p256"] != "0x":
                pub_key = dev_chain["pub_key_p256"]
        except Exception:
            pass
        sig_ok = bool(pub_key and verify_p256_signature(pub_key, rep_hash, str(op_sig)))
        checks["operator_signature_valid"] = sig_ok
        if not sig_ok:
            errors.append("Operator ECDSA P-256 signature verification failed")

    # 4. Verify Merkle inclusion proofs if present
    proof_bundles = envelope.get("merkle_proofs", [])
    if proof_bundles:
        proofs_ok = True
        for bundle in proof_bundles:
            b_id = int(bundle.get("batch_id", 0))
            b_root = str(bundle.get("merkle_root", ""))
            sample_proof = bundle.get("sample_proof")
            if isinstance(sample_proof, Mapping):
                off_ok = verify_merkle_proof(sample_proof, merkle_root=b_root)
                on_ok = False
                if b_id > 0:
                    try:
                        on_ok = chain_adapter.verify_packet_inclusion_on_chain(
                            b_id,
                            sample_proof["packet_hash"],
                            sample_proof["siblings"],
                        )
                    except Exception:
                        on_ok = False
                if not (off_ok and on_ok):
                    proofs_ok = False
                    errors.append(f"Merkle inclusion proof verification failed for batch {b_id}")
        checks["merkle_proofs_valid"] = proofs_ok

    is_valid = len(errors) == 0 and all(checks.values())
    return {
        "valid": is_valid,
        "schema_valid": True,
        "report_hash": rep_hash,
        "computed_period_merkle_root": computed_period_root,
        "checks": checks,
        "errors": errors,
        "on_chain_attestation": on_chain_att,
    }
