"""Physics-Informed Autoencoder (PyTorch training, ONNX export, deterministic CPU inference).

Implements Milestone P04 Tasks 3 and 6:
- Small CPU-trainable PyTorch autoencoder over the 8 real CAMPD channels in `docs/DATA_CARD.md`.
- Physics penalty during training that punishes reconstructions where reconstructed CO2
  departs from `emission_factor_ratio * reconstructed_heat_input` (with the ratio learned
  from training facilities only).
- Early stopping on validation facilities with fixed deterministic seeds.
- Deterministic ONNX export (`ml/artifacts/model.onnx`), `model_hash = SHA-256(model.onnx)`,
  and deterministic CPU inference via `onnxruntime`.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import copy
from dataclasses import dataclass, field
import hashlib
import io
from pathlib import Path
import random
from typing import Any
import warnings

import numpy as np
import onnxruntime as ort
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from backend.vericems.detectors.features import REAL_CHANNELS, extract_real_channel_matrix


def set_deterministic_seed(seed: int = 42) -> None:
    """Fix Python, NumPy, and PyTorch random seeds and enable CPU deterministic algorithms."""
    random.seed(int(seed))
    np.random.seed(int(seed))
    torch.manual_seed(int(seed))
    torch.use_deterministic_algorithms(True, warn_only=True)
    torch.set_num_threads(1)


class PhysicsInformedAutoencoderNet(nn.Module):
    """Compact deterministic MLP autoencoder over the 8 real CAMPD telemetry channels."""

    def __init__(
        self,
        input_dim: int = len(REAL_CHANNELS),
        hidden_dim: int = 16,
        latent_dim: int = 3,
    ) -> None:
        super().__init__()
        mid_dim = max(latent_dim + 2, hidden_dim // 2)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, mid_dim),
            nn.GELU(),
            nn.Linear(mid_dim, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, mid_dim),
            nn.GELU(),
            nn.Linear(mid_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, input_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = self.encoder(x)
        return self.decoder(z)


@dataclass
class ChannelScaler:
    """Z-score standardization parameters learned strictly from TRAINING facilities.

    Any channel that is structurally constant on the training split (`std <= 1e-3`,
    such as `steam_load_1000_lb_hr` which is 97.6% null across CAMPD electric units)
    is marked `active=False` and mapped to `0.0` in standardized space so it cannot
    cause division-by-epsilon blowup on unseen cogeneration units.
    """

    channels: list[str]
    mean: list[float]
    std: list[float]
    active: list[bool] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.active:
            self.active = [bool(s > 1e-3) for s in self.std]

    def transform(self, x: np.ndarray) -> np.ndarray:
        mu = np.asarray(self.mean, dtype=np.float32)
        sigma = np.where(
            np.asarray(self.active, dtype=bool),
            np.maximum(np.asarray(self.std, dtype=np.float32), 1e-3),
            1.0,
        ).astype(np.float32)
        z = (x.astype(np.float32) - mu) / sigma
        active_mask = np.asarray(self.active, dtype=np.float32)
        return (z * active_mask).astype(np.float32)

    def inverse_transform(self, z: np.ndarray) -> np.ndarray:
        mu = np.asarray(self.mean, dtype=np.float32)
        sigma = np.where(
            np.asarray(self.active, dtype=bool),
            np.maximum(np.asarray(self.std, dtype=np.float32), 1e-3),
            0.0,
        ).astype(np.float32)
        return (z.astype(np.float32) * sigma + mu).astype(np.float32)

    def to_dict(self) -> dict[str, Any]:
        return {
            "channels": list(self.channels),
            "mean": [float(v) for v in self.mean],
            "std": [float(v) for v in self.std],
            "active": [bool(a) for a in self.active],
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> ChannelScaler:
        std_list = [float(v) for v in data["std"]]
        active_list = (
            [bool(a) for a in data["active"]]
            if "active" in data
            else [bool(s > 1e-3) for s in std_list]
        )
        return cls(
            channels=[str(c) for c in data["channels"]],
            mean=[float(v) for v in data["mean"]],
            std=std_list,
            active=active_list,
        )


def compute_physics_informed_loss(
    x_std: torch.Tensor,
    recon_std: torch.Tensor,
    ratio_batch: torch.Tensor,
    mean_t: torch.Tensor,
    std_t: torch.Tensor,
    physics_penalty_weight: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Compute `(total_loss, recon_loss, physics_loss)` for a batch.

    `physics_loss` penalizes reconstructions where reconstructed `co2_mass_short_tons`
    departs from `ratio_batch * reconstructed_heat_input_mmbtu` or from
    `reconstructed_co2_rate * reconstructed_heat_input_mmbtu`.
    """
    recon_loss = torch.mean((x_std - recon_std) ** 2)

    # Unstandardize reconstructed channels to physical units
    recon_phys = recon_std * std_t + mean_t
    hi_idx = REAL_CHANNELS.index("heat_input_mmbtu")
    co2_idx = REAL_CHANNELS.index("co2_mass_short_tons")
    rate_idx = REAL_CHANNELS.index("co2_rate_short_tons_mmbtu")

    recon_hi = torch.clamp(recon_phys[:, hi_idx], min=0.0)
    recon_co2 = recon_phys[:, co2_idx]
    recon_rate = torch.clamp(recon_phys[:, rate_idx], min=0.0)

    co2_scale = torch.clamp(std_t[co2_idx], min=1.0)
    expected_co2_from_ratio = ratio_batch * recon_hi
    stoich_err = ((recon_co2 - expected_co2_from_ratio) / co2_scale) ** 2

    expected_co2_from_rate = recon_rate * recon_hi
    rate_consistency_err = ((recon_co2 - expected_co2_from_rate) / co2_scale) ** 2

    physics_loss = torch.mean(stoich_err + 0.5 * rate_consistency_err)
    total_loss = recon_loss + float(physics_penalty_weight) * physics_loss
    return total_loss, recon_loss, physics_loss


def export_autoencoder_to_onnx(
    model: nn.Module,
    onnx_path: Path,
    *,
    input_dim: int = len(REAL_CHANNELS),
    seed: int = 42,
) -> str:
    """Export trained `PhysicsInformedAutoencoderNet` to `onnx_path` and return `model_hash`."""
    set_deterministic_seed(seed)
    model_cpu = copy.deepcopy(model).to("cpu").eval()
    dummy_input = torch.zeros((1, input_dim), dtype=torch.float32, device="cpu")

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        torch.onnx.export(
            model_cpu,
            (dummy_input,),
            buf,
            export_params=True,
            opset_version=17,
            do_constant_folding=True,
            input_names=["telemetry_input"],
            output_names=["telemetry_reconstruction"],
            dynamic_axes={
                "telemetry_input": {0: "batch_size"},
                "telemetry_reconstruction": {0: "batch_size"},
            },
            dynamo=False,
        )

    onnx_bytes = buf.getvalue()
    onnx_path.write_bytes(onnx_bytes)
    return "0x" + hashlib.sha256(onnx_bytes).hexdigest()


def compute_model_hash(onnx_path: Path) -> str:
    """Compute `0x`-prefixed lowercase SHA-256 hex digest of `onnx_path`."""
    raw = onnx_path.read_bytes()
    return "0x" + hashlib.sha256(raw).hexdigest()


@dataclass
class AutoencoderTrainingOutput:
    """Training result bundle for the Physics-Informed Autoencoder."""

    model: PhysicsInformedAutoencoderNet
    scaler: ChannelScaler
    fuel_ratios: dict[str, float]
    global_ratio: float
    trained_facility_ids: list[int]
    val_facility_ids: list[int]
    training_history: list[dict[str, float]] = field(default_factory=list)
    best_epoch: int = 0
    best_val_loss: float = 0.0
    best_train_loss: float = 0.0
    model_hash: str = ""
    record_threshold: float = 1.0
    batch_threshold: float = 1.0
    val_record_fpr: float = 0.0
    val_batch_fpr: float = 0.0


def train_physics_informed_autoencoder(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    *,
    onnx_path: Path,
    hidden_dim: int = 16,
    latent_dim: int = 3,
    learning_rate: float = 0.002,
    batch_size: int = 512,
    max_epochs: int = 25,
    early_stopping_patience: int = 5,
    physics_penalty_weight: float = 0.50,
    target_fpr: float = 0.02,
    window_size: int = 8,
    seed: int = 42,
) -> AutoencoderTrainingOutput:
    """Train the physics-informed autoencoder on `train_df` with early stopping on `val_df`."""
    if len(train_df) == 0 or len(val_df) == 0:
        raise ValueError("train_df and val_df must both be non-empty")

    train_fids = (
        sorted(int(f) for f in train_df["facility_id"].unique())
        if "facility_id" in train_df.columns
        else []
    )
    val_fids = (
        sorted(int(f) for f in val_df["facility_id"].unique())
        if "facility_id" in val_df.columns
        else []
    )
    if set(train_fids) & set(val_fids):
        raise ValueError(
            f"Facility leakage detected between train and val: {set(train_fids) & set(val_fids)}"
        )

    set_deterministic_seed(seed)

    # 1. Fit scaler strictly on training facilities
    x_train_raw, _ = extract_real_channel_matrix(train_df)
    mean_vec = np.mean(x_train_raw, axis=0)
    raw_std_vec = np.std(x_train_raw, axis=0)
    active_flags = [bool(s > 1e-3) for s in raw_std_vec]
    std_vec = np.where(active_flags, np.maximum(raw_std_vec, 1e-4), 1.0)
    scaler = ChannelScaler(
        channels=list(REAL_CHANNELS),
        mean=mean_vec.tolist(),
        std=std_vec.tolist(),
        active=active_flags,
    )

    # 2. Estimate stoichiometric fuel ratios strictly from training facilities
    co2_train = train_df["co2_mass_short_tons"].to_numpy(dtype=np.float64)
    hi_train = np.maximum(train_df["heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6)
    global_ratio = float(np.median(co2_train / hi_train))
    fuel_ratios: dict[str, float] = {}
    if "primary_fuel_type" in train_df.columns:
        for fuel_name, grp in train_df.groupby("primary_fuel_type", sort=True):
            r = grp["co2_mass_short_tons"].to_numpy(dtype=np.float64) / np.maximum(
                grp["heat_input_mmbtu"].to_numpy(dtype=np.float64), 1e-6
            )
            fuel_ratios[str(fuel_name)] = float(np.median(r))

    def _ratios_for_df(df: pd.DataFrame) -> np.ndarray:
        if "primary_fuel_type" not in df.columns:
            return np.full(len(df), global_ratio, dtype=np.float32)
        out = np.full(len(df), global_ratio, dtype=np.float32)
        fuels = df["primary_fuel_type"].astype(str).to_numpy()
        for f_val in np.unique(fuels):
            mask = fuels == f_val
            if f_val in fuel_ratios:
                out[mask] = float(fuel_ratios[f_val])
            elif f_val == "Natural Gas" and "Pipeline Natural Gas" in fuel_ratios:
                out[mask] = float(fuel_ratios["Pipeline Natural Gas"])
        return out

    x_val_raw, _ = extract_real_channel_matrix(
        val_df, default_values=dict(zip(REAL_CHANNELS, scaler.mean))
    )

    x_train_std = scaler.transform(x_train_raw)
    x_val_std = scaler.transform(x_val_raw)
    r_train = _ratios_for_df(train_df)
    r_val = _ratios_for_df(val_df)

    train_ds = TensorDataset(
        torch.from_numpy(x_train_std),
        torch.from_numpy(r_train),
    )
    gen = torch.Generator()
    gen.manual_seed(int(seed))
    train_loader = DataLoader(
        train_ds,
        batch_size=int(batch_size),
        shuffle=True,
        generator=gen,
        drop_last=False,
    )

    x_val_tensor = torch.from_numpy(x_val_std)
    r_val_tensor = torch.from_numpy(r_val)
    mean_t = torch.tensor(scaler.mean, dtype=torch.float32)
    std_t = torch.tensor(scaler.std, dtype=torch.float32)

    model = PhysicsInformedAutoencoderNet(
        input_dim=len(REAL_CHANNELS),
        hidden_dim=int(hidden_dim),
        latent_dim=int(latent_dim),
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=float(learning_rate), weight_decay=1e-5)

    best_val_loss = float("inf")
    best_train_loss = float("inf")
    best_epoch = 0
    best_state = copy.deepcopy(model.state_dict())
    patience_counter = 0
    history: list[dict[str, float]] = []

    co2_idx = REAL_CHANNELS.index("co2_mass_short_tons")
    rate_idx = REAL_CHANNELS.index("co2_rate_short_tons_mmbtu")

    for epoch in range(1, int(max_epochs) + 1):
        model.train()
        epoch_tot = 0.0
        epoch_rec = 0.0
        epoch_phy = 0.0
        n_seen = 0

        for xb, rb in train_loader:
            optimizer.zero_grad()
            # Denoising corruption on CO2 mass and rate channels during training so decoder
            # learns to reconstruct CO2 from heat input, load, and stoichiometry rather than identity copying
            noise = torch.zeros_like(xb)
            noise[:, co2_idx] = 0.30 * torch.randn(xb.shape[0], generator=gen)
            noise[:, rate_idx] = 0.15 * torch.randn(xb.shape[0], generator=gen)
            recon = model(xb + noise)
            tot_loss, rec_loss, phy_loss = compute_physics_informed_loss(
                xb,
                recon,
                rb,
                mean_t,
                std_t,
                physics_penalty_weight=physics_penalty_weight,
            )
            tot_loss.backward()
            optimizer.step()

            bs = int(xb.shape[0])
            epoch_tot += float(tot_loss.item()) * bs
            epoch_rec += float(rec_loss.item()) * bs
            epoch_phy += float(phy_loss.item()) * bs
            n_seen += bs

        train_tot = epoch_tot / max(n_seen, 1)
        train_rec = epoch_rec / max(n_seen, 1)
        train_phy = epoch_phy / max(n_seen, 1)

        model.eval()
        with torch.no_grad():
            val_recon = model(x_val_tensor)
            v_tot, v_rec, v_phy = compute_physics_informed_loss(
                x_val_tensor,
                val_recon,
                r_val_tensor,
                mean_t,
                std_t,
                physics_penalty_weight=physics_penalty_weight,
            )
            val_tot = float(v_tot.item())
            val_rec = float(v_rec.item())
            val_phy = float(v_phy.item())

        history.append(
            {
                "epoch": float(epoch),
                "train_total_loss": train_tot,
                "train_recon_loss": train_rec,
                "train_physics_loss": train_phy,
                "val_total_loss": val_tot,
                "val_recon_loss": val_rec,
                "val_physics_loss": val_phy,
            }
        )

        if val_tot < best_val_loss - 1e-6:
            best_val_loss = val_tot
            best_train_loss = train_tot
            best_epoch = epoch
            best_state = copy.deepcopy(model.state_dict())
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= int(early_stopping_patience):
                break

    model.load_state_dict(best_state)
    model.eval()

    model_hash = export_autoencoder_to_onnx(
        model,
        onnx_path=onnx_path,
        input_dim=len(REAL_CHANNELS),
        seed=seed,
    )

    runner = OnnxAutoencoderRunner(
        onnx_path=onnx_path,
        scaler=scaler,
        fuel_ratios=fuel_ratios,
        global_ratio=global_ratio,
        physics_penalty_weight=physics_penalty_weight,
    )
    cal = runner.calibrate(val_df, target_fpr=target_fpr, window_size=window_size)

    return AutoencoderTrainingOutput(
        model=model,
        scaler=scaler,
        fuel_ratios=fuel_ratios,
        global_ratio=global_ratio,
        trained_facility_ids=train_fids,
        val_facility_ids=val_fids,
        training_history=history,
        best_epoch=best_epoch,
        best_val_loss=best_val_loss,
        best_train_loss=best_train_loss,
        model_hash=model_hash,
        record_threshold=cal["record_threshold"],
        batch_threshold=cal["batch_threshold"],
        val_record_fpr=cal["val_record_fpr"],
        val_batch_fpr=cal["val_batch_fpr"],
    )


class OnnxAutoencoderRunner:
    """Deterministic CPU ONNX Runtime inference engine for the Physics-Informed Autoencoder."""

    def __init__(
        self,
        onnx_path: Path,
        scaler: ChannelScaler,
        fuel_ratios: Mapping[str, float],
        global_ratio: float,
        *,
        physics_penalty_weight: float = 0.50,
        record_threshold: float = 1.0,
        batch_threshold: float = 1.0,
    ) -> None:
        self.onnx_path = Path(onnx_path)
        self.scaler = scaler
        self.fuel_ratios = {str(k): float(v) for k, v in fuel_ratios.items()}
        self.global_ratio = float(global_ratio)
        self.physics_penalty_weight = float(physics_penalty_weight)
        self.record_threshold = float(record_threshold)
        self.batch_threshold = float(batch_threshold)
        self.model_hash = compute_model_hash(self.onnx_path)

        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = 1
        sess_opts.inter_op_num_threads = 1
        sess_opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self._session = ort.InferenceSession(
            str(self.onnx_path),
            sess_options=sess_opts,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name

    def reconstruct(self, x_std: np.ndarray) -> np.ndarray:
        """Run deterministic CPU ONNX inference on standardized inputs `(N, 8)`."""
        inp = np.ascontiguousarray(x_std, dtype=np.float32)
        outputs = self._session.run([self._output_name], {self._input_name: inp})
        return np.asarray(outputs[0], dtype=np.float32)

    def _resolve_ratio_array(
        self,
        packets_or_df: Sequence[Mapping[str, Any]] | pd.DataFrame,
        x_raw: np.ndarray,
        primary_fuel_type: str | None = None,
    ) -> np.ndarray:
        n = x_raw.shape[0]
        if primary_fuel_type and primary_fuel_type in self.fuel_ratios:
            return np.full(n, float(self.fuel_ratios[primary_fuel_type]), dtype=np.float64)

        if isinstance(packets_or_df, pd.DataFrame) and "primary_fuel_type" in packets_or_df.columns:
            out = np.full(n, self.global_ratio, dtype=np.float64)
            fuels = packets_or_df["primary_fuel_type"].astype(str).to_numpy()
            for f_val in np.unique(fuels):
                mask = fuels == f_val
                if f_val in self.fuel_ratios:
                    out[mask] = float(self.fuel_ratios[f_val])
                elif f_val == "Natural Gas" and "Pipeline Natural Gas" in self.fuel_ratios:
                    out[mask] = float(self.fuel_ratios["Pipeline Natural Gas"])
            return out

        # When fuel type is not provided, pick the closest learned fuel ratio to the batch median
        co2_idx = REAL_CHANNELS.index("co2_mass_short_tons")
        hi_idx = REAL_CHANNELS.index("heat_input_mmbtu")
        obs_ratios = x_raw[:, co2_idx] / np.maximum(x_raw[:, hi_idx], 1e-6)
        med_ratio = float(np.median(obs_ratios)) if n > 0 else self.global_ratio
        if self.fuel_ratios:
            best_r = min(self.fuel_ratios.values(), key=lambda r: abs(r - med_ratio))
            return np.full(n, float(best_r), dtype=np.float64)
        return np.full(n, self.global_ratio, dtype=np.float64)

    def score_records(
        self,
        packets_or_df: Sequence[Mapping[str, Any]] | pd.DataFrame,
        *,
        primary_fuel_type: str | None = None,
    ) -> np.ndarray:
        """Compute per-record physics-informed autoencoder residual score on CPU via ONNX."""
        defaults = dict(zip(self.scaler.channels, self.scaler.mean))
        x_raw, mask = extract_real_channel_matrix(packets_or_df, default_values=defaults)
        if len(x_raw) == 0:
            return np.zeros(0, dtype=np.float64)

        # Check if only core subset of channels was provided (e.g. golden vectors without SO2/NOx)
        all_channels_present = bool(np.all(mask))
        x_std = self.scaler.transform(x_raw)

        if not all_channels_present:
            # For partial-channel packets (like golden vectors), only evaluate reconstruction error
            # on the core combustion & load channels that were actually present in the packet,
            # while zeroing standardized missing auxiliary channels so they equal the training mean.
            x_std_masked = np.where(mask, x_std, 0.0).astype(np.float32)
            recon_std = self.reconstruct(x_std_masked)
            sq_err = (x_std_masked - recon_std) ** 2
            weights = np.array([0.5, 0.0, 1.5, 3.0, 1.5, 0.05, 0.05, 0.05], dtype=np.float64)
            eff_w = weights * mask
            recon_mse = np.sum(sq_err * eff_w, axis=1) / np.maximum(np.sum(eff_w, axis=1), 1e-6)
        else:
            recon_std = self.reconstruct(x_std)
            sq_err = (x_std - recon_std) ** 2
            # Weight core combustion & load channels higher than plant-specific scrubber controls
            weights = np.array([0.5, 0.0, 1.5, 3.0, 1.5, 0.05, 0.05, 0.05], dtype=np.float64)
            recon_mse = np.sum(sq_err * weights, axis=1) / float(np.sum(weights))

        # Physics manifold discrepancy on input vs reconstructed stoichiometry
        recon_phys = self.scaler.inverse_transform(recon_std)
        hi_idx = REAL_CHANNELS.index("heat_input_mmbtu")
        co2_idx = REAL_CHANNELS.index("co2_mass_short_tons")
        co2_std_scale = max(float(self.scaler.std[co2_idx]), 1.0)

        ratios = self._resolve_ratio_array(packets_or_df, x_raw, primary_fuel_type=primary_fuel_type)
        input_co2 = x_raw[:, co2_idx]
        input_hi = np.maximum(x_raw[:, hi_idx], 1e-6)
        recon_hi = np.maximum(recon_phys[:, hi_idx], 0.0)
        recon_co2 = recon_phys[:, co2_idx]

        # Penalize input-to-reconstruction CO2 error, reconstruction physics violation, and input physics violation
        co2_recon_err = ((input_co2 - recon_co2) / co2_std_scale) ** 2
        phys_recon_err = ((recon_co2 - ratios * recon_hi) / co2_std_scale) ** 2
        phys_input_err = ((input_co2 - ratios * input_hi) / co2_std_scale) ** 2

        total_score = recon_mse + self.physics_penalty_weight * (
            co2_recon_err + 0.5 * phys_recon_err + 2.0 * phys_input_err
        )
        return np.asarray(total_score, dtype=np.float64)

    def score_batch_series(
        self, df: pd.DataFrame, *, window_size: int = 8, stride: int = 8
    ) -> np.ndarray:
        """Compute window-level AE residual scores across unit time series in `df`."""
        rec_scores = self.score_records(df)
        group_col = "unit_series_id" if "unit_series_id" in df.columns else None
        batch_scores: list[float] = []
        if group_col is not None:
            for _, grp in df.groupby(group_col, sort=True):
                idx = df.index.get_indexer(grp.index)
                s = rec_scores[idx]
                for start in range(0, len(s) - window_size + 1, stride):
                    batch_scores.append(float(np.quantile(s[start : start + window_size], 0.875)))
        else:
            for start in range(0, len(rec_scores) - window_size + 1, stride):
                batch_scores.append(
                    float(np.quantile(rec_scores[start : start + window_size], 0.875))
                )
        return np.asarray(batch_scores, dtype=np.float64)

    def calibrate(
        self,
        val_df: pd.DataFrame,
        *,
        target_fpr: float = 0.02,
        window_size: int = 8,
    ) -> dict[str, float]:
        """Calibrate AE record and batch thresholds on VALIDATION facilities only."""
        val_rec_scores = self.score_records(val_df)
        q = float(np.clip(1.0 - float(target_fpr), 0.50, 0.9999))
        self.record_threshold = float(np.quantile(val_rec_scores, q))
        val_rec_fpr = float(np.mean(val_rec_scores > self.record_threshold))

        val_batch_scores = self.score_batch_series(val_df, window_size=window_size, stride=window_size)
        if len(val_batch_scores) > 0:
            self.batch_threshold = float(np.quantile(val_batch_scores, q))
            val_batch_fpr = float(np.mean(val_batch_scores > self.batch_threshold))
        else:
            self.batch_threshold = self.record_threshold
            val_batch_fpr = val_rec_fpr

        return {
            "record_threshold": self.record_threshold,
            "batch_threshold": self.batch_threshold,
            "val_record_fpr": val_rec_fpr,
            "val_batch_fpr": val_batch_fpr,
        }
