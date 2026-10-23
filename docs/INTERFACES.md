# VeriCEMS Shared Interfaces Specification (`INTERFACES.md`)

> **Status:** Locked v1.0.0 · **Source of truth for integration across:** `contracts/`, `backend/`, `ml/`, `web/`, `calculator/`  
> **Rules:** [`AGENTS.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/Agents.md) · **Guide:** [`VeriCEMS_Project_Guide.md`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/VeriCEMS_Project_Guide.md)

This document defines the canonical data formats, cryptographic hashing/signing rules, Merkle tree construction, commit-reveal encoding, period report schema, smart contract ABIs, and operational parameters for VeriCEMS. Every parallel implementation track (Solidity, Python backend/ML, TypeScript frontend, and CBAM calculator) must conform to these specifications and pass the golden test vectors in [`schemas/golden/golden_vectors.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/golden/golden_vectors.json).

---

## Summary of Design Decisions (`DECISION` Log)

Every design choice not fully fixed by the guide is explicitly logged below with its rationale:

- **DECISION-01 (Device Signature Curve & Encoding):** Off-chain packet signatures use deterministic **ECDSA over NIST P-256 (`secp256r1`)** with RFC 6979 deterministic $k$ and low-$S$ normalization ($s \le n / 2$), serialized as a 64-byte raw `0x`-prefixed lowercase hex string (`r || s`, 32 bytes each, big-endian). The public key is represented as an uncompressed 65-byte SEC1 point (`0x04 || x || y`).  
  *Reasoning:* Matches Guide Sections 4.4 and 13 (`cryptography` library ECDSA P-256, representing hardware secure elements such as the Microchip ATECC608). Low-$S$ normalization and RFC 6979 make signatures strictly deterministic and non-malleable for golden test vectors. Verifiers check P-256 signatures off-chain, avoiding high EVM gas costs on chains without RIP-7212 precompiles.
- **DECISION-02 (Deterministic Floating-Point Rule in Canonical JSON):** While stored/transmitted JSON packets carry standard JSON numbers in `values` (`{channel: number}`), when constructing the **Canonical JSON pre-image** for hashing, every floating-point value (and every numeric entry inside `values`) is formatted as a **fixed 6-decimal-place ASCII string** (`"0.000000"`, rounded half-to-even via `Decimal("0.000001")`) prior to UTF-8 serialization. Integer protocol fields (`seq`, `batch_id`, `verdict`, `score_bp`) remain base-10 JSON integers.  
  *Reasoning:* In standard JSON serializers, integer-valued floats serialize differently across runtimes (Python `json.dumps(310.0)` outputs `310.0`, whereas TypeScript `JSON.stringify(310.0)` outputs `310`). Converting channel floats to fixed 6-decimal strings (`"310.000000"`) in the canonical pre-image enforces byte-for-byte identical UTF-8 output across Python and TypeScript using standard library JSON serializers.
- **DECISION-03 (Pre-image of ECDSA P-256 Signature):** `packet_hash` is computed as `SHA-256(canonical_json_bytes(packet_without_signature))`. The ECDSA P-256 signature is computed using `packet_hash` (32 bytes) as the **prehashed SHA-256 digest** (equivalent to signing `canonical_json_bytes(packet_without_signature)` with `ECDSA(SHA256())`).  
  *Reasoning:* In FIPS 186-4 ECDSA with SHA-256, signing message $M$ hashes $M$ once with SHA-256 to obtain the 32-byte digest $e = \text{SHA256}(M)$ and signs $e$. Defining the signature over the 32-byte digest `packet_hash` (via `Prehashed(SHA256())` when passing `packet_hash` directly, or `ECDSA(SHA256())` when passing the canonical JSON bytes) avoids double-hashing and works natively with WebCrypto, OpenSSL, and hardware secure elements.
- **DECISION-04 (Merkle Proof Odd-Node Promotion Behavior):** When a tree level has an odd number of nodes ($2k + 1$ with $k \ge 1$), the final node at index $2k$ is promoted **unchanged** to the next level without self-hashing. For a leaf that is promoted at a given level, **no sibling hash is emitted** in the proof array for that level.  
  *Reasoning:* Because `MerkleProof.verify(proof, root, leaf)` in OpenZeppelin iteratively folds each sibling in `proof` using `Hashes.commutativeKeccak256`, omitting a sibling at any level where the node was promoted unchanged means OpenZeppelin's standard `MerkleProof.verify` verifies promoted nodes on-chain with zero custom contract logic.
- **DECISION-05 (Quorum Consensus & ABI Encoding Types):** In `VerifierQuorum`, the vote commitment is `keccak256(abi.encode(uint256 batchId, bytes32 modelHash, bytes32 inputHash, uint16 scoreBp, uint8 verdict, bytes32 salt))`. Quorum consensus (3-of-5) requires at least 3 revealed votes with matching `(modelHash, inputHash, verdict)`. Individual `scoreBp` values are recorded on-chain and emitted in events, and match identically when verifiers run deterministic CPU inference on the same batch, but quorum finality gates on `verdict` (`0 = clean`, `1 = fraud`).  
  *Reasoning:* `abi.encode` pads each of the 6 arguments to a 32-byte word (192 bytes total), which is trivial to construct identically in Solidity, Python, and TypeScript (`viem` `encodeAbiParameters`). Gating consensus on `(modelHash, inputHash, verdict)` strictly ensures safety even if future hardware platforms exhibit 1-bp rounding differences while preserving full score auditability.
- **DECISION-06 (Native Testnet Asset for Staking):** `BondVault` accepts native EVM currency (`msg.value` in wei, ETH/POL on local Anvil or L2 testnet) for operator bonds and verifier stakes, using pull-payment withdrawals and a mandatory withdrawal delay.  
  *Reasoning:* Eliminates ERC-20 `approve`/`transferFrom` UX friction in the live demo while exercising real value transfers, reentrancy guards, conservation-of-funds invariants, and slashing redistribution.

---

## 1. Channel Registry (`schemas/channels.json`)

The channel registry at [`schemas/channels.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/channels.json) defines every telemetry variable permitted inside a packet's `values` map.

### 1.1 Structure of a Channel Entry
Each item in the `channels` array is an object with:
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Snake-case key used in `packet.values`. Synthetic channels **must** start with `synthetic_`. |
| `unit` | `string` | Physical unit of measurement (`MW`, `mmBtu`, `short_tons`, `lb`, `pct_vol_dry`, `degC`, `kscfm`, `fraction_0_to_1`). |
| `source` | `"real" \| "synthetic"` | `"real"` for columns directly from US EPA CAMPD; `"synthetic"` for simulated channels. |
| `status` | `"DEFINED"` | Active and verified in the channel registry (`schemas/channels.json` and `docs/DATA_CARD.md`). |
| `campd_column` | `string \| null` | Exact CSV header in EPA CAMPD (`null` for synthetic channels). |
| `description` | `string` | Plain-English explanation of the physical signal and its role. |

### 1.2 Registered Channels Summary
| Channel Name | Unit | Source | Status | CAMPD Column |
|---|---|---|---|---|
| `gross_load_mw` | `MW` | `real` | `DEFINED` | `Gross Load (MW)` |
| `steam_load_1000_lb_hr` | `1000 lb/hr` | `real` | `DEFINED` | `Steam Load (1000 lb/hr)` |
| `heat_input_mmbtu` | `mmBtu` | `real` | `DEFINED` | `Heat Input (mmBtu)` |
| `co2_mass_short_tons` | `short_tons` | `real` | `DEFINED` | `CO2 Mass (short tons)` |
| `co2_rate_short_tons_mmbtu` | `short_tons/mmBtu` | `real` | `DEFINED` | `CO2 Rate (short tons/mmBtu)` |
| `so2_mass_lbs` | `lb` | `real` | `DEFINED` | `SO2 Mass (lbs)` |
| `nox_mass_lbs` | `lb` | `real` | `DEFINED` | `NOx Mass (lbs)` |
| `op_time_fraction` | `fraction_0_to_1` | `real` | `DEFINED` | `Operating Time` |
| `synthetic_stack_o2_pct` | `pct_vol_dry` | `synthetic` | `DEFINED` | `null` |
| `synthetic_flue_temp_c` | `degC` | `synthetic` | `DEFINED` | `null` |
| `synthetic_stack_flow_kscfm` | `kscfm` | `synthetic` | `DEFINED` | `null` |
| `synthetic_fuel_flow_mmbtu_indep` | `mmBtu` | `synthetic` | `DEFINED` | `null` |

---

## 2. Packet Format (`schemas/packet.schema.json`)

Schema file: [`schemas/packet.schema.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/packet.schema.json)

### 2.1 JSON Structure
```json
{
  "device_id": "DEV-STEEL-001",
  "seq": 0,
  "timestamp_utc": "2026-07-01T00:00:00Z",
  "values": {
    "co2_mass_short_tons": 295.4,
    "gross_load_mw": 310.0,
    "heat_input_mmbtu": 2880.5,
    "synthetic_flue_temp_c": 148.2,
    "synthetic_fuel_flow_mmbtu_indep": 2879.1,
    "synthetic_stack_flow_kscfm": 845.0,
    "synthetic_stack_o2_pct": 4.2
  },
  "prev_hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "signature": "0x..."
}
```

### 2.2 Field & Cryptographic Rules
1. **`device_id`**: ASCII alphanumeric string (`^[A-Za-z0-9_-]+$`, 1..64 chars) matching a device registered in `DeviceRegistry`.
2. **`seq`**: 0-indexed integer (`0, 1, 2, ...`). A valid gapless chain satisfies `packet[i].seq == packet[i-1].seq + 1`.
3. **`timestamp_utc`**: ISO-8601 UTC string in whole seconds (`YYYY-MM-DDTHH:MM:SSZ`).
4. **`values`**: Object mapping channel names to JSON numbers (`float` or `int`).
5. **`packet_hash` computation**:
   - Construct a copy of the packet object **without** the `"signature"` key (retaining `"device_id"`, `"seq"`, `"timestamp_utc"`, `"values"`, `"prev_hash"`).
   - Serialize that object to **Canonical JSON bytes** (Section 3).
   - Compute `SHA-256` over those UTF-8 bytes.
   - Format as `"0x"` followed by 64 lowercase hexadecimal characters (`32 bytes`).
6. **`prev_hash` rule**:
   - For the genesis packet (`seq == 0`), `prev_hash` **must** equal 32 zero bytes:  
     `"0x0000000000000000000000000000000000000000000000000000000000000000"`.
   - For every subsequent packet (`seq > 0`), `packet[i].prev_hash` **must** equal `packet_hash(packet[i - 1])`.
7. **`signature` rule (DECISION-01, DECISION-03)**:
   - Algorithm: Deterministic ECDSA over NIST P-256 (`secp256r1`, curve order $n = \text{0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551}$) using RFC 6979 with SHA-256.
   - Digest signed: the 32-byte `packet_hash` (as a prehashed SHA-256 digest, which is identical to signing the canonical JSON bytes once with `ECDSA(SHA256())`).
   - Low-$S$ normalization: if $s > n / 2$, replace $s \leftarrow n - s$.
   - Encoding: `"0x"` + 64-char lowercase hex of $r$ (big-endian, zero-padded to 32 bytes) + 64-char lowercase hex of $s$ (big-endian, zero-padded to 32 bytes), totaling 130 characters (`64 bytes`).

---

## 3. Canonical JSON Specification

To enforce identical hashes across Python (`backend/`, `ml/`), TypeScript (`web/`), and test harnesses:

1. **Character Encoding:** UTF-8 without Byte Order Mark (BOM). Non-ASCII characters (if any) must be serialized as literal UTF-8 bytes (`ensure_ascii=False`), though all protocol identifiers and keys are strict ASCII.
2. **Key Ordering:** Every JSON object at every nesting depth (both the top-level packet object and the nested `values` object) has its keys sorted in ascending lexicographical UTF-8 code-point order (`sort_keys=True`).
3. **No Whitespace:** No spaces, tabs, or newlines outside string literals. Item separator is `","` (`0x2c`) and key-value separator is `":"` (`0x3a`).
4. **Deterministic Number Formatting (DECISION-02):**
   - **Integers** (`seq`, `batch_id`, `first_seq`, `last_seq`, `count`, `score_bp`, `verdict`): formatted as base-10 integer literals with no leading zeros and no decimal point (e.g., `0`, `7`, `10000`).
   - **Floating-point values** (every numeric entry inside `packet.values`): in the **canonical pre-image**, each number $v$ is converted to a **fixed 6-decimal-place string** (`"0.000000"`) using round-half-to-even (`Decimal(str(v)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)`).
5. **Example Canonical JSON Pre-image for a Packet (without `signature`):**
   ```json
   {"device_id":"DEV-STEEL-001","prev_hash":"0x0000000000000000000000000000000000000000000000000000000000000000","seq":0,"timestamp_utc":"2026-07-01T00:00:00Z","values":{"co2_mass_short_tons":"295.400000","gross_load_mw":"310.000000","heat_input_mmbtu":"2880.500000","synthetic_flue_temp_c":"148.200000","synthetic_fuel_flow_mmbtu_indep":"2879.100000","synthetic_stack_flow_kscfm":"845.000000","synthetic_stack_o2_pct":"4.200000"}}
   ```
6. **Reference Implementation (Python & TypeScript):**
   - **Python:**
     ```python
     from decimal import Decimal, ROUND_HALF_EVEN
     import json

     def format_float_6(val: int | float | Decimal) -> str:
         d = Decimal(str(val)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
         return f"{d:.6f}"

     def canonical_packet_bytes(packet: dict) -> bytes:
         preimage = {
             "device_id": str(packet["device_id"]),
             "prev_hash": str(packet["prev_hash"]),
             "seq": int(packet["seq"]),
             "timestamp_utc": str(packet["timestamp_utc"]),
             "values": {
                 str(k): format_float_6(v)
                 for k, v in packet["values"].items()
             },
         }
         return json.dumps(preimage, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
     ```
   - **TypeScript:**
     ```ts
     export function canonicalPacketBytes(packet: Omit<Packet, "signature">): Uint8Array {
       const sortedValues: Record<string, string> = {};
       for (const key of Object.keys(packet.values).sort()) {
         sortedValues[key] = packet.values[key].toFixed(6);
       }
       const preimage = {
         device_id: packet.device_id,
         prev_hash: packet.prev_hash,
         seq: packet.seq,
         timestamp_utc: packet.timestamp_utc,
         values: sortedValues,
       };
       return new TextEncoder().encode(JSON.stringify(preimage));
     }
     ```

---

## 4. Merkle Tree & Proof Rules

VeriCEMS batches telemetry packets into a binary Merkle tree whose root is anchored on-chain in `BatchAnchor` and verified using OpenZeppelin's `MerkleProof.verify`.

1. **Hash Primitive:** Original Ethereum `keccak256` (Keccak-256 with `0x01` domain padding, **not** NIST FIPS-202 SHA3-256 which uses `0x06` padding).
2. **Leaf Construction:**
   - Given the 32-byte binary `packet_hash` of packet $i$ in the batch:
     $$\text{leaf}_i = \text{keccak256}(\text{bytes32}(\text{packet\_hash}_i))$$
   - Note: `packet_hash` is already a 32-byte SHA-256 digest; hashing it once with `keccak256` produces a 32-byte domain-separated leaf compatible with Solidity `keccak256(abi.encodePacked(packetHash))`.
3. **Internal Node Construction (OpenZeppelin Compatible):**
   - For two adjacent child nodes $a$ and $b$ at level $L$ (indices $2j$ and $2j+1$), compare their 32-byte big-endian unsigned integer values (equivalently, unsigned byte-by-byte comparison):
     $$\text{parent}(a, b) = \begin{cases} \text{keccak256}(a \parallel b) & \text{if } a \le b \\ \text{keccak256}(b \parallel a) & \text{if } a > b \end{cases}$$
4. **Odd Node Promotion Rule (DECISION-04):**
   - If a level has an odd number of nodes $m = 2k + 1$:
     - If $m == 1$ at the root, that single node is the `merkle_root`. (If a batch has only 1 packet, `merkle_root = leaf_0`).
     - If $m > 1$, the first $2k$ nodes are paired into $k$ parent nodes $(0,1), (2,3), \dots, (2k-2, 2k-1)$, and the unpaired last node at index $2k$ is **promoted unchanged** to become index $k$ of the next level.
5. **Merkle Proof Format:**
   ```json
   {
     "leaf_index": 2,
     "packet_hash": "0x...",
     "leaf_hash": "0x...",
     "siblings": [
       "0x...",
       "0x..."
     ],
     "merkle_root": "0x..."
   }
   ```
   - `siblings` is an ordered array of `0x`-prefixed 32-byte hex hashes from bottom (leaf level) to top.
   - If the node along the path is the odd trailing node at level $L$ (promoted unchanged), **no sibling is added** for level $L$.
   - Verification algorithm (identical to OpenZeppelin `MerkleProof.processProof(siblings, leaf_hash)`):
     ```python
     computed = leaf_hash_bytes
     for sibling in siblings:
         computed = keccak256(min(computed, sibling) + max(computed, sibling))
     assert computed == merkle_root_bytes
     ```

---

## 5. Batch Object (`schemas/batch.schema.json`)

Schema file: [`schemas/batch.schema.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/batch.schema.json)

```json
{
  "device_id": "DEV-STEEL-001",
  "batch_id": 1,
  "first_seq": 0,
  "last_seq": 7,
  "count": 8,
  "merkle_root": "0x...",
  "created_at": "2026-07-01T00:00:08Z"
}
```

| Field | Type | Rule |
|---|---|---|
| `device_id` | `string` | Registered device ID (`1..64` chars). |
| `batch_id` | `integer` | Monotonically increasing batch ID (`uint256` on-chain). |
| `first_seq` | `integer` | `seq` of the first packet in the batch (`packets[0].seq`). |
| `last_seq` | `integer` | `seq` of the last packet in the batch (`packets[-1].seq`). For a valid gapless batch, `last_seq == first_seq + count - 1`. |
| `count` | `integer` | Number of packets in the batch (`len(packets) >= 1`). |
| `merkle_root` | `string` | `0x`-prefixed 64-hex-char `keccak256` Merkle root computed per Section 4. |
| `created_at` | `string` | ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`). |

---

## 6. Verdict and Vote (`schemas/verdict.schema.json`)

Schema file: [`schemas/verdict.schema.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/verdict.schema.json)

### 6.1 Verdict & Score Rules
- **`verdict`**: Integer enum:
  - `0` = **clean** (batch passes all cryptographic, physics, and ML checks)
  - `1` = **fraud** (batch fails one or more checks and must be quarantined)
- **`score_bp`**: Integer anomaly score in **basis points** (`0..10000`, where `0` = `0.00%` anomaly score and `10000` = `100.00%` anomaly score). Floating-point anomaly scores $s \in [0.0, 1.0]$ are quantized via `min(10000, max(0, int(round(s * 10000))))`.
- **`reason_codes`**: Array of zero or more strings from the canonical 8-code enum:

| Reason Code | Layer | Trigger Condition |
|---|---|---|
| `CHAIN_BREAK` | Cryptographic | `packet[i].prev_hash != packet_hash(packet[i - 1])` (or non-zero genesis `prev_hash`). |
| `SEQ_GAP` | Cryptographic | `packet[i].seq != packet[i - 1].seq + 1` (dropped, duplicated, or replayed sequence number). |
| `SIG_INVALID` | Cryptographic | ECDSA P-256 signature verification against registered device public key fails. |
| `PHYSICS_RESIDUAL` | Physics | Combustion mass-balance residual (reported $\text{CO}_2$ vs. heat input $\times$ fuel emission factor, or load co-movement) exceeds threshold. |
| `AE_RESIDUAL` | ML | Physics-informed autoencoder reconstruction error exceeds calibrated threshold. |
| `SPECTRAL_FLAT` | Signal / FFT | Near-zero variance or abnormal high-frequency power drop indicating flatline tamper. |
| `SPECTRAL_REPEAT` | Signal / FFT | Autocorrelation / spectral periodicity spike indicating replayed historical window. |
| `CROSS_SOURCE_MISMATCH` | Cross-Check | Reported heat input diverges from independent fuel meter (`synthetic_fuel_flow_mmbtu_indep`) or stack flow consistency. |

### 6.2 Vote Commitment Formula (DECISION-05)
During the commit phase of `VerifierQuorum`, each verifier submits:
$$\text{vote\_commitment} = \text{keccak256}\big(\text{abi.encode}(\text{batch\_id}, \text{model\_hash}, \text{input\_hash}, \text{score\_bp}, \text{verdict}, \text{salt})\big)$$

Exact ABI types and byte layout (6 static 32-byte words = **192 bytes** total):
| Word # | Byte Offset | Parameter | Solidity Type | Encoding in 32-byte Word |
|---|---|---|---|---|
| 0 | `0..31` | `batch_id` | `uint256` | Big-endian unsigned 256-bit integer |
| 1 | `32..63` | `model_hash` | `bytes32` | Raw 32 bytes |
| 2 | `64..95` | `input_hash` | `bytes32` | Raw 32 bytes (equals batch `merkle_root`) |
| 3 | `96..127` | `score_bp` | `uint16` | Left-padded with 30 zero bytes + 2-byte big-endian `uint16` (`0..10000`) |
| 4 | `128..159` | `verdict` | `uint8` | Left-padded with 31 zero bytes + 1-byte `uint8` (`0` or `1`) |
| 5 | `160..191` | `salt` | `bytes32` | Raw 32 bytes |

---

## 7. Period Report JSON (`schemas/report.schema.json`)

Schema file: [`schemas/report.schema.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/schemas/report.schema.json)

> **Honesty Rule (`AGENTS.md` Rule 5):** The report JSON **must** contain `"cbam_aligned": true` and **must never** contain the word `"official"` anywhere in keys, values, or descriptions.

```json
{
  "report_version": "1.0.0",
  "cbam_aligned": true,
  "installation_id": "INST-IND-STEEL-01",
  "device_id": "DEV-STEEL-001",
  "period": {
    "label": "2026-Q3",
    "start_utc": "2026-07-01T00:00:00Z",
    "end_utc": "2026-07-01T00:00:16Z"
  },
  "totals": {
    "verified_emissions_tco2e": 950.0,
    "production_tonnes": 500.0,
    "specific_embedded_emissions_tco2e_per_t": 1.9,
    "heat_input_mmbtu": 9200.0
  },
  "coverage": {
    "total_batches": 2,
    "verified_batches": 1,
    "quarantined_batches_count": 1,
    "coverage_bp": 5000
  },
  "quarantined_batches": [
    {
      "batch_id": 2,
      "first_seq": 8,
      "last_seq": 15,
      "merkle_root": "0x...",
      "reason_codes": ["CHAIN_BREAK", "PHYSICS_RESIDUAL"],
      "challenge_status": "UPHELD_SLASHED"
    }
  ],
  "merkle_roots": [
    "0x..."
  ],
  "transaction_hashes": {
    "batch_anchors": [
      "0x..."
    ],
    "attestation_tx": "0x..."
  },
  "attestation_id": 1
}
```

---

## 8. Smart Contract Interfaces (Solidity 0.8.24+)

All six contracts use custom errors, emit indexed events, include NatSpec on all public/external functions, forbid upgradeable proxies, and enforce role-based access control.

### 8.1 Shared Types & Roles
- `bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");`
- `bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");`
- `bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");`
- `bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");`
- `deviceId` and `installationId` on-chain are represented as `bytes32` (`keccak256(bytes(stringId))` or right-padded ASCII `bytes32`; **Rule:** all on-chain `deviceId` and `installationId` values are computed as `keccak256(utf8Bytes(string_id))` so arbitrary-length ASCII IDs map deterministically to `bytes32`).

---

### 8.2 `DeviceRegistry.sol`
Manages CEMS edge gateway device identities, uncompressed P-256 public keys (`65 bytes`), operator ownership, and lifecycle status.

- **Enums & Structs:**
  ```solidity
  enum DeviceStatus { Unregistered, Active, Revoked }

  struct DeviceInfo {
      bytes32 installationId;
      address operator;
      bytes pubKeyP256;      // 65-byte uncompressed SEC1 P-256 key (0x04 || X || Y)
      DeviceStatus status;
      uint64 registeredAt;
      uint64 updatedAt;
  }
  ```
- **Functions:**
  - `function registerDevice(bytes32 deviceId, bytes32 installationId, address operator, bytes calldata pubKeyP256) external`
  - `function rotateKey(bytes32 deviceId, bytes calldata newPubKeyP256) external`
  - `function revokeDevice(bytes32 deviceId, string calldata reason) external`
  - `function getDevice(bytes32 deviceId) external view returns (DeviceInfo memory)`
  - `function isDeviceActive(bytes32 deviceId) external view returns (bool)`
- **Events:**
  - `event DeviceRegistered(bytes32 indexed deviceId, bytes32 indexed installationId, address indexed operator, bytes pubKeyP256);`
  - `event DeviceKeyRotated(bytes32 indexed deviceId, bytes oldPubKeyP256, bytes newPubKeyP256);`
  - `event DeviceRevoked(bytes32 indexed deviceId, address indexed revokedBy, string reason);`
- **Roles:**
  - `registerDevice`: `ADMIN_ROLE` or self-registration by `operator` when `msg.sender == operator`
  - `rotateKey`: `operator` of `deviceId` or `ADMIN_ROLE`
  - `revokeDevice`: `operator` of `deviceId` or `ADMIN_ROLE`
- **Revert Conditions (Custom Errors):**
  - `error DeviceAlreadyRegistered(bytes32 deviceId);`
  - `error DeviceNotFound(bytes32 deviceId);`
  - `error DeviceNotActive(bytes32 deviceId);`
  - `error InvalidPublicKeyLength(uint256 length);` (reverts unless `pubKeyP256.length == 65 && pubKeyP256[0] == 0x04`)
  - `error UnauthorizedCaller(address caller);`
  - `error ZeroAddress();`

---

### 8.3 `BondVault.sol`
Holds operator bonds (keyed by `installationId`) and verifier stakes (keyed by verifier `address`), enforces withdrawal delays, and executes slashing/rewards using a pull-payment pattern (`claimRewards`).

- **Functions:**
  - `function depositOperatorBond(bytes32 installationId) external payable`
  - `function depositVerifierStake() external payable`
  - `function requestOperatorWithdraw(bytes32 installationId, uint256 amount) external`
  - `function executeOperatorWithdraw(bytes32 installationId) external`
  - `function requestVerifierWithdraw(uint256 amount) external`
  - `function executeVerifierWithdraw() external`
  - `function slashOperator(bytes32 installationId, uint256 slashAmount, address[] calldata honestVerifiers, address treasury) external`
  - `function slashVerifier(address verifier, uint256 slashAmount, address recipient) external`
  - `function claimRewards() external`
  - `function operatorBondOf(bytes32 installationId) external view returns (uint256)`
  - `function verifierStakeOf(address verifier) external view returns (uint256)`
  - `function hasSufficientOperatorBond(bytes32 installationId) external view returns (bool)`
  - `function hasSufficientVerifierStake(address verifier) external view returns (bool)`
- **Events:**
  - `event OperatorBondDeposited(bytes32 indexed installationId, address indexed depositor, uint256 amount, uint256 newBalance);`
  - `event VerifierStakeDeposited(address indexed verifier, uint256 amount, uint256 newBalance);`
  - `event WithdrawalRequested(address indexed account, bytes32 indexed installationId, uint256 amount, uint64 unlockTimestamp);`
  - `event WithdrawalExecuted(address indexed account, bytes32 indexed installationId, uint256 amount);`
  - `event OperatorSlashed(bytes32 indexed installationId, uint256 slashAmount, uint256 verifierRewardShare, uint256 treasuryShare);`
  - `event VerifierSlashed(address indexed verifier, uint256 slashAmount, address indexed recipient);`
  - `event RewardsClaimed(address indexed recipient, uint256 amount);`
- **Roles:**
  - `depositOperatorBond`: anyone (typically operator)
  - `requestOperatorWithdraw` / `executeOperatorWithdraw`: registered operator of `installationId`
  - `slashOperator` / `slashVerifier`: only authorized `Challenge` contract (`CHALLENGE_CONTRACT_ROLE`)
- **Revert Conditions (Custom Errors):**
  - `error ZeroDeposit();`
  - `error InsufficientBondBalance(uint256 available, uint256 requested);`
  - `error WithdrawalDelayNotElapsed(uint64 currentTimestamp, uint64 unlockTimestamp);`
  - `error NoPendingWithdrawal();`
  - `error ActiveChallengeBlocksWithdrawal(bytes32 installationId);`
  - `error NothingToClaim();`
  - `error TransferFailed();`
  - `error UnauthorizedCaller(address caller);`

---

### 8.4 `BatchAnchor.sol`
Anchors 32-byte batch Merkle roots and enforces strictly contiguous sequence numbers per `deviceId`.

- **Enums & Structs:**
  ```solidity
  enum BatchStatus { None, Anchored, Verified, Quarantined, Slashed, Cleared }

  struct BatchRecord {
      uint256 batchId;
      bytes32 deviceId;
      bytes32 installationId;
      bytes32 merkleRoot;
      uint64 firstSeq;
      uint64 lastSeq;
      uint32 count;
      uint64 anchoredAt;
      BatchStatus status;
  }
  ```
- **Functions:**
  - `function anchorBatch(bytes32 deviceId, bytes32 merkleRoot, uint64 firstSeq, uint64 lastSeq, uint32 count) external returns (uint256 batchId)`
  - `function updateBatchStatus(uint256 batchId, BatchStatus newStatus) external`
  - `function getBatch(uint256 batchId) external view returns (BatchRecord memory)`
  - `function verifyPacketInclusion(uint256 batchId, bytes32 packetHash, bytes32[] calldata siblings) external view returns (bool)`
- **Events:**
  - `event BatchAnchored(uint256 indexed batchId, bytes32 indexed deviceId, bytes32 indexed installationId, bytes32 merkleRoot, uint64 firstSeq, uint64 lastSeq, uint32 count);`
  - `event BatchStatusUpdated(uint256 indexed batchId, BatchStatus oldStatus, BatchStatus newStatus);`
- **Roles:**
  - `anchorBatch`: registered `operator` of an active `deviceId` whose `installationId` holds at least `minOperatorBond` in `BondVault`
  - `updateBatchStatus`: authorized `VerifierQuorum` or `Challenge` contract
- **Revert Conditions (Custom Errors):**
  - `error DeviceNotActive(bytes32 deviceId);`
  - `error InsufficientOperatorBond(bytes32 installationId);`
  - `error InvalidSequenceRange(uint64 expectedFirstSeq, uint64 actualFirstSeq, uint64 lastSeq, uint32 count);`
  - `error EmptyMerkleRoot();`
  - `error BatchNotFound(uint256 batchId);`
  - `error InvalidStatusTransition(BatchStatus current, BatchStatus requested);`
  - `error UnauthorizedCaller(address caller);`

---

### 8.5 `VerifierQuorum.sol`
Manages the 5-verifier committee and two-phase commit-reveal voting on anchored batches.

- **Enums & Structs:**
  ```solidity
  enum Verdict { Clean, Fraud } // 0 = Clean, 1 = Fraud

  struct RevealedVote {
      address verifier;
      bytes32 modelHash;
      bytes32 inputHash;
      uint16 scoreBp;
      Verdict verdict;
      bool revealed;
  }
  ```
- **Functions:**
  - `function commitVote(uint256 batchId, bytes32 commitment) external`
  - `function revealVote(uint256 batchId, bytes32 modelHash, bytes32 inputHash, uint16 scoreBp, Verdict verdict, bytes32 salt, string calldata reasonCodesCsv) external`
  - `function finalize(uint256 batchId) external`
  - `function getVote(uint256 batchId, address verifier) external view returns (RevealedVote memory)`
  - `function getBatchVerifiers(uint256 batchId, Verdict verdict) external view returns (address[] memory)`
- **Events:**
  - `event VoteCommitted(uint256 indexed batchId, address indexed verifier, bytes32 commitment);`
  - `event VoteRevealed(uint256 indexed batchId, address indexed verifier, bytes32 modelHash, bytes32 inputHash, uint16 scoreBp, Verdict verdict, string reasonCodesCsv);`
  - `event QuorumFinalized(uint256 indexed batchId, Verdict winningVerdict, uint8 matchingVotes, bytes32 evidenceHash);`
- **Roles:**
  - `commitVote` / `revealVote`: registered `VERIFIER_ROLE` with active stake in `BondVault`
  - `finalize`: anyone once 3 matching votes are revealed or reveal window expires
- **Revert Conditions (Custom Errors):**
  - `error NotRegisteredVerifier(address caller);`
  - `error InsufficientVerifierStake(address verifier);`
  - `error CommitWindowClosed(uint256 batchId);`
  - `error CommitWindowStillOpen(uint256 batchId);`
  - `error RevealWindowClosed(uint256 batchId);`
  - `error AlreadyCommitted(uint256 batchId, address verifier);`
  - `error CommitmentMismatch(bytes32 expected, bytes32 actual);`
  - `error InvalidScoreBp(uint16 scoreBp);` (reverts if `scoreBp > 10000`)
  - `error InputHashMismatch(bytes32 expectedMerkleRoot, bytes32 providedInputHash);`
  - `error QuorumNotReached(uint256 batchId);`
  - `error BatchAlreadyFinalized(uint256 batchId);`

---

### 8.6 `Challenge.sol`
Manages the optimistic challenge window for quarantined batches, operator disputes, multisig arbiter resolution, and settlement triggers to `BondVault`.

- **Enums & Structs:**
  ```solidity
  enum ChallengeStatus { None, Open, DisputedByOperator, UpheldSlashed, OverturnedCleared, ExpiredSlashed }

  struct ChallengeRecord {
      uint256 batchId;
      bytes32 installationId;
      bytes32 evidenceHash;
      bytes32 operatorDisputeHash;
      uint64 windowClosesAt;
      ChallengeStatus status;
  }
  ```
- **Functions:**
  - `function openChallenge(uint256 batchId, bytes32 evidenceHash) external`
  - `function submitOperatorDispute(uint256 batchId, bytes32 disputeEvidenceHash, string calldata explanationUri) external`
  - `function resolve(uint256 batchId, bool upholdFraudFlag, string calldata resolutionNotes) external`
  - `function settleExpired(uint256 batchId) external`
  - `function getChallenge(uint256 batchId) external view returns (ChallengeRecord memory)`
- **Events:**
  - `event ChallengeOpened(uint256 indexed batchId, bytes32 indexed installationId, bytes32 evidenceHash, uint64 windowClosesAt);`
  - `event OperatorDisputeSubmitted(uint256 indexed batchId, address indexed operator, bytes32 disputeEvidenceHash, string explanationUri);`
  - `event ChallengeResolved(uint256 indexed batchId, bool fraudUpheld, address indexed arbiter, string resolutionNotes);`
  - `event ChallengeSettled(uint256 indexed batchId, ChallengeStatus finalStatus, uint256 slashedAmount);`
- **Roles:**
  - `openChallenge`: called automatically by `VerifierQuorum` upon a 3-of-5 `Fraud` quorum (or by `VERIFIER_ROLE`)
  - `submitOperatorDispute`: registered `operator` of the batch's installation before `windowClosesAt`
  - `resolve`: `ARBITER_ROLE` (multisig arbiter)
  - `settleExpired`: anyone after `block.timestamp >= windowClosesAt` when operator did not dispute
- **Revert Conditions (Custom Errors):**
  - `error ChallengeAlreadyExists(uint256 batchId);`
  - `error ChallengeNotFound(uint256 batchId);`
  - `error ChallengeWindowExpired(uint256 batchId, uint64 windowClosesAt);`
  - `error ChallengeWindowStillOpen(uint256 batchId, uint64 windowClosesAt);`
  - `error ChallengeAlreadySettled(uint256 batchId);`
  - `error UnauthorizedCaller(address caller);`

---

### 8.7 `Attestation.sol`
Records period-end CBAM-aligned installation attestations linking total verified emissions ($t\text{CO}_2\text{e}$), production mass, coverage basis points, and an aggregated root of accepted batch roots.

- **Structs:**
  ```solidity
  struct PeriodAttestation {
      uint256 attestationId;
      bytes32 installationId;
      string periodLabel;
      uint256 totalEmissionsKgCo2e; // integer kg CO2e (1 tCO2e = 1000 kg) for fixed-point precision
      uint256 productionKg;         // integer kg product mass
      uint16 coverageBp;            // 0..10000 basis points
      bytes32 periodMerkleRoot;     // Merkle root over the period's verified batch merkleRoots
      uint64 attestedAt;
      address attestedBy;
  }
  ```
- **Functions:**
  - `function recordAttestation(bytes32 installationId, string calldata periodLabel, uint256 totalEmissionsKgCo2e, uint256 productionKg, uint16 coverageBp, bytes32 periodMerkleRoot, uint256[] calldata verifiedBatchIds) external returns (uint256 attestationId)`
  - `function getAttestation(uint256 attestationId) external view returns (PeriodAttestation memory)`
- **Events:**
  - `event AttestationRecorded(uint256 indexed attestationId, bytes32 indexed installationId, string periodLabel, uint256 totalEmissionsKgCo2e, uint256 productionKg, uint16 coverageBp, bytes32 periodMerkleRoot);`
- **Roles:**
  - `recordAttestation`: `OPERATOR_ROLE` or `ADMIN_ROLE` (contract verifies that every batch in `verifiedBatchIds` belongs to `installationId` and has status `Verified` or `Cleared` in `BatchAnchor`)
- **Revert Conditions (Custom Errors):**
  - `error EmptyBatchList();`
  - `error BatchNotVerified(uint256 batchId);`
  - `error InstallationMismatch(uint256 batchId, bytes32 expectedInstallation, bytes32 actualInstallation);`
  - `error InvalidCoverageBp(uint16 coverageBp);`
  - `error ZeroProductionMass();`
  - `error UnauthorizedCaller(address caller);`

---

## 9. System Parameters (`config/params.yaml`)

Configuration file: [`config/params.yaml`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/config/params.yaml)

| Parameter | `demo` Profile | `benchmark` Profile | Real-World Production Target (in comments) |
|---|---|---|---|
| `batch_size_packets` | `8` | `24` | `60` (1-min readings over 1 hour) or `24` (hourly readings over 1 day) |
| `packet_interval_seconds` | `1` | `3600` (hourly) | `60` (1-min CEMS average) or `3600` (Part 75 hourly) |
| `commit_window_seconds` | `30` | `900` | `900` (15 minutes) |
| `reveal_window_seconds` | `30` | `900` | `900` (15 minutes) |
| `challenge_window_seconds` | `120` | `86400` | `86400` (24 hours) |
| `withdrawal_delay_seconds` | `180` | `604800` | `604800` (7 days) |

---

## 10. Golden Test Vectors (`schemas/golden/golden_vectors.json`)

Generated deterministically by [`scripts/make_golden.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/scripts/make_golden.py) using a fixed deterministic key labeled **`TEST KEY`** (`SHA256(b"VeriCEMS-GOLDEN-TEST-KEY-DO-NOT-REUSE-IN-PRODUCTION-v1")`, never used outside golden tests) and verified by [`tests/test_golden.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/tests/test_golden.py):

1. **`chain_1_clean_and_tampered`**:
   - An 8-packet valid hash chain (`seq = 0..7`) with its batch object, Merkle root, and inclusion proofs for every leaf.
   - A tampered variant where packet `seq = 3` has `co2_mass_short_tons` scaled down by 30% **after** signing (`SIG_INVALID` on packet 3 and `CHAIN_BREAK` on packet 4).
2. **`chain_2_seq_gap`**:
   - A 7-packet chain (`seq = 0, 1, 2, 3, 5, 6, 7`) where high-emission packet `seq = 4` was selectively dropped (`SEQ_GAP` and `CHAIN_BREAK` at index 4, plus odd-leaf promotion in the 7-leaf Merkle tree).
3. **`chain_3_replayed`**:
   - An 8-packet chain where packets at positions `4, 5` are naive replays of historical packets `seq = 1, 2` (`SEQ_GAP` and `CHAIN_BREAK` at index 4).
4. **Golden Verdict & Vote Commitment & Period Report**:
   - Sample verdict object with 192-byte ABI-encoded preimage and `vote_commitment`, plus a valid CBAM-aligned period report (`"cbam_aligned": true`).
