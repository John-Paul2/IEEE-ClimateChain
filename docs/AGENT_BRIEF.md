# VeriCEMS Agent Brief

> **Source of truth:** [`VeriCEMS_Project_Guide.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/VeriCEMS_Project_Guide.md) · **Rules:** [`AGENTS.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/AGENTS.md)

## a. The Project in Plain Words
VeriCEMS is a tamper-evident verification pipeline for industrial smokestack emissions designed for the EU Carbon Border Adjustment Mechanism (CBAM). Because EU importers must pay carbon certificate costs on imported goods—or face punitive default-value markups of 10%–30% if their foreign suppliers cannot prove actual emissions—there is a strong financial incentive to report verified data, alongside a temptation to manipulate numbers in plant-controlled computers before audit. VeriCEMS addresses this oracle problem by cryptographically signing each sensor reading at the edge (simulated secure element) and linking readings into a hash chain so records cannot be deleted, reordered, or replayed. Batches of readings are summarized into Merkle roots anchored on an EVM Layer-2 testnet, while raw data stays off-chain for confidentiality. Five independent verifier nodes evaluate each batch off-chain using signature/chain checks, combustion mass-balance physics rules, and a physics-informed autoencoder, then vote via a 3-of-5 commit-reveal quorum backed by staked operator and verifier bonds. Confirmed fraud triggers an optimistic challenge window and bond slashing, while accepted batches aggregate into CBAM-aligned period attestations that an EU importer can verify in one click to calculate real savings over marked-up default values.

## b. End-to-End Flow
1. **Setup:** The edge gateway generates a key pair inside a simulated secure element, registers the public key against the installation ID in `DeviceRegistry`, and the operator and 5 verifier nodes lock stakes in `BondVault`.
2. **Measure:** Stack analyzers record gas concentrations, flow, and temperature into the plant data system (1-minute intervals in production; hourly records in the CAMPD benchmark).
3. **Seal and Chain:** The gateway packages each reading into `{seq, timestamp, values, previous_packet_hash, signature}` and signs it, creating a tamper-evident hash chain.
4. **Batch:** Readings are grouped into batches (hourly in production; 24 records in benchmark; 8 in live demo) and hashed into a Merkle tree; only the 32-byte Merkle root is submitted on-chain to `BatchAnchor` while raw packets go off-chain to verifiers.
5. **Check:** Each verifier independently runs deterministic cryptographic checks (signatures, hash links, sequence numbers), physics checks (CO₂ vs. heat input/fuel mass balance, load co-movement), and ML checks (physics-informed autoencoder reconstruction error, spectral/FFT features) to compute a quantized score (0..10000 basis points) and verdict.
6. **Vote:** Verifiers submit sealed commitments `hash(model_hash + input_hash + quantized_score + verdict)` to `VerifierQuorum` and reveal them after the commit phase closes.
7. **Outcome:** A 3-of-5 "clean" quorum marks the batch verified; a 3-of-5 "fraud" quorum quarantines the batch, anchors evidence on-chain, and opens a challenge window (24h in production; ~2 min in demo).
8. **Challenge:** During the window (`Challenge` contract), the operator may dispute with raw data and explanations; a multisig arbiter resolves the dispute to either slash the operator's bond (rewarding honest verifiers/treasury) or clear the batch and penalize careless verifiers.
9. **Report:** At period end, verified batches are summed into total tCO₂e and divided by production mass to yield Specific Embedded Emissions (SEE), recording an on-chain attestation in `Attestation` and exporting a downloadable signed "CBAM-aligned" report.
10. **Importer:** The EU buyer uploads the report into the Importer Portal, which recomputes Merkle proofs against on-chain roots, displays verified coverage vs. quarantined hours, and runs the CBAM cost calculator comparing default values against verified SEE.

## c. On-Chain vs. Off-Chain Architecture
| On-Chain (EVM Testnet / Local Anvil) | Off-Chain (Python Backend, ML, React Web App) |
|---|---|
| Device public keys, status, key rotation/revocation (`DeviceRegistry`) | Raw sensor readings and packets (confidential to operator, shared with verifiers) |
| Operator bonds, verifier stakes, withdrawal delays, slashing (`BondVault`) | Cryptographic chain verification, physics mass-balance engine, and ONNX/PyTorch ML inference |
| 32-byte batch Merkle roots and sequence bounds (`BatchAnchor`) | Detailed time-series telemetry, spectral/FFT analysis, and quarantine evidence payloads |
| Commit-reveal hashes, revealed verdicts, 3-of-5 quorum state (`VerifierQuorum`) | Four-screen React UI (Operator Live View, Verifier Console, Importer Portal, Benchmark) |
| Challenge state, arbiter resolution, settlement (`Challenge`) | Browser/Python CBAM cost calculator (`cbam_calculator.py`) and JSON regulatory configs |
| Period attestations: installation, period, tCO₂e, coverage, roots (`Attestation`) | Benchmark suite, 8 adversarial attack scripts, and SQLite demo persistence |

## d. Data, Proxy Limits, and Synthetic Channels
- **Real Dataset:** US EPA Clean Air Markets Program Data (CAMPD) reported under 40 CFR Part 75 (hourly power-plant emissions and operating data: facility/unit IDs, timestamp, operating time, gross load MW, steam load, heat input mmBtu, CO₂/SO₂/NOx mass, rates, fuel type). Split strictly by facility (`GroupShuffleSplit` across 20+ facilities).
- **Proxy Limit:** US power generation combustion data serves as a behavioural proxy for EU CBAM industrial sectors (steel, cement, aluminium, fertilisers) and does not capture non-combustion chemical process emissions (e.g., limestone calcination).
- **Derived Field Circularity:** Under 40 CFR Part 75, hourly CO₂ mass may be mathematically derived from heat input or fuel flow rather than independently measured, making naive "CO₂ vs. heat input" checks partially circular unless accounted for.
- **Synthetic Channels:** Standard hourly CAMPD files likely omit raw stack O₂ concentration, flue gas temperature, and stack flow rate, as well as independent fuel-meter or power-meter cross-checks. Any channel or analog-dilution signal not natively present in the downloaded CAMPD CSVs must be explicitly named and labelled `synthetic` in code, data cards, UI, and documentation.

## e. Scope Freeze
- **Must-Have (Build):**
  1. Simulated secure-element ECDSA signing, SHA-256 hash chaining, and Merkle batching.
  2. Detection engine: deterministic mass-balance physics rules + physics-informed autoencoder + static threshold baseline.
  3. Reproducible benchmark of 8 attacks (constant scaling, flatline, naive replay, time-shifted replay, noise on flatline, slow drift, selective dropping, adaptive white-box attacker) with facility-grouped splits.
  4. Six Solidity smart contracts (`DeviceRegistry`, `BondVault`, `BatchAnchor`, `VerifierQuorum`, `Challenge`, `Attestation`) with Foundry unit/fuzz/invariant tests and Slither analysis.
  5. Four-screen dark-theme React web app (`#0B1220` palette), FastAPI WebSocket backend, 5 verifier node processes, deterministic "play scenario" demo mode, and transparent CBAM calculator.
  6. Required deliverables: docs, architecture diagram, problem statement, security assessment, and 3-minute video script/support.
- **Out of Scope (Do NOT Build — log in `docs/FUTURE_WORK.md`):** Zero-knowledge (ZK) circuits, live satellite integration, Scope 2 / precursor accounting engine, physical hardware rig, or upgradeable proxy contracts. (Optional extras like canary batches or analog dilution only if explicitly requested later.)

## f. Blocking `[VERIFY]` Items in the Guide
| `[VERIFY]` Item in Guide | Affected File / Module | Why It Could Block or Affect Coding |
|---|---|---|
| Exact CAMPD columns, units, download URL, and whether CO₂ is derived from heat input under Part 75 (Sec 7.1, App E/F) | `data/`, `ml/` (preprocessing, physics rules, data card) | Determines exact CSV schema parser, which channels must be generated and labelled `synthetic`, and how mass-balance rules avoid circularity. |
| Fuel emission factors from EPA / Part 75 appendices (Sec 7.3) | `ml/`, `config/` | Needed as constants for the deterministic combustion mass-balance rule (cannot hardcode from memory). |
| CBAM CSCF (2026–2030), post-2026 free-allocation schedule, route benchmarks (2025/2620), country defaults (2025/2621 & 2026/1740), default benchmarks rule, and indirect emissions scope (Sec 2.3, 7.2, App A/B/E) | `config/`, `calculator/cbam_calculator.py`, `web/` | Needed for calculator config; per `AGENTS.md` Rule 4, unknown values must be stored as `null` and shown as `"needs source"` in UI, while known rules (e.g., separate default benchmark) affect formula structure. |
| Signature curve support on EVM vs. P-256 / RIP-7212 (Sec 4.4, 13) | `contracts/`, `backend/` | Guide specifies Python ECDSA P-256 off-chain (`cryptography` lib) and off-chain verifier checks; if any on-chain signature check is desired, curve choice (`secp256k1` vs `P-256`) blocks contract ABI. |
| CEMS QA/calibration standards (EN 14181, 40 CFR Part 75) & industrial protocols (Modbus/OPC UA) (Sec 2.4, 5.1, 6.1) | `docs/` | Affects technical specification accuracy only (non-blocking for code if treated as background context). |
| India-to-EU covered export trade statistics, L2 PoS energy footprint source, prior-art paper venues, hackathon eligibility (Sec 6.2, 10.3, 12.1, App E/F) | `docs/` (impact assessment, roadmap, spec) | Required for climate-impact projections and citations; must remain `null` or `[ILLUSTRATIVE]` until verified sources are provided. |

## g. Assumptions, Contradictions, and Gaps Found
- **Path Discrepancy:** `AGENTS.md` and the prompt refer to `docs/VeriCEMS_Project_Guide.md`, whereas the file is currently at the workspace root (`./VeriCEMS_Project_Guide.md`) and `docs/INTERFACES.md` does not exist yet.
- **Directory Layout Mismatch:** `AGENTS.md` lists 10 top-level directories (`contracts/ backend/ ml/ web/ calculator/ docs/ data/ scripts/ results/ deployments/ config/`), whereas Guide Section 13.1 omits `scripts/`, `results/`, `deployments/`, and `config/` (placing `config` inside `calculator/`). **Assumption:** We will follow `AGENTS.md`'s 10-directory monorepo rule.
- **Verifier Stakes vs. Contract Sketch:** Step 0 (Sec 3.2) and Step 7 state that verifiers register with their own stakes and lose stake for careless flags, but the contract table (Sec 4.2) only sketches `BondVault` for operator deposits and `VerifierQuorum` for voting. **Assumption:** `BondVault` (or `VerifierQuorum`) will manage both operator bonds and verifier stakes.
- **Vote Hash Input Specification:** Step 5 defines commitment as `hash(model_hash + input_hash + quantized_score + verdict)`. In Solidity, fixed-point basis points (`0..10000`, per `AGENTS.md`) could vary slightly across verifiers unless thresholds or exact input determinism are enforced. **Assumption:** All 5 verifier nodes run identical deterministic CPU inference on the exact same batch packet array so `quantized_score` matches bit-for-bit, or quorum matching checks `verdict` while recording `quantized_score`.
- **Default Benchmark Formula Gap:** Appendix A notes that when default SEE values are used, a specific default benchmark may apply rather than the actual route benchmark. **Assumption:** `cbam_calculator.py` should accept an optional `default_benchmark_tco2e_per_t` alongside `benchmark_tco2e_per_t`.

## h. Questions for You (Up to 10)
1. **Guide File Location:** Should we copy or move `VeriCEMS_Project_Guide.md` into `docs/VeriCEMS_Project_Guide.md` so it matches `AGENTS.md`, or keep a copy in both locations?
2. **CAMPD Data Acquisition:** Do you already have local EPA CAMPD CSV files ready to place in `data/`, or should our next task include a script to download them from `campd.epa.gov` (which will require network access)?
3. **CBAM Config Values:** Do you have verified numbers and source dates for the `null` fields in Appendix B (`cscf_by_year`, `benchmark_tco2e_per_t`, `default_value_base_tco2e_per_t`), or should we leave them `null` (displaying `"needs source"` in the UI) alongside an explicitly tagged `[ILLUSTRATIVE]` preset for the demo?
4. **Device Signature Curve:** Should the simulated gateway sign packets with `ECDSA P-256` (verified off-chain by Python verifiers as described in Sec 4.4 & 13) or `secp256k1` (so Solidity `ecrecover` can also verify signatures on-chain if needed)?
5. **Quorum Consensus Rule:** When 5 verifiers reveal `hash(model_hash, input_hash, quantized_score, verdict, salt)`, must all 3-of-5 matching verifiers have the exact same `quantized_score` (enforced by deterministic CPU inference on identical inputs), or does the contract quorum only require matching `verdict` (`clean` vs `fraud`)?
6. **Bond Token Type:** Should `BondVault` hold native testnet ETH/POL (`msg.value`) for simplicity and zero ERC-20 setup friction, or a mock ERC-20 token?
7. **Target Testnet:** Which EVM L2 testnet do you prefer for deployment config once we reach the contracts milestone: **Arbitrum Sepolia** or **Polygon Amoy** (in addition to local Foundry `anvil`)?
8. **`docs/INTERFACES.md` Creation:** Would you like us to draft `docs/INTERFACES.md` as the next step to lock down canonical JSON schemas, contract ABIs, and REST/WebSocket payloads before any code is written?
