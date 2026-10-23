# VeriCEMS Scalability & Sustainability Roadmap (`SCALABILITY_ROADMAP.md`)

> **Document Class:** Throughput Arithmetic, Measured Gas Economics & Architectural Scaling  
> **Source Baseline:** [`docs/VeriCEMS_Project_Guide.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/docs/VeriCEMS_Project_Guide.md) §6.2  
> **Empirical On-Chain Data:** [`results/gas_measured.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/gas_measured.json) (Arbitrum Sepolia, `Chain ID: 421614`)  
> **Honesty Rule:** Gas figures are strictly extracted from automated deployment benchmarks; financial costs are expressed as parameterizable formulas requiring operator inputs.

---

## 1. Scale Arithmetic & Data Volume

### 1.1 Raw Off-Chain Telemetry Volumes
Industrial CEMS analyzers typically sample at 1-minute intervals (60-second integration periods) to produce continuous emissions averages:
- **Records per installation per year:**
  $$365 \text{ days} \times 24 \text{ hours} \times 60 \text{ minutes} = 525,600 \text{ records/year}$$
- **Record payload size:** Each canonical JSON telemetry record (timestamp, sequence number, device ID, 7 sensor values, previous hash, and 64-byte ECDSA signature) measures approximately 150 bytes [ILLUSTRATIVE benchmark estimate; schema dependent].
- **Annual off-chain data volume:**
  $$525,600 \text{ records} \times 150 \text{ bytes} \approx 78.84 \text{ MB per installation per year}$$
- **Storage strategy:** All raw telemetry records remain completely **off-chain** in local plant archives, operator cloud storage, and verifier caches. For 10,000 global installations, annual storage totals approximately **788 GB/year**, which is easily accommodated on commodity enterprise storage.

---

## 2. On-Chain Gas Measurements & Cost Formulas

### 2.1 Real Measured Gas Consumption
Gas measurements were recorded across 20 automated testnet transactions deployed to Arbitrum Sepolia (`results/gas_measured.json`):

| Smart Contract Function | Sample Count | Minimum Gas | Median Gas | Maximum Gas | Operation Description |
|---|---:|---:|---:|---:|---|
| `BatchAnchor.anchorBatch` | 20 | 179,831 | **179,843** | 179,855 | Anchors 32-byte Merkle root + sequence range |
| `VerifierQuorum.commitVote` | 6 | 103,410 | **103,410** | 120,510 | Locks sealed vote commitment hash |
| `VerifierQuorum.revealVote` | 6 | 176,983 | **177,505** | 194,605 | Reveals unsealed vote, salt, and anomaly score |
| `VerifierQuorum.finalize` | 2 | 127,850 | **188,177** | 248,504 | Evaluates 3-of-5 matching threshold & finalizes batch |
| `Attestation.recordAttestation` | 1 | 281,626 | **281,626** | 281,626 | Mints period CBAM compliance certificate |
| `Challenge.openChallenge` | 1 | 120,654 | **120,654** | 120,654 | Initiates optimistic dispute on flagged fraud |
| `Challenge.submitOperatorDispute` | 1 | 82,020 | **82,020** | 82,020 | Logs operator counter-proof hash |
| `Challenge.resolve` | 2 | 77,704 | **198,309** | 318,914 | Arbiter resolves dispute; executes slashing |

### 2.2 Cost Formulas (Parameterizable Inputs)
Per `AGENTS.md` and `results/gas_measured.json`, on-chain costs fluctuate with market gas prices and token exchange rates. Costs must be calculated using user-supplied inputs:

$$\text{Transaction Cost (EUR)} = \left(\text{Gas Used} \times \text{Gas Price (Gwei)} \times 10^{-9}\right) \times \text{ETH/EUR Exchange Rate}$$

```
=============================================================================
INPUTS REQUIRED FOR COST EVALUATION:
  - Gas Price (Gwei): [USER INPUT: e.g., 0.1 Gwei on Arbitrum L2]
  - ETH/EUR Exchange Rate: [USER INPUT: e.g., €2,800 / ETH]
=============================================================================
```

#### Illustrative Cost Calculation [ILLUSTRATIVE]
*Assuming an illustrative Arbitrum L2 gas price of 0.1 Gwei and an illustrative ETH price of €2,800:*
- Cost per `anchorBatch`:
  $$179,843 \text{ gas} \times (0.1 \times 10^{-9}) \times 2,800 = \text{€}0.0504 \text{ per anchor}$$
- Cost per full 3-of-5 quorum cycle (1 anchor + 5 commits + 3 reveals + 1 finalize):
  $$\text{Total Gas} = 179,843 + (5 \times 103,410) + (3 \times 177,505) + 188,177 = 1,417,585 \text{ gas}$$
  $$\text{Quorum Cost} = 1,417,585 \times (0.1 \times 10^{-9}) \times 2,800 \approx \text{€}0.3969 \text{ per batch}$$

---

## 3. Throughput Arithmetic & Batching Architecture

### 3.1 Scenario Analysis: 10,000 Global Industrial Installations
If 10,000 industrial facilities participate globally in CBAM verification:

| Architecture Architecture | Anchors / Plant / Year | Total Network Anchors / Year | Average Writes / Second | Annual Gas per Installation | Scaling Characteristics & Trade-offs |
|---|---:|---:|---:|---:|---|
| **Base: Hourly Roots** | 8,760 | 87,600,000 | **~2.78 tx/s** | 1,575,424,680 gas | Standard L2 throughput. Provides fine-grained hourly audit granularity with zero delay. |
| **Option A: Daily Roots** | 365 | 3,650,000 | **~0.12 tx/s** | 65,642,695 gas | **24x reduction in on-chain writes.** Merkle proof depth increases from 6 to 11 levels (negligible client overhead). |
| **Option B: Batch-of-Batches Aggregator** | 1 (aggregated) | 8,760 (entire network) | **~0.0003 tx/s** | Shares root write | **Aggregates 10,000 installations into one on-chain root per hour.** Aggregator tree adds $\sim 14$ proof levels. Requires aggregator availability assumptions. |

### 3.2 Verifier Compute Scaling
- Each batch requires deterministic validation by the 5 committee nodes.
- At 10,000 installations with hourly batching, the network evaluates $10,000 \text{ batches} / 3,600 \text{ s} \approx 2.78 \text{ batch evaluations/sec}$.
- A single ONNX autoencoder inference pass on CPU requires **~1.2 ms** [results/benchmark_summary.json].
- Evaluating 2.78 batches per second consumes less than **1% of a single CPU core**, confirming that verifier nodes can operate on modest commodity cloud instances (e.g., 2 vCPU, 4GB RAM) with negligible hardware cost.

---

## 4. Sustainability & Blockchain Footprint

### 4.1 Proof-of-Stake & Layer-2 Energy Footprint
VeriCEMS operates on EVM Layer-2 rollups (Arbitrum Sepolia / Nitro architecture) and Proof-of-Stake consensus:
- **L1 vs L2 Efficiency:** Unlike deprecated Proof-of-Work networks, Ethereum Proof-of-Stake and Arbitrum Nitro rollups execute transactions with negligible electrical energy per operation.
- **Rollup Calldata Compression:** Arbitrum compresses transaction batches using Brotli before publishing to L1, minimizing Ethereum data blob footprint.
- **Measured Engineering Gas:** At **179,843 gas** per `anchorBatch` on Arbitrum Sepolia, 8,760 hourly anchors require **1.575 billion gas/year** per installation.
- **Energy Benchmark Reference:** Published empirical assessments of Ethereum PoS and Arbitrum L2 rollups (e.g., CCRI Crypto Carbon Research Institute order-of-magnitude estimates) bound energy consumption at $<0.01\text{ kWh}$ per L2 transaction (treated as a robust empirical upper bound rather than an immutable statutory constant).

VeriCEMS's annual on-chain operations consume a minute fraction of the carbon emissions generated by a single hour of operation at an industrial blast furnace.

---

## 5. Phased Scalability Roadmap

```
Phase 0 (Current)       Phase 1 (Production L2)    Phase 2 (Rollup Aggregator)   Phase 3 (App-Chain / Validium)
+-------------------+   +----------------------+   +--------------------------+  +-------------------------------+
| Arbitrum Sepolia  |-->| Arbitrum / Polygon L2|-->| Daily Batch-of-Batches   |->| Dedicated CBAM Validium       |
| Direct Batch Root |   | Hourly Anchors       |   | Aggregator Trees         |  | ZK-STARK State Transition     |
| 179,843 gas/batch |   | Packed Storage Slots |   | 24x-100x Gas Reduction   |  | Gas < 0.001 EUR / verification|
+-------------------+   +----------------------+   +--------------------------+  +-------------------------------+
```

### Phase 0: Hackathon Prototype (Current Milestone)
- Direct per-batch anchor submissions to Arbitrum Sepolia (`BatchAnchor.sol`).
- Measured base gas consumption: 179,843 gas per root anchor.

### Phase 1: Production L2 Deployment (Months 1–6)
- Deploy to production Arbitrum One or Polygon PoS.
- Storage optimization: Pack sequence bounds and timestamps into single 32-byte storage slots (`uint64 startSeq`, `uint64 endSeq`, `uint64 timestamp`), reducing `anchorBatch` gas by ~20,000 gas.

### Phase 2: Hierarchical Aggregator Tree (Months 7–18)
- Implement `AggregatorAnchor.sol` allowing an authorized operator consortium to commit a single multi-facility Merkle root covering up to 1,000 industrial installations simultaneously.
- Reduces network-wide L2 transactions by 100x while maintaining individual plant proof verifiability.

### Phase 3: Dedicated Environmental Validium / App-Rollup (Months 19+)
- Transition to a dedicated Validium or Celestia-backed rollup where raw packet state transitions are verified via recursive SNARKs or STARKs.
- Telemetry data availability is maintained across decentralized nodes with near-zero gas transaction fees.
