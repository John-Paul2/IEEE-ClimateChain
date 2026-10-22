# VeriCEMS: 3-Minute Video Pitch & Demo Script

> **Time Limit:** Exactly 3:00 (180 seconds).  
> **Source of Truth:** [`docs/VeriCEMS_Project_Guide.md`](file:///docs/VeriCEMS_Project_Guide.md) Section 11.4.  
> **Target Audience:** IEEE ClimateChain judges, technical reviewers, industrial auditors, and customs authorities.  
> **Demo Setup:** Launch the local web app connected to the deterministic backend (`npm --prefix web run dev` and `make demo` or navigate to `http://localhost:5173/operator`). The demo bar at the bottom will control each step with exact 1-click progression.

---

## Shot-by-Shot Production Plan (Total: 180s)

```
0:00 ─── 0:25 ─── 0:50 ─── 1:10 ─── 1:30 ─── 1:50 ─── 2:10 ─── 2:25 ─── 2:50 ─── 3:00
│ Scene 1: Problem  │ Scene 2: Edge + Attack │ Scene 3: Quorum + Slash │ Scene 4: Importer │ Scene 5: Limits │ Outro │
│ "The CBAM Oracle" │ "Why Blockchain?"     │ "Arbitrum Sepolia"      │ "Cost Calculator" │ "Evasion Bound" │ Pilot │
```

---

### Shot 1: The Smokestack Oracle Dilemma (0:00 – 0:25 / 25s)
- **Visual:** Split screen / Slide: A German customs port on the left, an overseas steel smokestack on the right. Highlight the 2026 EU CBAM regulation text: default emission penalty markups (+10% in 2026, +20% in 2027, +30% in 2028).
- **On-Screen Action:** Zoom in on a Continuous Emission Monitoring System (CEMS) analyzer connected to an operator's local Windows workstation.
- **On-Screen Caption:** `THE CBAM ORACLE PROBLEM: Industrial carbon taxes depend on sensors the emitter controls.`
- **Voiceover (Key Sentence):**  
  > *"Under the EU Carbon Border Adjustment Mechanism, European importers face millions in punitive carbon penalties unless foreign exporters prove their real stack emissions. But today, continuous emissions data flows through industrial computers controlled by the factory operator before reaching auditors—creating an acute oracle problem where a single registry tweak can erase thousands of tonnes of CO₂."*

---

### Shot 2: System Architecture & "Why Blockchain?" (0:25 – 0:50 / 25s)
- **Visual:** Full-screen high-resolution architecture diagram ([`docs/architecture.png`](file:///docs/architecture.png)). Highlight the 4 distinct layers: Edge Gateway (NIST P-256 ECDSA), Dual Physics/ML Detectors, Bonded 3-of-5 Verifier Quorum, and Browser-Side Merkle Importer Verification.
- **On-Screen Action:** Highlight the EVM L2 layer between the edge gateway and the enterprise importer.
- **On-Screen Caption:** `WHY BLOCKCHAIN? A centralized database is owned by the operator. An L2 anchor makes history irreversible.`
- **Voiceover (Key Sentence):**  
  > *"Why blockchain? Because a centralized cloud database can be silently retrofitted by the plant owner. By cryptographically signing readings at the edge with unexported hardware keys, chaining them via continuous SHA-256 hashes, and anchoring batch roots into Arbitrum Sepolia smart contracts, we make retroactive data forgery mathematically impossible and economically suicidal."*

---

### Shot 3: Live Telemetry & Attack Caught (0:50 – 1:20 / 30s)
- **Visual:** Switch to browser: **Operator Portal** (`/operator`).
- **On-Screen Action:**
  1. Click **`Reset Demo`** on the bottom control bar.
  2. Click **`Step 1`**. Observe Batch #1 confirmed `VERIFIED` with green hash chips and rising coverage.
  3. Click **`Step 2`**. Select the attack dropdown: `Constant Scaling (-20% CO2)` and click inject.
- **On-Screen Caption:** `STEP 1 & 2: Real US EPA CAMPD telemetry streaming. Malicious -20% scaling injected and caught.`
- **Voiceover (Key Sentence):**  
  > *"Here in the Operator console, real 2025 US EPA CAMPD telemetry streams from Unit 3. In Step 1, normal batches pass combustion mass-balance checks. In Step 2, a rogue insider injects an attack, scaling CO₂ down by 20% to evade CBAM taxes. Instantly, our dual-stage detector flags it: combustion physics catches the fuel-to-carbon ratio collapse, and our ONNX autoencoder spots the spectral deviation."*

---

### Shot 4: Quorum Consensus & Automated On-Chain Slashing (1:20 – 1:50 / 30s)
- **Visual:** Switch to **Verifier Committee Portal** (`/verifier`).
- **On-Screen Action:**
  1. Click **`Step 3`**. Watch the 5 independent verifier nodes vote. Show the commit-reveal votes tallying `4 INVALID / 1 VALID`. The batch status turns `QUARANTINED` on-chain.
  2. Click **`Step 4`**. Trigger the challenge window expiration. Watch the operator's €2,000 security bond get slashed in `BondVault.sol`.
  3. Click the Arbiscan transaction link: [`0x80f5...`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34).
- **On-Screen Caption:** `STEP 3 & 4: 3-of-5 quorum confirms fraud. Operator bond slashed on Arbitrum Sepolia.`
- **Voiceover (Key Sentence):**  
  > *"Moving to the Verifier Quorum: five independent validator nodes evaluate the telemetry batch. They reach consensus, voting 4-to-1 that the data is fraudulent. The batch is quarantined on Arbitrum Sepolia. The 24-hour challenge window passes without valid cryptographic proof from the operator, automatically triggering contract slashing of the operator's staked bond in BondVault.sol."*

---

### Shot 5: Importer Verification & CBAM Cost Savings (1:50 – 2:25 / 35s)
- **Visual:** Switch to **Importer Portal** (`/importer`).
- **On-Screen Action:**
  1. Click **`Step 5`**. Observe the clean reporting period receiving an immutable on-chain Attestation.
  2. Click **`Step 6`**. Click **`Verify Report & Calculate Savings`**.
  3. The Merkle verification modal flashes green (`Verified in 3.4ms`).
  4. The CBAM Certificate Cost Calculator displays: Verified Specific Embedded Emissions (SEE) of `1.850 tCO2/t` vs. EU Default with markup of `2.310 tCO2/t`, calculating exact certificate savings of **€25,930.80** with the official Commission formula displayed.
- **On-Screen Caption:** `STEP 5 & 6: Browser verifies Merkle proof in <5ms. Importer saves €25,930.80 vs punitive EU default penalty.`
- **Voiceover (Key Sentence):**  
  > *"On the European importer side, customs agents upload the exporter's digital attestation. In under 5 milliseconds, the browser verifies the Merkle inclusion proof directly against the Arbitrum Sepolia contract. Our CBAM cost calculator instantly evaluates the verified emissions against EU Commission default penalty values—proving a verified saving of €25,930 for this single shipment while guaranteeing full regulatory integrity."*

---

### Shot 6: Rigorous Benchmark & What Still Gets Through (2:25 – 2:48 / 23s)
- **Visual:** Switch to **Benchmark Page** (`/benchmark`).
- **On-Screen Action:**
  1. Click **`Step 7`**. Display the Macro-Average Benchmark Table and ROC curve.
  2. Scroll down to the prominent red **"What Still Gets Through"** card.
- **On-Screen Caption:** `BENCHMARK & HONEST BOUNDARIES: 75.64% macro recall across 30 EPA plants. Evasion bounds openly published.`
- **Voiceover (Key Sentence):**  
  > *"We don't claim impossible 100% security. Rigorously evaluated across 5 facility splits on 30 US EPA power plants, VeriCEMS achieves 75.64% macro recall across 14 attack scenarios. And in strict adherence to scientific honesty, we publish our evasion boundary: slow calibration drifts below 0.3% per day mimic fuel variability, and coordinated insider collusion across both stack and fuel meters drops detection to 2.95%."*

---

### Shot 7: Climate Impact & Production Pilot Path (2:48 – 3:00 / 12s)
- **Visual:** Final summary slide: Architecture thumbnail, live Arbitrum Sepolia badge, and GitHub QR code.
- **On-Screen Caption:** `VERICEMS: Don't trust the sensor. Verify the physics and the chain.`
- **Voiceover (Key Sentence):**  
  > *"VeriCEMS transforms industrial emissions reporting from blind trust to cryptographically enforced physics. Fully deployed on Arbitrum Sepolia, tested on real EPA CAMPD data, and ready for commercial pilot integration. Don't trust the sensor. Verify the physics and the chain."*

---

## Technical Recording Guidelines for Screencast

1. **Resolution:** 1920x1080 (16:9), 60 fps.
2. **Audio:** High-quality microphone, clean voiceover with no background music during technical explanations.
3. **Pacing:** Each click must happen exactly on the script's visual cue. Do not rush cursor movements; keep the pointer smooth.
4. **Browser State:** Full-screen browser window (`F11`), dark mode enabled, developer console closed, zoom set to 100%.
5. **Output File:** Save final raw video as `screenshots/vericems_demo_3min.mp4`.
