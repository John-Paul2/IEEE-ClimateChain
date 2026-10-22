# VeriCEMS Human Verification Checklist (`docs/HUMAN_TODO.md`)

> **Honesty & Compliance Directive (`AGENTS.md` Rule 1, 4, and 6):**  
> *"Never invent numbers, results, citations, regulation values or links... Regulatory values (benchmarks, default values, CSCF, factors, prices) are inputs in config files. If unknown, store null and make the UI show 'needs source'. Never guess them... Stop and tell me."*  
> 
> As an automated coding system, VeriCEMS has programmed and evaluated all cryptographic, smart contract, and machine-learning components deterministically. However, **statutory regulatory variables, legal citations, prior-art bibliographic entries, and competition eligibility requirements must be independently verified by the human author from primary sources** before submitting to the IEEE ClimateChain Hackathon or deploying to production.

This document provides your complete, actionable checklist with exact primary URLs and primary document identifiers.

---

## 1. Primary EU Regulations & EUR-Lex Articles

Open each primary legislative act on [EUR-Lex](https://eur-lex.europa.eu) or the [European Commission CBAM Legislation Portal](https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en).

### 1.1 Regulation (EU) 2023/956 (Founding CBAM Regulation)
- **Primary Source:** [Regulation (EU) 2023/956 on EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0956)
- **Items to Verify:**
  - [ ] **Article 31 (Free Allocation Phase-Out Schedule):**
    - 2026: Verified as 97.5% free allocation (2.5% CBAM payable factor).
    - 2027 through 2033: Look up the exact statutory percentage for each year. Fill the `null` entries in `calculator/config/cbam_config.json:free_allocation_factor_by_year`.
    - 2034: Verified as 0.0% free allocation (100% payable factor).
  - [ ] **Article 8 (Accredited Human Verification):** Confirm that CBAM strictly mandates human verifiers accredited under national accreditation bodies (e.g., DAkkS, TÜRKAK, COFRAC), validating that VeriCEMS operates as pre-verification assurance and does not replace human auditors.
  - [ ] **Annex I & Annex II (Product Scope and Sectoral Coverage):** Confirm whether your target goods (steel, cement, aluminium, fertilisers, hydrogen, electricity) fall under direct or indirect scope.

### 1.2 Commission Implementing Regulation (EU) 2025/2546 (Verification Rules)
- **Primary Source:** EUR-Lex Direct Record (search Celex 32025R2546 on EUR-Lex)
- **Items to Verify:**
  - [ ] Verify accreditation requirements for verification bodies issuing CBAM verification statements.
  - [ ] Verify typical site visit frequency (annual vs risk-based) and whether digital audit trails are formally admissible to scope physical sample sizes.

### 1.3 Commission Implementing Regulation (EU) 2025/2547 (Calculation Methodology)
- **Primary Source:** EUR-Lex Direct Record (search Celex 32025R2547 on EUR-Lex)
- **Items to Verify:**
  - [ ] Specific embedded emissions calculation formulas ($SEE_{\text{direct}}$ and $SEE_{\text{indirect}}$).
  - [ ] Continuous emissions monitoring system (CEMS) data aggregation rules (hourly averaging, calibration drift handling).

### 1.4 Commission Implementing Regulation (EU) 2025/2548 (Certificate Pricing)
- **Primary Source:** EUR-Lex Direct Record (search Celex 32025R2548 on EUR-Lex)
- **Items to Verify:**
  - [ ] Method for calculating the quarterly and weekly average auction price of EU ETS allowances.
  - [ ] Verify the current benchmark price (€82.32 / tCO2e was secondary-sourced for Q3 2026; verify against the Commission price publication page before submitting).

### 1.5 Commission Implementing Regulation (EU) 2025/2620 (SEFA & Benchmarks)
- **Primary Source:** EUR-Lex Direct Record (search Celex 32025R2620 on EUR-Lex)
- **Items to Verify:**
  - [ ] **Rules for Free Allocation Adjustment (SEFA):** Verify the exact mathematical formula: $\text{SEFA} = BM \times \text{CSCF} \times \text{CBAM\_Factor}$.
  - [ ] **Cross-Sectoral Correction Factor (CSCF):** Confirm whether the Commission decision fixes CSCF = 1.0000 for the period 2026–2030, or if an annual reduction trajectory applies.
  - [ ] **Product Benchmarks:** Look up the exact product benchmark in $\text{tCO}_2\text{e}/\text{t}$ for your target production route.

### 1.6 Commission Implementing Regulation (EU) 2025/2621 (as corrected by 2026/1740)
- **Primary Source:** EUR-Lex Direct Record (search Celex 32025R2621 and 32026R1740 on EUR-Lex)
- **Items to Verify:**
  - [ ] **Default Value Markups:** Confirm statutory markups: +10% in 2026, +20% in 2027, +30% from 2028.
  - [ ] **Country-Specific Default Values:** Look up the default value table for grey clinker and structural steel for your country of export (e.g., Turkey, India, China).
  - [ ] **Separate Default Benchmark Rule:** Verify whether a distinct "default benchmark" applies when default values are surrendered, as noted in Project Guide Appendix A.

---

## 2. Product-Specific Benchmark & Default Values to Look Up

Before using the CBAM calculator for a specific commercial export consignment, look up and populate the following values in `calculator/config/cbam_config.json`:

### 2.1 Cement & Grey Clinker (CN Code: 2523 10 00 / 2523 29 00)
- [ ] **Production Route Benchmark ($BM_{\text{clinker}}$):** Annex of Reg (EU) 2025/2620 (typical EU ETS grey clinker benchmark is ~0.693–0.766 tCO2e/t clinker [ILLUSTRATIVE]; verify exact figure).
- [ ] **Country Default Value ($SEE_{\text{default}}$):** Annex of Reg (EU) 2025/2621 for your country of export.
- [ ] **Default Benchmark ($BM_{\text{default}}$):** Check if a dedicated default benchmark applies.

### 2.2 Iron & Steel (e.g., Non-Alloy Hot-Rolled Coils, CN Code: 7208)
- [ ] **Production Route Benchmark ($BM_{\text{steel}}$):** Blast Furnace / Basic Oxygen Furnace (BF-BOF) route vs Electric Arc Furnace (EAF) route benchmark in Reg (EU) 2025/2620.
- [ ] **Country Default Value ($SEE_{\text{default}}$):** Country-specific default value in Reg (EU) 2025/2621.

---

## 3. Direct vs. Indirect Scope Verification

- [ ] **Primary Source:** Regulation (EU) 2023/956, Annex II and Implementing Regulation (EU) 2025/2547.
- [ ] **Sectoral Scope Verification:**
  - **Cement & Clinker:** Counts **both direct stack emissions and indirect electricity emissions**.
  - **Fertilisers (Nitric Acid, Ammonia, Urea):** Counts **both direct and indirect emissions**.
  - **Iron & Steel:** In the initial definitive phase, focus is on **direct stack emissions** (with indirect emissions monitored for reporting purposes).
  - **Aluminium:** Focus is primarily on **direct emissions** (perfluorocarbons and fuel combustion) in initial phase.
- [ ] *Action Required:* If expanding VeriCEMS to a cement or fertiliser exporter, ensure electricity grid emission factors are integrated into the Scope 2 accounting engine (documented in `docs/FUTURE_WORK.md`).

---

## 4. Primary Emission Factors & Stoichiometry (40 CFR Part 75)

- **Primary Source:** [Electronic Code of Federal Regulations (eCFR) — 40 CFR Part 75](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-75)
- [ ] **Part 75 Appendix G (Equation G-4 / Table G-1):** Fuel carbon content and $F_c$ factors for gas and oil combustion:
  - Coal reference factor: Verify `206.0 lbs CO2 / mmBtu` (`0.10300 short tons / mmBtu`) [ILLUSTRATIVE].
  - Natural gas reference factor: Verify `117.0 lbs CO2 / mmBtu` (`0.05850 short tons / mmBtu`) [ILLUSTRATIVE].
  - Fuel oil reference factor: Verify `161.0 lbs CO2 / mmBtu` (`0.08050 short tons / mmBtu`) [ILLUSTRATIVE].
- [ ] **Part 75 Appendix F (Equations F-1 through F-6):** Confirm formulas for $CO_2$ mass derivation from diluent analyzers ($O_2$ and $CO_2$) and volumetric stack flow, verifying why hourly CAMPD reported $CO_2$ mass is co-derived from heat input (circularity caveat in `docs/DATA_CARD.md`).
- [ ] Once confirmed, update `status: "verified"` in `config/emission_factors.yaml`.

---

## 5. Prior-Art Bibliographic Citations to Verify

Before citing prior art in your hackathon presentation deck or submission writeup, look up the exact paper metadata:

- [ ] **Paper 1: Tremble:**
  - Search IEEE Xplore: *"Tremble: Blockchain-endorsed emission monitoring"*
  - Verify exact authors, publication year, IEEE conference/journal title, and DOI.
- [ ] **Paper 2: Authenticated Emissions Accounting with Random Verification:**
  - Open arXiv: `arXiv:2011.13954`
  - Verify author names, institutional affiliations, and publication venue.
- [ ] **Paper 3: Industrial Park Outlier Detection Blockchain Model:**
  - Search academic databases for IoT blockchain emissions monitoring with outlier detection in industrial parks.
  - Verify journal name, volume, issue, and author citations.
- [ ] **Paper 4: Master's Thesis on Trusted Pollution Registers:**
  - Look up the referenced academic thesis on trusted environmental registries using secure hardware oracles.
  - Verify author, university, and year of publication.

---

## 6. IEEE ClimateChain Hackathon 2026 Eligibility & Competition Rules

Open the competition portal before submitting:
- **Hackathon Portal:** [IEEE Blockchain Türkiye Hackathon](https://cmte.ieee.org/turkiye-blockchain/hackatlon/) & Devpost registration page.
- [ ] **Team Structure:** Verify minimum and maximum team size (individual vs teams of 2 to 5 members). Confirm no member is registered on multiple teams.
- [ ] **Geographic / Country Restrictions:** Verify participant eligibility requirements and any sanctioned jurisdiction exclusions.
- [ ] **Submission Deliverables:**
  - Public GitHub repository link (ensuring `honesty_lint.py` passes and no secrets are committed).
  - Working demo link or recorded walkthrough video (verify maximum duration: typically 3 minutes).
  - Track Selection: Confirm Track 4 (*Climate Data & Environmental Monitoring*).
  - Open-Source Licence: Confirm MIT or Apache 2.0 licence is declared in repository root.

---

## 7. Resolution Checklist for Guide `[VERIFY]` Items

All `[VERIFY]` notes flagged in `docs/VeriCEMS_Project_Guide.md` are consolidated here:

| Guide Section | `[VERIFY]` Item | Primary Source to Open | Status / Action |
|---|---|---|---|
| Sec 2.3 | CSCF = 1.00 for 2026–2030 | EUR-Lex Primary Record (Reg 2025/2620) | Kept as `null` in config; look up Commission decision |
| Sec 2.3 | Direct vs indirect emissions scope in Annex II | Reg (EU) 2023/956, Annex II | Confirmed: demo focuses on direct stack emissions |
| Sec 2.4 | EN 14181 and 40 CFR Part 75 calibration standards | EN 14181 European Standard / eCFR Part 75 | Quality-assurance background context |
| Sec 4.4 | EVM RIP-7212 (secp256r1 precompile) status on L2s | Ethereum Magicians RIP-7212 / L2 docs | Off-chain P-256 verifier checks implemented; on-chain gated |
| Sec 5.1 | Annual verifier site visit intervals under 2025/2546 | Implementing Reg (EU) 2025/2546 | Verified as background context |
| Sec 6.1 | Modbus / OPC UA industrial interfaces in CEMS edge | Industrial automation vendor specs | Documented in `docs/TECH_SPEC.md` |
| Sec 6.2 | L2 Proof-of-Stake energy footprint per tx (kWh) | CCRI (Crypto Carbon Research Institute) / Arbitrum | Flagged `[ASSUMPTION]` in `CLIMATE_IMPACT.md`; source CCRI |
| Sec 7.1 | CAMPD bulk download endpoint URL | `campd.epa.gov/data/bulk-data-files` | Confirmed and automated in `ml/data/download.py` |
| Sec 7.1 | Absence of stack O2, flue temp, and flow in CAMPD hourly | CAMPD Part 75 33-column schema | Confirmed programmatically in `results/data_inspection.json` |
| Sec 7.1 | CO2 vs Heat Input Part 75 derivation circularity | Part 75 App G / App F equations | Confirmed programmatically ($r \ge 0.9998$) in `results/data_inspection.json` |
| Sec 9.2 | Status of dMRV platforms (e.g., Hedera Guardian) | Open-source repo / documentation | Documented in `docs/TECH_SPEC.md` |
| Sec 9.2 | Facility-level satellite inventories (Climate TRACE) | `climatetrace.org` | Confirmed coarse facility inventory utility for future work |
| Sec 10.3 | Turkish and Indian heavy industry CBAM export stats | Eurostat International Trade Database | Sourced Eurostat & World Bank CCDR in `config/impact_inputs.yaml` |
| Sec 12.1 | Devpost eligibility & country restrictions | Devpost Hackathon Page | Review before final submission |
| App A | Separate default benchmark applicability | Reg (EU) 2025/2620 Annex | Supported as optional parameter in `cbam_calculator.py` |
