# VeriCEMS
**Don't trust the sensor. Verify the physics and the chain.**
Tamper-evident emissions telemetry for EU CBAM, built for the IEEE ClimateChain Hackathon 2026 (Climate Data & Environmental Monitoring track).

| | |
|---|---|
| Live demo | https://ieee-climate-chain.vercel.app/ |
| 3-minute video | VIDEO_URL_HERE |
| 2-minute judge guide | [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md) |
| Docs | [Problem statement](docs/PROBLEM_STATEMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY_ASSESSMENT.md) · [Climate impact](docs/CLIMATE_IMPACT.md) · [Adoption](docs/ADOPTION_STRATEGY.md) · [Roadmap](docs/SCALABILITY_ROADMAP.md) |

**Contracts on Arbitrum Sepolia (chain 421614)**

| Contract | Address |
|---|---|
| DeviceRegistry | [0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471) |
| BondVault | [0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36) |
| BatchAnchor | [0x8Bf14de651FA70FeB3538852c2160d082255638B](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B) |
| VerifierQuorum | [0x734849b029dDF31030CfaE4A74c314f8E21DBfB9](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9) |
| Challenge | [0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34) |
| Attestation | [0x872D5EF7C6a457d1B8eD68221350236151c763B0](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0) |

Source code for all contracts is in contracts/src. Explorer source verification is not done in this prototype.

# VeriCEMS: Tamper-Evident Industrial Telemetry Verification for EU CBAM

[![Arbitrum Sepolia](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue)](https://sepolia.arbiscan.io)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-lightgrey)](contracts/src/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-green)](backend/)
[![IEEE ClimateChain Hackathon](https://img.shields.io/badge/IEEE%20Hackathon-Track%204-purple)](https://cmte.ieee.org/turkiye-blockchain/hackatlon/)

> **IEEE Global ClimateChain Hackathon 2026 — Track 4 (Climate Data & Environmental Monitoring)**  
> **Tagline:** *Don't trust the sensor. Verify the physics and the chain.*  
> **Standards Alignment:** Informed by **IEEE 2413-2019** (IoT Architecture), **IEEE draft P3218** (Blockchain for Carbon Trading), **IEEE draft P3219** (Zero-Trust IoT Framework), and **IEEE draft P2418.1** (Blockchain for Connected IoT Devices). *VeriCEMS is informed by these standards; not a formal certification.*  
> **Quick Judge Walkthrough:** See [`docs/JUDGE_GUIDE.md`](docs/JUDGE_GUIDE.md) for a 2-minute interactive guide to the 4 screens, browser tamper/omission presets, and live Arbitrum Sepolia contracts.

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

To run the complete system locally from the repository root:

```bash
# 1. Setup Python virtual environment & dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Install web dependencies
npm --prefix web install

# 3. Start the interactive web portal (or run `make test` for the full suite)
npm --prefix web run dev
```

### Live Testnet Contracts
All 6 core contracts are deployed on Arbitrum Sepolia:
- **`Attestation.sol`:** [`0x872D5EF7C6a457d1B8eD68221350236151c763B0`](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0)
- **`BatchAnchor.sol`:** [`0x8Bf14de651FA70FeB3538852c2160d082255638B`](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B)
- **`BondVault.sol`:** [`0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36`](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36)
- **`Challenge.sol`:** [`0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34)
- **`DeviceRegistry.sol`:** [`0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471`](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471)
- **`VerifierQuorum.sol`:** [`0x734849b029dDF31030CfaE4A74c314f8E21DBfB9`](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9)

Full transaction hashes and deployment logs are documented in [`docs/TESTNET_EVIDENCE.md`](docs/TESTNET_EVIDENCE.md).

---

## Adversarial Benchmark Results

### Macro-Average Adversarial Benchmark Performance

> Measured over **5 facility-grouped splits** across 30 US EPA CAMPD units (393,222 operating hours, 720h evaluation series per unit). All detector thresholds calibrated strictly on validation splits for a target false-positive rate of **2.0%**.

| Detector Configuration | Recall (Mean ± Std) | Precision | False Positive Rate | AUROC | Mean Detection Delay |
|---|---:|---:|---:|---:|---:|
| **Proposed Detector (VeriCEMS)** | **75.64% ± 8.03%** | 77.59% ± 8.23% | 8.34% ± 6.08% | 0.8830 ± 0.0107 | 49.7 h |
| Baseline 2 (Combustion Physics) | **53.11% ± 2.81%** | 81.65% ± 6.08% | 0.25% ± 0.18% | 0.8029 ± 0.0297 | 106.6 h |
| Baseline 1 (Static Thresholds) | **43.85% ± 7.37%** | 74.42% ± 8.19% | 3.22% ± 3.41% | 0.5770 ± 0.1344 | 130.5 h |
| Autoencoder Only (Neural Unsupervised) | **37.73% ± 21.78%** | 56.78% ± 11.69% | 10.51% ± 11.43% | 0.7555 ± 0.0201 | 131.0 h |

### Attack-by-Attack Recall Comparison (14 Evaluated Scenarios)

| Attack Scenario | Target Reduction | Proposed Recall | Baseline 2 Recall | Baseline 1 Recall |
|---|---:|---:|---:|---:|
| `constant_scaling_5pct` (Constant Scaling (-5%)) | -5.0% | **85.75% ± 31.81%** | 99.97% ± 0.05% | 65.29% ± 23.71% |
| `constant_scaling_10pct` (Constant Scaling (-10%)) | -10.0% | **100.00% ± 0.00%** | 100.00% ± 0.00% | 65.32% ± 23.69% |
| `constant_scaling_20pct` (Constant Scaling (-20%)) | -20.0% | **100.00% ± 0.00%** | 100.00% ± 0.00% | 65.32% ± 23.68% |
| `constant_scaling_30pct` (Constant Scaling (-30%)) | -30.0% | **100.00% ± 0.00%** | 100.00% ± 0.00% | 74.09% ± 27.27% |
| `slow_drift_0_1pct_day` (Slow Drift (0.1%/day, 30d)) | -0.57% | **8.12% ± 11.54%** | 7.13% ± 9.70% | 19.74% ± 11.32% |
| `slow_drift_0_3pct_day` (Slow Drift (0.3%/day, 30d)) | -1.70% | **29.09% ± 18.44%** | 33.96% ± 10.76% | 43.13% ± 11.13% |
| `slow_drift_0_5pct_day` (Slow Drift (0.5%/day, 30d)) | -2.83% | **51.19% ± 23.09%** | 59.50% ± 6.64% | 51.51% ± 11.95% |
| `naive_replay` (Naive Historical Replay (Un-resigned)) | Varies | **100.00% ± 0.00%** | 2.14% ± 2.58% | 5.25% ± 4.97% |
| `time_shifted_replay` (Time-Shifted Replay (Re-signed)) | Varies | **99.78% ± 0.13%** | 31.81% ± 13.04% | 5.25% ± 4.97% |
| `flatline_injection` (Flatline Sensor Injection) | Varies | **99.12% ± 1.78%** | 97.34% ± 1.11% | 82.20% ± 10.76% |
| `synthetic_noise_on_flatline` (Noise-Masked Flatline) | Varies | **97.20% ± 2.65%** | 97.46% ± 1.01% | 82.76% ± 10.83% |
| `selective_packet_dropping` (Selective Peak Packet Dropping) | Varies | **100.00% ± 0.00%** | 0.22% ± 0.20% | 3.83% ± 4.47% |
| `adaptive_whitebox_a_single_source` (Adaptive White-Box (Variant A: CEMS Forgery)) | -4.97% | **85.69% ± 31.81%** | 13.89% ± 14.12% | 45.05% ± 28.32% |
| `adaptive_whitebox_b_coordinated_insider` (Adaptive White-Box (Variant B: Coordinated Insider)) | -23.73% | **2.95% ± 3.66%** | 0.17% ± 0.12% | 5.14% ± 5.07% |

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

### Regulatory Sources & Legal Citations (`calculator/sources.json`)

> VeriCEMS strictly references primary EU regulatory texts. Variables without confirmed primary legal sources are stored as `null` and displayed with status `NEEDS_SOURCE` per AGENTS.md honesty rules.

| Parameter Name | Value in Demo | Status | Primary Regulatory Citation |
|---|---:|---|---|
| `price_eur_per_tco2e` | Defined in Config | `VERIFIED_SECONDARY` | 2023/956, 2025/2548 |
| `free_allocation_factor_by_year` | Defined in Config | `VERIFIED_SECONDARY` | 2023/956, 2025/2620 (Article 31 (Regulation 2023/956)) |
| `cscf_by_year` | Defined in Config | `NEEDS_SOURCE` | 2023/956, 2025/2620 |
| `benchmark_tco2e_per_t` | Defined in Config | `NEEDS_SOURCE` | 2023/956, 2025/2620 |
| `default_benchmark_tco2e_per_t` | Defined in Config | `NEEDS_SOURCE` | 2025/2620, 2025/2621 (as corrected by 2026/1740) |
| `default_value_base_tco2e_per_t` | Defined in Config | `NEEDS_SOURCE` | 2023/956, 2025/2621 (as corrected by 2026/1740) |
| `default_markup_by_year` | Defined in Config | `VERIFIED_SECONDARY` | 2025/2621 (as corrected by 2026/1740) |
| `verified_see_tco2e_per_t` | Defined in Config | `VERIFIED_SECONDARY` | 2023/956, 2025/2546, 2025/2547 |
| `tonnes_shipped` | Defined in Config | `VERIFIED_SECONDARY` | 2023/956, 2025/2083 |

#### Referenced European Union Regulations:

- **2023/956**: Regulation (EU) 2023/956 of the European Parliament and of the Council establishing a carbon border adjustment mechanism (CBAM) — *Primary CBAM founding regulation defining scope, authorised declarants, certificate surrender, free allocation adjustment, and penalties*
- **2025/2083**: Regulation (EU) 2025/2083 amending Regulation (EU) 2023/956 (CBAM Omnibus simplification) — *Omnibus simplification amendments (including small-importer mass threshold exemption and compliance timeline updates)*
- **2025/2546**: Commission Implementing Regulation (EU) 2025/2546 — *Verification principles and rules for accredited verifiers checking declared embedded emissions*
- **2025/2547**: Commission Implementing Regulation (EU) 2025/2547 — *Methodology for calculating and monitoring embedded emissions of CBAM goods in the definitive period*
- **2025/2548**: Commission Implementing Regulation (EU) 2025/2548 — *Rules on CBAM certificate pricing and quarterly/weekly EU ETS allowance average calculation*
- **2025/2620**: Commission Implementing Regulation (EU) 2025/2620 — *Rules for the free allocation adjustment (SEFA), production-route CBAM benchmarks, and cross-sectoral correction factor application*
- **2025/2621 (as corrected by 2026/1740)**: Commission Implementing Regulation (EU) 2025/2621 as corrected by Commission Implementing Regulation (EU) 2026/1740 — *Default values by CN code and country of origin and proportionate markups applied when actual verified emissions data are unavailable*

---

## License & Reproducibility Notice
VeriCEMS is an open-source hackathon prototype developed for the IEEE Global ClimateChain Hackathon 2026. Code is licensed under Apache-2.0. All benchmark results are deterministically reproducible with fixed seeds (`base_seed = 42`).
