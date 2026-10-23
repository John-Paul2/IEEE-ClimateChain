# VeriCEMS Security and Data-Integrity Assessment

> **Document Status:** Hackathon Prototype Technical Assessment (IEEE ClimateChain Hackathon 2026, Track 4)  
> **Evaluation Scope:** Monorepo commit state (`contracts/`, `backend/`, `ml/`, `web/`, `calculator/`, `config/`, `schemas/`)  
> **Mandatory Disclaimer:** VeriCEMS is a hackathon prototype designed to demonstrate feasibility and cryptographic tamper-evidence. This system has **not** undergone an external formal security audit, and this document does **not** claim the system is "secure" or "production-ready". All metrics, numbers, and evaluation outcomes cited herein are extracted directly from automated test and benchmark outputs stored in [`results/security/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/) and [`results/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/). Per `AGENTS.md`, terminology is strictly "CBAM-aligned" and "informed by standards", never "official" or "compliant".

---

## 1. Scope and Methodology

### 1.1 Assessment Scope
The scope of this security and data-integrity evaluation includes:
1. **Edge Cryptography & Data Pipelines:** Canonical JSON serialization, NIST P-256 ECDSA signatures, SHA-256 hash chaining, and OpenZeppelin-compatible Merkle tree construction (`backend/vericems/crypto.py`, `schemas/`).
2. **Detection Engine Integrity:** Off-chain mass-balance combustion physics rules, autoencoder reconstruction error thresholding, and multi-source cross-checks (`backend/vericems/detectors.py`, `ml/`).
3. **Smart Contracts Layer:** All 6 Solidity contracts deployed to local Anvil / EVM L2 testnets (`contracts/src/`):
   - `DeviceRegistry.sol`: Gateway public key registration, rotation, and revocation.
   - `BondVault.sol`: Operator and verifier stake deposits, withdrawal delay locks, and pull-payment slashing.
   - `BatchAnchor.sol`: Contiguous sequence tracking and 32-byte Merkle root anchoring.
   - `VerifierQuorum.sol`: Two-phase commit-reveal quorum voting (3-of-5 threshold) with reentrancy guards.
   - `Challenge.sol`: Optimistic challenge window, Merkle dispute verification, and arbiter settlement.
   - `Attestation.sol`: Aggregated period emissions records and coverage accounting.
4. **Browser & Portal Verification:** Browser-side Merkle proof validation and CBAM cost calculation (`web/src/lib/`, `calculator/`).

### 1.2 Evaluation Methodology
The evaluation applies five complementary verification methods:
- **Foundry Unit and Scenario Tests:** Verifying core state transitions, edge revert paths, and 6 end-to-end integration scenarios (`Scenario A` through `Scenario F`).
- **Fuzzing and Invariant Testing:** State-space fuzz testing (256 runs per property) and 5 long-running invariant campaigns (64 runs × 32 depth = 2,048 calls per invariant, totaling 10,240 calls with 0 reverts).
- **Branch and Line Coverage:** Full coverage analysis using Foundry compiler instrumentation.
- **Static Analysis:** Crytic Slither 0.11.6 static analysis across all 16 contract compilation units with 102 detector classes.
- **Hypothesis Property-Based Testing:** 8 automated property-based test suites executing 800 randomized telemetry chains and Merkle variations in Python.
- **Cross-Language Differential Golden Vectors:** Tri-language verification (Python, Solidity, TypeScript) executing identical canonical vectors for hashes, signatures, odd-node Merkle trees, and vote commitments.

---

## 2. Test Execution and Real Results

All verification tests were executed locally. Full command outputs are archived in [`results/security/`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/).

### 2.1 Foundry Test Suite Summary
From [`results/security/forge_test.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/forge_test.txt):
- **Compiler:** Solc 0.8.24 (Cancun EVM, 200 optimizer runs)
- **Total Test Suites:** 3
- **Total Tests Passed:** 27
- **Total Tests Failed:** 0
- **Total Tests Skipped:** 0
- **Total Execution Time:** 876.13 ms (1.45 s CPU time)

```
Ran 3 test suites:
- test/GoldenVectors.t.sol: 4 passed, 0 failed
- test/UnitAndScenario.t.sol: 16 passed, 0 failed
- test/FuzzAndInvariants.t.sol: 7 passed, 0 failed
Suite result: ok. 27 passed; 0 failed; 0 skipped
```

### 2.2 Fuzz and Invariant Campaign Metrics
From [`results/security/forge_test.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/forge_test.txt):

| Invariant / Fuzz Test | Type | Runs | Total Calls | Reverts | Outcome |
|---|---|---|---|---|---|
| `invariant_batchFinalizedAtMostOnce()` | Invariant | 64 | 2,048 | 0 | **PASS** |
| `invariant_ethHeldEqualsRecordedBalances()` | Invariant | 64 | 2,048 | 0 | **PASS** |
| `invariant_onlyRegisteredNonRevokedCanAnchor()` | Invariant | 64 | 2,048 | 0 | **PASS** |
| `invariant_sequenceNumbersOnlyIncrease()` | Invariant | 64 | 2,048 | 0 | **PASS** |
| `invariant_slashedNeverExceedsBond()` | Invariant | 64 | 2,048 | 0 | **PASS** |
| `testFuzz_BondSlashAndRewardConservation(uint96,uint16,uint8)` | Fuzz | 256 | 256 | 0 | **PASS** (μ: 325,928 gas) |
| `testFuzz_SequenceRangesContiguousAndNonOverlapping(uint16,uint16,uint16,uint64)` | Fuzz | 256 | 256 | 0 | **PASS** (μ: 463,745 gas) |

### 2.3 Contract Code Coverage
From [`results/security/coverage.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/coverage.txt):

```
+===========================================================================================================+
| File                         | % Lines           | % Statements      | % Branches       | % Funcs         |
+===========================================================================================================+
| script/Deploy.s.sol          | 99.15% (117/118)  | 99.31% (143/144)  | 60.00% (3/5)     | 100.00% (7/7)   |
| src/Attestation.sol          | 100.00% (40/40)   | 100.00% (51/51)   | 100.00% (10/10)  | 100.00% (6/6)   |
| src/BatchAnchor.sol          | 100.00% (56/56)   | 100.00% (65/65)   | 100.00% (15/15)  | 100.00% (7/7)   |
| src/BondVault.sol            | 98.18% (162/165)  | 97.85% (182/186)  | 90.00% (36/40)   | 100.00% (20/20) |
| src/Challenge.sol            | 100.00% (145/145) | 100.00% (163/163) | 100.00% (30/30)  | 100.00% (12/12) |
| src/DeviceRegistry.sol       | 100.00% (66/66)   | 100.00% (85/85)   | 100.00% (17/17)  | 100.00% (11/11) |
| src/VerifierQuorum.sol       | 100.00% (137/137) | 100.00% (163/163) | 100.00% (32/32)  | 100.00% (14/14) |
| test/FuzzAndInvariants.t.sol | 91.23% (104/114)  | 90.60% (135/149)  | 92.31% (12/13)   | 83.33% (10/12)  |
| test/UnitAndScenario.t.sol   | 100.00% (2/2)     | 100.00% (1/1)     | 100.00% (0/0)    | 100.00% (1/1)   |
| Total                        | 98.34% (829/843)  | 98.11% (988/1007) | 95.68% (155/162) | 97.78% (88/90)  |
+===========================================================================================================+
```

All 6 production smart contracts achieved **98.18% to 100.00%** line coverage and **90.00% to 100.00%** branch coverage.

### 2.4 Gas Costs for Critical Operations (Forge Gas Report & Arbitrum Sepolia Execution)
From [`results/gas_report.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/gas_report.txt), [`results/gas_measured.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/gas_measured.json), and [`docs/TESTNET_EVIDENCE.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/TESTNET_EVIDENCE.md):

| Contract Function | Forge Test Gas (Min / Median / Max) | Arbitrum Sepolia Testnet Gas (Chain 421614) | Purpose & Execution Notes |
|---|---|---|---|
| `DeviceRegistry.registerDevice` | 26,464 / **194,115** / 238,072 | **238,041** | Registers device P-256 public key & factory installation ID (`0x905a8f52...`, Block 321580773) |
| `BondVault.depositOperatorBond` | 28,780 / **46,333** / 117,845 | **117,845** (first) / **46,345** (top-up) | Locks operator collateral bond in ETH (`0xa7355a72...`, Block 321580907) |
| `BondVault.depositVerifierStake` | 28,581 / **38,011** / 72,211 | **72,211** (V0) / **55,111** (V1/V2) | Locks verifier committee stake in ETH (`0x4842628c...`, Block 321580926) |
| `BatchAnchor.anchorBatch` | 24,923 / **179,855** / 196,955 | **179,843** (median, 20 samples) | Anchors 32-byte Merkle root + sequence bounds. **$O(1)$ constant gas** regardless of batch size |
| `VerifierQuorum.commitVote` | 26,414 / **103,410** / 120,510 | **103,410** (median) / 120,510 (max) | Records sealed commitment hash in Phase 1 (6 testnet samples) |
| `VerifierQuorum.revealVote` | 28,036 / **176,623** / 195,379 | **177,505** (median) / 194,605 (max) | Verifies and opens commitment in Phase 2 (Clean: 176,983; Fraud: 194,605) |
| `VerifierQuorum.finalize` | 25,896 / **147,105** / 305,234 | **127,850** (clean) / **248,504** (fraud) | Reaches 3-of-5 quorum consensus; opens challenge window on fraud quarantine |
| `Challenge.openChallenge` | 28,555 / **32,463** / 46,518 | **120,654** | Opens optimistic dispute window on quarantined batch |
| `Challenge.submitOperatorDispute` | 24,554 / **28,098** / 63,779 | **82,020** | Operator lodges dispute with verified Merkle proof (`0x0c28f6f6...`, Block 321585333) |
| `Challenge.resolve` (Arbiter Council) | 27,053 / **77,348** / 343,207 | **77,704** (vote 1) / **318,914** (resolution & slash) | Arbiter 1 reached 2-of-3 quorum: executes 50% operator bond slash (`0xac83b059...`, Block 321585388) |
| `BondVault.slashOperator` | 27,475 / **202,426** / 271,306 | *Called via `Challenge.resolve`* | Slashes 50% operator bond, distributes reward to verifiers and treasury |
| `Attestation.recordAttestation` | 34,181 / **34,584** / 281,715 | **281,626** | Records period EU CBAM Attestation Certificate linking verified Merkle roots (`0xe139990c...`, Block 321583085) |

#### $O(1)$ Constant Gas via Merkle Batching vs. Naive On-Chain Logging
- **Naive On-Chain Logging (Linear $O(N)$):** Logging each hourly telemetry packet individually on-chain requires $24 \times 179,843 = 4,316,232\text{ gas/day}$, and scales linearly to $179,843,000\text{ gas}$ for 1,000 packets.
- **VeriCEMS Merkle Batching ($O(1)$ Constant):** VeriCEMS aggregates an entire batch off-chain and anchors only the 32-byte cryptographic Merkle root into `BatchAnchor.anchorBatch`, requiring a constant **179,843 gas** on Arbitrum Sepolia whether the batch contains 8, 24, or 1,000 packets. This represents a **95.8% gas reduction** for a 24-hour batch ($4.32\text{M} \to 180\text{k}$) and **99.9% reduction** at scale, while enabling browser-side Merkle inclusion proof verification with zero server trust.
- **Economic Feasibility:** Per `AGENTS.md` honesty rules, gas prices and token prices are inputs (kept null in code). Illustratively, at 0.1 Gwei Arbitrum L2 gas price and ETH @ \$3,000, anchoring an hourly batch costs **\$0.054**, demonstrating strong economic viability for industrial compliance.

---

## 3. Data Integrity Assessment

This section presents the empirical validation of the cryptographic hash chain, Merkle inclusion proofs, and property-based test counts.

### 3.1 Hash-Chain Verification Results
Telemetry packets are signed at the edge and linked sequentially using:
$$\text{packet\_hash}_i = \text{SHA256}(\text{CanonicalJSON}(\text{packet}_i \setminus \{\text{signature}\}))$$
$$\text{packet}_i.\text{prev\_hash} = \text{packet\_hash}_{i-1} \quad (\text{with } \text{packet}_0.\text{prev\_hash} = 0^{32})$$

From [`results/security/golden_vectors_python.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/golden_vectors_python.txt) and [`results/security/python_crypto_tests.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/python_crypto_tests.txt):
- **Baseline Clean Chain:** 8 packets validated without error (`is_valid == True`, `problems == []`).
- **Chain 1 (Tampered Value):** Packet 4 CO₂ value modified from `104.200000` to `80.000000`. Detected immediately via `SIG_INVALID` and `CHAIN_BREAK`.
- **Chain 2 (Sequence Gap):** Packet 5 deleted (`seq` jumps from 4 to 6). Detected immediately via `SEQ_GAP` and `CHAIN_BREAK`.
- **Chain 3 (Replayed History):** Historical Packet 2 replayed at Packet 7. Detected immediately via `SEQ_REORDER`, `TIMESTAMP_REGRESSION`, and `CHAIN_BREAK`.

### 3.2 Merkle Tree and Odd-Node Promotion
VeriCEMS implements binary Merkle trees using sorted-pair Keccak-256 concatenation:
$$H(A, B) = \text{keccak256}(\min(A, B) \mathbin{\Vert} \max(A, B))$$
Per architectural decision **DECISION-04**, when a level has an odd number of nodes, the trailing odd node is promoted directly to the next level without duplicate hashing, matching standard OpenZeppelin `MerkleProof` verification semantics.

From [`results/security/golden_vectors_solidity.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/golden_vectors_solidity.txt) and [`results/security/golden_vectors_typescript.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/golden_vectors_typescript.txt):
- All 8 leaves of `baseline_clean` pass Merkle proof verification across Python, Solidity, and TypeScript.
- All 7 leaves of `chain_2_seq_gap` (odd node promotion test) pass Merkle proof verification across all three implementations, computing identical root `0x9c5a...`.
- Proofs for tampered leaves, altered packet hashes, altered roots, and injected siblings are deterministically rejected across all test cases.

### 3.3 Property-Based Testing Execution Counts
Using `hypothesis`, the Python crypto test suite ran 8 automated property campaigns with pinned deterministic seeds (`derandomize=True`).

From [`results/security/python_crypto_tests.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/python_crypto_tests.txt):

| Property Test Function | Invariant Tested | Random Examples Executed | Result |
|---|---|---|---|
| `test_prop_untouched_chain_always_verifies` | Every untouched chain produced by `build_hash_chain` verifies cleanly | 100 | **PASSED** |
| `test_prop_changing_any_single_field_is_detected` | Changing ANY single field (`device_id`, `seq`, `timestamp_utc`, values, `prev_hash`, `signature`) is detected | 120 | **PASSED** |
| `test_prop_deleting_any_packet_is_detected` | Deleting ANY packet from a chain is detected (`SEQ_GAP`, `CHAIN_BREAK`) | 100 | **PASSED** |
| `test_prop_duplicating_any_packet_is_detected` | Duplicating ANY packet is detected (`SEQ_DUPLICATE`, `CHAIN_BREAK`) | 100 | **PASSED** |
| `test_prop_reordering_packets_is_detected` | Reordering ANY packet sequence is detected (`SEQ_REORDER`, `CHAIN_BREAK`) | 100 | **PASSED** |
| `test_prop_replaying_historical_packets_is_detected` | Injecting historical packets later is detected (`SEQ_DUPLICATE`, `TIMESTAMP_REGRESSION`) | 100 | **PASSED** |
| `test_prop_timestamp_regression_with_valid_signatures` | Non-monotonic timestamps (even if freshly signed by device key) are detected | 80 | **PASSED** |
| `test_prop_merkle_proofs_verify_and_reject_any_tamper` | Merkle proofs verify for all leaves across any batch size and reject corrupted nodes | 100 | **PASSED** |
| **Total Property Runs** | **Sum across all 8 properties** | **800** | **PASSED** |

---

## 4. Findings and Disclosures Log

### 4.1 Slither Static Analysis Verification Summary
Automated static analysis was executed via Crytic Slither across all contracts (logged in [`results/slither.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/slither.txt) and [`results/security/slither.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/slither.txt)):
- **Analysis Scope:** 16 contracts analyzed with 102 active detectors.
- **Raw Results:** 32 findings identified across 8 detector types (0 High, 0 Critical unmitigated bugs).

| Slither Detector Type | Impact / Severity | Contract(s) & Function(s) | Finding Count | Slither Reference & Technical Assessment |
|---|---|---|:---:|---|
| `arbitrary-send-eth` | Low | `BondVault._safeTransferETH` | 1 | Destination address `to` is restricted to authenticated depositor/operator. Protected by `nonReentrant`. |
| `divide-before-multiply` | Low | `BondVault.slashOperator` | 1 | Deliberate integer truncation ensures rounding dust routes to treasury; verified by invariant tests. |
| `incorrect-equality` | Informational | `Attestation`, `BatchAnchor`, `Challenge`, `DeviceRegistry` | 6 | Strict equality checks against enum status (`BatchStatus.None`) and `attestationId == 0`. Idiomatic and safe. |
| `reentrancy-no-eth` | Low / Medium | `VerifierQuorum.finalize` | 1 | Mitigated: Protected by OpenZeppelin `ReentrancyGuard` and Checks-Effects-Interactions (CEI). |
| `calls-loop` | Low | `Attestation.recordAttestation`, `Challenge._executeOverturned`, `VerifierQuorum.finalize` | 5 | External calls inside loop. Committee size bounded by constant `MAX_VERIFIERS = 5`. No gas exhaustion risk. |
| `reentrancy-events` | Informational | `Challenge._executeOverturned`, `Challenge._executeUpheld`, `VerifierQuorum.finalize` | 3 | Events emitted after external calls. No reentrancy vector affecting state variables. |
| `timestamp` | Low | `Attestation`, `BatchAnchor`, `BondVault`, `Challenge`, `DeviceRegistry`, `VerifierQuorum` | 14 | Proof of Stake timestamp drift bounded by ~12 seconds. Challenge/commit windows are coarse (60s–7d). |
| `low-level-calls` | Informational | `BondVault._safeTransferETH` | 1 | Standard low-level `.call{value: amount}("")` pattern for native ETH transfers with reentrancy guard. |
| **Total Slither Results** | — | **All 6 production smart contracts** | **32** | **0 Critical / High unmitigated bugs** |

### 4.2 Comprehensive Findings and Disclosures Log
The table below catalogs all findings identified during static analysis, automated testing, and threat modeling, along with their resolution status and technical justification.

| Finding ID | Component | Severity | Description | Status | Rationale / Resolution |
|---|---|---|---|---|---|
| **SEC-01** | `VerifierQuorum.sol` | Medium | External call inside loop in `finalize()` calling `bondVault.slashVerifier()` flagged as potential reentrancy. | **FIXED** | Added OpenZeppelin `ReentrancyGuard` to `VerifierQuorum` and declared `finalize()` as `nonReentrant`. Emitted events and updated internal states (`batchFinalized`, `unrevealedPenalized`) before making external calls (Checks-Effects-Interactions). Re-verified in [`results/security/forge_test.txt`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/security/forge_test.txt). |
| **SEC-02** | `BondVault.sol` | Low | Slither `arbitrary-send-eth` warning on `_safeTransferETH(to, amount)`. | **ACCEPTED** | Intended pull-payment architecture. The destination address `to` is restricted to the recorded depositor or registered operator. All transfer entry points (`claimRewards`, `executeOperatorWithdraw`, `executeVerifierWithdraw`) decrement balances before transfer and use `nonReentrant`. |
| **SEC-03** | `BondVault.sol` | Low | Slither `divide-before-multiply` in `slashOperator()`. | **ACCEPTED** | Intentional integer truncation handling: `perVerifier = verifierRewardPool / count; distributedVerifierShare = perVerifier * count; treasuryShare = slashAmount - distributedVerifierShare;`. This ensures that rounding remainders are routed to the treasury and zero wei is created or leaked. Tested by `testFuzz_BondSlashAndRewardConservation` (256 runs). |
| **SEC-04** | All Contracts | Info | Slither `incorrect-equality` warnings on `status == BatchStatus.None`, etc. | **ACCEPTED** | Standard Solidity enum and identifier equality checks. Comparing enums and non-zero IDs (`attestationId == 0`) is idiomatic and safe. |
| **SEC-05** | `VerifierQuorum.sol`, `BondVault.sol`, `Challenge.sol` | Low | Slither `timestamp` dependency on `block.timestamp` for commit/reveal and challenge windows. | **ACCEPTED** | EVM validator timestamp manipulation is bounded by ~12 seconds under Proof of Stake. Quorum commit windows (1 hour), challenge windows (24 hours), and bond withdrawal delays (7 days) are coarse-grained enough that validator drift cannot subvert logic. |
| **SEC-06** | `VerifierQuorum.sol`, `Challenge.sol` | Low | External calls in loops over verifier addresses (`calls-loop`). | **ACCEPTED** | Committee size is strictly bounded by constant `MAX_VERIFIERS = 5`. The loop iterates at most 5 times, preventing unbounded gas exhaustion. |
| **SEC-07** | Gateway Architecture | High | Software emulation of secure element stores private key in host memory (`SoftwareSecureElement`). | **OPEN** | Architectural constraint of software prototype. Production deployments must bind key operations to a physical tamper-resistant chip (ATECC608, TPM 2.0) with bus encryption. |
| **SEC-08** | ML/Physics Detection | High | Coordinated insider fraud co-falsifying both CEMS stack gas and independent primary fuel delivery ledgers (Adaptive Attacker Scenario 8B). | **OPEN** | Documented honest limitation. When an attacker simultaneously doctors all correlated physical meters below the 3.5% noise floor, detection recall drops to 0.0% (see [`results/WHAT_STILL_GETS_THROUGH.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/WHAT_STILL_GETS_THROUGH.md)). |
| **SEC-09** | On-Chain Signature Curve | Medium | Ethereum L1/L2 lacking cheap native P-256 precompiles requires off-chain signature checks by verifier nodes. | **OPEN** | P-256 signatures are checked by verifiers off-chain. Future EVM upgrades incorporating RIP-7212 precompiles will allow direct on-chain dispute settlement via `ecrecover`-style P-256 verification. |
| **SEC-10** | Governance Centralization | Medium | Dispute resolution relies on a 2-of-3 arbiter council multisig. | **ACCEPTED** | Reflects the operational role of accredited certification bodies under EU CBAM regulation. The multisig serves as an explicit trust anchor for resolving complex engineering disputes. |

---

## 5. Key Management and Operational Assumptions

### 5.1 Edge Gateway Keys
- **Algorithm:** NIST P-256 (`secp256r1`) ECDSA with RFC 6979 deterministic $k$-generation and low-$S$ normalization ($S \le n/2$).
- **Lifecycle:** The gateway generates a key pair upon initial factory provisioning. The public key is registered on-chain via `DeviceRegistry.registerDevice(deviceId, pubKeyX, pubKeyY, operatorAddress)`.
- **Revocation & Rotation:** If a device is compromised, the operator or registry admin calls `DeviceRegistry.rotateKey` or `DeviceRegistry.revokeDevice`. Revocation permanently flips device status to `Revoked`. `BatchAnchor.anchorBatch` reverts if a revoked device attempts to anchor data.
- **Hardware Isolation:** In the hackathon prototype, keys reside in software memory via `SoftwareSecureElement.from_golden_test_key()`. Production deployments require hardware-backed secure storage.

### 5.2 Operator and Verifier Keys
- **Operator Account:** Holds the funds used to deposit operator bonds in `BondVault`. To prevent exit scams following fraudulent emissions reporting, bond withdrawals are subject to a mandatory 7-day delay (`withdrawalDelaySeconds = 604,800`). If a batch is challenged, all pending withdrawals for that installation are locked.
- **Verifier Committee Keys:** 5 verifiers hold independent EVM accounts. Each verifier must deposit a minimum stake (`verifierStakeRequired`). Verifiers that fail to reveal their commitments are slashed (`unrevealedPenaltyBps = 500`, or 5%). Verifiers that vote fraud on a batch that arbiters later prove honest are penalized (`carelessVerifierSlashBps = 1,000`, or 10%).

---

## 6. Data Confidentiality and Privacy Architecture

Industrial stack emissions and operating load (MW) are commercially sensitive: revealing hourly production rates on a public blockchain would disclose confidential factory throughput and dispatch margins to competitors.

VeriCEMS implements a strict off-chain/on-chain confidentiality separation:
1. **Raw Telemetry Stays Off-Chain:** Hourly raw packets containing gas concentrations, temperatures, MW load, and fuel consumption remain off-chain within the plant network and are transmitted only to authenticated verifier nodes over encrypted channels.
2. **On-Chain Footprint Limited to Fingerprints:** `BatchAnchor` records only the 32-byte Merkle root, the installation ID, and sequence bounds `[firstSeq, lastSeq]`. It is computationally infeasible to infer emissions rates or production levels from the 32-byte root alone.
3. **Period Aggregation:** `Attestation` publishes only aggregated quarterly figures (total tCO₂e and Specific Embedded Emissions SEE) necessary for EU CBAM declaration, preserving intra-day operational confidentiality.
4. **Zero-Leakage Browser Verification:** The EU importer portal verifies individual batches by obtaining Merkle proofs directly from the exporter or verifiers and checking them locally against the public on-chain root, without broadcasting raw hourly data to the blockchain.

---

## 7. What the System Does NOT Protect Against

In accordance with `AGENTS.md` honesty rules, the following attack vectors are explicitly outside the system's defensive scope:

1. **Pre-Sampling Analog Dilution:** If ambient air is physically piped into the flue duct upstream of the CEMS analyzer sampling port, the analyzer will measure genuinely diluted gas. Cryptographic signatures confirm the analyzer reported honestly, but cannot detect the physical deception unless stack O₂ stoichiometry departs from the combustion model envelope.
2. **Coordinated Multi-Source Insider Fraud (Adaptive Attacker 8B):** If plant management simultaneously falsifies CEMS analyzer telemetry and primary fuel delivery logs below the ~3.5% noise margin, the dual-source cross-check is bypassed, resulting in **0.0% detection recall**.
3. **Verifier Cartelization (≥ 3 Colluding Verifiers):** A 3-of-5 threshold quorum trusts that at least 3 verifiers act independently. If an adversary compromises 3 or more verifiers, they can finalize fraudulent batches without detection on-chain until human arbiters intervene.
4. **Hardware Extraction Prior to Revocation:** If an attacker physically extracts the private key from an edge gateway before the operator detects the breach and submits an on-chain `revokeDevice` transaction, the attacker can forge historical-looking batches that pass signature checks.

---

## 8. Future Work and Production Roadmap

The following enhancements are documented in `docs/FUTURE_WORK.md` and deferred to post-hackathon releases:
1. **Hardware Remote Attestation (TPM / DICE):** Integrating hardware TPM 2.0 / ATECC608 modules capable of generating signed DICE hardware quotes over gateway firmware measurements during device registration.
2. **Zero-Knowledge (ZK) Emissions Circuits:** Implementing Groth16 or Plonk ZK-SNARK circuits allowing plant operators to evidence that emissions satisfy CBAM thresholds without revealing proprietary fuel mass or gross load to off-chain verifiers.
3. **Restaking-Style Shared Verifier Security:** Leveraging restaking architectures (e.g., EigenLayer or Symbiotic) to draw verifier security from large pooled collateral, making verifier quorum corruption prohibitively expensive.
4. **EVM RIP-7212 Support:** Upgrading contracts to utilize the RIP-7212 precompile on supporting Layer-2 networks, enabling native, inexpensive on-chain P-256 signature verification during dispute arbitration.
5. **Physical CEMS Tamper Sensors:** Deploying optical stack seals and enclosure tamper switches wired into the secure element's hardware interrupt pins.
