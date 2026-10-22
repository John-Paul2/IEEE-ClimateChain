"""Demo clock and operational profile loader (`backend.vericems.demo_clock`).

Reads timing and staking parameters from `config/params.yaml` (`demo` and `benchmark`
profiles) per `docs/INTERFACES.md` Section 9.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final
import yaml

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent
DEFAULT_PARAMS_PATH: Final[Path] = REPO_ROOT / "config" / "params.yaml"


@dataclass
class DemoClock:
    """Configurable clock driving gateway packet pacing and on-chain window progression."""

    profile_name: str = "demo"
    batch_size_packets: int = 8
    packet_interval_seconds: float = 1.0
    commit_window_seconds: int = 30
    reveal_window_seconds: int = 30
    challenge_window_seconds: int = 120
    withdrawal_delay_seconds: int = 180
    speed_multiplier: float = 1.0
    auto_advance_chain_time: bool = True

    @classmethod
    def from_yaml(
        cls,
        params_path: Path = DEFAULT_PARAMS_PATH,
        *,
        profile: str = "demo",
        speed_multiplier: float = 1.0,
        auto_advance_chain_time: bool = True,
    ) -> DemoClock:
        """Load profile parameters from `config/params.yaml`."""
        raw = yaml.safe_load(Path(params_path).read_text(encoding="utf-8"))
        profiles = raw.get("profiles", {})
        profile_key = "benchmark" if profile in ("real", "benchmark") else "demo"
        prof = profiles.get(profile_key, profiles.get("demo", {}))

        if speed_multiplier <= 0:
            raise ValueError(f"speed_multiplier must be positive, got {speed_multiplier}")

        return cls(
            profile_name=profile_key,
            batch_size_packets=int(prof.get("batch_size_packets", 8)),
            packet_interval_seconds=float(prof.get("packet_interval_seconds", 1.0)),
            commit_window_seconds=int(prof.get("commit_window_seconds", 30)),
            reveal_window_seconds=int(prof.get("reveal_window_seconds", 30)),
            challenge_window_seconds=int(prof.get("challenge_window_seconds", 120)),
            withdrawal_delay_seconds=int(prof.get("withdrawal_delay_seconds", 180)),
            speed_multiplier=float(speed_multiplier),
            auto_advance_chain_time=bool(auto_advance_chain_time),
        )

    @property
    def effective_packet_delay_seconds(self) -> float:
        """Wall-clock sleep delay between packets given `speed_multiplier`."""
        if self.speed_multiplier >= 1000.0 or self.packet_interval_seconds <= 0.0:
            return 0.0
        return max(0.0, float(self.packet_interval_seconds) / float(self.speed_multiplier))

    async def sleep_packet_interval(self) -> None:
        """Sleep for one effective packet interval if non-zero."""
        delay = self.effective_packet_delay_seconds
        if delay > 0.0:
            await asyncio.sleep(delay)

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_name": self.profile_name,
            "batch_size_packets": self.batch_size_packets,
            "packet_interval_seconds": self.packet_interval_seconds,
            "effective_packet_delay_seconds": self.effective_packet_delay_seconds,
            "commit_window_seconds": self.commit_window_seconds,
            "reveal_window_seconds": self.reveal_window_seconds,
            "challenge_window_seconds": self.challenge_window_seconds,
            "withdrawal_delay_seconds": self.withdrawal_delay_seconds,
            "speed_multiplier": self.speed_multiplier,
            "auto_advance_chain_time": self.auto_advance_chain_time,
        }
