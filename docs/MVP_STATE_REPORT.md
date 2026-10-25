# VeriCEMS: MVP State Report (read-only audit)

- Audit time: 2026-10-23 (local), branch `main`, HEAD `af42c66f591575e30db1a3fafbc0e005a668e1b3` (also tagged `v1.0-submission`).
- **Evidence tags:** `[V]` = VERIFIED (I ran a command or opened the named file). `[I]` = INFERRED (from reading code or docs, not executed). "unknown" = I could not tell.
- Raw logs for everything below are in `results/audit/` (e.g. `pytest.log`, `forge_test_run.log`, `web_build.log`, `secret_scan.log`).
- **Side effect disclosure:** running `pytest` rewrote the tracked file `deployments/anvil.json` (demo parameters). I saved the diff to `results/audit/anvil_json_side_effect.diff` and restored the file with `git checkout -- deployments/anvil.json`. `forge test` and `npm run build` also refreshed git-ignored build folders (`contracts/out`, `contracts/cache`, `web/dist`). No other existing file was changed by me. [V] (`git status` before and after)
- **Not run on purpose:** the full benchmark (slow), the Playwright browser tests (they overwrite tracked screenshots in `web/screenshots/`), live testnet calls and the explorer (no network calls were made), the live backend server.

### Plain-word glossary (explained once)
- **Blockchain / EVM testnet:** a shared public ledger nobody can quietly edit. "EVM" is the Ethereum-style programming model; a "testnet" uses play money. **Anvil** is a local fake chain on your laptop.
- **Smart contract:** a small program that lives on the chain and enforces rules (for example "no bond, no anchoring").
- **Hash:** a fingerprint of data. Change one digit of the data and the fingerprint changes completely. **Merkle root:** one fingerprint that summarises many records; storing it on-chain commits you to all of them.
- **Hash chain:** each record contains the fingerprint of the previous one, so deleting or reordering records is detectable.
- **Commit-reveal vote:** voters first publish a sealed fingerprint of their vote, then open it later, so nobody copies others.
- **Slashing / bond:** a deposit that is partly taken away if the depositor cheats.
- **ML autoencoder:** a small neural network trained on normal data; if it cannot "reconstruct" a new batch well, the batch looks abnormal. **ONNX:** a portable file format for a trained model.
- **FPR (false-positive rate):** how often clean data is wrongly flagged. **Recall:** how often attacks are caught. **AUROC:** 0.5 = coin flip, 1.0 = perfect ranking.
- **CAMPD:** US EPA Clean Air Markets Program Data (real hourly power-plant emissions). **CBAM:** EU Carbon Border Adjustment Mechanism.

---

## 1. WHAT THIS PRODUCT DOES TODAY

1. VeriCEMS replays real US EPA power-plant hourly readings, signs each one, chains them, and anchors batch fingerprints on an EVM chain; five verifier nodes vote 3-of-5 on whether a batch is clean or fraudulent. [I] (`docs/AGENT_BRIEF.md`, `backend/vericems/orchestrator.py`)
2. Screen `/operator`: live-style telemetry, hash chain strip, Merkle tree, attack injector, trust score. [V] (`web/src/App.tsx:20`, `web/src/pages/OperatorPage.tsx`)
3. Screen `/verifier`: the five verifier votes, commit/reveal state, model hash, challenge panel and arbiter votes. [V] (`web/src/App.tsx:21`)
4. Screen `/importer`: upload a signed period report, re-check Merkle proofs in the browser, run the CBAM cost calculator (shows "needs source" for missing regulatory values). [V] (`web/src/App.tsx:22`, `web/e2e/fixtures/valid_report_payload.json` exists)
5. Screen `/benchmark`: detector results from `results/benchmark_summary.json`, attack table, "what still gets through", data provenance. [V] (`web/src/lib/benchmarkData.ts:2-5` imports results files)
6. A fifth, unrequested route `/gallery` (design component showcase) is linked from the top bar. [V] (`web/src/App.tsx:24`, `web/src/shell/TopBar.tsx:392`)
7. The UI starts in a **MOCK / SYNTHETIC provider by default**; you must click the toggle to use the live backend. [V] (`web/src/data/DataContext.tsx:86-96`)
8. Run Python tests: `.venv/Scripts/python.exe -m pytest -q` → 65 passed, 1 skipped. [V] (`results/audit/pytest.log`)
9. Run contract tests: `cd contracts; ..\.venv\Scripts\forge.exe test` (forge is **not on PATH**; it sits in `.venv\Scripts`) → 27 passed. [V] (`results/audit/forge_test_run.log`)
10. Run UI: `npm --prefix web install`, `npm --prefix web run build` (passes), `npm --prefix web run test:unit` (32 pass), `npm --prefix web run dev`. Run backend (starts its own Anvil + deploys 6 contracts): `.venv/Scripts/python.exe -m backend.vericems.server --port 8000 --anvil-port 8545`; the Vite dev and preview servers proxy `/api` and `/ws` to `127.0.0.1:8000`. [V build/tests] [I server and dev] (`backend/vericems/server.py`, `web/vite.config.ts`)

**Environment variable NAMES (no values read):**
- Root `.env.example`: `RPC_URL`, `CHAIN_ID`, `VERICEMS_PROFILE`, `DEPLOYER_ACCOUNT`, `PASSWORD_FILE`, `ETHERSCAN_API_KEY`, `ARBISCAN_API_KEY`, `HOST`, `PORT`. [V]
- Also read by scripts: `VERICEMS_ADMIN`, `VERICEMS_DEPLOYMENT_OUT`, `VERICEMS_NETWORK`, `VERICEMS_RPC_URL`, `VERICEMS_TREASURY`. [V] (grep of `scripts/`, `backend/`)
- Web: `VITE_API_BASE_URL`, `VITE_CHAIN_ID`, `VITE_CHAIN_RPC_URL`, `VITE_EXPLORER_BASE_URL`, `VITE_BATCH_ANCHOR_ADDRESS`, `VITE_ATTESTATION_ADDRESS`, `VITE_BOND_VAULT_ADDRESS`, `VITE_VERIFIER_QUORUM_ADDRESS`, `VITE_CHALLENGE_ADDRESS`, `VITE_DEVICE_REGISTRY_ADDRESS`. [V] (grep of `web/src`)
- The local demo needs none of them. A real root `.env` file exists on disk (git-ignored); I did not open it. [V] (`Test-Path` only)

---

## 2. REAL vs SYNTHETIC vs MOCK

**Default provider:** the UI starts with `isMock = true` unless `sessionStorage["vericems_is_mock"]` says otherwise. [V] (`DataContext.tsx:86-100`)
**How to switch:** the top-bar button labelled `SYNTHETIC`/`LIVE` (`TopBar.tsx:258-278`) toggles it and stores the choice for the browser session. [V]
**If the backend is down in LIVE mode:** `loadData` catches the failure, logs only to the console, **silently flips back to MOCK**, loads fake data, and sets `error = null` (no error panel). The user only notices the `MOCK DATA` badge. [V] (`DataContext.tsx:179-188`)
**If the chain is unreachable:** network badge becomes `OFFLINE SNAPSHOT`. [V] (`web/src/chain/chainHelpers.ts:138-141`)

### 2.1 Data-source table

| # | Source | Class | file:line | Labelled in UI? |
|---|---|---|---|---|
| 1 | Mock batches, verifiers, votes, health, events (`getSynthetic*`) | MOCK | `web/src/data/mockData.ts:21-277` | Partly: global `MOCK DATA` badge (`TopBar.tsx:246`); individual hashes are not marked |
| 2 | In-browser scenario simulation (steps, challenges, slashing) | MOCK | `web/src/data/DataContext.tsx:23-40, 205-480` | Partly (same badge) |
| 3 | Placeholder arbiter addresses and tx hashes `0xarb1tx...`, `0xarb2tx...` | MOCK | `DataContext.tsx:277-279, 387-389` | No |
| 4 | Ticker fallback sentences (see 2.3) | MOCK | `web/src/shell/EventTicker.tsx:77-85` | **No** |
| 5 | Merkle tree demo leaf hashes (`0x1111222233…`, `0x0123456789abcdef…`) | MOCK | `web/src/components/MerkleTreeViz.tsx:56-139` | No |
| 6 | Fallback tx hash `0x9876543210abcdef…` | MOCK | `web/src/components/ChallengePanel.tsx:164` | No |
| 7 | Fallback model hash `0x4b789a2bcde789…` (the real model hash is `0xf9608ef7…`) | MOCK | `web/src/pages/VerifierPage.tsx:91` | No |
| 8 | Fallback zero-ish hash `0x…0001` | MOCK | `web/src/pages/ImporterPage.tsx:156` | No |
| 9 | Fallback trust score `"98%"` | MOCK | `web/src/pages/OperatorPage.tsx:148` | No |
| 10 | Gallery KPIs `98.2%`, `21.5%`, `+1.4%`, `-76.7%` and sample addresses | MOCK (design sample) | `web/src/pages/GalleryPage.tsx:150-158, 175-186, 245-256` | No |
| 11 | Offline snapshot used by importer verification (2.6 KB) | REAL-ish: looks like a local-Anvil export (admin `0xf39F…2266` is the public Foundry test account); origin unknown | `web/public/offline_snapshot.json` | unknown |
| 12 | Live telemetry: processed EPA CAMPD unit file `facility_1073_unit_3` replayed | REAL (EPA CAMPD replay) | `backend/vericems/gateway.py:3, 102-125`; `backend/vericems/server.py:27-28, 48` | Yes: `DataProvenancePanel.tsx:137` REAL/SYNTHETIC chips |
| 13 | Four extra channels `synthetic_stack_o2_pct`, `synthetic_flue_temp_c`, `synthetic_stack_flow_kscfm`, `synthetic_fuel_flow_mmbtu_indep` (seeded noise) | SYNTHETIC | `gateway.py:55-59, 144` | Yes (same panel; names carry `synthetic_`) |
| 14 | Attack injections applied to real data | SYNTHETIC by design | `ml/attacks/library.py`, `ml/attacks/adaptive.py` | Yes (benchmark page and docs) |
| 15 | Benchmark numbers (JSON/figures imported statically) | REAL (generated by repo code) | `web/src/lib/benchmarkData.ts:2-7`; `results/benchmark_summary.json` | Yes |
| 16 | On-chain reads from the local Anvil chain (chain id 31337) | REAL (on-chain read) | `web/src/chain/viemClient.ts`, `chainHelpers.ts` | Badge `LOCAL`/`TESTNET` |
| 17 | Backend REST/WebSocket API, SQLite store | REAL (real backend API) | `backend/vericems/api.py`, `store.py` | Badge `LIVE` (only when toggled) |
| 18 | CBAM config: price `82.32`, factor 2026 `0.975`, default markups 10/20/30 % | Config input with secondary source (`VERIFIED_SECONDARY`, `last_verified 2026-10-20`) | `calculator/config/cbam_config.json` | Yes (sources drawer, status field) |
| 19 | Hard-coded demo anchoring time `1782820800/1782823200/1782825600`, `Date.UTC(2026, 6, 1…)` | MOCK | `mockData.ts:21, 74, 90, 106` | No |
| 20 | Installation id `0x1111…1111` used for all mock batches | MOCK | `mockData.ts:68, 84, 100, 116, 268`; `DataContext.tsx:209, 308` | No |

### 2.2 Hard-coded hashes, addresses, numbers (search results)
- `0xdeadbeef1234567890abcdef…` as a mock tx hash: `mockData.ts:107`. `0xfa123456bcde7890…` as a mock Merkle root: `mockData.ts:101, 218`. `0xbeefcafe00112233…`: `mockData.ts:123`. `0x789a42f8c5b9…` (mock root reused in 4 places): `mockData.ts:69`, `MerkleTreeViz.tsx:56`, `GalleryPage.tsx:150`. `0x4b7c891023d4…` mock model hash repeated for all 5 verifiers: `mockData.ts:143-187`. [V] (`results/audit/web_hex_literals.log`, 68 hex literals found across `web/src`, 22 of them in tests)
- Repeated "pattern" hashes (`0x1111…`, `0x2222…`, ascending `0123456789abcdef…`) are plainly fake and not marked as such: `MerkleTreeViz.tsx:63-70, 114-139`. [V]
- Default contract addresses in `web/src/chain/viemClient.ts:12-22` are the **local Anvil deterministic addresses** (they match `deployments/anvil.json` at HEAD). The `.env.example` points to Arbitrum Sepolia with **blank** addresses, so a testnet switch needs manual env edits; the deployed testnet addresses in `deployments/testnet.json` are not wired into the UI. [V]
- Verifier / arbiter addresses in mocks (`0x3C44…93BC`, `0x90F7…b906`, `0x7099…79C8`, `0x15d3…6A65`, `0x9965…A4dc`, `0x976E…0aa9`) are the public Foundry/Hardhat test accounts, not secrets. [V]
- Backend hard-codes: `INSTALLATION_ID = "INST-CAMPD-1073"`, `DEVICE_ID = "DEV-CAMPD-1073-3"` (`server.py:27-28`); default verifier address `0x7099…79C8` (`backend/vericems/detectors/verifier.py:150`); default admin `0xf39F…2266` (`chain_adapter.py:286, 294`). [V] (`results/audit/backend_hardcodes.log`)
- Hard-coded percentages in benchmark prose (`BenchmarkPage.tsx:103-115`: slow drift 0.1 %/day = 8.1 %, 0.3 %/day = 29.1 %, coordinated insider = 3.0 %): **they match** `results/benchmark_summary.json` (0.081, 0.291, 0.03). [V] (`results/audit/attack_recalls.log`)

### 2.3 Contradictions between badges, ticker and network
1. **Ticker says "P-256 ECDSA gateway signature confirmed on Arbitrum Sepolia"** every time, while the network badge says `LOCAL` or `OFFLINE SNAPSHOT` and all default addresses are Anvil. Untrue unless on testnet. [V] (`EventTicker.tsx:79`; `DataContext.tsx:117-126`)
2. **Ticker says "Audited actual route saved €25,930.80 compared to default penalty values"**. The figure is hard-coded and appears in no result file or config; the calculator's CSCF and benchmark values are `null` ("needs source"), so the repo cannot currently compute such a saving. [V] (`EventTicker.tsx:84`; grep found the number only in docs/tests/video script; `calculator/config/cbam_config.json`)
3. **Ticker maps *any* vote event to "3 of 5 voted FRAUD"** even for clean batches. [V] (`EventTicker.tsx:56-57`)
4. **Initial network state is hard-coded `connected: true, LOCAL, chainId 31337`** before any check runs, so the badge can say `LOCAL` while the data is MOCK. [V] (`DataContext.tsx:117-126`)
5. With a local Anvil running (it is right now) the UI shows `LOCAL` plus `MOCK DATA`: mixed signals, though the MOCK badge is visible. [I]
6. A `/gallery` page shows polished KPI tiles that are not tied to any result. [V] (`GalleryPage.tsx:175-186`)

---

## 3. DATA

- `data/` is git-ignored except nothing is tracked there; only `data/anvil.log` (2.4 MB) shows as untracked-not-ignored. [V] (`git ls-files -o --exclude-standard`)
- **`data/raw/`**: 3 CSVs, state files for IA / UT / WY, calendar year 2025, plus `download_manifest.json`. Sizes: IA 49,971,838 B, UT 53,596,311 B, WY 59,992,324 B (≈ 163.6 MB). [V] (`results/audit/raw_files.log`)
- **Raw totals:** 30 facilities, 75 units, 646,104 hourly rows, 374,950 operating rows, 33 columns. Date range 2025-01-01 to 2025-12-31. [V] (`results/data_inspection.json`)
- **`data/processed/`**: `campd_hourly_processed.parquet` (5,627,267 B, **371,963 rows × 22 columns, 29 facilities**), `preprocessing_manifest.json` (36 KB), `units/` with 71 per-unit parquet files. [V] (pandas read; `ls`)
- **Processed columns:** state, facility_id, facility_name, unit_id, unit_series_id, date, hour, timestamp_utc, op_time_fraction, gross_load_mw, steam_load_1000_lb_hr, heat_input_mmbtu, co2_mass_short_tons, co2_rate_short_tons_mmbtu, so2_mass_lbs, nox_mass_lbs, primary_fuel_type, unit_type, co2_measure_indicator, heat_input_measure_indicator, gross_load_missing_flag, steam_load_missing_flag. [V]
- **O2, flue temperature, stack flow: absent.** Not in the 33 raw columns, nor in the processed file. [V] (`results/data_inspection.json` columns list; parquet columns; `docs/DATA_CARD.md:119-128`)
- **Processed file hashes match** `results/run_manifest.json` (parquet `0xac7b911e…`, preprocessing manifest `0xd9cebfa0…`, splits `0xbebaf68b…`). [V] (`Get-FileHash`)
- **CO₂ vs heat input (derivation finding):** CO₂ mass is almost a fixed multiple of heat input. My recomputation on the processed file: Pearson r = 0.9826 pooled across fuels; the ratio `short tons/mmBtu` ranges 0.04-0.118 pooled but per-fuel standard deviation is tiny (Coal 0.0032, Natural Gas 0.0002, Pipeline Natural Gas 0.0007). `DATA_CARD.md` reports per-fuel r² of 0.9997 (coal), 0.99999 (gas) and sets `is_circular = True`. So a plain "CO₂ vs heat input" check cannot catch an attacker who scales both, and CO₂ in Part 75 is largely *calculated*, not independently measured. [V] (own pandas check; `DATA_CARD.md:130-149`)
- **Splits manifest:** `results/splits.json`, `sklearn GroupShuffleSplit`, base seed 42, 5 splits, 29 facilities split by facility (train/val/test lists, e.g. split 0: 17 train, 6 val). [V]
- **Does `docs/DATA_CARD.md` match reality?** Yes on every number I checked: 30 raw / 29 processed facilities, 75 / 71 units, 646,104 raw rows, 371,963 processed rows, absent O2/temperature/flow, circularity table. [V] (`DATA_CARD.md:~30-60`, my recomputation). Caveat: `data/raw/` and `data/processed/` are not in git, so a fresh clone cannot run the pipeline without re-downloading from EPA (needs network). [I] (`.gitignore:24-27`, `ml/data/download.py`)

---

## 4. ML AND BENCHMARK

- **Detectors present:** `baseline_1_static` (static threshold), `baseline_2_physics` (mass-balance rules), `autoencoder_only`, and `proposed` (combined: crypto/chain checks + physics + autoencoder). Code in `backend/vericems/detectors/`. [V] (`benchmark_summary.json` keys; files exist)
- **Trained artifacts:** `ml/artifacts/model.onnx` (7,844 bytes, SHA-256 `F9608EF7CC239B3F844843F8B42FBF265F5E1DE14A3795DD77CA7F77F06DB467`), `scalers.json`, `thresholds.json`, `training_curves.{json,png}`. The hash equals the `model_hash` in the benchmark's split 0. [V]
- **Thresholds (split 0):** `ae_threshold 0.05`, `combined_batch_threshold 1.1111`, `cross_source_rel_threshold 0.0359`, `flatness_threshold 0.9`, `physics_threshold 1.0`, `repeat_threshold 0.7011`. [V] (`benchmark_summary.json`)
- **Validation false-positive rate (record level, target 0.02):** proposed 0.0105, 0.0100, 0.0178, 0.0031, 0.0118 over the 5 splits. [V]
- **Test false-positive rate (batch level, macro mean ± std):** proposed **0.0834 ± 0.0608** → about 4× the validation target; the units differ (record vs batch), so the gap may be partly definitional. Whether this is explained in the docs: unknown (not checked). [V numbers]
- **Determinism and leakage tests:** `test_onnx_and_verify_batch_determinism` and `test_zero_facility_leakage_across_splits_and_artifacts` (`backend/tests/test_detectors.py:362, 406`) both **pass** in the 65-passed run. [V]
- **Top-level benchmark summary table** (copied from `results/benchmark_summary.json` → `overall_macro_average`; mean ± std over 5 facility-grouped splits, 14 attack scenarios, 288-hour attack windows):

| Detector | AUROC | FPR | Precision | Recall | Detection delay (h) |
|---|---|---|---|---|---|
| autoencoder_only | 0.755516 ± 0.020129 | 0.10505 ± 0.114329 | 0.567763 ± 0.116859 | 0.377324 ± 0.217754 | 131.01185 ± 71.365181 |
| baseline_1_static | 0.577032 ± 0.134414 | 0.032194 ± 0.034066 | 0.74424 ± 0.081883 | 0.438496 ± 0.07372 | 130.480419 ± 14.772978 |
| baseline_2_physics | 0.802859 ± 0.029664 | 0.002453 ± 0.001812 | 0.816516 ± 0.060767 | 0.531133 ± 0.028116 | 106.595954 ± 11.933251 |
| proposed | 0.883008 ± 0.010667 | 0.083397 ± 0.060778 | 0.775867 ± 0.082331 | 0.756359 ± 0.080267 | 49.680716 ± 21.780091 |

  [V] (`results/audit/overall_macro.log`, full JSON copy). Honest reading: `proposed` has the best AUROC and recall, but its FPR (8.3 %) is the worst of the non-autoencoder options; `baseline_2_physics` has the lowest FPR (0.25 %) and higher precision. Per-attack recall of `proposed`: naive replay 1.00, selective dropping 1.00, constant scaling ≥10 % 1.00, flatline 0.991, **slow drift 0.1 %/day 0.081, 0.3 %/day 0.291, coordinated insider (8B) 0.030**, adaptive white-box A 0.857. [V] (`results/audit/attack_recalls.log`)
- **Manifest vs HEAD:** `results/run_manifest.json` records commit `9cad8a0f9f67057df5179863b307d3649de7d243`; HEAD is `af42c66…` (3 commits later). `git diff --stat 9cad8a0 HEAD -- ml data results config` shows only `results/WHAT_STILL_GETS_THROUGH.md` and `results/run_manifest.json` changed, and `git status` shows no uncommitted changes in `ml/`, `config/`, `calculator/`, `contracts/`. So the **benchmark is probably not stale in substance**, but the manifest commit does not equal HEAD, and the manifest says Python 3.14.3 while CI uses 3.11 and `cryptography` version is `"unknown"`. Re-running is the only way to be sure. [V] (git commands) [I] (conclusion)
- Benchmark outputs exist: `results/benchmark_raw.csv`, `benchmark_summary.json`, `run_manifest.json`, `WHAT_STILL_GETS_THROUGH.md`, `results/figures/{roc_curves,recall_per_attack_detector,adaptive_attacker_curve}.png`. [V]

---

## 5. TELEMETRY CRYPTO

- **Modules:** `backend/vericems/crypto/{packet,chain,merkle,secure_element}.py`, plus `gateway.py`. [V]
- The "secure element" is **software only** (simulated key store). It contains a hand-written P-256 implementation (`secure_element.py:27-33` curve constants) and `merkle.py` contains a hand-written Keccak (round constants at `merkle.py:32-49`); I did not audit these, so they should be described as "simulated, unaudited". [V] (grep) [I] (conclusion)
- `secure_element.py:222` has an `if` that claims to "enforce canonical lowercase hex" but its body is just `pass` (does not enforce). [V]
- **Tests:** `backend/tests/test_crypto_golden_and_unit.py` (7), `test_crypto_properties.py` (9), `test_gateway.py` (4), `tests/test_golden.py` (10). All inside the 65-passed Python run. [V]
- **Golden vectors:**
  - Python: `tests/test_golden.py` and `backend/tests/test_crypto_golden_and_unit.py` pass (golden file `schemas/golden/golden_vectors.json`, 61 KB). [V]
  - Solidity: `contracts/test/GoldenVectors.t.sol` 4/4 pass in my `forge test`. [V]
  - TypeScript: `web/src/lib/__tests__/verification.test.ts` (part of 32/32 pass) includes a golden hash assertion at line 125. [V]
  - Stored evidence copies: `results/security/golden_vectors_{python,solidity,typescript}.txt`. [V] (exist; dated earlier than this audit)

---

## 6. CONTRACTS

Solidity 0.8.24, OpenZeppelin (git submodule), `via_ir = false`, fuzz runs 256, invariant runs 64 × depth 32. [V] (`contracts/foundry.toml`)

| Contract | Purpose | Public state-changing functions |
|---|---|---|
| `DeviceRegistry` | Register each sensor-gateway's public key; rotate or revoke it | `registerDevice`, `rotateKey`, `revokeDevice`, `setInstallationOperator`, `pause`, `unpause` |
| `BondVault` | Holds operator bonds and verifier stakes; slashing; withdrawal delays; reward pull-payments | `depositOperatorBond`, `depositVerifierStake`, `requestOperatorWithdraw`, `executeOperatorWithdraw`, `requestVerifierWithdraw`, `executeVerifierWithdraw`, `slashOperator`, `slashVerifier`, `setChallengeStatus`, `claimRewards`, `updateParameters`, `pause`, `unpause` |
| `BatchAnchor` | Stores one Merkle root per batch with sequence bounds; status machine | `anchorBatch`, `updateBatchStatus`, `verifyPacketInclusion` (view), `pause`, `unpause` |
| `VerifierQuorum` | Commit-reveal voting, 3-of-5 finalisation, penalty for no-reveal | `setChallengeContract`, `registerVerifier`, `commitVote`, `revealVote`, `finalize`, `computeCommitment` (pure), `pause`, `unpause` |
| `Challenge` | Optimistic challenge window, operator dispute, arbiter 2-of-3 resolution | `openChallenge`, `submitOperatorDispute` (2 overloads, one with Merkle proof), `resolve`, `settleExpired`, `pause`, `unpause` |
| `Attestation` | Period attestation for importers (tCO₂e, coverage, batch ids) | `recordAttestation`, `getAttestation`, `getAttestationBatchIds`, `pause`, `unpause` |

[V] (`results/audit/contract_signatures.log`, read from `contracts/src/*.sol`)

### 6.1 Exact on-chain checks (revert conditions)
- **`DeviceRegistry`:** zero address, zero ids (`InvalidIdentifier`), duplicate device (`DeviceAlreadyRegistered`), caller must be the installation's operator or admin role, device must exist and be Active for rotate/revoke, public key length validated (`InvalidPublicKeyLength`, `_validatePublicKey`). [V] (`DeviceRegistry.sol:53-154, 192-194`)
- **`BatchAnchor.anchorBatch`:** root ≠ 0 (`EmptyMerkleRoot`); device Active; `msg.sender == dev.operator`; operator bond ≥ minimum (`hasSufficientOperatorBond`); sequence range must start exactly at the expected next seq, be non-empty, and satisfy `firstSeq + count − 1 == lastSeq`. [V] (`BatchAnchor.sol:88-119`)
- **Duplicate roots are NOT rejected.** There is no mapping from root to batch; the same Merkle root can be anchored twice as long as the sequence range advances. [V] (read of `BatchAnchor.sol:88-135`). Impact is limited because a replayed batch must still carry a new contiguous sequence range, but it is a gap.
- **`updateBatchStatus`:** only the quorum contract or challenge contract roles, and only valid transitions (`InvalidStatusTransition`). [V] (`BatchAnchor.sol:141-165`)
- **MerkleProof use:** `BatchAnchor.verifyPacketInclusion` calls OpenZeppelin `MerkleProof.verifyCalldata` with leaf `keccak256(abi.encodePacked(packetHash))` (`BatchAnchor.sol:182-190`). `Challenge.submitOperatorDispute` (overload with proof) reverts `InvalidMerkleProof` if the proof fails (`Challenge.sol:209-221`). [V]
- **`VerifierQuorum.commitVote`:** caller is a registered verifier, has enough stake, commitment ≠ 0, batch not finalised, within commit window, one commit per verifier. [V] (`VerifierQuorum.sol:165-181`)
- **Vote commitment is recomputed in Solidity:** `revealVote` → `_validateReveal` recomputes `keccak256(abi.encode(batchId, modelHash, inputHash, scoreBp, uint8(verdict), salt))` and reverts `CommitmentMismatch` if it differs from the stored commitment; it also requires reveal after the commit window, before the reveal deadline, `inputHash == batch merkleRoot`, and `scoreBp ≤ MAX_SCORE_BP`; one reveal per verifier. [V] (`VerifierQuorum.sol:196-260, 313-322`)
- **`finalize`:** anyone may call; needs at least `requiredQuorum` revealed votes with identical (modelHash, inputHash, verdict) (`QuorumNotReached`); Clean → batch `Verified`; otherwise → `Quarantined` and calls `Challenge.openChallenge`. Verifiers who committed but did not reveal after the window are slashed `unrevealedPenaltyBps` of stake (to treasury). [V] (`VerifierQuorum.sol:265-310`)
- **`Challenge`:** open only by quorum role/verifier, evidence hash ≠ 0, one challenge per batch, batch must be `Quarantined`; operator dispute only before window closes, by the operator; arbiters (`ARBITER_ROLE`) vote once each; settlement after `requiredArbiterApprovals` (2); `settleExpired` slashes if the window passed and there was no dispute. [V] (`Challenge.sol:159-286, 307-339`)
- **Slashing:** `BondVault.slashOperator` (only `CHALLENGE_CONTRACT_ROLE`): reduces operator bond by `slashAmount` (must be ≤ bond); `verifierRewardShareBps` (config: 7000 bps = 70 %) of it is split equally between the honest verifiers who flagged it as pull-payment credits; the remainder (and rounding dust) credits the treasury. `slashVerifier` (quorum/challenge roles only) slashes a verifier for failed reveal or overturned flag. Withdrawals are delayed and blocked while a challenge is open. [V] (`BondVault.sol:142-221, 239-340`; params in `deployments/testnet.json`)
- **`Attestation.recordAttestation`:** non-empty batch list, production mass ≠ 0, coverage ≤ max bp, period root ≠ 0, every batch belongs to the installation and is `Verified`, caller must be authorised. [V] (`Attestation.sol:96-114`)
- **Possible stuck-state (not tested by me):** if the operator disputes, `settleExpired` reverts `OperatorAlreadyDisputed`; only arbiter votes can end it, and the operator's bond is locked meanwhile. If arbiters never reach 2 votes, the batch stays quarantined. [I] (`Challenge.sol:278-280`)

### 6.2 Test, coverage, gas and static-analysis results
- **`forge test` (run by me):** 3 suites, **27 passed, 0 failed, 0 skipped**: `GoldenVectorsTest` 4, `UnitAndScenarioTest` 16, `FuzzAndInvariants` 7 (2 fuzz tests × 256 runs; 5 invariants × 64 runs × depth 32). forge 1.0.0 (`.venv\Scripts\forge.exe`). [V] (`results/audit/forge_test_run.log`)
- **Invariants:** ETH held equals recorded balances; slashed ≤ bond; batch finalised at most once; sequence numbers only increase; only registered, non-revoked devices can anchor. [V] (`FuzzAndInvariants.t.sol`)
- **Coverage (stored, not re-run):** `src/` files 100 % lines except `BondVault.sol` 98.18 % (162/165) lines and 90 % branches (36/40); `script/Deploy.s.sol` 99.15 % lines / 60 % branches. [V] (`results/coverage.txt`, dated 2026-10-21)
- **Gas (stored):** `anchorBatch` median 179,855; `slashOperator` median 202,426; `recordAttestation` median 34,584; `openChallenge` median 32,463. Measured on Arbitrum Sepolia in `results/gas_measured.json`: `anchorBatch` median 179,843 (20 samples), but `gas_price_gwei_input` and `token_price_usd_input` are `null`, so no EUR cost is computed. [V]
- **Slither (stored, not re-run):** 32 results, 8 detector types: `arbitrary-send-eth` (BondVault `_safeTransferETH`, pull-payment by design), `calls-loop`, `divide-before-multiply`, `incorrect-equality`, `low-level-calls`, `reentrancy-events`, `reentrancy-no-eth`, `timestamp`. No triage file seen. Line numbers in the report are shifted by one line versus current source (e.g. `finalize` listed at 264, now 265), so Slither output is slightly older than the contract text. [V] (`results/slither.txt`)
- Not installed here, so not re-run: Slither (not on PATH). [V]

### 6.3 Deployments
- **Files:** `deployments/anvil.json` (chain 31337, profile `demo`), `deployments/testnet.json` (chain **421614 = Arbitrum Sepolia**, profile `testnet`), `deployments/deploy_anvil.ps1`. [V]
- **Committed `anvil.json` is inconsistent:** profile says `demo`, but its parameter block (`challengeWindowSeconds 60`, `commitWindowSeconds 20`, bonds of 0.001 ETH) matches the testnet profile; running the tests regenerates it with `120 / 30 / 1 ETH`. [V] (`results/audit/anvil_json_side_effect.diff`)
- **Public testnet addresses (from `deployments/testnet.json`):** DeviceRegistry `0x10b6647d48888a7c3c4dc28f0df0a2e5c23b3471`; BondVault `0x7ffb90cdc55c6c61b961acf2a042a804f5857c36`; BatchAnchor `0x8bf14de651fa70feb3538852c2160d082255638b`; VerifierQuorum `0x734849b029ddf31030cfae4a74c314f8e21dbfb9`; Challenge `0x80f58f44ca8bcbeeda72a27ec2555d26bb016a34`; Attestation `0x872d5ef7c6a457d1b8ed68221350236151c763b0`. Deployer/admin/treasury `0x55f1a7F7cc829C842Ce71A2552E5DD46bb7C9b89`. [V]
- **Explorer verification:** `README.md` and `docs/TESTNET_EVIDENCE.md` state that all six are "deployed on Arbitrum Sepolia" with explorer links and transaction hashes; `scripts/verify_contracts.py` exists. I made **no network call**, so I cannot confirm the contracts are actually verified on the explorer. [V] (docs read) / unknown (reality)
- Testnet evidence also uses an **admin = treasury = deployer** address, so slashed funds go to the deployer. [V] (`testnet.json`)

---

## 7. BACKEND

### 7.1 Endpoints and events (from `backend/vericems/api.py`)
- REST: `GET /api/health`, `/api/state`, `/api/batches`, `/api/batches/{id}`, `/api/verifiers`, `/api/events`, `/api/challenges`, `/api/scenario/status`, `/api/report/latest`; `POST /api/scenario/{batch,attack,step,play,pause,reset,speed}`, `/api/verifiers/{id}/mode`, `/api/challenges/{id}/{dispute,resolve,settle}`, `/api/report`, `/api/report/verify`. [V] (decorators at `api.py:79-185`)
- WebSocket: `/ws/events` streams every stored event. Event types allowed: `packet`, `batch_anchored`, `vote`, `finalized`, `flagged`, `challenge_open`, `slashed`, `attestation`, `scenario_step`, `scenario_reset`. [V] (`api.py:189`, `store.py:20-33`)
- **No authentication** on any endpoint, including state-changing `POST`s and `/api/scenario/reset`. Acceptable for a local demo only. [V] (no auth dependency in `api.py`)

### 7.2 P09 components

| Component | Status | Evidence |
|---|---|---|
| Chain adapter (Anvil + testnet mode) | done | `chain_adapter.py` (52 KB); used by tests [V] |
| Orchestrator | done | `orchestrator.py`; `test_scenario.py` passes [V] |
| Five verifier nodes | done | `verifier_node.py` (`VerifierCommittee`), modes honest/attack set via API [I] |
| Challenge flow | done | API `dispute/resolve/settle` + contract tests [V endpoints] [I end-to-end] |
| Report generator | done | `reports.py` (24 KB); `/api/report`, `/api/report/verify` [V file] |
| API | done | `api.py` [V] |
| Demo clock | done | `demo_clock.py` (loaded from `config/params.yaml`) [V file] |
| Event store | done | `store.py` [V] |
| Logging | done | `logging_utils.py` [V file] |
| Auth / rate limiting | missing | not in scope; none found [V] |

### 7.3 Database
- **SQLite**, file `data/vericems_demo.db` (118,784 B at audit time; git-ignored via `*.db`). Tables and row counts at audit time: `events` (29), `batches` (2), `votes` (20), `challenges` (1), `reports` (1), `sqlite_sequence`. Schema columns: events (id, event_type, timestamp_utc, batch_id, device_id, installation_id, payload_json); batches (batch_id, device_id, installation_id, first_seq, last_seq, count, merkle_root, status, anchor_tx_hash, finalize_tx_hash, created_at, packets_json, merkle_json, verdict_summary_json); votes (…, phase, model_hash, input_hash, score_bp, verdict, reason_codes_json, commitment, salt, tx_hash, …); challenges (…, evidence_hash, window_closes_at, status, slashed_amount_wei, arbiter_votes_json, tx_hashes_json, …); reports (report_id, attestation_id, period_label, report_json, envelope_json, created_at). [V] (`results/audit/_dbinspect.py`, read-only open)
- **Persistence after restart:** the SQLite file persists; but the server starts a **fresh Anvil chain and re-deploys contracts each run** (`server.py:~40-52`), so stored `anchor_tx_hash` values would point at a chain that no longer exists, and `ScenarioEngine(auto_snapshot=True)` is used. Whether the store is wiped on start: unknown. [I]

### 7.4 TODO / FIXME / NotImplemented / bare `pass`
- TODO/FIXME/NotImplemented in Python source: **none real** (13 grep hits were the word "hackathon" or "XXX" in URLs/strings). TypeScript source: none. The only "TODO" is a skipped test marker `TODO_HUMAN` in `calculator/tests/test_official_crosscheck.py`. [V] (`results/audit/todo_scan_py.log`)
- Bare `pass` statements (12), all in `except` handlers or no-ops: `api.py:203` (WebSocket loop swallows all exceptions), `chain_adapter.py:125, 174, 1353, 1363`, `reports.py:552` (`except Exception: pass` while reading the device key during report generation), `scenario.py:216, 233, 290`, `verifier_node.py:238` (swallows reward lookup errors), `secure_element.py:222` (no-op check), `ml/impact.py:48`. [V] (`results/audit/bare_pass.log`)

### 7.5 Integration tests
- `backend/tests/test_integration_anvil.py` (3 tests) and `test_scenario.py` (1 full-story test) pass; these start a real local Anvil. They emit **45 `MismatchedABI` warnings** ("The event signature did not match the provided ABI. It has been discarded.") meaning some contract events are not decoded by the backend. [V] (`results/audit/pytest.log`)
- Processes: a pre-existing `anvil` (PID 34648), `node`, `python` were already running before the audit; I did not start or stop long-running processes (the test-started Anvil exited by itself). [V] (`Get-Process` before and after)

---

## 8. WEB

- **Routes:** `/` → `/operator`; `/operator`, `/verifier`, `/importer`, `/benchmark`, `/gallery`; `*` → `/operator`. [V] (`web/src/App.tsx`)
- **Main components:** `web/src/components/` (≈ 40 files, e.g. `HashChainStrip`, `MerkleTreeViz`, `VoteCard`, `ChallengePanel`, `QuarantineViewer`, `BenchmarkTable`, `BenchmarkCharts`, `DataProvenancePanel`, `TrustGauge`, `SourcesDrawer`); shell: `AppShell`, `TopBar`, `EventTicker`. `DemoControlBar.tsx` and `Sidebar.tsx` are **deleted in the working tree** (uncommitted). [V]
- **State / provider logic:** `DataContext.tsx` (602 lines) holds batches, verifiers, challenges, health, state, network, scenario status; `apiClient.ts` calls REST with `VITE_API_BASE_URL` (default empty → same-origin, relies on the Vite proxy); `useVeriCEMSWebSocket.ts`; `chain/viemClient.ts` + `chainHelpers.ts` read the chain via `viem` with a 1.5 s timeout. [V]
- **Env vars:** see Section 1. [V]
- **Build:** `npm run build` (`tsc && vite build`) **passes** in 5.37 s; `tsc --noEmit` clean. [V] (`results/audit/web_build.log`)
- **Bundle size:** one JS chunk `index-BpY019TG.js` = 2,599.39 kB (545.25 kB gzip) → over Vite's 500 kB warning; CSS 54.5 kB (10.8 kB gzip); total `dist/assets` ≈ 3.5 MB (includes fonts and 3 figure PNGs). [V]
- **Unit tests:** `npm run test:unit` → **32 pass, 0 fail** (3 files: `benchmark.test.ts`, `cbam.test.ts`, `verification.test.ts`). [V] (`results/audit/web_unit.log`)
- **Playwright:** 16 test definitions in 7 spec files (2 viewport projects: desktop 1440×900, mobile 390×844 → about 32 runs). **I did not run them** because they overwrite tracked screenshots. Last recorded status: `web/test-results/.last-run.json` = `passed` (written 2026-10-23 02:45, before my audit); the stale root-level `test-results/.last-run.json` says `failed` (2026-10-22 21:29). [V] (files read) / pass state at audit time: unknown
- **UI lint:** `node web/scripts/ui_text_lint.mjs` passes (39 UI files). Note `web/scripts/` is untracked. [V]
- **Rough visible words per route** (string literals + JSX text in the page file plus the components it directly imports; rough, over-counts shared labels and ignores deeper components): Operator ≈ 216, Verifier ≈ 246, Importer ≈ 414, Benchmark ≈ 518, Gallery ≈ 699. [V] (`results/audit/words_per_route.log`, script `results/audit/_words.py`)

---

## 9. CALCULATOR

- Python `calculator/cbam_calculator.py` (+ `cli.py`) and TypeScript `web/src/lib/cbam.ts`; config `calculator/config/cbam_config.json`, sources `calculator/sources.json` (12 entries `VERIFIED_SECONDARY`, 4 `NEEDS_SOURCE`). [V]
- **Config summary (19 value slots): 5 filled, 14 null.** [V] (`results/audit/cbam_config_summary.log`)
  - Filled: price `82.32` €/tCO₂e (quarter 2026-Q3; source is a secondary website `cbamguide.com`, last_verified 2026-10-20); free allocation factor 2026 `0.975`; default markup 2026 `0.10`, 2027 `0.20`, 2028 `0.30` (all `VERIFIED_SECONDARY`).
  - Null (`NEEDS_SOURCE`): free allocation 2027-2034 (8 values), CSCF 2026-2027+ values, `benchmark_tco2e_per_t`, `default_benchmark_tco2e_per_t`, `default_value_base_tco2e_per_t`.
  - `config/emission_factors.yaml` also has `last_verified: null` entries. [V]
- **Consequence:** the importer can show a cost only where inputs exist; benchmark and default values being null means any "savings" shown for real use needs a source. A hard-coded `€25,930.80` appears in the ticker (Section 2.3). [V]
- **Tests:** `calculator/tests/test_cbam_calculator.py` (8) pass; web `cbam.test.ts` passes. [V]
- **Official cross-check test is still skipped:** `calculator/tests/test_official_crosscheck.py:14` → `SKIPPED ... TODO_HUMAN: I will add one official or third-party worked example later`. [V] (`pytest.log`)

---

## 10. DELIVERABLES

| Requirement | Status | Path / evidence |
|---|---|---|
| Working prototype | exists | tests pass, build passes; UI defaults to mock mode (see §13) |
| Repo with README | exists | `README.md` (147 lines); says `make test` runs contracts + Python + browser tests, but `Makefile` `test` runs only `pytest` [V] |
| Architecture diagram | exists | `docs/architecture.png`, `.svg`, `.mmd`, `docs/ARCHITECTURE.md` [V] |
| Technical specification | exists | `docs/TECH_SPEC.md` (1,823 words) [V] |
| 3-minute video | **missing** | no `.mp4/.mov/.webm/.mkv` found outside dependencies; only `docs/VIDEO_SCRIPT.md` (1,211 words) [V] |
| Security & data-integrity assessment | exists | `docs/SECURITY_ASSESSMENT.md` (2,723 w), `THREAT_MODEL.md`, `threat_model.json`, `ADAPTIVE_ATTACKER.md`, `results/security/` [V] |
| Problem statement (max 2 pages) | exists | `docs/PROBLEM_STATEMENT.md`, 953 words (≈ 2 pages; page count unknown) [V] |
| Climate impact assessment | exists | `docs/CLIMATE_IMPACT.md` (991 w), inputs in `config/impact_inputs.yaml` [V] |
| Adoption strategy | exists | `docs/ADOPTION_STRATEGY.md` (1,967 w) [V] |
| Scalability & sustainability roadmap | exists | `docs/SCALABILITY_ROADMAP.md` (1,185 w) [V] |
| LICENSE | exists | `LICENSE`, MIT, "VeriCEMS Contributors" [V] |
| `.env.example` | exists | `.env.example`, `web/.env.example` [V] |
| CI workflow | exists | `.github/workflows/ci.yml`: jobs for honesty lint + syntax check, pytest, forge test, web unit tests + build. It does **not** run Playwright, Slither or the benchmark. [I] (step names) |
| `.gitignore` coverage | good, one gap | covers `.env*` (except example), keys, keystores, `*.parquet`, `*.csv`, `*.db`, `node_modules`, `web/dist`, Foundry `out/cache/broadcast`; `data/anvil.log` (2.4 MB) is **not** ignored [V] |

Other: `docs/HUMAN_TODO.md` still has unchecked boxes for regulation checks; `docs/SUBMISSION_CHECKLIST.md` exists. [V]

---

## 11. HEALTH

| Check | Command | Result |
|---|---|---|
| Python tests | `.venv/Scripts/python.exe -m pytest -q -rs -p no:cacheprovider` | **65 passed, 1 skipped, 45 warnings** in 106.4 s [V] |
| Contract tests | `.venv\Scripts\forge.exe test` (cwd `contracts`) | **27 passed, 0 failed** [V] |
| Web type-check + build | `npm run build`, `npx tsc --noEmit` | pass [V] |
| Web unit tests | `npm run test:unit` | 32 pass, 0 fail [V] |
| Playwright e2e | not run | see §8 |
| Honesty lint | `python scripts/honesty_lint.py` | exit 0, "All honesty checks passed", 81 files scanned [V] |
| UI text lint | `node web/scripts/ui_text_lint.mjs` | pass, 39 files [V] |
| Other linters | none configured (`ruff`, `mypy`, `eslint`, `solhint` not found in config) | n/a [V] |

- **Secrets scan** (tracked files only, `.env*` excluded and never opened; patterns: PEM private-key block, `private_key = 64-hex`, `secret/privkey 64-hex`, AWS key id, GitHub token, mnemonic assignment, API-key assignment): **0 hits**. Tracked env-like files: `.env.example`, `web/.env.example` only. Untracked files such as `data/anvil.log` were not scanned for secrets. [V] (`results/audit/secret_scan.log`; `scripts/secret_scan.py` also exists but I did not use it)
- **Repo size:** about 202 MB excluding `.git`, `node_modules`, `.venv`, `clean_clone` (mostly `data/`); tracked files ≈ 12.2 MB. Largest: `data/raw/campd_hourly_2025_WY.csv` 57.2 MB, `..._UT.csv` 51.1 MB, `..._IA.csv` 47.7 MB, `data/processed/campd_hourly_processed.parquet` 5.4 MB, `web/dist` JS 2.5 MB, `data/anvil.log` 2.4 MB. **Files over 5 MB: 4, all git-ignored; none tracked.** [V]
- **Git:** branch `main`; 6 commits total (the 15-commit request is capped by history): `af42c66` docs: SUBMISSION_CHECKLIST, VIDEO_SCRIPT; `ce9203d` fix: auto-build contracts and frontend preview; `e21a691` "Full ai ver TBU"; `9cad8a0` fix: foundry binaries / parquet fallback; `f72121f` chore: ignore clean_clone; `3621034` feat: complete VeriCEMS production implementation. Tag: `v1.0-submission` → `af42c66` (= HEAD). [V]
- **Uncommitted changes: 99 entries** at the end of the audit (85 files modified or deleted vs HEAD in the working tree, plus untracked): a UI redesign (≈ 40 `web/src` files, 31 screenshots, `index.html`, `package.json`, `tailwind.config.ts`), four modified backend files (`api.py`, `chain_adapter.py`, `scenario.py`, `server.py`), deleted `web/src/shell/Sidebar.tsx` and `web/src/components/DemoControlBar.tsx`, untracked `web/scripts/`, `web/src/shell/EventTicker.tsx`, `Button.tsx`, `Chip.tsx`, `Popover.tsx`, `pytest.ini`, `VeriCEMS_UI_Redesign_Spec_and_Prompts.md`, `data/anvil.log`, and my `results/audit/`. **The tag `v1.0-submission` therefore does not describe what is on disk.** [V] (`results/audit/git_status_full.log`)

---

## 12. PLAN vs REALITY

| Prompt | Status | Evidence |
|---|---|---|
| P00 Agent brief | done | `docs/AGENT_BRIEF.md` [V] |
| P01 Skeleton, Makefile, CI | done (with a drift) | all folders present, `Makefile`, `.github/workflows/ci.yml`; `make test` is pytest-only [V] |
| P02 Interfaces, schemas, golden vectors, params | done | `docs/INTERFACES.md`, `schemas/*.json` (5) + `schemas/golden/golden_vectors.json`, `config/params.yaml` [V] |
| P03 Data pipeline, DATA_CARD, splits | done | `ml/data/*.py`, `docs/DATA_CARD.md` matches data, `results/splits.json`; raw/processed not in git [V] |
| P04 Calculator (Python + TS), config, sources | partial | both implementations + `sources.json`; 14 of 19 config values null; official cross-check skipped [V] |
| P05 Crypto package, gateway | done | `backend/vericems/crypto/`, `gateway.py`, tests pass; software-only, hand-rolled primitives [V] |
| P06 Six contracts, tests, reports | done | 6 contracts, 27 tests pass, `results/{coverage,gas_report,slither}.txt`; no Slither triage [V] |
| P07 Detectors, artifacts | done | `backend/vericems/detectors/`, `ml/artifacts/model.onnx` [V] |
| P08 Attacks, benchmark, WHAT_STILL_GETS_THROUGH | done (results only re-checked, not re-run) | `ml/attacks/`, `results/benchmark_summary.json` (14 attacks, 8 families), `results/WHAT_STILL_GETS_THROUGH.md` [V] |
| P09 Backend | done (minor defects) | all components exist; 45 ABI warnings; swallowed exceptions [V] |
| P10-P14 Web, demo mode, end-to-end | **changed** | 4 screens + `/gallery`; working tree has an uncommitted redesign; default provider is mock; ticker contains unsourced claims [V] |
| P15 Security docs | done | `docs/SECURITY_ASSESSMENT.md`, `THREAT_MODEL.md`, `ADAPTIVE_ATTACKER.md`, `results/security/` [V] |
| P16 Testnet | partial / unverified | `deployments/testnet.json`, `docs/TESTNET_EVIDENCE.md`, `scripts/deploy_testnet.*`, `run_live_testnet_e2e.py`; no network check; UI not wired to testnet addresses [V files] |
| P17 Docs | done except video | README + 11 docs present; no video file [V] |
| P18 Honesty lint | done | `scripts/honesty_lint.py` passes on 81 files, but it does not catch the hard-coded ticker claims in §2.3 [V] |
| P19 QA | partial | tests green; Playwright not re-run here; stale root `test-results` says `failed`; `HUMAN_TODO` boxes open [V] |

---

## 13. TOP 15 PROBLEMS (ranked by risk to a hackathon submission)

Effort: S = under 1 hour, M = a few hours, L = a day or more. "Model" = what kind of AI model (or human) should fix it.

| # | Problem | Evidence | Effort | Who/what should fix |
|---|---|---|---|---|
| 1 | **No 3-minute demo video** (required deliverable) | no video file; only `docs/VIDEO_SCRIPT.md` | M | Human (record); a small model can tidy the script |
| 2 | **UI opens in MOCK mode; LIVE failure silently falls back to MOCK with no error** | `DataContext.tsx:86-100, 179-188` | S | Mid-size coding model |
| 3 | **Unsourced and contradictory claims in the ticker** ("confirmed on Arbitrum Sepolia", "3 of 5 voted FRAUD" for any vote, "saved €25,930.80") violate the honesty rules; the honesty lint misses them | `EventTicker.tsx:56-57, 79, 84` | S | Mid-size coding model, then extend lint |
| 4 | **Submission state is ambiguous: 99 uncommitted entries (UI redesign, deleted files, 4 backend files) but tag `v1.0-submission` = HEAD** | `results/audit/git_status_full.log` | S-M | Human decides; small model commits in logical chunks |
| 5 | **Regulatory inputs mostly null (14 of 19); price from a secondary website; official cross-check test skipped** | `calculator/config/cbam_config.json`, `pytest.log` skip line | M (human sourcing) | Human with EUR-Lex access; small model wires values |
| 6 | **Proposed detector test FPR 8.3 % ± 6.1 %** vs 2 % validation target and 0.25 % for the physics baseline; headline AUROC/recall hides it unless readers see FPR | `benchmark_summary.json` overall_macro_average | M | Strong reasoning model to analyse (without tuning on test data); document honestly |
| 7 | **Core "physics" signal is circular** (CO₂ is derived from heat input, r² ≈ 0.9997+), real data lacks O₂/temperature/flow, so those channels are synthetic; slow drift (8 % / 29 % recall) and coordinated insider (3 %) get through | `DATA_CARD.md:130-149`, `attack_recalls.log` | L (design) / S (disclose) | Disclosure: small model; real fix: strong reasoning model + human |
| 8 | **Testnet claims unverified; UI not wired to testnet addresses** (defaults are Anvil addresses; `.env.example` addresses blank) | `viemClient.ts:12-22`, `web/.env.example`, `docs/TESTNET_EVIDENCE.md` | S-M | Human checks explorer; mid-size model wires env |
| 9 | **Benchmark manifest commit (`9cad8a0`) ≠ HEAD (`af42c66`)**, Python 3.14.3 vs CI 3.11, `cryptography` "unknown" | `results/run_manifest.json` | S (run `make benchmark`, slow) | Any model to run; human to wait |
| 10 | **Tests mutate tracked file `deployments/anvil.json`**, and the committed copy has testnet-like params under profile `demo` | `results/audit/anvil_json_side_effect.diff` | S | Small coding model |
| 11 | **Contract gaps:** duplicate Merkle roots accepted; operator-disputed challenge can stay stuck if arbiters never vote; admin = treasury = deployer on testnet; Slither findings not triaged | `BatchAnchor.sol:88-135`, `Challenge.sol:278-280`, `testnet.json`, `slither.txt` | M | Strong reasoning model (security review) |
| 12 | **Backend swallows errors and drops events:** 45 `MismatchedABI` warnings (events discarded), 8 `except … pass`, no-op lowercase check, no API auth | `pytest.log`, `bare_pass.log`, `secure_element.py:222` | M | Mid-size coding model |
| 13 | **E2E evidence stale/unverified:** Playwright not re-run; root `test-results` = failed (old); e2e writes tracked screenshots (dirty tree); CI does not run e2e | `web/test-results/.last-run.json`, `ci.yml` | S-M | Mid-size model + human run |
| 14 | **Reproducibility friction:** `forge` not on PATH; README says `make test` covers contracts and browser, Makefile only pytest; raw/processed data not in repo (needs EPA download) | `Makefile`, `README.md`, `.gitignore` | S | Small model for docs/Makefile |
| 15 | **Single 2.6 MB JS bundle, hand-written P-256/Keccak (simulated secure element, unaudited), mock hashes with obvious patterns (`0xdead…`, `0xfa123…`) and `/gallery` KPIs not marked as samples; `data/anvil.log` not ignored** | `web_build.log`, `secure_element.py:27-33`, `merkle.py:32-49`, `mockData.ts:101-123`, `GalleryPage.tsx:175-186` | S-M | Small to mid-size model |

---

## 14. QUESTIONS FOR ME

1. Is the uncommitted UI redesign (≈ 85 files) meant to be the submission? Should `v1.0-submission` be moved, or should I commit/revert the working tree?
2. Should the demo open in LIVE mode (needs backend running) or is MOCK-by-default acceptable for judges? Do you want a visible error instead of silent fallback?
3. Where did the ticker text "saved €25,930.80" and "confirmed on Arbitrum Sepolia" come from: a real run, or a design placeholder?
4. Who checked the Arbiscan contract verification and the transaction links in `docs/TESTNET_EVIDENCE.md`? I could not check without network access.
5. Who will record the 3-minute video, and does the hackathon require a specific format/host?
6. Do you have access to the primary EU texts to fill the 14 null CBAM values (CSCF, benchmarks, default values, 2027-2034 factors) and an official worked example for the skipped cross-check test?
7. Which FPR should be the headline: the record-level validation figure (~1 %) or the batch-level test figure (8.3 %)? Was the threshold selection done only on validation data?
8. Which Python version is canonical: 3.14.3 (benchmark manifest) or 3.11 (CI, README)?
9. Is a real `.env` at the repo root needed for the local demo, or only for testnet deploys? (I did not open it.)
10. Is the `/gallery` route meant to ship, and is the offline snapshot `web/public/offline_snapshot.json` from a real Anvil run (origin unknown)?

---

## 15. PASTE-BACK SUMMARY (for another assistant)

**Product:** VeriCEMS (IEEE ClimateChain 2026 Track 4): signed, hash-chained EPA CAMPD telemetry → Merkle roots on EVM → 3-of-5 commit-reveal verifier quorum + challenge window + bonds → importer portal with CBAM calculator.
**Repo:** `main` @ `af42c66` (= tag `v1.0-submission`), 6 commits, 99 uncommitted entries (UI redesign; deleted `Sidebar.tsx`, `DemoControlBar.tsx`; 4 backend files modified). Audit side effect: pytest rewrote `deployments/anvil.json`; restored.
**Screens:** `/operator`, `/verifier`, `/importer`, `/benchmark` (+ unrequested `/gallery`). UI defaults to MOCK provider; LIVE failure silently reverts to MOCK.
**Run:** `.venv/Scripts/python.exe -m pytest -q`; `cd contracts; ..\.venv\Scripts\forge.exe test` (forge not on PATH); `npm --prefix web run build|test:unit|dev`; backend `python -m backend.vericems.server --port 8000 --anvil-port 8545`.
**Env names:** RPC_URL, CHAIN_ID, VERICEMS_PROFILE, DEPLOYER_ACCOUNT, PASSWORD_FILE, ETHERSCAN_API_KEY, ARBISCAN_API_KEY, HOST, PORT, VERICEMS_{ADMIN,DEPLOYMENT_OUT,NETWORK,RPC_URL,TREASURY}, VITE_{API_BASE_URL,CHAIN_ID,CHAIN_RPC_URL,EXPLORER_BASE_URL,*_ADDRESS×6}.

**Key numbers (all VERIFIED unless noted):**
- Python: 65 passed, 1 skipped (official CBAM cross-check, `TODO_HUMAN`), 45 warnings (incl. `MismatchedABI`).
- Forge: 27 passed / 0 failed (4 golden, 16 unit/scenario, 2 fuzz + 5 invariants). Coverage (stored): `src` 98-100 % lines. Slither (stored): 32 results, untriaged.
- Web: build OK (2.6 MB single JS, 545 kB gzip); 32 unit pass; Playwright 16 specs not re-run (last-run file says passed).
- Honesty lint: pass (81 files). Secrets scan: 0 hits (paths/patterns only). No files > 5 MB tracked.
- Data: 3 CSVs (IA, UT, WY, 2025; 646,104 rows, 30 facilities) → processed 371,963 rows, 29 facilities, 71 units; no O₂/temp/flow; CO₂ derived from heat input (circular); DATA_CARD matches; hashes match manifest.
- Model: `model.onnx` 7,844 B, SHA-256 `F9608EF7…DB467`. Manifest commit `9cad8a0` ≠ HEAD (ml/data/config unchanged since).

**Benchmark (macro mean ± std, 5 facility-grouped splits, 14 attacks):**
| Detector | AUROC | FPR | Precision | Recall | Delay h |
|---|---|---|---|---|---|
| autoencoder_only | 0.7555 | 0.1051 | 0.5678 | 0.3773 | 131.0 |
| baseline_1_static | 0.5770 | 0.0322 | 0.7442 | 0.4385 | 130.5 |
| baseline_2_physics | 0.8029 | 0.0025 | 0.8165 | 0.5311 | 106.6 |
| proposed | 0.8830 | 0.0834 | 0.7759 | 0.7564 | 49.7 |
Proposed recall: replay/dropping/scaling≥10 % ≈ 1.00; slow drift 0.1 %/day 0.081, 0.3 %/day 0.291; coordinated insider 0.030.

**Deployment:** local Anvil (`deployments/anvil.json`); Arbitrum Sepolia (421614) `deployments/testnet.json` with 6 addresses (docs state explorer verification not done in prototype; NOT checked by me). UI defaults to Anvil addresses.

**Top problems:** (1) no video; (2) MOCK default + silent fallback; (3) hard-coded ticker claims (Sepolia, "3 of 5 FRAUD", €25,930.80); (4) uncommitted redesign vs tag; (5) 14/19 CBAM values null, cross-check skipped; (6) test FPR 8.3 %; (7) circular physics signal, slow-drift/insider evade; (8) testnet unverified/unwired; (9) manifest commit mismatch; (10) tests mutate `anvil.json`; (11) contract gaps (duplicate roots, stuck dispute); (12) backend swallowed errors/ABI mismatch; (13) e2e stale; (14) reproducibility friction; (15) bundle size, hand-rolled crypto, obvious fake hashes.

**Open questions:** ship the redesign? default LIVE vs MOCK? source of ticker numbers? who verifies explorer links? video owner? CBAM primary sources? FPR headline? Python version? `.env` need? `/gallery` and offline snapshot origin?
