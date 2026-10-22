# Adaptive White-Box Attacker Specification (`ADAPTIVE_ATTACKER.md`)

> **Module:** [`ml/attacks/adaptive.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/attacks/adaptive.py) · **Measured Results:** [`results/WHAT_STILL_GETS_THROUGH.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/WHAT_STILL_GETS_THROUGH.md) & [`results/benchmark_summary.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/benchmark_summary.json)  
> **Rules:** [`AGENTS.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/AGENTS.md) · **Data Caveat:** [`docs/DATA_CARD.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/DATA_CARD.md) Section 6.3

---

## 1. Threat Model Overview

A static or rule-based emissions verification system is vulnerable to an **adaptive insider** who studies the verification rules and optimizes falsified sensor readings to stay just beneath the detection threshold. Rather than assuming an oblivious attacker who scales only $\text{CO}_2$ in isolation, we evaluate VeriCEMS against a **white-box adversary** with complete knowledge of the detector stack.

We define and benchmark two explicit variants of this white-box adversary:

1. **Variant A — Single-Source Forging (`attack_adaptive_whitebox_single_source`):**
   - **Adversary Profile:** A plant operator or compromised CEMS data-logger insider who controls the stack analyzer software *before* telemetry packets are hashed and signed by the edge gateway (`before_sign_hook`).
   - **Boundary:** The attacker can forge all stack CEMS channels consistently, but **cannot** alter the independent custody-transfer fuel ledger (`fuel_ledger_synthetic`, representing the fuel supplier's fiscal gas meter or coal belt scale) or the substation electrical revenue meter (`gross_load_mw`).

2. **Variant B — Coordinated Insider (`attack_adaptive_whitebox_coordinated_insider`):**
   - **Adversary Profile:** A colluding plant insider who controls **both** the pre-signing CEMS telemetry pipeline **and** the plant's internal fuel-meter feed (`fuel_ledger_synthetic`), forging both sources simultaneously.
   - **Boundary:** The attacker cannot alter the external grid revenue wattmeter (`gross_load_mw`) monitored by the grid transmission operator.

---

## 2. Attacker's White-Box Knowledge ($\mathcal{K}$)

In both Variant A and Variant B, the attacker has full read access to the trained detector instance (`ProposedDetector`) for the active split:

| Knowledge Element | Symbol | Exact Source in Code | How the Attacker Exploits It |
|---|---|---|---|
| **ONNX Autoencoder Weights & Architecture** | $\theta_{\text{AE}}$ | `detector.ae_runner._session` (`model.onnx`) | Evaluates exact forward-pass reconstructions $\hat{\mathbf{x}} = f_{\theta_{\text{AE}}}(\mathbf{z})$ and physics-penalized reconstruction residuals during optimization. |
| **Channel Standardization Scaler** | $(\boldsymbol{\mu}, \boldsymbol{\sigma})$ | `detector.ae_runner.scaler` (`scalers.json`) | Knows the exact per-channel training mean and standard deviation across the 8 real CAMPD channels. |
| **Learned Stoichiometric Fuel Ratios** | $r_{\text{fuel}}$ | `detector.physics_detector.per_fuel_params` | Knows the exact median $\text{CO}_2 / \text{Heat Input}$ ratio ($r_{\text{Coal}} \approx 0.1049$, $r_{\text{Gas}} \approx 0.0594\text{ short tons/mmBtu}$) and relative residual scale $\sigma_{\text{rel}}$. |
| **Electrical Load-to-Heat Envelope** | $[q_{01}, q_{99}]$ | `FuelPhysicsParams.load_to_heat_q01`, `load_to_heat_q99` | Knows the training 1st–99th percentile bounds on thermal efficiency $\text{Gross Load (MW)} / \text{Heat Input (mmBtu)}$. |
| **Rolling Spectral Window & Features** | $W = 8$ | `compute_window_spectral_features` (`features.py`) | Knows the exact window length ($W=8$ hours), CV suppression ratio, Wiener spectral flatness formula, and repeated-segment lag checks. |
| **Validation-Calibrated Thresholds** | $\tau_{\text{phys}}, \tau_{\text{ae}}, \tau_{\text{flat}}, \tau_{\text{rep}}, \tau_{\text{cs}}, \tau_{\text{batch}}$ | `detector.*_threshold` (`thresholds.json`) | Knows the exact numerical cutoff for every sub-detector and the batch quarantine threshold (`score_bp >= 5000`, normalized ratio $> 1.0$). |

---

## 3. Attacker's Capabilities ($\mathcal{C}_A$ vs. $\mathcal{C}_B$)

Let each hourly record $t \in \{1, \dots, W\}$ in an attack window carry the 8 real CAMPD channels plus the synthetic custody-transfer fuel ledger channel `fuel_ledger_synthetic`:

| Channel | Source | Variant A (Single-Source) | Variant B (Coordinated Insider) | Physical / Protocol Justification |
|---|---|---|---|---|
| `co2_mass_short_tons` | `real` | **Writable** ($\alpha_t \in (0, 1]$) | **Writable** ($\alpha_t \in (0, 1]$) | Primary target of CBAM emissions under-reporting. |
| `heat_input_mmbtu` | `real` | **Writable** ($\beta_t \in (0, 1]$) | **Writable** ($\beta_t \in (0, 1]$) | Co-derived in CEMS data acquisition system under 40 CFR Part 75 (`docs/DATA_CARD.md` Sec. 6). |
| `co2_rate_short_tons_mmbtu` | `real` | **Writable** ($\text{CO}_2(t)/H(t)$) | **Writable** ($\text{CO}_2(t)/H(t)$) | Recomputed by attacker as $\text{CO}_2(t) / H(t)$ so internal packet fields are self-consistent. |
| `so2_mass_lbs`, `nox_mass_lbs` | `real` | **Writable** ($\beta_t \cdot \text{orig}$) | **Writable** ($\beta_t \cdot \text{orig}$) | Scaled proportionally with thermal heat input $\beta_t$ to stay on the autoencoder manifold. |
| `gross_load_mw` | `real` | **Read-Only** | **Read-Only** | Metered independently by the grid substation revenue meter outside plant CEMS control. |
| `op_time_fraction`, `steam_load_1000_lb_hr` | `real` | **Read-Only** | **Read-Only** | Plant operating clock and steam header status. |
| `fuel_ledger_synthetic` | `synthetic` | **Read-Only** | **Writable** ($\beta_t \cdot \text{orig}$) | Variant A cannot falsify the external fuel supplier's custody-transfer meter; Variant B compromises and forges it to match $\beta_t$. |
| `seq`, `prev_hash`, `signature` | `crypto` | **Valid (Pre-Sign)** | **Valid (Pre-Sign)** | Tampering occurs before `packet_hash` and `SecureElement.sign()`, producing a valid hash chain (`crypto_score = 0`). |

---

## 4. Mathematical Objective and Constrained Optimization Formulation

Given a clean window of $W = 8$ hourly records with true values $\big(\text{CO}_2^{(0)}(t), H^{(0)}(t), L^{(0)}(t), \text{SO}_2^{(0)}(t), \text{NO}_x^{(0)}(t), F_{\text{ledger}}^{(0)}(t)\big)$, the attacker parameterizes the forged window using multiplicative trajectories $\boldsymbol{\alpha}, \boldsymbol{\beta} \in (0, 1]^W$:

$$\text{CO}_2(t) = \alpha_t \, \text{CO}_2^{(0)}(t), \qquad H(t) = \beta_t \, H^{(0)}(t), \qquad \text{Rate}(t) = \frac{\text{CO}_2(t)}{\max(H(t), 10^{-6})}$$

$$\text{SO}_2(t) = \beta_t \, \text{SO}_2^{(0)}(t), \qquad \text{NO}_x(t) = \beta_t \, \text{NO}_x^{(0)}(t)$$

$$F_{\text{ledger}}(t) = \begin{cases} F_{\text{ledger}}^{(0)}(t) & \text{(Variant A: Single-Source)} \\ \beta_t \, F_{\text{ledger}}^{(0)}(t) & \text{(Variant B: Coordinated Insider)} \end{cases}$$

### 4.1 Normalized Detector Component Ratios
At any candidate $(\boldsymbol{\alpha}, \boldsymbol{\beta})$, the attacker queries the exact white-box detector ratios:

1. **Physics Mass-Balance & Load Ratio:**
   $$R_{\text{phys}}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \frac{1}{\tau_{\text{phys}}} \max_{t \in \{1,\dots,W\}} \max\Big( S_{\text{mb}}\big(\text{CO}_2(t), H(t)\big), \; S_{\text{load}}\big(L^{(0)}(t), H(t)\big) \Big)$$
2. **ONNX Physics-Informed Autoencoder Ratio:**
   $$R_{\text{ae}}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \frac{1}{\tau_{\text{ae}}} \max_{t \in \{1,\dots,W\}} S_{\text{AE}}\big(\mathbf{x}(t; \alpha_t, \beta_t)\big)$$
3. **Cross-Source Fuel Ledger Ratio:**
   $$R_{\text{cs}}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \frac{1}{\tau_{\text{cs}}} \max_{t \in \{1,\dots,W\}} \max\left( \frac{|\text{CO}_2(t) - r_{\text{fuel}} F_{\text{ledger}}(t)|}{r_{\text{fuel}} F_{\text{ledger}}(t)}, \; 1.5 \frac{|H(t) - F_{\text{ledger}}(t)|}{F_{\text{ledger}}(t)} \right)$$
4. **Spectral Flatness & Repeat Ratios:**
   $$R_{\text{flat}}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \frac{S_{\text{flat}}(\text{CO}_2, H, L^{(0)})}{\tau_{\text{flat}} \, \tau_{\text{batch}}}, \qquad R_{\text{rep}}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \frac{S_{\text{rep}}(\text{CO}_2, H, L^{(0)})}{\tau_{\text{rep}} \, \tau_{\text{batch}}}$$

The combined detector ratio is:
$$R_{\max}(\boldsymbol{\alpha}, \boldsymbol{\beta}) = \max\Big( R_{\text{phys}}, \; R_{\text{ae}}, \; R_{\text{cs}}, \; R_{\text{flat}}, \; R_{\text{rep}} \Big)$$
A window is flagged as fraud (`verdict = 1`, `score_bp >= 5000`) if and only if $R_{\max}(\boldsymbol{\alpha}, \boldsymbol{\beta}) > 1.0$.

### 4.2 Constrained Optimization Problem
In **Constrained Evasion Mode** (used for the main benchmark scenarios `8A` and `8B`), the attacker seeks to minimize reported $\text{CO}_2$ subject to staying below a safety margin $\gamma = 0.88 < 1.0$ and attempting at least a minimum economically meaningful reduction $\delta_{\min} = 4.5\%$ (up to $\delta_{\max} = 25\%\text{–}30\%$):

$$\min_{\boldsymbol{\alpha}, \boldsymbol{\beta}} \quad \frac{1}{W} \sum_{t=1}^{W} \alpha_t$$
$$\text{subject to} \quad R_{\max}(\boldsymbol{\alpha}, \boldsymbol{\beta}) \le \gamma = 0.88$$
$$\quad 1 - \delta_{\max} \le \alpha_t \le 1 - \delta_{\min}, \qquad \alpha_t \le \beta_t \le 1.0$$
$$\quad \alpha_t = a \cdot \left(1 + 0.0015 \sin\frac{2\pi t}{W}\right), \quad \beta_t = b \cdot \left(1 + 0.0015 \sin\frac{2\pi t}{W}\right)$$

The smooth sinusoidal modulation preserves the exact temporal correlation ($\text{corr}(\text{CO}_2, H) > 0.999$) of the underlying combustion signal so `SPECTRAL_FLAT` stays near zero while preventing consecutive windows from triggering `SPECTRAL_REPEAT`.

If no feasible point in $[1 - \delta_{\max}, 1 - \delta_{\min}]$ satisfies $R_{\max} \le \gamma$ (which happens in **Variant A** whenever the cross-source fuel ledger threshold $\tau_{\text{cs}} \approx 3.6\%$ is tighter than $\delta_{\min} = 4.5\%$), the projected optimizer selects the point $(a^*, b^*)$ at the boundary $1 - \delta_{\min}$ that minimizes the penalized violation $R_{\max}(\boldsymbol{\alpha}, \boldsymbol{\beta}) + 0.15 \max(R_{\text{phys}}, R_{\text{ae}})$.

### 4.3 Target-Reduction Sweep (Adaptive Attacker Curve)
To trace the complete trade-off between **Reported-$\text{CO}_2$ Reduction Achieved (%)** and **Probability of Detection (Recall)**, we also sweep fixed target reductions $r \in \{2\%, 3\%, 4\%, 5\%, 7.5\%, 10\%, 15\%, 20\%, 25\%, 30\%\}$:
- Fix $a = 1 - r / 100$ and optimize $b \in [a, 1.0]$ to minimize $R_{\max}(\boldsymbol{\alpha}, \boldsymbol{\beta}) + 0.15 \max(R_{\text{phys}}, R_{\text{ae}})$.
- Record the resulting empirical detection rate across all held-out test facilities in all 5 splits.

---

## 5. Why Variant A Is Caught and Why Variant B Still Gets Through

1. **Why Variant A Beats Baseline 2 (`MassBalancePhysicsDetector`) but Loses to `ProposedDetector`:**
   - By choosing $\beta_t \approx \alpha_t$ (scaling `heat_input_mmbtu` down in lockstep with `co2_mass_short_tons`), Variant A exploits the **Part 75 CO₂-vs-Heat-Input circularity** documented in `docs/DATA_CARD.md` Section 6.3. The internal ratio $\text{CO}_2(t)/H(t)$ equals the exact clean stoichiometric factor $r_{\text{fuel}}$, so `MassBalancePhysicsDetector` sees zero mass-balance residual!
   - However, because Variant A cannot alter `fuel_ledger_synthetic`, `ProposedDetector`'s cross-source check (`CROSS_SOURCE_MISMATCH`) compares $\text{CO}_2(t)$ and $H(t)$ against $F_{\text{ledger}}^{(0)}(t)$ and catches Variant A whenever the reduction exceeds the ~3.5% meter-noise tolerance.

2. **Why Variant B Evades All Three Detectors Up to ~15%–20% Reduction:**
   - In Variant B, the coordinated insider scales $\text{CO}_2(t)$, $H(t)$, $\text{SO}_2(t)$, $\text{NO}_x(t)$, **and** `fuel_ledger_synthetic` by the same factor $\alpha_t = \beta_t$.
   - Consequently, both the stoichiometric mass-balance residual and the cross-source fuel-ledger residual are **identically zero**.
   - The **only** remaining physical anchor is the independent substation electrical load `gross_load_mw` ($L^{(0)}(t)$). Because real power-plant boilers and turbines operate across a wide legitimate thermal efficiency band $[q_{01}, q_{99}]$ (due to part-load operation, ambient temperature changes, and turbine heat-rate curves), scaling $H(t)$ down by 12%–18% moves $L^{(0)}(t) / H(t)$ upward within the training `[q01, q99]` interval without crossing `load_to_heat_q99` or the 8-channel autoencoder reconstruction threshold $\tau_{\text{ae}}$.
   - **Architectural Lesson:** Software and ML checks alone cannot stop a coordinated insider who falsifies all plant-side thermal and fuel logs simultaneously; closing the Variant B gap requires hardware-authenticated, third-party fiscal fuel metering (e.g., pipeline utility custody-transfer telemetry signed by the gas/coal supplier's key, not the plant operator's key) or tighter unit-specific turbine heat-rate curves calibrated against live grid dispatch.
