# VeriCEMS Cryptographic Telemetry Notes (`CRYPTO_NOTES.md`)

> **Plain Limitation Statement (The Oracle Problem):**  
> **An ECDSA signature and SHA-256 hash chain attest to *origin* and *post-signing integrity*—they do NOT prove the *physical truth* of the measurement.**  
> If false, scaled, flatlined, or replayed sensor numbers are injected into the gateway **before** the packet is signed, or if the physical flue-gas sample is manipulated before the analyzer, the gateway will produce a mathematically valid ECDSA P-256 signature and an unbroken hash chain over false emissions data.

---

## 1. What the Cryptographic Layer Evidences (and What It Cannot Evidence)

| Property | Evidenced by Crypto Layer? | Mechanism in `backend/vericems/crypto/` | Honest Limitation |
|---|---|---|---|
| **Origin (Device Authentication)** | **YES** | Deterministic RFC 6979 ECDSA over NIST P-256 (`secp256r1`, low-$S$ normalized) verified against the device's uncompressed 65-byte SEC1 public key (`0x04 \|\| X \|\| Y`). | Proves *which key* signed the packet, not whether the host feeding numbers to that key was honest. |
| **Post-Signing Integrity (Man-in-the-Middle Protection)** | **YES** | `packet_hash = SHA-256(canonical_json(packet_without_signature))`. Modifying any single character or numeric field of any packet after signing invalidates the ECDSA signature (`SIG_INVALID`) and breaks the next packet's `prev_hash` (`CHAIN_BREAK`). | Does not detect modifications made *before* `packet_hash` and `sign()` are called. |
| **Post-Signing Completeness & Ordering** | **YES** | Contiguous `seq` (`0, 1, 2, ...`), monotonic `timestamp_utc`, and `packet[i].prev_hash == packet_hash(packet[i - 1])`. Deleting, duplicating, reordering, or naively splicing signed packets triggers `SEQ_GAP`, `SEQ_DUPLICATE`, `SEQ_REORDER`, `TIMESTAMP_REGRESSION`, and `CHAIN_BREAK`. | An insider who controls the gateway before signing can maintain contiguous `seq` and valid `prev_hash` links while signing fabricated values. |
| **On-Chain Batch Inclusion** | **YES** | Binary `keccak256` Merkle tree (`leaf = keccak256(bytes32(packet_hash))`, sorted pairs, odd-node promotion per `DECISION-04`). Verifiable against the 32-byte `merkle_root` anchored in `BatchAnchor`. | Proves a packet was included in the anchored batch; does not by itself prove the readings inside the batch are physically accurate. |
| **Physical Truth of the Stack Measurement** | **NO** | **Not solvable by cryptography alone.** | Requires physics mass-balance checks (`PHYSICS_RESIDUAL`), independent custody-transfer fuel meter cross-checks (`CROSS_SOURCE_MISMATCH`), physics-informed autoencoder & spectral analysis (`AE_RESIDUAL`, `SPECTRAL_FLAT`, `SPECTRAL_REPEAT`), and staked economic bonds (`BondVault`). |

---

## 2. Simulated Secure Element Disclosure (`SoftwareSecureElement`)

In a physical industrial deployment, the signing key would be generated and stored inside a dedicated hardware cryptographic co-processor—such as a **Microchip ATECC608** secure element—connected to the CEMS edge gateway over I²C or SPI, where the private scalar never leaves the chip's tamper-resistant silicon boundary.

In this hackathon prototype:
- [`SoftwareSecureElement`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/backend/vericems/crypto/secure_element.py) **simulates** a hardware secure element in Python software (`is_synthetic_simulation = True`) and **is not physical hardware**.
- **Software Key Encapsulation:** To model the narrow hardware API as faithfully as possible in Python, `SoftwareSecureElement` exposes only `sign(packet_hash)` and `public_key()`. The 256-bit private key scalar is bound exclusively inside a lexical closure created during `__init__`; it is never stored on `self.__dict__`, cannot be read via any method or attribute, and raises `TypeError` on any attempt to `pickle`, `copy`, or `deepcopy` the instance.
- **Remaining Software & Hardware Limits:**
  1. Because `SoftwareSecureElement` runs in host CPU memory, an attacker with root/administrator access to the gateway OS could inspect process memory or invoke `sign()` on arbitrary digests.
  2. Even with a genuine hardware ATECC608 chip, the chip is a passive signing oracle: it signs whatever 32-byte SHA-256 digest the gateway CPU sends over the bus. Without secure boot, signed firmware, and physical protection of the analyzer-to-gateway link, an insider can still tamper with readings *before* they reach the secure element.

---

## 3. Insider (`before_sign_hook`) vs. Man-in-the-Middle (`after_sign_hook`)

The gateway simulator in [`backend/vericems/gateway.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/backend/vericems/gateway.py) provides two explicit hooks when replaying real preprocessed US EPA CAMPD records:

1. **`after_sign_hook` (Man-in-the-Middle / Post-Signing Tamper):**
   - The gateway computes the honest `packet_hash`, signs it via `SecureElement.sign()`, and advances its internal `_prev_hash` state.
   - The attack function then alters a field (e.g., scales `co2_mass_short_tons` by `0.70`), drops a packet, duplicates a packet, or reorders packets on the wire.
   - **Result:** [`verify_chain`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/backend/vericems/crypto/chain.py) deterministically catches every modification (`SIG_INVALID`, `CHAIN_BREAK`, `SEQ_GAP`, `SEQ_DUPLICATE`, `SEQ_REORDER`, `TIMESTAMP_REGRESSION`).

2. **`before_sign_hook` (Insider / Pre-Signing Tamper):**
   - The insider modifies `packet["values"]["co2_mass_short_tons"]` **before** `packet_hash` is computed and **before** `SecureElement.sign()` is called.
   - The gateway hashes and signs the modified payload and links the next packet's `prev_hash` to that hash.
   - **Result:** [`verify_chain`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/backend/vericems/crypto/chain.py) reports `is_valid = True` (`reason_codes = []`) because the cryptographic seal was applied *after* the lie was written. Catching this insider attack is the job of the downstream physics, cross-source, and ML verification layers.
