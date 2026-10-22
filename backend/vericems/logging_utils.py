"""Structured logging and domain error classes for the VeriCEMS backend (`backend.vericems.logging_utils`).

Enforces `AGENTS.md` security rules:
- Never log or print private keys (any 64-hex string associated with private key fields is redacted).
- Emits structured JSON or readable key-value logs with clear error messages and error codes.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import re
import sys
from typing import Any, Final

_PRIVATE_KEY_FIELD_RE: Final[re.Pattern[str]] = re.compile(
    r"(private[_-]?key|secret[_-]?scalar|mnemonic|seed[_-]?phrase)",
    re.IGNORECASE,
)
_HEX64_RE: Final[re.Pattern[str]] = re.compile(r"(0x)?[0-9a-fA-F]{64}")


def redact_sensitive(value: Any, key_name: str = "") -> Any:
    """Recursively redact any private-key-like field or secret material from log payloads."""
    if key_name and _PRIVATE_KEY_FIELD_RE.search(key_name):
        return "[REDACTED_SECRET]"
    if isinstance(value, dict):
        return {str(k): redact_sensitive(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_sensitive(item, key_name) for item in value]
    if isinstance(value, str) and _PRIVATE_KEY_FIELD_RE.search(value):
        return _HEX64_RE.sub("[REDACTED_HEX]", value)
    return value


class StructuredLogFormatter(logging.Formatter):
    """Formats log records as single-line structured JSON with secret redaction."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive(record.getMessage()),
        }
        extra_data = getattr(record, "structured_data", None)
        if isinstance(extra_data, dict):
            payload["data"] = redact_sensitive(extra_data)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, sort_keys=True, default=str)


def get_logger(name: str = "vericems.backend") -> logging.Logger:
    """Return a configured structured logger."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredLogFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


def log_event(
    logger: logging.Logger,
    level: int,
    message: str,
    **kwargs: Any,
) -> None:
    """Emit a structured log entry with attached redacted metadata."""
    logger.log(level, message, extra={"structured_data": redact_sensitive(kwargs)})


class VeriCEMSError(Exception):
    """Base exception for VeriCEMS backend errors with HTTP status and structured code."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "VERICEMS_ERROR",
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = redact_sensitive(details or {})

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class ChainAdapterError(VeriCEMSError):
    """Raised when an RPC connection, ABI load, or contract call fails."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "CHAIN_ADAPTER_ERROR",
        status_code: int = 502,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=status_code, details=details)


class MainnetForbiddenError(ChainAdapterError):
    """Raised if someone attempts to connect `ChainAdapter` to a mainnet chain ID."""

    def __init__(self, chain_id: int) -> None:
        super().__init__(
            f"Refusing to connect to mainnet chainId={chain_id}. "
            "VeriCEMS allows local Anvil and testnets only (AGENTS.md).",
            code="MAINNET_FORBIDDEN",
            status_code=403,
            details={"chain_id": chain_id},
        )


class ScenarioError(VeriCEMSError):
    """Raised when a scenario or attack injection configuration is invalid."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "SCENARIO_ERROR",
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=status_code, details=details)


class ReportValidationError(VeriCEMSError):
    """Raised when a period report fails schema or on-chain attestation verification."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "REPORT_VALIDATION_ERROR",
        status_code: int = 422,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=status_code, details=details)
