# What Still Gets Through (`WHAT_STILL_GETS_THROUGH.md`)

> **Generated automatically by:** [`ml/benchmark/report.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/benchmark/report.py) from [`results/benchmark_summary.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/benchmark_summary.json) and [`results/run_manifest.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/run_manifest.json).
> **Git Commit:** `9cad8a0f9f67057df5179863b307d3649de7d243` · **Splits:** `5` facility-grouped splits (`base_seed = 42`) · **Validation Target FPR:** `2.00%`

## 1. Prominent Disclosure: Attacks Where Proposed Detector Recall Is Below 50%

VeriCEMS does **not** catch every attack. Because thresholds are calibrated strictly on clean validation facilities to maintain a realistic 2% on validation, 8.3% on held-out facilities false-positive rate in industrial operation, attacks that stay inside the natural variance envelope of fuel quality, analyzer noise, and plant thermal efficiency evade detection.

| Attack ID | Attack Scenario | CO₂ Reduction Achieved (%) | Proposed Detector Recall (Mean ± Std) | Detection Delay (Hours) | Why It Gets Through |
|---|---|---:|---:|---:|---|
| `adaptive_whitebox_b_coordinated_insider` | **8B. Adaptive White-Box (Coordinated Insider)** | `23.73%` | **`2.95% ± 3.66%`** | `219.7 h` | Coordinated insider compromises both the CEMS gateway (before signing) and the synthetic fuel ledger simultaneously, scaling CO₂, Heat Input, and Fuel Ledger together inside the wide electric load-to-heat efficiency envelope. |
| `slow_drift_0_1pct_day` | **6a. Slow Calibration Drift (0.1%/day)** | `0.57%` | **`8.12% ± 11.54%`** | `168.4 h` | At 0.1%/day, cumulative drift over 12 days is at most 1.2%, remaining strictly inside the ~2.5%–3.6% validation-calibrated tolerance required to avoid false alarms. |
| `slow_drift_0_3pct_day` | **6b. Slow Calibration Drift (0.3%/day)** | `1.70%` | **`29.09% ± 18.44%`** | `144.1 h` | At 0.3%/day, cumulative drift stays below the ~3.0%–3.6% threshold for the first ~9–11 operating days (200+ hours) before crossing the detection boundary. |

### 1.1 Attacks Where Baseline 2 (Mass-Balance & Load Physics) Recall Is Below 50%

| Attack ID | Attack Scenario | Baseline 2 Recall (Mean ± Std) | Why Baseline 2 Fails |
|---|---|---:|---|
| `adaptive_whitebox_a_single_source` | 8A. Adaptive White-Box (Single-Source) | `13.89% ± 14.12%` | Attacker scales CO₂ and Heat Input together along the exact learned stoichiometric ratio (exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| `adaptive_whitebox_b_coordinated_insider` | 8B. Adaptive White-Box (Coordinated Insider) | `0.17% ± 0.12%` | Attacker scales CO₂ and Heat Input together along the exact learned stoichiometric ratio (exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| `naive_replay` | 3. Naive Replay (Un-resigned Loop) | `2.14% ± 2.58%` | Replayed historical packets contain internally consistent physical readings; Baseline 2 has no sequence number or hash-chain check. |
| `selective_packet_dropping` | 7. Selective Packet Dropping (High-CO2) | `0.22% ± 0.20%` | Dropping high-CO₂ packets leaves only valid low-emission records; without sequence gap (`SEQ_GAP`) verification, omissions are invisible. |
| `slow_drift_0_1pct_day` | 6a. Slow Calibration Drift (0.1%/day) | `7.13% ± 9.70%` | Drift magnitude remains below the validation-calibrated stoichiometric residual bound for most of the window. |
| `slow_drift_0_3pct_day` | 6b. Slow Calibration Drift (0.3%/day) | `33.96% ± 10.76%` | Drift magnitude remains below the validation-calibrated stoichiometric residual bound for most of the window. |
| `time_shifted_replay` | 4. Time-Shifted Replay (Re-signed) | `31.81% ± 13.04%` | Replayed CEMS channels preserve internal CO₂/Heat stoichiometry; Baseline 2 only flags hours where current Gross Load diverges sharply from replayed Heat Input. |

---

## 2. Plain Statement of Adaptive White-Box Attacker Results (Variants A and B)

We evaluated a white-box attacker who knows the exact ONNX autoencoder weights, channel scalers, learned fuel stoichiometric ratios, rolling spectral window ($W=8$), and all validation-calibrated thresholds:

1. **Variant A — Single-Source Forging (`adaptive_whitebox_a_single_source`):**
   - **Capability:** Can modify CEMS stack telemetry (`co2_mass_short_tons`, `heat_input_mmbtu`, `co2_rate_short_tons_mmbtu`, `so2_mass_lbs`, `nox_mass_lbs`) **before** ECDSA signing, but **cannot** alter the independent custody-transfer fuel ledger (`fuel_ledger_synthetic`) or substation electric meter (`gross_load_mw`).
   - **Outcome at Benchmark Target (`min_reduction = 4.5%`):** Achieved **`4.97% ± 0.45%`** CO₂ reduction. Because the attacker scales `co2_mass_short_tons` and `heat_input_mmbtu` together along the stoichiometric manifold, **Baseline 2 (Mass-Balance Physics) is fooled** (Recall = **`13.89%`**), directly confirming the Part 75 circularity vulnerability documented in `docs/DATA_CARD.md` (CO₂ is derived from heat input in this data). However, **Proposed Detector catches Variant A with `85.69%` recall** via `CROSS_SOURCE_MISMATCH` against `fuel_ledger_synthetic`.
   - **Maximum Uncaught Reduction Limit:** In the adaptive trade-off sweep below, Variant A can shave only **~2.0% to 3.0% of CO₂** before `ProposedDetector` detection probability rises sharply above 50%.

2. **Variant B — Coordinated Insider (`adaptive_whitebox_b_coordinated_insider`):**
   - **Capability:** Has full Variant A white-box CEMS control **and** compromises the synthetic custody-transfer fuel ledger (`fuel_ledger_synthetic`), scaling `co2_mass_short_tons`, `heat_input_mmbtu`, and `fuel_ledger_synthetic` down together while keeping `gross_load_mw` untouched.
   - **Outcome:** Achieved **`23.73% ± 1.16%` CO₂ reduction while evading detection** — Proposed Detector recall is only **`2.95%`** (and Baseline 2 recall is **`0.17%`**).
   - **Why Variant B Succeeds (Fundamental Physical Limitation):** Because real utility boilers and combined-cycle turbines exhibit a broad legitimate operating band in electrical-load-to-heat ratio (`gross_load_mw / heat_input_mmbtu` between part-load startups, ambient temperature swings, and peak load), a coordinated insider who falsifies **both** the stack analyzer and the fuel meter can hide a **12%–18% emission reduction** inside the plant's apparent thermal efficiency margin without triggering `PHYSICS_RESIDUAL`, `AE_RESIDUAL`, or `CROSS_SOURCE_MISMATCH`. Stopping Variant B requires an uncompromised third-party custody-transfer utility feed (pipeline gas fiscal meter / coal belt weigher) outside the plant operator's write domain.

### 2.1 Adaptive Attacker Curve Table (Reported-CO₂ Reduction vs. Detection Probability)

| Target CO₂ Reduction (%) | Variant A Achieved Reduction (%) | Variant A Detection Prob (`Proposed`) | Variant A Detection Prob (`Baseline 2`) | Variant B Achieved Reduction (%) | Variant B Detection Prob (`Proposed`) |
|---:|---:|---:|---:|---:|---:|
| `2.0%` | `2.00%` | `13.89% ± 13.02%` | `0.24%` | `2.00%` | `9.83% ± 9.63%` |
| `3.0%` | `3.00%` | `46.28% ± 27.41%` | `2.53%` | `3.00%` | `9.69% ± 9.63%` |
| `4.0%` | `4.00%` | `84.34% ± 34.15%` | `3.65%` | `4.00%` | `9.58% ± 9.61%` |
| `5.0%` | `5.00%` | `86.91% ± 29.27%` | `17.78%` | `5.00%` | `9.31% ± 9.69%` |
| `7.5%` | `7.50%` | `100.00% ± 0.00%` | `81.46%` | `7.50%` | `9.06% ± 9.56%` |
| `10.0%` | `10.00%` | `100.00% ± 0.00%` | `96.74%` | `10.00%` | `8.96% ± 9.47%` |
| `15.0%` | `15.00%` | `100.00% ± 0.00%` | `99.76%` | `15.00%` | `10.73% ± 12.40%` |
| `20.0%` | `20.00%` | `100.00% ± 0.00%` | `99.76%` | `20.00%` | `11.25% ± 13.04%` |
| `25.0%` | `25.00%` | `100.00% ± 0.00%` | `99.76%` | `25.00%` | `11.32% ± 13.61%` |
| `30.0%` | `30.00%` | `100.00% ± 0.00%` | `99.76%` | `30.00%` | `14.58% ± 15.37%` |

---

## 3. Where the Simple Mass-Balance Rule Beats the Neural Autoencoder

We explicitly highlight every scenario where the deterministic `MassBalancePhysicsDetector` (Baseline 2) outperforms the neural `PhysicsInformedAutoencoderNet` (`autoencoder_only`) or the union-calibrated `ProposedDetector`:

| Attack Scenario | Baseline 2 Recall (Mean ± Std) | Standalone Autoencoder Recall | Proposed Detector Recall | Baseline 2 Delay (h) | Proposed Delay (h) | Technical Explanation |
|---|---:|---:|---:|---:|---:|---|
| **1b. Constant Scaling (-10%)** | **`100.00% ± 0.00%`** | `51.82% ± 40.21%` | `100.00% ± 0.00%` | `0.0 h` | `0.0 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **1c. Constant Scaling (-20%)** | **`100.00% ± 0.00%`** | `75.00% ± 35.96%` | `100.00% ± 0.00%` | `0.0 h` | `0.0 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **1d. Constant Scaling (-30%)** | **`100.00% ± 0.00%`** | `86.23% ± 23.84%` | `100.00% ± 0.00%` | `0.0 h` | `0.0 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **1a. Constant Scaling (-5%)** | **`99.97% ± 0.05%`** | `26.69% ± 31.59%` | `85.75% ± 31.81%` | `0.0 h` | `24.9 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **2. Flatline Injection** | **`97.34% ± 1.11%`** | `77.48% ± 24.79%` | `99.12% ± 1.78%` | `0.1 h` | `0.0 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **6b. Slow Calibration Drift (0.3%/day)** | **`33.96% ± 10.76%`** | `17.01% ± 20.61%` | `29.09% ± 18.44%` | `153.2 h` | `144.1 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **6c. Slow Calibration Drift (0.5%/day)** | **`59.50% ± 6.64%`** | `21.05% ± 24.82%` | `51.19% ± 23.09%` | `96.3 h` | `103.8 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |
| **5. Synthetic Noise on Flatline** | **`97.46% ± 1.01%`** | `77.64% ± 23.93%` | `97.20% ± 2.65%` | `0.0 h` | `0.1 h` | Single-ratio stoichiometric residual has lower variance on clean validation data than an 8-channel neural reconstruction or 5-check union, allowing a tighter threshold calibrated to 2% on validation (0.25% on held-out facilities vs 8.3% for proposed detector, exploiting Part 75 circularity: CO₂ is derived from heat input in this data). |

---

## 4. Complete Benchmark Summary Table (Mean ± Std Across 5 Splits)

| Attack Scenario | CO₂ Red. (%) | B1 Static Recall | B2 Physics Recall | Proposed Recall | Proposed Precision | Proposed FPR | Proposed AUROC | Proposed Delay (h) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 8A. Adaptive White-Box (Single-Source) | `5.0%` | `45.05% ± 28.32%` | `13.89% ± 14.12%` | **`85.69% ± 31.81%`** | `91.01% ± 7.42%` | `6.71% ± 6.22%` | `0.973 ± 0.035` | `32.5 ± 72.8` |
| 8B. Adaptive White-Box (Coordinated Insider) | `23.7%` | `5.14% ± 5.07%` | `0.17% ± 0.12%` | **`2.95% ± 3.66%`** | `26.58% ± 19.35%` | `6.71% ± 6.22%` | `0.398 ± 0.149` | `219.7 ± 26.8` |
| 1b. Constant Scaling (-10%) | `10.0%` | `65.32% ± 23.69%` | `100.00% ± 0.00%` | **`100.00% ± 0.00%`** | `91.37% ± 7.83%` | `6.71% ± 6.22%` | `0.988 ± 0.016` | `0.0 ± 0.0` |
| 1c. Constant Scaling (-20%) | `20.0%` | `65.32% ± 23.68%` | `100.00% ± 0.00%` | **`100.00% ± 0.00%`** | `91.37% ± 7.83%` | `6.71% ± 6.22%` | `0.993 ± 0.010` | `0.0 ± 0.0` |
| 1d. Constant Scaling (-30%) | `30.0%` | `74.09% ± 27.27%` | `100.00% ± 0.00%` | **`100.00% ± 0.00%`** | `91.37% ± 7.83%` | `6.71% ± 6.22%` | `0.995 ± 0.007` | `0.0 ± 0.0` |
| 1a. Constant Scaling (-5%) | `5.0%` | `65.29% ± 23.71%` | `99.97% ± 0.05%` | **`85.75% ± 31.81%`** | `91.02% ± 7.42%` | `6.71% ± 6.22%` | `0.983 ± 0.020` | `24.9 ± 55.7` |
| 2. Flatline Injection | `41.2%` | `82.20% ± 10.76%` | `97.34% ± 1.11%` | **`99.12% ± 1.78%`** | `91.25% ± 7.99%` | `6.71% ± 6.22%` | `0.994 ± 0.007` | `0.0 ± 0.0` |
| 3. Naive Replay (Un-resigned Loop) | `43.6%` | `5.25% ± 4.97%` | `2.14% ± 2.58%` | **`100.00% ± 0.00%`** | `72.47% ± 3.90%` | `25.48% ± 4.89%` | `0.887 ± 0.015` | `0.0 ± 0.0` |
| 7. Selective Packet Dropping (High-CO2) | `48.4%` | `3.83% ± 4.47%` | `0.22% ± 0.20%` | **`100.00% ± 0.00%`** | `66.31% ± 12.59%` | `10.67% ± 5.66%` | `0.962 ± 0.019` | `2.0 ± 0.4` |
| 6a. Slow Calibration Drift (0.1%/day) | `0.6%` | `19.74% ± 11.32%` | `7.13% ± 9.70%` | **`8.12% ± 11.54%`** | `40.20% ± 26.06%` | `6.71% ± 6.22%` | `0.560 ± 0.030` | `168.4 ± 59.5` |
| 6b. Slow Calibration Drift (0.3%/day) | `1.7%` | `43.13% ± 11.13%` | `33.96% ± 10.76%` | **`29.09% ± 18.44%`** | `64.48% ± 31.28%` | `6.71% ± 6.22%` | `0.784 ± 0.036` | `144.1 ± 61.7` |
| 6c. Slow Calibration Drift (0.5%/day) | `2.8%` | `51.51% ± 11.95%` | `59.50% ± 6.64%` | **`51.19% ± 23.09%`** | `86.26% ± 10.18%` | `6.71% ± 6.22%` | `0.860 ± 0.031` | `103.8 ± 60.2` |
| 5. Synthetic Noise on Flatline | `41.2%` | `82.76% ± 10.83%` | `97.46% ± 1.01%` | **`97.20% ± 2.65%`** | `91.22% ± 7.98%` | `6.71% ± 6.22%` | `0.991 ± 0.009` | `0.1 ± 0.1` |
| 4. Time-Shifted Replay (Re-signed) | `44.8%` | `5.25% ± 4.97%` | `31.81% ± 13.04%` | **`99.78% ± 0.13%`** | `91.31% ± 7.87%` | `6.76% ± 6.24%` | `0.994 ± 0.006` | `0.1 ± 0.1` |

---

## 5. Honest False-Positive Generalization Gap Analysis (2% on Validation, 8.3% on Held-Out Facilities)

> [!IMPORTANT]
> **Per-Record Accounting:** The reported 8.3% false-positive rate (`8.34% ± 6.08%` macro-average across all 14 benchmark attacks, `6.71% ± 6.22%` on clean unattacked series) is evaluated **per record** (where 1 record = 1 operating unit-hour), not per batch. The detector was calibrated strictly on clean validation facilities to maintain a target 2.0% FPR (`target_fpr: 0.02`), achieving 1.07% empirical record-level FPR on validation data.

### 5.1 False-Positive Rate Distribution Across Held-Out Test Facilities
- **Min facility FPR:** `0.00%` (e.g. Hunter [6165], Wygen I [55479], Greater Des Moines [7985], Lake Side CC [56237])
- **Median facility FPR:** `0.62%`
- **Max facility FPR:** `46.25%` (Jim Bridger [8066] gas-converted units)

| Aggregation Dimension | Category / Type | Clean Records Evaluated | False Positives | Record-Level FPR |
|---|---|---:|---:|---:|
| **By Fuel Category** | Coal | 25,200 | 1,595 | **`6.33%`** |
| | Natural Gas | 1,440 | 67 | **`4.65%`** |
| | Pipeline Natural Gas | 31,680 | 2,209 | **`6.97%`** |
| **By Unit Type** | Tangentially-fired boiler | 12,960 | 1,336 | **`10.31%`** |
| | Simple-cycle combustion turbine | 11,552 | 943 | **`8.16%`** |
| | Dry bottom wall-fired boiler | 19,440 | 1,541 | **`7.93%`** |
| | Cyclone boiler | 1,440 | 13 | **`0.90%`** |
| | Combined cycle | 11,520 | 37 | **`0.32%`** |
| | Combined cycle (New 2025 units) | 1,408 | 1 | **`0.07%`** |

### 5.2 What Drives the Gap: Structural Drivers & The 10 Most-Flagged Clean Hours
The false-positive gap is not uniformly distributed across the fleet. It is heavily driven by three distinct operational phenomena:
1. **Fuel Switches / Atypical Plant Configurations:** Jim Bridger (8066) units BW71/BW72 are 550 MW tangentially-fired boilers originally engineered for coal that were converted to Pipeline Natural Gas. The neural autoencoder (trained predominantly on standard coal boilers or gas turbines) produces high reconstruction residuals (`AE = 18.0–21.4`) on this atypical pairing, generating 46.25% FPR on these units, while the simple physics baseline readily handles them (`Phys = 0.29`).
2. **Zero-Load Banked Boiler Warmups & Idling:** During startup or banking (Gross Load = 0 MW, Heat Input < 1 MMBtu), division by near-zero denominators causes apparent heat-to-load and fuel-ledger ratios to spike artificially.
3. **Peaker Turbine Startup & Synchronization:** Simple-cycle combustion turbines cycling on for peak grid demand incur transient stoichiometric shifts during ignition before synchronizing with the grid.

| # | Facility & Unit | Date & Hour | Operating Status | Proposed Score | Sub-Detector Triggers | Technical Explanation |
|---|---|---|---|---:|---|---|
| 1 | Muscatine (1167) U8 | 2025-07-26 14:00 | 0 MW, 0.0 MMBtu, 0.0 t | 1,000,000.0 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Banked boiler idling at near-zero heat input; numerical denominator clipping artifact. |
| 2 | Gadsby (3648) U3 | 2025-06-19 10:00 | 0 MW, 0.0 MMBtu, 0.0 t | 1,000,000.0 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Banked steam boiler warming up without electric generation online. |
| 3 | Pleasant Hill (7145) U3 | 2025-06-12 15:00 | 1 MW, 0.02 MMBtu, 0.0 t | 834,629.8 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Turbine startup synchronization transient; minimal flame firing before grid tie-in. |
| 4 | Gadsby (3648) U5 | 2025-01-27 11:00 | 0 MW, 0.0 MMBtu, 0.0 t | 700,000.0 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Peaker turbine cold-start ignition transient at zero generator load. |
| 5 | Gadsby (3648) U5 | 2025-01-27 11:00 | 0 MW, 0.0 MMBtu, 0.0 t | 351,439.2 | `CROSS_SOURCE_MISMATCH`, `AE_RESIDUAL` | Peaker turbine flame establishment before synchronization. |
| 6 | Gadsby (3648) U6 | 2025-12-11 13:00 | 0 MW, 0.0 MMBtu, 0.0 t | 300,000.0 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Cold-standby startup hour prior to turbine loading. |
| 7 | Gadsby (3648) U5 | 2025-06-27 21:00 | 0 MW, 0.0 MMBtu, 0.0 t | 251,028.0 | `CROSS_SOURCE_MISMATCH`, `AE_RESIDUAL` | Peaking start-up cycle with minimal flame establishment fuel. |
| 8 | Gadsby (3648) U3 | 2025-06-19 10:00 | 0 MW, 0.0 MMBtu, 0.0 t | 59.1 | `CROSS_SOURCE_MISMATCH`, `PHYSICS_RESIDUAL` | Low-fire boiler warmup without turbine generator online. |
| 9 | Laramie River (6204) U3 | 2025-06-23 22:00 | 29 MW, 10.1 MMBtu, 1.1 t | 55.0 | `PHYSICS_RESIDUAL` | Utility coal boiler low-load startup (29 MW on 500 MW unit); off-design load-to-heat ratio. |
| 10 | Muscatine (1167) U8 | 2025-07-26 14:00 | 0 MW, 0.0 MMBtu, 0.0 t | 41.9 | `CROSS_SOURCE_MISMATCH`, `AE_RESIDUAL` | Banked steam maintenance hour with near-zero heat input. |

### 5.3 Batch-Level False-Positive Rate Under k-of-n Rule (Batch Size n=8)
Under the VeriCEMS batch verification architecture (8 operating unit-hours per anchored batch), we evaluate a $k$-of-$n$ decision rule where a batch is quarantined only if at least $k$ hours trigger fraud flags. Selecting $k$ **strictly on clean validation data** to satisfy the $\le 2.0\%$ target selects **$k=2$** ($1.50\% \pm 1.10\%$ on validation batches):

| Voting Rule ($k$-of-$n$, $n=8$) | Clean Validation Batch FPR (Mean ± Std) | Held-Out Test Batch FPR (Mean ± Std) | Operational Interpretation |
|---|---:|---:|---|
| $k=1$ (Any 1 hour alarms) | `2.84% ± 1.10%` | `11.32% ± 9.67%` | Overly sensitive to isolated 1-hour startup transients. |
| **$k=2$ (Chosen on Val: $\le 2.0%$)** | **`1.50% ± 1.10%`** | **`9.00% ± 8.36%`** | **Filters single isolated startup spikes; headline batch FPR.** |
| $k=3$ | `0.83% ± 0.67%` | `7.75% ± 7.09%` | Requires sustained 3-hour anomaly. |
| $k=4$ (Majority vote: 4-of-8) | `0.56% ± 0.55%` | `6.68% ± 5.89%` | Half of batch must be corrupted. |
| $k=8$ (Strict unanimous: 8-of-8) | `0.08% ± 0.07%` | `3.32% ± 2.66%` | Only catches full-window persistent tampering. |

### 5.4 Experiment: Per-Facility Baseline Calibration
To evaluate whether the gap is structural to cross-facility pooling, we conducted a per-facility baseline calibration experiment across all 30 facilities with $\ge 14$ operating days: each facility's anomaly threshold was calibrated strictly on its own first 14 clean operating days (336 hours) to a 2% FPR bound, and evaluated on the remainder of the calendar year.

- **Per-facility baseline calibration FPR (post-14-day data):** **`4.56% ± 7.47%`**
- **Pooled validation-calibrated FPR (exact same post-14-day data):** **`2.92% ± 5.39%`**
- **Finding & Headline Decision:** While per-facility calibration reduces false alarms on atypical baseload plants (e.g. Jim Bridger drops from 15.6% to 2.91%, Laramie River from 21.06% to 10.75%), it drastically degrades performance on seasonal and cycling peaking facilities (e.g. Neil Simpson II jumps to 37.23% because winter startup profiles were not represented in the first 14 days). Overall, pooled calibration maintains lower mean false alarms on post-14-day data (`2.92%` vs `4.56%`). **We retain the pooled cross-validation result (2% on validation, 8.3% on held-out facilities) as the headline.**

> [!NOTE]
> **Circularity Caveat:** Part 75 regulatory data derives CO₂ mass directly from measured heat input ($r^2 \approx 0.9997$); physics-only rules cannot catch coordinated single-source manipulation without independent custody-transfer fuel receipts.
