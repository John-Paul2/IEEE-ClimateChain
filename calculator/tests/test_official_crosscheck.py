"""Official or reputable third-party CBAM worked-example cross-check test.

Per Milestone P04 Task 7 & AGENTS.md Rule 1:
This test is intentionally SKIPPED with a TODO_HUMAN message until a human-verified
official European Commission or third-party worked example from the definitive period
regulations (2025/2620, 2025/2621 as corrected by 2026/1740) is added.
"""

from __future__ import annotations

import pytest


@pytest.mark.skip(
    reason=(
        "TODO_HUMAN: I will add one official or third-party worked example later "
        "(verify against European Commission CBAM guidance / Implementing Regulations "
        "2025/2620 and 2025/2621 as corrected by 2026/1740)."
    )
)
def test_official_cbam_worked_example_crosscheck() -> None:
    """Placeholder for human-verified official CBAM worked example."""
    raise NotImplementedError("TODO_HUMAN: Populate with verified official CBAM worked example.")
