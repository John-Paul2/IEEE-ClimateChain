# VeriCEMS — 2-Minute Judge Walkthrough (`docs/JUDGE_GUIDE.md`)

> **IEEE Global ClimateChain Hackathon 2026 — Track 4 (Climate Data & Environmental Monitoring)**  
> **Tagline:** *Don't trust the sensor. Verify the physics and the chain.*  
> **Standards Alignment:** Informed by **IEEE 2413-2019**, **IEEE draft P3218**, **IEEE draft P3219**, and **IEEE draft P2418.1**. *VeriCEMS is CBAM-aligned and informed by these standards; not a formal certification.*

---

## 1. Quick Orientation (30 Seconds)

VeriCEMS makes industrial stack-emissions telemetry tamper-evident for the **EU Carbon Border Adjustment Mechanism (CBAM)** (Regulation (EU) 2023/956) across four layers:

1. **Edge Hash Chaining & Signatures (`/operator`):** Readings are signed by an unexported device key (NIST P-256 ECDSA) and linked in a continuous SHA-256 hash chain (`prev_hash = SHA256(CanonicalJSON(packet_{i-1}))`).
2. **Combustion Physics & ML Detection (`/verifier`, `/benchmark`):** Hourly telemetry is checked against combustion stoichiometry, an independent custody fuel ledger (`synthetic_fuel_flow_mmbtu_indep`), spectral flatness, autocorrelation, and a physics-informed ONNX autoencoder.
3. **Bonded 3-of-5 Verifier Quorum (`/verifier`):** 5 independent verifier nodes stake collateral (`0.1 ETH` per verifier; `1.0 ETH` operator bond) in `BondVault.sol` and vote via two-phase commit-reveal on **Arbitrum Sepolia (`Chain ID: 421614`)**. Quarantined fraud triggers a `50%` (`0.50 ETH`) operator bond slash after a 24-hour (`86,400s`) challenge window.
4. **Browser-Verified Importer Portal & Statutory CBAM Calculator (`/importer`):** European importers verify period attestation reports in their browser in `<5ms` and calculate exact EUR certificate liabilities under Implementing Regulations (EU) `2025/2548`, `2025/2620`, and `2025/2621` (as corrected by `2026/1740`).

---

## 2. Interactive 4-Screen Demo Walkthrough (90 Seconds)

### Step A — Stack Operator Telemetry & Hash Chain (`/operator`)
- Inspect the live 720-hour (30-day) telemetry stream from US EPA CAMPD (`gross_load_mw`, `heat_input_mmbtu`, `co2_mass_short_tons`) alongside explicitly labelled `synthetic_` channels (`synthetic_stack_o2_pct`, `synthetic_flue_temp_c`, `synthetic_stack_flow_kscfm`, `synthetic_fuel_flow_mmbtu_indep`).
- Click any packet in the **Hash Chain Strip** to inspect its NIST P-256 signature, canonical SHA-256 digest, and `prev_hash` linkage.
- Switch the attack preset selector to inject adversarial tampering (e.g., Constant Scaling `-20%`, Flatline Injection, or Selective Packet Dropping) and observe how the composite anomaly score crosses the validation-calibrated threshold.

### Step B — Bonded 3-of-5 Quorum & Slashing (`/verifier`)
- View the anchored batches (`BatchAnchor.anchorBatch` uses a median `179,843 gas` on Arbitrum Sepolia — $O(1)$ constant gas regardless of batch size).
- Inspect the **5-node Commit-Reveal Matrix** (`commitVote`: `103,410 gas`; `revealVote`: `177,505 gas`; `finalize`: `188,177 gas`).
- Open the **Quarantine & Slashing Drawer** on Batch `#2` to see why it was quarantined, inspect the Merkle dispute proof (`submitOperatorDispute`: `82,020 gas`), and verify the on-chain arbiter resolution (`resolve`: `198,309 gas`) that slashes `50%` (`0.50 ETH`) of the operator bond.

### Step C — Interactive Browser Tamper & Omission Testing (`/importer`)
On `/importer`, judges can test **four interactive browser verification presets** in real time without trusting a backend server:
1. **Valid report:** All 7 cryptographic and accounting checks pass (`VALID — 7/7 checks passed`).
2. **1-digit edit:** Alters reported emissions by a single digit while leaving the Merkle root untouched — immediately caught by the `emissions_totals_match` check comparing the report against the on-chain `Attestation.sol` record (`281,626 gas`).
3. **Missing hours:** Omits 2 hourly packets from the proof bundle — immediately caught by the `chain_continuity` check verifying batch accounting and proof window completeness.
4. **Tampered:** Corrupts a leaf hash inside the Merkle inclusion proof — immediately caught by the browser Keccak-256 Merkle proof verifier.

Below the verifier, use the **CBAM Cost Calculator** (`[ILLUSTRATIVE]` consignment presets or custom inputs) to compare verified embedded emissions against punitive EU default values (`+10%` in 2026, `+20%` in 2027, `+30%` in 2028+). Any regulatory constant without a primary EU legal text is stored as `null` and badged `NEEDS_SOURCE`.

### Step D — Reproducible 14-Attack Benchmark & Honest Limits (`/benchmark`)
- Explore empirical results across **5 facility-grouped splits** (30 US EPA CAMPD units, `393,222` operating unit-hours, target validation FPR `2.0%`):
  - **Proposed Detector (VeriCEMS):** `75.64% ± 8.03%` recall, `77.59% ± 8.23%` precision, `0.8830 ± 0.0107` AUROC, `49.7 h` mean detection delay.
  - **Baseline 2 (Combustion Physics):** `53.11% ± 2.81%` recall, `0.8029 ± 0.0297` AUROC.
  - **Baseline 1 (Static Thresholds):** `43.85% ± 7.37%` recall, `0.5770 ± 0.1344` AUROC.
  - **Autoencoder Only:** `37.73% ± 21.78%` recall, `0.7555 ± 0.0201` AUROC.
- Review the **Honest System Limits ("What Still Gets Through")** panel (`results/WHAT_STILL_GETS_THROUGH.md`):
  - Slow calibration drift (`0.1%/day` recall: `8.12%`; `0.3%/day` recall: `29.09%`).
  - Coordinated insider collusion scaling both stack CEMS and custody fuel meter (`adaptive_whitebox_b_coordinated_insider` recall: `2.95%`).
  - Pre-sensor physical flue dilution before gas enters the analyzer probe.

---

## 3. Live Arbitrum Sepolia Contracts (`Chain ID: 421614`)

Click the **Live Testnet** pill in the top bar (or verify directly on Arbiscan Sepolia):

| Contract | Arbitrum Sepolia Address | Verified Explorer Link |
|---|---|---|
| `Attestation.sol` | `0x872D5EF7C6a457d1B8eD68221350236151c763B0` | [Arbiscan](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0) |
| `BatchAnchor.sol` | `0x8Bf14de651FA70FeB3538852c2160d082255638B` | [Arbiscan](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B) |
| `BondVault.sol` | `0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36` | [Arbiscan](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36) |
| `Challenge.sol` | `0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34` | [Arbiscan](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34) |
| `DeviceRegistry.sol` | `0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471` | [Arbiscan](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471) |
| `VerifierQuorum.sol` | `0x734849b029dDF31030CfaE4A74c314f8E21DBfB9` | [Arbiscan](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9) |

Full transaction hashes (`29` live transactions across deployment and end-to-end clean/fraud scenarios) are recorded in [`deployments/testnet.json`](../deployments/testnet.json) and [`docs/TESTNET_EVIDENCE.md`](TESTNET_EVIDENCE.md).
