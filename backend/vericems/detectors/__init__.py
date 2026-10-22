"""VeriCEMS Anomaly Detectors and Verifier Verdict Engine (`backend.vericems.detectors`).

Exports:
- Baseline 1: `StaticThresholdDetector`, `FuelStaticLimits`
- Baseline 2: `MassBalancePhysicsDetector`, `FuelPhysicsParams`
- Proposed Detector: `PhysicsInformedAutoencoderNet`, `ChannelScaler`, `OnnxAutoencoderRunner`,
  `ProposedDetector`, `train_physics_informed_autoencoder`, `export_autoencoder_to_onnx`,
  `compute_model_hash`, `set_deterministic_seed`
- Verifier Function: `Verdict`, `verify_batch`, `load_proposed_detector`, `compute_input_hash`,
  `quantize_score_bp`
- Features & Synthetic Fuel Ledger: `REAL_CHANNELS`, `FUEL_LEDGER_SYNTHETIC_CHANNEL`,
  `generate_fuel_ledger_synthetic`, `add_fuel_ledger_synthetic_column`,
  `compute_window_spectral_features`, `compute_rolling_spectral_scores`
"""

from __future__ import annotations

from backend.vericems.detectors.autoencoder import (
    AutoencoderTrainingOutput,
    ChannelScaler,
    OnnxAutoencoderRunner,
    PhysicsInformedAutoencoderNet,
    compute_model_hash,
    export_autoencoder_to_onnx,
    set_deterministic_seed,
    train_physics_informed_autoencoder,
)
from backend.vericems.detectors.baseline_physics import (
    FuelPhysicsParams,
    MassBalancePhysicsDetector,
)
from backend.vericems.detectors.baseline_static import (
    FuelStaticLimits,
    StaticThresholdDetector,
)
from backend.vericems.detectors.features import (
    FUEL_LEDGER_SYNTHETIC_ALIAS,
    FUEL_LEDGER_SYNTHETIC_CHANNEL,
    REAL_CHANNELS,
    add_fuel_ledger_synthetic_column,
    compute_rolling_spectral_scores,
    compute_window_spectral_features,
    extract_fuel_ledger_synthetic,
    extract_real_channel_matrix,
    generate_fuel_ledger_synthetic,
)
from backend.vericems.detectors.verifier import (
    AE_RESIDUAL,
    CANONICAL_REASON_ORDER,
    CROSS_SOURCE_MISMATCH,
    DEFAULT_ARTIFACTS_DIR,
    PHYSICS_RESIDUAL,
    ProposedDetector,
    SPECTRAL_FLAT,
    SPECTRAL_REPEAT,
    Verdict,
    compute_input_hash,
    load_proposed_detector,
    quantize_score_bp,
    verify_batch,
)

__all__ = [
    "AE_RESIDUAL",
    "AutoencoderTrainingOutput",
    "CANONICAL_REASON_ORDER",
    "CROSS_SOURCE_MISMATCH",
    "ChannelScaler",
    "DEFAULT_ARTIFACTS_DIR",
    "FUEL_LEDGER_SYNTHETIC_ALIAS",
    "FUEL_LEDGER_SYNTHETIC_CHANNEL",
    "FuelPhysicsParams",
    "FuelStaticLimits",
    "MassBalancePhysicsDetector",
    "OnnxAutoencoderRunner",
    "PHYSICS_RESIDUAL",
    "PhysicsInformedAutoencoderNet",
    "ProposedDetector",
    "REAL_CHANNELS",
    "SPECTRAL_FLAT",
    "SPECTRAL_REPEAT",
    "StaticThresholdDetector",
    "Verdict",
    "add_fuel_ledger_synthetic_column",
    "compute_input_hash",
    "compute_model_hash",
    "compute_rolling_spectral_scores",
    "compute_window_spectral_features",
    "export_autoencoder_to_onnx",
    "extract_fuel_ledger_synthetic",
    "extract_real_channel_matrix",
    "generate_fuel_ledger_synthetic",
    "load_proposed_detector",
    "quantize_score_bp",
    "set_deterministic_seed",
    "train_physics_informed_autoencoder",
    "verify_batch",
]
