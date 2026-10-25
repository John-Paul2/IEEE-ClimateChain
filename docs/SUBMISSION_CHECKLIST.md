# VeriCEMS: Devpost Submission Checklist

> **Competition:** IEEE Global ClimateChain Hackathon 2026 — Track 4 (Climate Data & Environmental Monitoring)  
> **Source of Truth:** [`docs/VeriCEMS_Project_Guide.md`](file:///docs/VeriCEMS_Project_Guide.md) Sections 1.3, 11.4, 12, and 13  
> **Repository:** Monorepo at `https://github.com/vericems/vericems`  
> **Standards Alignment:** Informed by **IEEE 2413-2019** (IoT Architecture), **IEEE draft P3218** (Blockchain for Carbon Trading), **IEEE draft P3219** (Zero-Trust IoT Framework), and **IEEE draft P2418.1** (Blockchain for Connected IoT Devices). *VeriCEMS is informed by these standards; not a formal certification.*

---

## Deliverables Matrix

| # | Devpost Requirement | Repository File / Evidence URL | Status | Details & Verification |
|---|---|---|:---:|---|
| 1 | **Working Prototype (Arbitrum Sepolia Testnet)** | [`docs/TESTNET_EVIDENCE.md`](file:///docs/TESTNET_EVIDENCE.md)<br>[`deployments/testnet.json`](file:///deployments/testnet.json) | **DONE** | 6 smart contracts deployed on Arbitrum Sepolia (`Chain ID: 421614`):<br>• `Attestation`: [`0x872D5EF7C6a457d1B8eD68221350236151c763B0`](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0)<br>• `BatchAnchor`: [`0x8Bf14de651FA70FeB3538852c2160d082255638B`](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B)<br>• `BondVault`: [`0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36`](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36)<br>• `Challenge`: [`0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34)<br>• `DeviceRegistry`: [`0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471`](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471)<br>• `VerifierQuorum`: [`0x734849b029dDF31030CfaE4A74c314f8E21DBfB9`](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9) |
| 2 | **Source Code Repository** | Root repository<br>[`LICENSE`](file:///LICENSE)<br>[`Makefile`](file:///Makefile)<br>[`README.md`](file:///README.md) | **DONE** | Complete monorepo passing CI (`contracts/`, `backend/`, `ml/`, `calculator/`, `web/`, `schemas/`, `config/`, `results/`). Permissive MIT License. Clean checkout quickstart verified. |
| 3 | **Architecture Diagram & Technical Specification** | [`docs/architecture.png`](file:///docs/architecture.png)<br>[`docs/architecture.svg`](file:///docs/architecture.svg)<br>[`docs/TECH_SPEC.md`](file:///docs/TECH_SPEC.md)<br>[`docs/ARCHITECTURE.md`](file:///docs/ARCHITECTURE.md)<br>[`docs/INTERFACES.md`](file:///docs/INTERFACES.md) | **DONE** | High-resolution 4-layer architecture diagram (Edge Gateway, Detection Engine, Verifier Quorum, Importer Portal). Full protocol specification, schemas (`schemas/`), and sequence diagrams. |
| 4 | **3-Minute Video Demo** | Script: [`docs/VIDEO_SCRIPT.md`](file:///docs/VIDEO_SCRIPT.md)<br>URL: `[TODO(HUMAN): Paste final YouTube / Vimeo 3-min video URL here]` | **TODO(HUMAN)** | Shot-by-shot 3:00 script adhering strictly to Section 11.4 structure, on-screen steps, timed captions, and spoken narratives including "Why Blockchain?" and honest boundary disclosure. Final screen capture and voiceover upload to be completed by human contributor. |
| 5 | **Security & Data-Integrity Assessment** | [`docs/SECURITY_ASSESSMENT.md`](file:///docs/SECURITY_ASSESSMENT.md)<br>[`docs/THREAT_MODEL.md`](file:///docs/THREAT_MODEL.md)<br>[`results/security/forge_test.txt`](file:///results/security/forge_test.txt)<br>[`results/security/slither.txt`](file:///results/security/slither.txt) | **DONE** | Formal STRIDE threat model, 5 invariant tests (64 runs, 2048 calls), 2 property fuzz tests (256 runs), Slither static analysis with verified justifications, and cross-language golden vector parity across Python, Solidity, and TypeScript. |
| 6 | **Problem Statement (max 2 pages)** | [`docs/PROBLEM_STATEMENT.md`](file:///docs/PROBLEM_STATEMENT.md) | **DONE** | 2-page briefing: industrial CEMS data vulnerabilities, EU CBAM default value markups (+10% in 2026, +20% in 2027, +30% from 2028), the oracle problem at the smokestack, and market failure analysis. |
| 7 | **Climate Impact Assessment with Projections** | [`docs/CLIMATE_IMPACT.md`](file:///docs/CLIMATE_IMPACT.md)<br>[`ml/impact.py`](file:///ml/impact.py)<br>[`config/impact_inputs.yaml`](file:///config/impact_inputs.yaml) | **DONE** | Rigorous carbon deterrence model grounded in actual empirical benchmark detection rate (75.64%), EU ETS price (€82.32/t, `calculator/sources.json`), and CBAM trade flows. Projections for heavy industry export corridors and self-consumption L2 footprint analysis (<0.0001% of savings). |
| 8 | **Adoption and Implementation Strategy** | [`docs/ADOPTION_STRATEGY.md`](file:///docs/ADOPTION_STRATEGY.md) | **DONE** | Pragmatic 4-phase rollout aligned with CBAM regulatory timetable (2026 transitional, 2027 escalation, 2028-2030 full scope, 2034 phaseout). Hardware retrofit specs (TPM 2.0 / ATECC608), stake economics, and third-party verifier governance. |
| 9 | **Scalability & Sustainability Roadmap** | [`docs/SCALABILITY_ROADMAP.md`](file:///docs/SCALABILITY_ROADMAP.md)<br>[`results/gas_measured.json`](file:///results/gas_measured.json) | **DONE** | Empirical on-chain gas benchmarks: BatchAnchor amortisation, hourly root commits per installation, EVM L2 state growth, and decentralized committee horizontal scaling (detailed in [`docs/SCALABILITY_ROADMAP.md`](file:///docs/SCALABILITY_ROADMAP.md)). |
| 10 | **User Testing Results (Optional)** | [`docs/HUMAN_TODO.md`](file:///docs/HUMAN_TODO.md)<br>[`docs/ADOPTION_STRATEGY.md`](file:///docs/ADOPTION_STRATEGY.md) Section 4 | **TODO(HUMAN)** | Optional pilot stakeholder feedback log and usability testing with customs brokers and plant managers. Pre-formatted interview protocols and questionnaire templates ready in documentation. |

---

## Honesty and Compliance Verification

- [x] **No Invented Numbers:** All detector recalls, AUROC, gas costs, and regulatory constants cite exact code-generated results (`results/`) or verified config files (`calculator/sources.json`, `config/`).
- [x] **Honest Evasion Disclosure:** Transparently documents where the system fails (<0.3%/day slow drift and coordinated insider multi-channel collusion) in [`results/WHAT_STILL_GETS_THROUGH.md`](file:///results/WHAT_STILL_GETS_THROUGH.md) and on-screen in the portal.
- [x] **Strict Labeling:** All non-CAMPD channels are explicitly named and tagged `synthetic_` in code, schemas, and UI. Real data is exclusively US EPA CAMPD 2025 Part 75.
- [x] **Regulatory Terminology:** Strictly uses "CBAM-aligned" (never "official") and "informed by" standards (never "compliant").
- [x] **Zero Forbidden Secrets:** Zero private keys, mnemonic seeds, or third-party API credentials committed to repository history.
- [x] **Sub-5 MB Files:** All committed fixtures, artifacts, and figures respect monorepo commit constraints.

---

## Action Items for Human Submitter (`TODO(HUMAN)`)

1. **Record Video Walkthrough:**
   - Follow [`docs/VIDEO_SCRIPT.md`](file:///docs/VIDEO_SCRIPT.md) using the automated 7-step demo mode in the web app.
   - Limit runtime strictly to 3:00.
   - Upload to YouTube / Vimeo / Devpost as public or unlisted.
   - Update `[TODO(HUMAN): Paste final YouTube / Vimeo 3-min video URL here]` in this file, [`README.md`](file:///README.md), and [`docs/HUMAN_TODO.md`](file:///docs/HUMAN_TODO.md).

2. **Submit on Devpost:**
   - Link public GitHub repository URL.
   - Copy problem statement and technical summary from [`docs/PROBLEM_STATEMENT.md`](file:///docs/PROBLEM_STATEMENT.md) and [`docs/TECH_SPEC.md`](file:///docs/TECH_SPEC.md).
   - Enter Arbitrum Sepolia contract addresses from [`docs/TESTNET_EVIDENCE.md`](file:///docs/TESTNET_EVIDENCE.md).
   - Submit before **October 25, 2026, 11:59 PM UTC**.
