"""VeriCEMS Reproducible Adversarial Benchmark Package (`ml/benchmark`)."""

from __future__ import annotations

from ml.benchmark.metrics import (
    compute_roc_curve_points,
    compute_split_attack_metrics,
    score_crypto_chain_per_record,
    score_series_with_all_detectors,
)
from ml.benchmark.report import (
    generate_what_still_gets_through_markdown,
    plot_adaptive_attacker_curve,
    plot_recall_per_attack,
    plot_roc_curves,
)
from ml.benchmark.run_benchmark import run_full_benchmark

__all__ = [
    "compute_roc_curve_points",
    "compute_split_attack_metrics",
    "generate_what_still_gets_through_markdown",
    "plot_adaptive_attacker_curve",
    "plot_recall_per_attack",
    "plot_roc_curves",
    "run_full_benchmark",
    "score_crypto_chain_per_record",
    "score_series_with_all_detectors",
]
