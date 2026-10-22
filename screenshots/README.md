# VeriCEMS: Media & Submission Artifacts Directory

This directory stores the official media assets and Devpost submission artifacts for **VeriCEMS**.

---

## 1. Video Recording (`TODO(HUMAN)`)

| File Name | Description | Target Length | Resolution | Source Script |
|---|---|:---:|:---:|---|
| `screenshots/vericems_demo_3min.mp4` | 3-minute video walkthrough pitch & demo | ≤ 3:00 (180s) | 1920x1080 (16:9), 60fps | [`docs/VIDEO_SCRIPT.md`](../docs/VIDEO_SCRIPT.md) |

> **Instructions for Recording:**
> 1. Start the local full-stack demo: `make demo` (backend + Anvil) and `npm --prefix web run dev` (frontend).
> 2. Open browser to `http://localhost:5173/operator` in full screen (`F11`).
> 3. Follow the 7 shots in [`docs/VIDEO_SCRIPT.md`](../docs/VIDEO_SCRIPT.md) using the 1-click step buttons in the bottom demo bar.
> 4. Export as MP4 (H.264 / AAC) to `screenshots/vericems_demo_3min.mp4`.
> 5. Upload to YouTube / Vimeo / Devpost and update the placeholder link in [`docs/SUBMISSION_CHECKLIST.md`](../docs/SUBMISSION_CHECKLIST.md).

---

## 2. Devpost Gallery Screenshots to Upload

The automated test suite has captured high-resolution UI captures in `web/screenshots/`. For Devpost submission, copy or reference the following:

| # | Recommended File Name | Source Location | Description |
|---|---|---|---|
| 1 | `01_operator_live_telemetry.png` | `web/screenshots/story-step-1-normal-desktop.png` | Real US EPA CAMPD telemetry streaming with continuous hash-chaining |
| 2 | `02_attack_injected_quarantine.png` | `web/screenshots/story-step-2-attack-injected-desktop.png` | Malicious -20% CO2 scaling detected by physics & ONNX autoencoder |
| 3 | `03_verifier_committee_consensus.png` | `web/screenshots/story-step-3-quarantined-desktop.png` | 3-of-5 bonded verifier committee voting 4-1 invalid on-chain |
| 4 | `04_bond_vault_slashing.png` | `web/screenshots/story-step-4-slashed-desktop.png` | Operator €2,000 bond slashed in `BondVault.sol` after challenge window |
| 5 | `05_onchain_attestation.png` | `web/screenshots/story-step-5-attested-desktop.png` | Clean reporting batch attested on Arbitrum Sepolia (`Attestation.sol`) |
| 6 | `06_importer_merkle_verification.png` | `web/screenshots/story-step-6-importer-verified-desktop.png` | Browser-side Merkle inclusion proof verified in <5ms against contract root |
| 7 | `07_cbam_savings_calculator.png` | `web/screenshots/importer-success-desktop.png` | Importer CBAM certificate cost comparison saving €25,930.80 vs default |
| 8 | `08_adversarial_benchmark_roc.png` | `results/figures/roc_curves.png` | AUROC 0.8830 vs baselines across 5 facility splits on 30 EPA plants |
| 9 | `09_honest_evasion_limits.png` | `web/screenshots/story-step-7-benchmark-disclosure-desktop.png` | Prominent honest disclosure of slow drift and coordinated insider bounds |
| 10 | `10_system_architecture.png` | `docs/architecture.png` | 4-layer end-to-end architecture diagram (Gateway, Engine, Quorum, Portal) |

---

## 3. Testnet Explorer Evidence Screenshots

| File Name | Contract / Action | Arbiscan Link |
|---|---|---|
| `screenshots/tx_batch_anchor.png` | `BatchAnchor.sol` deployment & anchor | [`0x8Bf14de651FA70FeB3538852c2160d082255638B`](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B) |
| `screenshots/tx_bond_slashing.png` | `Challenge.sol` & `BondVault.sol` | [`0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34) |
| `screenshots/tx_attestation.png` | `Attestation.sol` issue & verify | [`0x872D5EF7C6a457d1B8eD68221350236151c763B0`](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0) |
