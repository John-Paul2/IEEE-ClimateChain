# VeriCEMS Technical Specification (`TECH_SPEC.md`)

> **Document Class:** Comprehensive Technical Specification  
> **Source of Truth for Integration:** [`docs/INTERFACES.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/INTERFACES.md)  
> **Operational Parameters:** [`config/params.yaml`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/config/params.yaml)  
> **Contract Implementations:** [`contracts/src/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/contracts/src/)  
> **Detector Implementations:** [`backend/vericems/detectors.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/backend/vericems/detectors.py), [`ml/train.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/train.py)  
> **Evaluation Suite:** [`ml/benchmark/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/benchmark/), [`ml/attacks/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/attacks/)

---

## 1. System Components & Architecture Pointers

VeriCEMS consists of six primary subsystems across the monorepo:

| Component | Monorepo Directory | Primary Modules / Contracts | Role & Responsibilities |
|---|---|---|---|
| **Edge Cryptography & Streaming** | `backend/vericems/` | `crypto.py`, `gateway.py`, `operator.py` | Canonical JSON serialization, NIST P-256 ECDSA signing, SHA-256 hash chaining, binary Merkle tree generation, and telemetry streaming. |
| **Smart Contract Layer** | `contracts/src/` | `DeviceRegistry.sol`, `BondVault.sol`, `BatchAnchor.sol`, `VerifierQuorum.sol`, `Challenge.sol`, `Attestation.sol` | On-chain state machine: device authorization, bonded economic security, root anchoring, 3-of-5 commit-reveal voting, dispute handling, and compliance attestation. |
| **Detection Engine & Physics Rules** | `backend/vericems/`, `ml/` | `detectors.py`, `ml/train.py`, `ml/artifacts/model.onnx` | Multi-source fuel cross-checks, combustion mass balance, spectral flatness, autocorrelation, and physics-informed ONNX autoencoder inference. |
| **Adversarial Benchmark Framework** | `ml/` | `ml/attacks/library.py`, `ml/attacks/adaptive.py`, `ml/benchmark/run_benchmark.py`, `ml/benchmark/report.py` | 5 facility-grouped cross-validation splits over 30 EPA CAMPD power-plant units, evaluating 8 attack classes and white-box adaptive adversaries. |
| **CBAM Calculator Engine** | `calculator/` | `cbam_calculator.py`, `cli.py`, `config/cbam_config.json`, `sources.json` | Exact implementation of EU CBAM financial liabilities under Regulation (EU) 2023/956, comparing actual verified emissions against Commission default markups. |
| **Importer Web Portal** | `web/` | `web/src/pages/`, `web/src/lib/`, `web/src/components/` | Dark-mode operator mission control, live verifier committee inspection, browser-side Merkle proof validation, and transparent CBAM cost modeling. |

---

## 2. Canonical Interfaces & Cryptographic Specifications

All interfaces conform to the locked specification in [`docs/INTERFACES.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/INTERFACES.md).

### 2.1 Canonical Serialization Rules (DECISION-02)
Standard JSON number serialization varies across programming runtimes (e.g., Python outputs `310.0`, while JavaScript outputs `310`). To enforce byte-for-byte identical UTF-8 pre-images across Python, TypeScript, and Solidity:
1. Object keys are sorted lexicographically (`sort_keys=True`).
2. Whitespace is eliminated (`separators=(',', ':')`).
3. Every floating-point number in the telemetry payload is converted to a fixed 6-decimal-place ASCII string (`"0.000000"`), rounded half-to-even via Python `Decimal("0.000001")`.
4. Integer fields (`seq`, `batch_id`, `verdict`, `score_bp`) remain standard base-10 JSON integers.

### 2.2 Hash Chaining & Signature Construction (DECISION-01 & DECISION-03)
- **Packet Pre-image:** Formatted with `prev_hash` (the 32-byte hex hash of packet $i-1$) and `seq = seq_{i-1} + 1`. Genesis packet uses `prev_hash = "0x000...000"`.
- **Packet Hash:** Computed as $H_i = \text{SHA-256}(\text{UTF-8}(\text{CanonicalJSON}(\text{packet} \setminus \{\text{sig}\})))$.
- **Device Signature:** Computed using ECDSA over NIST P-256 (`secp256r1`) with RFC 6979 deterministic nonces and low-$S$ normalization ($s \le n / 2$), formatted as a 64-byte raw hex string (`r || s`, 32 bytes each, big-endian).

### 2.3 Merkle Tree & Odd-Node Promotion (DECISION-04)
- Leaves are computed as OpenZeppelin-compatible double-hashes:
  $$\text{leaf} = \text{keccak256}(\text{bytes.concat}(\text{keccak256}(\text{canonical\_bytes})))$$
- Parent nodes are combined commutatively:
  $$\text{parent} = \text{keccak256}(\min(a, b) \parallel \max(a, b))$$
- **Odd-Node Rule:** When a tree level has an odd count ($2k + 1$), the trailing node at index $2k$ is promoted unchanged to the next level without duplicate self-hashing. For promoted leaves, no sibling is emitted in the proof array, enabling standard OpenZeppelin `MerkleProof.verify` verification with zero custom contract logic.

### 2.4 Quorum ABI Encoding (DECISION-05)
Vote commitments in `VerifierQuorum.sol` use standard EVM ABI parameter packing:
$$\text{commitment} = \text{keccak256}(\text{abi.encode}(\text{uint256 } batchId, \text{bytes32 } modelHash, \text{bytes32 } inputHash, \text{uint16 } scoreBp, \text{uint8 } verdict, \text{bytes32 } salt))$$

---

## 3. Operational Protocol Parameters (`config/params.yaml`)

System parameters are managed declaratively in [`config/params.yaml`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/config/params.yaml):

```yaml
cryptography:
  hash_algorithm: "sha256"
  merkle_hash_algorithm: "keccak256"
  signature_curve: "ECDSA_P256"
  float_format_decimals: 6
  genesis_prev_hash: "0x0000000000000000000000000000000000000000000000000000000000000000"

quorum:
  verifier_count: 5          # 5 registered verifier committee slots
  required_matches: 3        # 3-of-5 matching verdicts for quorum consensus
  score_min_bp: 0            # 0.00% anomaly score
  score_max_bp: 10000        # 100.00% anomaly score
  fraud_threshold_bp: 5000   # Quantized threshold (50.00%)

detectors:
  target_fpr: 0.02           # 2.0% false-positive rate target on validation splits
  rolling_window_hours: 8    # Rolling window length for spectral & autocorrelation checks
  autoencoder:
    hidden_dim: 16           # Hidden layer dimension for CPU-trainable model
    latent_dim: 3            # Bottleneck latent space dimension
    learning_rate: 0.002     # Adam optimizer learning rate
    batch_size: 512          # Training mini-batch size
    max_epochs: 25           # Maximum training epochs with early stopping (patience=5)
    physics_penalty_weight: 0.50 # Stoichiometric mass-balance penalty in loss function
    seed: 42                 # Deterministic seed for reproducible ONNX export

staking:
  min_operator_bond_wei: "1000000000000000000"   # 1.0 ETH (production) / 0.001 ETH (testnet)
  min_verifier_stake_wei: "500000000000000000"   # 0.5 ETH (production) / 0.0005 ETH (testnet)
  operator_slash_bps: 5000                       # 50% operator bond slashed on confirmed fraud
  verifier_reward_share_bps: 7000                # 70% of slash to verifiers, 30% to treasury
  careless_verifier_slash_bps: 1000              # 10% verifier stake slashed if dispute overturned

profiles:
  demo:
    batch_size_packets: 8
    packet_interval_seconds: 1
    commit_window_seconds: 30
    reveal_window_seconds: 30
    challenge_window_seconds: 120
    withdrawal_delay_seconds: 180

  benchmark:
    batch_size_packets: 24                       # 24 hourly records = 1 full operating day
    packet_interval_seconds: 3600                # Hourly interval (40 CFR Part 75)
    commit_window_seconds: 900                   # 15 minutes
    reveal_window_seconds: 900                   # 15 minutes
    challenge_window_seconds: 86400              # 24 hours
    withdrawal_delay_seconds: 604800             # 7 days
```

---

## 4. Smart Contracts Overview (`contracts/src/`)

All six smart contracts are written in Solidity `^0.8.24`, compiled with Foundry, and deployed to Arbitrum Sepolia (`Chain ID: 421614`):

```
contracts/src/
├── DeviceRegistry.sol   # Gateway public key authorization & revocation
├── BondVault.sol        # Operator/verifier stake custody & slashing
├── BatchAnchor.sol      # Contiguous Merkle root anchoring
├── VerifierQuorum.sol   # 3-of-5 commit-reveal quorum voting
├── Challenge.sol        # Optimistic dispute window & arbiter resolution
└── Attestation.sol      # Verified period compliance certification
```

### Contract Responsibilities & Real Measured Gas

1. **`DeviceRegistry.sol`**
   - Maps `deviceId` to 65-byte uncompressed SEC1 public key (`0x04 || x || y`).
   - Supports key rotation and emergency revocation.
   - Deployed at: `0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471`.
   - Measured gas: `238,041` gas (`registerDevice`).

2. **`BondVault.sol`**
   - Non-custodial escrow for operator bonds and verifier stakes.
   - Implements pull-payment withdrawals with a mandatory withdrawal lock delay (`withdrawalDelaySeconds`).
   - Slashes operator bond on fraud, paying 70% bounty to honest verifiers and 30% to treasury.
   - Enforces the conservation of funds invariant: `address(this).balance >= totalDeposited`.
   - Deployed at: `0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36`.
   - Measured gas: `117,845` gas (`depositOperatorBond`), `55,111`–`72,211` gas (`depositVerifierStake`).

3. **`BatchAnchor.sol`**
   - Records batch Merkle root, starting sequence number, and ending sequence number.
   - Reverts if operator has insufficient bond in `BondVault`.
   - Enforces contiguous sequence numbering: `startSeq == lastEndSeq + 1`.
   - Deployed at: `0x8Bf14de651FA70FeB3538852c2160d082255638B`.
   - Measured gas: median `179,843` gas (`anchorBatch`, 20 samples).

4. **`VerifierQuorum.sol`**
   - Two-phase commit-reveal consensus across 5 registered verifier committee slots.
   - Phase 1: `commitVote(batchId, commitment)` locks sealed vote hash during `commitWindow`.
   - Phase 2: `revealVote(batchId, modelHash, inputHash, scoreBp, verdict, salt)` validates commitment and records vote during `revealWindow`.
   - Reaches finality when 3 revealed votes agree on `(modelHash, inputHash, verdict)`.
   - Deployed at: `0x734849b029dDF31030CfaE4A74c314f8E21DBfB9`.
   - Measured gas: median `103,410` gas (`commitVote`), `177,505` gas (`revealVote`), `188,177` gas (`finalize`).

5. **`Challenge.sol`**
   - Opens an optimistic challenge window (`challengeWindowSeconds`) upon a Fraud quorum verdict.
   - Operator can invoke `submitOperatorDispute(batchId, disputeEvidenceHash)`.
   - Arbiter resolves dispute via `resolve(batchId, upheld)`: if upheld, triggers `BondVault.slashOperator`; if overturned, slashes careless verifiers.
   - Deployed at: `0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`.
   - Measured gas: `120,654` gas (`openChallenge`), `82,020` gas (`submitOperatorDispute`), median `198,309` gas (`resolve`).

6. **`Attestation.sol`**
   - Mints permanent CBAM compliance certificates for verified multi-batch compliance periods.
   - Stores cumulative emissions in integer kg CO2e (`totalEmissionsKgCo2e`), operating hours, verified batch IDs, and off-chain report hash.
   - Deployed at: `0x872D5EF7C6a457d1B8eD68221350236151c763B0`.
   - Measured gas: `281,626` gas (`recordAttestation`).

---

## 5. Detectors & Verification Modules (`backend/vericems/detectors.py`)

VeriCEMS benchmarks four distinct detector configurations:

### 5.1 Baseline 1: Static Thresholds (`baseline_1_static`)
- Evaluates raw channels against static physical limits:
  - `gross_load_mw` within operating limits ($[0, \text{max\_load}]$).
  - Heat input and emissions non-negative.
  - Heat input per gross load MW within generous static bounds.
- Limitation: Blind to subtle manipulation, scaling, and replay loops (AUROC: 0.5770, Recall: 43.85%).

### 5.2 Baseline 2: Mass-Balance Physics (`baseline_2_physics`)
- Computes stoichiometric CO2 to heat input ratio:
  $$R_t = \frac{\text{co2\_mass\_short\_tons}_t}{\text{heat\_input\_mmbtu}_t}$$
- Computes residual against empirical fuel stoichiometric mean $\bar{R}$:
  $$\Delta_{\text{stoich}} = |R_t - \bar{R}|$$
- Flags batches exceeding the validation-calibrated residual threshold.
- Limitation: Exploitable by attackers who scale CO2 and Heat Input together (Variant A / Part 75 circularity).

### 5.3 Autoencoder Only (`autoencoder_only`)
- Physics-informed neural autoencoder implemented in PyTorch (`ml/train.py`), exported to ONNX (`ml/artifacts/model.onnx`).
- Architecture: Fully connected encoder ($7 \to 16 \to 3$) and decoder ($3 \to 16 \to 7$) with ReLU activations.
- Physics-informed loss function:
  $$\mathcal{L} = \text{MSE}(x, \hat{x}) + \lambda \cdot |\hat{\text{CO}}_2 - R_{\text{fuel}} \cdot \hat{\text{Heat}}|$$
- Flags anomalies based on mean squared reconstruction error.

### 5.4 Proposed Detector (`proposed`)
The proposed detector implements a layered defense combining all modules:
1. **Cryptographic Validation:** Checks sequence gaps (`SEQ_GAP`), hash chain continuity (`BAD_HASH`), and device ECDSA signature validity (`BAD_SIG`).
2. **Multi-Source Cross-Check (`CROSS_SOURCE_MISMATCH`):** Compares reported `heat_input_mmbtu` against independent custody fuel flow (`fuel_ledger_synthetic`).
3. **Mass-Balance Residual (`MASS_BALANCE_MISMATCH`):** Evaluates stoichiometric combustion residual.
4. **Spectral Flatness (`SPECTRAL_FLATLINE`):** Computes Wiener spectral entropy over rolling window $W = 8$:
   $$\gamma = \frac{\exp\left(\frac{1}{K}\sum \ln S(f)\right)}{\frac{1}{K}\sum S(f)}$$
   Flags frozen sensor flatlines ($\gamma \to 0$) and synthetic white noise injection ($\gamma \to 1$).
5. **Autocorrelation (`AUTOCORR_REPLAY`):** Computes normalized lag-1 through lag-4 autocorrelations to catch periodic loops and historical replays.
6. **Autoencoder Reconstruction Error:** Evaluates latent bottleneck reconstruction error against validation-calibrated threshold.

---

## 6. Evaluation Protocol & Reproducibility

The adversarial evaluation protocol is defined in `ml/benchmark/`:

### 6.1 Data Ingestion & Splitting
- **Dataset:** 30 combustion power facilities deterministically selected from US EPA CAMPD 2025 bulk data (`config/facilities.yaml`), totaling 393,222 facility operating hours across IA, UT, and WY.
- **Cross-Validation:** 5 facility-grouped splits (`results/splits.json`). All units of a facility are confined to either train, validation, or test to prevent cross-facility data leakage.
- **Calibration:** All detector thresholds are calibrated strictly on clean validation facilities to satisfy a target false-positive rate of **2.0% on validation (8.3% on held-out facilities)** (`target_fpr: 0.02`).

### 6.2 Evaluated Attack Classes (`ml/attacks/`)
The benchmark executes 8 primary attack classes (14 variations total) across 720-hour evaluation series:
1. `constant_scaling_5pct`, `10pct`, `20pct`, `30pct`: Multiplicative downward scaling of CO2.
2. `slow_drift_0_1pct_day`, `0_3pct_day`, `0_5pct_day`: Progressive calibration drift.
3. `naive_replay`: Replay of historical low-carbon operating records without re-signing.
4. `time_shifted_replay`: Replay of historical records with valid timestamp and re-signing.
5. `flatline_injection`: Freezing sensor readings at average low-emission levels.
6. `synthetic_noise_on_flatline`: Adding Gaussian noise to masked flatlines.
7. `selective_packet_dropping`: Omitting packets during peak-emission operating hours.
8. `adaptive_whitebox_a_single_source`: White-box attacker scaling CO2 and Heat Input along the stoichiometric manifold before edge signing.
9. `adaptive_whitebox_b_coordinated_insider`: Coordinated insider simultaneously compromising CEMS stack telemetry and the independent custody fuel ledger.

### 6.3 Benchmark Performance Summary
From [`results/benchmark_summary.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/benchmark_summary.json):

| Detector Configuration | Macro Recall (Mean ± Std) | Macro Precision | False Positive Rate | AUROC | Mean Detection Delay |
|---|---:|---:|---:|---:|---:|
| **Proposed Detector** | **`75.64% ± 8.03%`** | **`77.59% ± 8.23%`** | `8.34% ± 6.08%` | **`0.8830 ± 0.0107`** | **`49.7 hours`** |
| Baseline 2 (Mass-Balance Physics) | `53.11% ± 2.81%` | `81.65% ± 6.08%` | `0.25% ± 0.18%` | `0.8029 ± 0.0297` | `106.6 hours` |
| Baseline 1 (Static Thresholds) | `43.85% ± 7.37%` | `74.42% ± 8.19%` | `3.22% ± 3.41%` | `0.5770 ± 0.1344` | `130.5 hours` |
| Autoencoder Only | `37.73% ± 21.78%` | `56.78% ± 11.69%` | `10.51% ± 11.43%` | `0.7555 ± 0.0201` | `131.0 hours` |
