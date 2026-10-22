#!/usr/bin/env python3
"""
scripts/update_readme.py
Generates or updates README.md with exact benchmark results extracted from
results/benchmark_summary.json and regulatory sources from calculator/sources.json.
Conforms strictly to AGENTS.md honesty rules.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BENCHMARK_PATH = REPO_ROOT / "results" / "benchmark_summary.json"
SOURCES_PATH = REPO_ROOT / "calculator" / "sources.json"
README_PATH = REPO_ROOT / "README.md"


def format_pct(val: float, std: float = None) -> str:
    if std is not None:
        return f"{val * 100:.2f}% ± {std * 100:.2f}%"
    return f"{val * 100:.2f}%"


def generate_benchmark_tables() -> str:
    if not BENCHMARK_PATH.exists():
        raise FileNotFoundError(f"Missing {BENCHMARK_PATH}")

    with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    macro = data["overall_macro_average"]
    attacks = data["attacks"]

    # Overall Macro Table
    order = [
        ("proposed", "**Proposed Detector (VeriCEMS)**"),
        ("baseline_2_physics", "Baseline 2 (Combustion Physics)"),
        ("baseline_1_static", "Baseline 1 (Static Thresholds)"),
        ("autoencoder_only", "Autoencoder Only (Neural Unsupervised)"),
    ]

    lines = [
        "### Macro-Average Adversarial Benchmark Performance",
        "",
        "> Measured over **5 facility-grouped splits** across 30 US EPA CAMPD units (393,222 operating hours, 720h evaluation series per unit). All detector thresholds calibrated strictly on validation splits for a target false-positive rate of **2.0%**.",
        "",
        "| Detector Configuration | Recall (Mean ± Std) | Precision | False Positive Rate | AUROC | Mean Detection Delay |",
        "|---|---:|---:|---:|---:|---:|",
    ]

    for key, name in order:
        m = macro[key]
        rec = format_pct(m["recall"]["mean"], m["recall"]["std"])
        prec = format_pct(m["precision"]["mean"], m["precision"]["std"])
        fpr = format_pct(m["fpr"]["mean"], m["fpr"]["std"])
        auroc = f"{m['auroc']['mean']:.4f} ± {m['auroc']['std']:.4f}"
        delay = f"{m['detection_delay_hours']['mean']:.1f} h"
        lines.append(f"| {name} | **{rec}** | {prec} | {fpr} | {auroc} | {delay} |")

    lines.extend([
        "",
        "### Attack-by-Attack Recall Comparison (14 Evaluated Scenarios)",
        "",
        "| Attack Scenario | Target Reduction | Proposed Recall | Baseline 2 Recall | Baseline 1 Recall |",
        "|---|---:|---:|---:|---:|",
    ])

    attack_names = [
        ("constant_scaling_5pct", "Constant Scaling (-5%)", "-5.0%"),
        ("constant_scaling_10pct", "Constant Scaling (-10%)", "-10.0%"),
        ("constant_scaling_20pct", "Constant Scaling (-20%)", "-20.0%"),
        ("constant_scaling_30pct", "Constant Scaling (-30%)", "-30.0%"),
        ("slow_drift_0_1pct_day", "Slow Drift (0.1%/day, 30d)", "-0.57%"),
        ("slow_drift_0_3pct_day", "Slow Drift (0.3%/day, 30d)", "-1.70%"),
        ("slow_drift_0_5pct_day", "Slow Drift (0.5%/day, 30d)", "-2.83%"),
        ("naive_replay", "Naive Historical Replay (Un-resigned)", "Varies"),
        ("time_shifted_replay", "Time-Shifted Replay (Re-signed)", "Varies"),
        ("flatline_injection", "Flatline Sensor Injection", "Varies"),
        ("synthetic_noise_on_flatline", "Noise-Masked Flatline", "Varies"),
        ("selective_packet_dropping", "Selective Peak Packet Dropping", "Varies"),
        ("adaptive_whitebox_a_single_source", "Adaptive White-Box (Variant A: CEMS Forgery)", "-4.97%"),
        ("adaptive_whitebox_b_coordinated_insider", "Adaptive White-Box (Variant B: Coordinated Insider)", "-23.73%"),
    ]

    for att_key, att_label, target_red in attack_names:
        if att_key in attacks:
            att_data = attacks[att_key]
            dets = att_data["detectors"]
            prop_rec = format_pct(dets["proposed"]["recall"]["mean"], dets["proposed"]["recall"]["std"])
            b2_rec = format_pct(dets["baseline_2_physics"]["recall"]["mean"], dets["baseline_2_physics"]["recall"]["std"])
            b1_rec = format_pct(dets["baseline_1_static"]["recall"]["mean"], dets["baseline_1_static"]["recall"]["std"])
            lines.append(f"| `{att_key}` ({att_label}) | {target_red} | **{prop_rec}** | {b2_rec} | {b1_rec} |")

    return "\n".join(lines)


def generate_sources_table() -> str:
    if not SOURCES_PATH.exists():
        raise FileNotFoundError(f"Missing {SOURCES_PATH}")

    with open(SOURCES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    lines = [
        "### Regulatory Sources & Legal Citations (`calculator/sources.json`)",
        "",
        "> VeriCEMS strictly references primary EU regulatory texts. Variables without confirmed primary legal sources are stored as `null` and displayed with status `NEEDS_SOURCE` per AGENTS.md honesty rules.",
        "",
        "| Parameter Name | Value in Demo | Status | Primary Regulatory Citation |",
        "|---|---:|---|---|",
    ]

    vars_dict = data.get("variables", {})
    for var_id, var_info in vars_dict.items():
        desc = var_info.get("description", "")
        status = var_info.get("status", "NEEDS_SOURCE")
        regs = ", ".join(var_info.get("regulations", []))
        art = var_info.get("article", None)
        art_str = f" ({art})" if art else ""
        lines.append(f"| `{var_id}` | Defined in Config | `{status}` | {regs}{art_str} |")

    lines.extend([
        "",
        "#### Referenced European Union Regulations:",
        "",
    ])

    regs_dict = data.get("regulations", {})
    for reg_id, reg_info in regs_dict.items():
        citation = reg_info.get("citation", "")
        role = reg_info.get("role", "")
        lines.append(f"- **{reg_id}**: {citation} — *{role}*")

    return "\n".join(lines)


def build_full_readme() -> str:
    benchmark_md = generate_benchmark_tables()
    sources_md = generate_sources_table()

    readme_content = f"""# VeriCEMS: Tamper-Evident Industrial Telemetry Verification for EU CBAM

[![Arbitrum Sepolia](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue)](https://sepolia.arbiscan.io)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-lightgrey)](contracts/src/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-green)](backend/)
[![IEEE ClimateChain Hackathon](https://img.shields.io/badge/IEEE%20Hackathon-Track%204-purple)](https://cmte.ieee.org/turkiye-blockchain/hackatlon/)

> **IEEE Global ClimateChain Hackathon 2026 — Track 4 (Climate Data & Environmental Monitoring)**  
> **Tagline:** *Don't trust the sensor. Verify the physics and the chain.*  
> **Standards Alignment:** Informed by **IEEE 2413-2019** (IoT Architecture), **IEEE draft P3218** (Blockchain for Carbon Trading), **IEEE draft P3219** (Zero-Trust IoT Framework), and **IEEE draft P2418.1** (Blockchain for Connected IoT Devices). *VeriCEMS is informed by these standards; never claim certified compliance.*

---

## What VeriCEMS Is

VeriCEMS is a decentralized pre-verification assurance network designed to make industrial stack emissions data tamper-evident for the **EU Carbon Border Adjustment Mechanism (CBAM)** (Regulation (EU) 2023/956).

Under CBAM, non-EU industrial exporters (steel, cement, aluminium, fertilisers) must prove their installation-level greenhouse gas emissions to European importers. If verified data cannot be supplied, importers must surrender CBAM certificates under punitive Commission **default values** (carrying a +10% markup in 2026, +20% in 2027, and +30% from 2028).

Continuous emission monitoring systems (CEMS) measure these emissions at the smokestack, but telemetry passes through operator-controlled computers before reaching auditors—creating an acute **oracle problem**. VeriCEMS solves this with a four-layer verification architecture:
1. **Edge Cryptography & Hash Chaining:** Readings are signed by an unexported device key (NIST P-256 ECDSA) and linked in a continuous SHA-256 hash chain at the physical stack gateway.
2. **Combustion Physics & ML Anomaly Detection:** Batches are checked against combustion mass-balance laws, independent fuel ledgers, spectral flatness, autocorrelation, and a physics-informed ONNX autoencoder.
3. **Bonded 3-of-5 Verifier Quorum:** A committee of 5 independent verifier nodes stakes collateral in `BondVault.sol` and votes via a two-phase commit-reveal consensus protocol on Arbitrum Sepolia (`Chain ID: 421614`). Confirmed fraud triggers automated bond slashing.
4. **Transparent Importer Portal:** European importers verify Merkle inclusion proofs in their browser in <5ms and calculate exact certificate cost savings in EUR compared to EU default penalties.

---

## One-Command Quickstart

To run the complete system locally:

```bash
# 1. Clone repository
git clone https://github.com/your-org/vericems.git
cd vericems

# 2. Setup Python virtual environment & dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate
pip install -r requirements.txt

# 3. Install web dependencies
npm --prefix web install

# 4. Run End-to-End Test Suite (Contracts + Python + Browser Tests)
make test
```

### Live Testnet Explorer Verification
All 6 core contracts are deployed and verified on **Arbitrum Sepolia**:
- **`Attestation.sol`:** [`0x872D5EF7C6a457d1B8eD68221350236151c763B0`](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0)
- **`BatchAnchor.sol`:** [`0x8Bf14de651FA70FeB3538852c2160d082255638B`](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B)
- **`BondVault.sol`:** [`0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36`](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36)
- **`Challenge.sol`:** [`0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34)
- **`DeviceRegistry.sol`:** [`0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471`](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471)
- **`VerifierQuorum.sol`:** [`0x734849b029dDF31030CfaE4A74c314f8E21DBfB9`](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9)

Full transaction hashes and deployment logs are documented in [`docs/TESTNET_EVIDENCE.md`](docs/TESTNET_EVIDENCE.md).

---

## Adversarial Benchmark Results

{benchmark_md}

---

## Honest System Limits & What Still Gets Through

In strict adherence to `AGENTS.md` honesty rules, VeriCEMS openly publishes its evasion boundaries (see [`results/WHAT_STILL_GETS_THROUGH.md`](results/WHAT_STILL_GETS_THROUGH.md)):
1. **Slow Calibration Drift (<0.3%/day):** Gradual sensor drift below 0.3%/day mimics natural fuel quality fluctuations and stays within the 2.0% validation-calibrated false-alarm bound. Proposed recall is **8.12%** for 0.1%/day drift and **29.09%** for 0.3%/day drift.
2. **Coordinated Insider Collusion (Variant B):** When a malicious actor simultaneously controls both the stack analyzer and the secondary custody fuel meter, scaling CO2, Heat Input, and Fuel Flow together, proposed detector recall drops to **2.95%**.
3. **Pre-Sensor Physical Dilution:** Digital signatures cannot prevent physical tampering occurring inside the flue stack before gas enters the analyzer probe.

---

## Data Provenance & Real vs. Synthetic Channels

VeriCEMS strictly separates real baseline telemetry from simulated signals:

- **Real Telemetry (US EPA CAMPD 2025):** 30 combustion power-plant facilities across Iowa, Utah, and Wyoming reporting under 40 CFR Part 75, comprising 393,222 unit-hours (`gross_load_mw`, `heat_input_mmbtu`, `co2_mass_short_tons`, `so2_mass_lbs`, `nox_mass_lbs`, `op_time_fraction`). Detailed in [`docs/DATA_CARD.md`](docs/DATA_CARD.md).
- **Synthetic Channels (Explicitly Labelled):** Parameters not present in hourly EPA CAMPD files are generated via calibrated physical simulation and prefixed with `synthetic_` in code and schemas:
  - `synthetic_stack_o2_pct` (stack oxygen percentage)
  - `synthetic_flue_temp_c` (flue gas temperature)
  - `synthetic_stack_flow_kscfm` (stack volumetric flow)
  - `synthetic_fuel_flow_mmbtu_indep` / `fuel_ledger_synthetic` (independent custody fuel ledger)

---

{sources_md}

---

## License & Reproducibility Notice
VeriCEMS is an open-source hackathon prototype developed for the IEEE Global ClimateChain Hackathon 2026. Code is licensed under Apache-2.0. All benchmark results are deterministically reproducible with fixed seeds (`base_seed = 42`).
"""
    return readme_content


def main():
    print("Building final README.md from benchmark_summary.json and sources.json...")
    content = build_full_readme()
    with open(README_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Successfully generated {README_PATH} ({len(content.split())} words)")


if __name__ == "__main__":
    main()
