# Problem Statement: Trustworthy Industrial Emissions Telemetry for EU CBAM

> **Document Class:** Formal Problem Statement & Scope Definition  
> **Target Track:** IEEE Global ClimateChain Hackathon 2026 — Track 4 (Climate Data & Environmental Monitoring)  
> **Source Baseline:** [`docs/VeriCEMS_Project_Guide.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/VeriCEMS_Project_Guide.md) §1.2  
> **Regulatory Citations:** Regulation (EU) 2023/956, Commission Implementing Regulations (EU) 2025/2546, 2025/2547, 2025/2620, 2025/2621 (as corrected by 2026/1740)

---

## 1. Regulatory Context

The European Union Carbon Border Adjustment Mechanism (CBAM) entered its definitive phase on 1 January 2026 [Regulation (EU) 2023/956]. Under this regime, EU importers (known as *authorised CBAM declarants*) must purchase and surrender CBAM certificates for greenhouse gas emissions embedded in covered industrial imports: cement, iron and steel, aluminium, fertilisers, electricity, and hydrogen.

CBAM certificates reflect weekly average EU ETS allowance auction prices. In Q3 2026, the CBAM certificate benchmark was €82.32 per tonne of CO2 equivalent (€/tCO2e) [European Commission CBAM price notice, Q3 2026].

When an exporter cannot supply verified installation-level emissions data, the importer must declare **default values** published by the European Commission [Implementing Regulation (EU) 2025/2621, as corrected by 2026/1740]. To deter reliance on defaults, the Commission mandates progressive markups:
- **10% markup** in 2026
- **20% markup** in 2027
- **30% markup** from 2028 onward

Foreign producers have a direct financial reason to prove actual emissions. EU importers bear strict financial liability to ensure figures withstand verification.

---

## 2. The Core Gap: The Smokestack Oracle Problem

Industrial stack emissions are measured continuously by Continuous Emission Monitoring Systems (CEMS). CEMS instrumentation analyzes flue gas concentrations (such as CO2, SO2, NOx, and O2) and volumetric flue gas flow.

However, raw analyzer signals route directly into plant Programmable Logic Controllers (PLCs), Data Acquisition Systems (DAS), and corporate servers controlled entirely by the plant operator. This architecture creates an acute **oracle problem**:
1. **Unconstrained Telemetry Manipulation:** An operator can scale emissions downward, replay historical low-carbon operating runs, inject synthetic noise, or drop high-emission batches before external parties see the data.
2. **Periodic Audit Blind Spots:** Accredited third-party verification bodies perform annual or semi-annual spot checks [Implementing Regulation (EU) 2025/2546]. They inspect calibration logs and sample historical records. They cannot observe unmonitored hours between audits.
3. **Cross-Border Asymmetry of Trust:** An EU importer in Germany or Italy purchasing hot-rolled steel coils from an overseas supplier cannot inspect the exporter's physical chimney or evaluate sensor tampering across borders.

Blockchains store data immutably, but a ledger preserves whatever data is submitted. Committing unvalidated numbers to a blockchain simply creates an immutable record of fraud.

---

## 3. Why It Matters

Integrity in carbon pricing determines whether industrial decarbonization occurs:
- **Unpriced Greenhouse Gas Emissions:** If an exporter under-reports stack emissions by 10% without detection, those emissions escape the EU carbon price. The environmental policy fails its primary statutory purpose.
- **Economic Injustice:** Honest producers investing millions in low-carbon production technologies (such as green hydrogen DRI or scrap electric arc furnaces) are economically undercut by dishonest competitors who falsify monitoring records.
- **Importer Audit and Regulatory Risk:** If customs authorities discover falsified declarations during post-clearance audits, the authorised declarant faces severe financial penalties and certificate revocation [Regulation (EU) 2023/956, Article 26].

---

## 4. What We Built: The VeriCEMS Architecture

VeriCEMS addresses the oracle problem through a layered, multi-party verification pipeline:

1. **Edge Cryptography & Hash Chaining:** Telemetry packets are signed at the edge gateway using NIST P-256 ECDSA and linked into an unalterable SHA-256 hash chain ($H_i = \text{SHA-256}(H_{i-1} \parallel \text{packet}_i)$). Reordering, packet deletion, and historical replacement cause immediate cryptographic verification failure.
2. **Physics and Machine-Learning Validation:** Verifier nodes evaluate incoming batches against empirical stoichiometric combustion ratios ($R = \text{CO}_2 / \text{Heat Input}$), independent custody-transfer fuel flow checks, rolling spectral flatness, autocorrelation, and a physics-informed autoencoder.
3. **Economic Bonding and 3-of-5 Quorum:** Operators post refundable ETH bonds in `BondVault.sol`. A committee of 5 independent verifier nodes executes deterministic inference and votes via a commit-reveal protocol in `VerifierQuorum.sol`. Confirmed fraud triggers automated stake slashing.
4. **Optimistic Challenge Window:** Flagged fraud enters a dispute window in `Challenge.sol` where the operator can present Merkle counter-evidence to an arbiter before slashing finalizes.
5. **CBAM Cost Savings Portal:** EU importers verify Merkle membership proofs directly in their web browser and compute cost differentials between actual verified emissions and Commission default values.

---

## 5. Implementation Grounding and Real Evidence

VeriCEMS is evaluated on real industrial monitoring data:
- **Real Baseline Telemetry:** 30 combustion power facilities selected deterministically from the US EPA Clean Air Markets Program Data (CAMPD) 2025 archive (40 CFR Part 75), spanning Iowa, Utah, and Wyoming [EPA CAMPD, calendar year 2025].
- **Live Testnet Contracts:** All six core contracts (`DeviceRegistry`, `BondVault`, `BatchAnchor`, `VerifierQuorum`, `Challenge`, `Attestation`) are deployed and verified on Arbitrum Sepolia (`Chain ID: 421614`).
- **Adversarial Benchmark:** Evaluated against 8 distinct attack classes across 5 facility-grouped cross-validation splits. The proposed detector achieves **75.64% macro-average recall** with an **8.34% false-positive rate** (AUROC: 0.8830) compared to 53.11% recall for baseline physics rules and 43.85% recall for static threshold checks.

---

## 6. Honest Boundary Limits

VeriCEMS does not claim to solve every attack vector:
1. **Pre-Sensor Physical Fraud:** If an attacker physically dilutes sampling gas or modifies probe optics *before* measurement occurs, digital signatures cannot detect the fraud. Physics and autoencoder cross-checks detect some physical anomalies, but cannot catch small perturbations.
2. **Coordinated Insider Collusion:** If an attacker compromises the CEMS analyzer and the secondary fuel ledger simultaneously (evaluated as Variant B in our benchmark), detector recall drops to **2.95%** [results/benchmark_summary.json].
3. **Regulatory Standing:** VeriCEMS is a pre-verification assurance prototype informed by IEEE standards (IEEE 2413-2019, IEEE P3218, IEEE P3219, IEEE P2418.1). It provides cryptographically anchored evidence for human verifiers, but does not replace accredited certification bodies or submit declarations directly to the EU CBAM Registry.
