# VeriCEMS: Future Work & Architectural Scope Roadmap (`FUTURE_WORK.md`)

> **Context:** In strict accordance with `AGENTS.md` Scope Freeze rules, this document logs architectural enhancements, cryptographic extensions, and regulatory integrations intentionally deferred from the hackathon prototype.

---

## 1. Zero-Knowledge (ZK) Emissions Circuits

### Current Status in Prototype
Raw telemetry packets (including energy inputs, raw fuel flows, and power production) are shared confidentially off-chain only with authenticated verifier nodes under mutual enterprise non-disclosure.

### Future Architecture
- **Problem:** Industrial manufacturers fiercely protect proprietary heat-rate curves, raw fuel consumption, and boiler operational efficiencies as competitive trade secrets. Operators hesitate to disclose raw hourly operating numbers to external verifier committees.
- **ZK Enhancement:** Deploy zero-knowledge proof circuits (using Groth16 or Plonk over the BN254 / BLS12-381 curves).
- **Functionality:** The operator generates an off-chain ZK-SNARK proving that:
  1. All hourly readings $P_1 \dots P_N$ satisfy stoichiometric mass-balance bounds ($R_{\text{min}} \le \text{CO}_2 / \text{Heat} \le R_{\text{max}}$).
  2. The hash chain $H_i = \text{SHA-256}(H_{i-1} \parallel P_i)$ is continuous with zero omitted records.
  3. The resulting Specific Embedded Emissions (SEE in tCO2e/tonne) is equal to declared value $X$.
  4. The Merkle root matches the anchored on-chain root in `BatchAnchor.sol`.
- **Outcome:** The verifier contract verifies the ZK proof on-chain in ~200,000 gas without ever seeing the plant's proprietary hourly megawatt output or fuel purchases.

---

## 2. Remote Hardware Attestation & Physical Secure Elements

### Current Status in Prototype
Simulated via `SoftwareSecureElement` with unexported private keys stored in memory, signing canonical JSON payloads using NIST P-256 ECDSA.

### Future Architecture
- **Problem:** If an attacker gains root administrative access to the edge gateway operating system, they could extract private keys from RAM or inject tampered readings before the signing routine.
- **Hardware Attestation:**
  1. Deploy tamper-resistant industrial hardware secure elements (e.g., Microchip ATECC608B, NXP EdgeLock SE050, or Trusted Platform Module TPM 2.0).
  2. Implement DICE (Device Identifier Composition Engine) measured boot architecture: firmware binaries and cryptographic keys are hardware-bound.
  3. During `DeviceRegistry.registerDevice`, the gateway provides a cryptographic remote attestation quote signed by the silicon manufacturer's root of trust, proving that the device is running untampered, signed firmware.
- **Physical Sampling Seals:** Wire microswitch tamper loops and optical enclosure sensors directly into secure element hardware interrupt pins to detect physical probe removal or sample dilution.

---

## 3. Satellite Plume Spectroscopy Cross-Checks

### Current Status in Prototype
Multi-source validation is performed against an independent on-site custody-transfer fuel flow ledger (`fuel_ledger_synthetic`).

### Future Architecture
- **Problem:** A fully coordinated insider who controls both the stack analyzer and the fuel supply records (Variant B) can evade local mass-balance detection.
- **Satellite Cross-Validation:**
  1. Integrate public and commercial satellite spectroscopy feeds:
     - **Copernicus Sentinel-5P TROPOMI:** Daily global mapping of tropospheric NO2, SO2, and CO concentrations at $3.5 \times 5.5 \text{ km}$ spatial resolution.
     - **GHGSat / Carbon Mapper:** High-resolution optical point-source imaging capable of resolving individual industrial facility plumes.
  2. Verifiers ingest satellite observation tiles intersecting the facility's geographic coordinates.
  3. Compare plant reported daily stack CO2/SO2 mass against satellite integrated plume mass balances, flagging gross multi-ton divergences to the verification committee.

---

## 4. Scope 2 Indirect Emissions & Precursor Accounting Engine

### Current Status in Prototype
VeriCEMS focuses strictly on direct combustion Scope 1 stack emissions (fuel combustion in boilers, furnaces, and kilns) under Regulation (EU) 2023/956.

### Future Architecture
- **Problem:** EU CBAM rules mandate reporting and certificate surrender for:
  - **Indirect Scope 2 Emissions:** Emissions from electricity consumed during production.
  - **Complex Precursor Goods:** Embedded emissions in input materials (e.g., clinker used in cement, pig iron used in steel, alumina used in aluminium, and nitric acid/ammonia used in mixed fertilisers).
- **Scope 2 Engine:** Integrate verifiable grid emission factor feeds and 24/7 granular renewable energy certificates (EnergyTag / Granular EACs) anchored to smart meters.
- **Supply Chain Precursor Tracking:** Implement recursive cryptographic attestation chaining: downstream steel mills verify upstream iron ore pelletizer attestations on-chain, rolling precursor emissions into the final finished product attestation.

---

## 5. Restaking-Style Shared Verifier Security

### Current Status in Prototype
Independent verifiers stake ETH directly into `BondVault.sol` across 5 fixed committee slots, with slashing penalties capped by individual deposited stakes.

### Future Architecture
- **Problem:** If an industrial facility produces millions of tonnes of steel, the potential profit from emissions fraud could exceed the economic value of 5 local verifier stakes, creating an economic vulnerability to verifier bribery.
- **Shared Economic Security:**
  1. Integrate with decentralized shared security protocols (e.g., EigenLayer on Ethereum, Symbiotic, or Babylon for Bitcoin staking).
  2. Verifier nodes re-stake pooled assets into a dedicated VeriCEMS Actively Validated Service (AVS).
  3. Slashing contracts borrow hundreds of millions of dollars in shared crypto-economic security, raising the financial cost of corrupting a 3-of-5 quorum beyond any conceivable CBAM tariff savings.
