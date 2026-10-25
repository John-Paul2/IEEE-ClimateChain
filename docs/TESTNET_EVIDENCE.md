# VeriCEMS Testnet Evidence & Transaction Proofs

**Target Network:** Arbitrum Sepolia (`Chain ID: 421614`)  
**Block Explorer:** [https://sepolia.arbiscan.io](https://sepolia.arbiscan.io)  
**Deployer / Operator Address:** [`0x55f1a7F7cc829C842Ce71A2552E5DD46bb7C9b89`](https://sepolia.arbiscan.io/address/0x55f1a7F7cc829C842Ce71A2552E5DD46bb7C9b89)  
**Execution Timestamp (UTC):** `2026-10-22T02:32:00Z`  

---

## 1. Deployed Smart Contracts

Explorer source verification: not done in this prototype; contract source is in contracts/src.

| Contract | Address | Deployment Tx | Explorer Link |
| :--- | :--- | :--- | :--- |
| **Attestation** | [`0x872D5EF7C6a457d1B8eD68221350236151c763B0`](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0) | [`0x0810228d5f53...`](https://sepolia.arbiscan.io/tx/0x0810228d5f538f32830b4b6068f287e807ececeda865c9d979e2b3d2c09b2ef9) | [View Contract](https://sepolia.arbiscan.io/address/0x872D5EF7C6a457d1B8eD68221350236151c763B0#code) |
| **BatchAnchor** | [`0x8Bf14de651FA70FeB3538852c2160d082255638B`](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B) | [`0xea50bf33d15f...`](https://sepolia.arbiscan.io/tx/0xea50bf33d15f2463afbef5becfad7b96fa559ff19a9d48c2a6d409977f039a26) | [View Contract](https://sepolia.arbiscan.io/address/0x8Bf14de651FA70FeB3538852c2160d082255638B#code) |
| **BondVault** | [`0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36`](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36) | [`0xa3d0a992adc0...`](https://sepolia.arbiscan.io/tx/0xa3d0a992adc0a1edad4e656f4119dc13ff32fa0887c171c29cef06f099c3b8bf) | [View Contract](https://sepolia.arbiscan.io/address/0x7FFB90Cdc55C6C61B961AcF2a042A804F5857C36#code) |
| **Challenge** | [`0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34`](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34) | [`0x3eee1a33cc34...`](https://sepolia.arbiscan.io/tx/0x3eee1a33cc34d9decce0156ef0c3fb9638af0838736e3f3e9d83d5549825da7f) | [View Contract](https://sepolia.arbiscan.io/address/0x80f58f44Ca8BCBEEDa72a27ec2555D26BB016A34#code) |
| **DeviceRegistry** | [`0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471`](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471) | [`0x87b8fe9fbe13...`](https://sepolia.arbiscan.io/tx/0x87b8fe9fbe1319a2015c670d8d8dd7a9d2bb268548a86ef2dbc1f5b60dc18e52) | [View Contract](https://sepolia.arbiscan.io/address/0x10B6647D48888a7C3C4DC28f0df0a2E5c23b3471#code) |
| **VerifierQuorum** | [`0x734849b029dDF31030CfaE4A74c314f8E21DBfB9`](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9) | [`0xf5696c0dbc82...`](https://sepolia.arbiscan.io/tx/0xf5696c0dbc82d81cd8280dba2fed5035b95127b1bfa9c93c74f3bd37aef6bfcb) | [View Contract](https://sepolia.arbiscan.io/address/0x734849b029dDF31030CfaE4A74c314f8E21DBfB9#code) |

---

## 2. Live Honest Flow (Full Lifecycle)

| Action | Role | Gas Used | Block | Transaction Hash | Explorer Link | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| DeviceRegistry.registerDevice | Operator / Verifier | 238,041 | 321580773 | [`0x905a8f529d55...`](https://sepolia.arbiscan.io/tx/0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce) | [View Tx](https://sepolia.arbiscan.io/tx/0x905a8f529d5503ab973f12af51c801c9ab067f8147943c7bc450c35347e308ce) | CEMS device registered |
| BondVault.depositOperatorBond | Operator / Verifier | 117,845 | 321580907 | [`0xa7355a729551...`](https://sepolia.arbiscan.io/tx/0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621) | [View Tx](https://sepolia.arbiscan.io/tx/0xa7355a72955137f88d78a096108d47df73b4edacc93b47967afd483e23c33621) | Operator bonded 0.002 ETH |
| BondVault.depositVerifierStake[V0] | Operator / Verifier | 72,211 | 321580926 | [`0x4842628c0140...`](https://sepolia.arbiscan.io/tx/0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd) | [View Tx](https://sepolia.arbiscan.io/tx/0x4842628c0140c97532a0caa204cd5829dd34c6aa93363e11b55798377a1eafcd) | Verifier 0 bonded 0.0005 ETH |
| BondVault.depositVerifierStake[V1] | Operator / Verifier | 55,111 | 321580941 | [`0x51151074c274...`](https://sepolia.arbiscan.io/tx/0x51151074c274888636aa56a112a8ba4f4b73cee3d5c2860743c8d521d50fc904) | [View Tx](https://sepolia.arbiscan.io/tx/0x51151074c274888636aa56a112a8ba4f4b73cee3d5c2860743c8d521d50fc904) | Verifier 1 bonded 0.0005 ETH |
| BondVault.depositVerifierStake[V2] | Operator / Verifier | 55,111 | 321580960 | [`0x04bcb069f85f...`](https://sepolia.arbiscan.io/tx/0x04bcb069f85fd07c35e709cbca64f546cf41f7d802a9090dd0965a4c5fcd3604) | [View Tx](https://sepolia.arbiscan.io/tx/0x04bcb069f85fd07c35e709cbca64f546cf41f7d802a9090dd0965a4c5fcd3604) | Verifier 2 bonded 0.0005 ETH |
| BatchAnchor.anchorBatch (Honest #4) | Operator / Verifier | 179,843 | 321582952 | [`0x46e5be70fee0...`](https://sepolia.arbiscan.io/tx/0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22) | [View Tx](https://sepolia.arbiscan.io/tx/0x46e5be70fee08a7a093c2d522da3cc9d5a4ed16abcb4be5aed6d595e2e07df22) | Anchored Batch #4 |
| VerifierQuorum.commitVote (Honest V0) | Operator / Verifier | 120,510 | 321582964 | [`0xf1987522e0f2...`](https://sepolia.arbiscan.io/tx/0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5) | [View Tx](https://sepolia.arbiscan.io/tx/0xf1987522e0f28a5e2f742e30bf88959f2fcadd9a51d0d231d6f4671a012c35c5) | V0 sealed commitment |
| VerifierQuorum.commitVote (Honest V1) | Operator / Verifier | 103,410 | 321582969 | [`0xe2c3a560ef6b...`](https://sepolia.arbiscan.io/tx/0xe2c3a560ef6b18318bc883a68a55c34640cba33f4b9cc70d59deb938f7c6fb1a) | [View Tx](https://sepolia.arbiscan.io/tx/0xe2c3a560ef6b18318bc883a68a55c34640cba33f4b9cc70d59deb938f7c6fb1a) | V1 sealed commitment |
| VerifierQuorum.commitVote (Honest V2) | Operator / Verifier | 103,410 | 321582977 | [`0x0c3060003323...`](https://sepolia.arbiscan.io/tx/0x0c30600033232ac0b6e4632d1a88d1111f6c5357ed5f10ffe0cbbb72ff40383f) | [View Tx](https://sepolia.arbiscan.io/tx/0x0c30600033232ac0b6e4632d1a88d1111f6c5357ed5f10ffe0cbbb72ff40383f) | V2 sealed commitment |
| VerifierQuorum.revealVote (Honest V0) | Operator / Verifier | 194,083 | 321583050 | [`0x0e00b82a3c8b...`](https://sepolia.arbiscan.io/tx/0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f) | [View Tx](https://sepolia.arbiscan.io/tx/0x0e00b82a3c8b5844a6e55b51c50c0a639c395b40eace829b1d0e78687b34065f) | V0 revealed Clean (score=0bp) |
| VerifierQuorum.revealVote (Honest V1) | Operator / Verifier | 176,983 | 321583058 | [`0x52f236196386...`](https://sepolia.arbiscan.io/tx/0x52f236196386c69a50fc894682a9df4a4a387f6111578c8fd19c05f171556b51) | [View Tx](https://sepolia.arbiscan.io/tx/0x52f236196386c69a50fc894682a9df4a4a387f6111578c8fd19c05f171556b51) | V1 revealed Clean (score=0bp) |
| VerifierQuorum.revealVote (Honest V2) | Operator / Verifier | 176,983 | 321583062 | [`0xcef8dec16d22...`](https://sepolia.arbiscan.io/tx/0xcef8dec16d2275758f6a9a3d3f9d008bf5c7619398d15ba367d3d2a5091e3eba) | [View Tx](https://sepolia.arbiscan.io/tx/0xcef8dec16d2275758f6a9a3d3f9d008bf5c7619398d15ba367d3d2a5091e3eba) | V2 revealed Clean (score=0bp) |
| VerifierQuorum.finalize (Honest) | Operator / Verifier | 127,850 | 321583075 | [`0x88739782d829...`](https://sepolia.arbiscan.io/tx/0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722) | [View Tx](https://sepolia.arbiscan.io/tx/0x88739782d8290af52131418b63bf76808b2244714b79095fa2f2cc8d0bd23722) | Quorum finalized Clean -> Status=Verified |
| Attestation.recordAttestation | Operator / Verifier | 281,626 | 321583085 | [`0xe139990cef5f...`](https://sepolia.arbiscan.io/tx/0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd) | [View Tx](https://sepolia.arbiscan.io/tx/0xe139990cef5ffc3e13b750925549b0e6c3839f93a49bc0e4aa875fc736fea4cd) | Recorded EU CBAM Attestation for Batch #4 |
| VerifierQuorum.finalize (Quarantine + openChallenge) | Operator / Verifier | 248,504 | 321585247 | [`0x2ee068a31e36...`](https://sepolia.arbiscan.io/tx/0x2ee068a31e36f7685d0eb87abc5787ae0b8b417bd1b60052d91cb5c82e7a31a2) | [View Tx](https://sepolia.arbiscan.io/tx/0x2ee068a31e36f7685d0eb87abc5787ae0b8b417bd1b60052d91cb5c82e7a31a2) | Quorum finalized Fraud -> Batch #6 Quarantined & openChallenge invoked |

---

## 3. Live Attack & Slashing Flow (Fraud Injection & Arbiter Council Resolution)

| Action | Role | Gas Used | Block | Transaction Hash | Explorer Link | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BatchAnchor.anchorBatch (Attack Injection #6) | Operator / Verifier / Arbiter | 179,843 | 321584995 | [`0x043ad66ba6d7...`](https://sepolia.arbiscan.io/tx/0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9) | [View Tx](https://sepolia.arbiscan.io/tx/0x043ad66ba6d788f05b9fafc96d85cbd22a9e42628f3c6b20ee8c63987bf1d2d9) | Anchored Tampered Batch #6 |
| VerifierQuorum.commitVote (Attack V0) | Operator / Verifier / Arbiter | 120,510 | 321585012 | [`0x4ceea3a326fe...`](https://sepolia.arbiscan.io/tx/0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100) | [View Tx](https://sepolia.arbiscan.io/tx/0x4ceea3a326fe6feaa23875f54074ef57bfa6306ee3123eebbad59749f73eb100) | V0 sealed Fraud commitment |
| VerifierQuorum.commitVote (Attack V1) | Operator / Verifier / Arbiter | 103,410 | 321585017 | [`0xf0d74c40b571...`](https://sepolia.arbiscan.io/tx/0xf0d74c40b5712f845920a5ad228aaf9d4ffbb0fbc1ea3a00f849831c8e349bc5) | [View Tx](https://sepolia.arbiscan.io/tx/0xf0d74c40b5712f845920a5ad228aaf9d4ffbb0fbc1ea3a00f849831c8e349bc5) | V1 sealed Fraud commitment |
| VerifierQuorum.commitVote (Attack V2) | Operator / Verifier / Arbiter | 103,410 | 321585022 | [`0x2d95ed664772...`](https://sepolia.arbiscan.io/tx/0x2d95ed6647721313d10c678c2632907ab0532ef96cbab069f6d267f94996f887) | [View Tx](https://sepolia.arbiscan.io/tx/0x2d95ed6647721313d10c678c2632907ab0532ef96cbab069f6d267f94996f887) | V2 sealed Fraud commitment |
| VerifierQuorum.revealVote (Attack V0) | Operator / Verifier / Arbiter | 194,605 | 321585097 | [`0x7797def15bd4...`](https://sepolia.arbiscan.io/tx/0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80) | [View Tx](https://sepolia.arbiscan.io/tx/0x7797def15bd47b43da3796f89cb236cc08122e3d9fe93f9bc0439bfef37e7e80) | V0 revealed Fraud (score=8500bp, reasons=E01,E03) |
| VerifierQuorum.revealVote (Attack V1) | Operator / Verifier / Arbiter | 177,505 | 321585104 | [`0x7fd4ee06cea9...`](https://sepolia.arbiscan.io/tx/0x7fd4ee06cea972e95876de38de982b5ae8b2e10b70a04955fcfc9a3afa9495b8) | [View Tx](https://sepolia.arbiscan.io/tx/0x7fd4ee06cea972e95876de38de982b5ae8b2e10b70a04955fcfc9a3afa9495b8) | V1 revealed Fraud (score=8500bp, reasons=E01,E03) |
| VerifierQuorum.revealVote (Attack V2) | Operator / Verifier / Arbiter | 177,505 | 321585108 | [`0x1a081e098cec...`](https://sepolia.arbiscan.io/tx/0x1a081e098cec5136a192366329af3fd666c8a75dc770b93451f06787a9285ec8) | [View Tx](https://sepolia.arbiscan.io/tx/0x1a081e098cec5136a192366329af3fd666c8a75dc770b93451f06787a9285ec8) | V2 revealed Fraud (score=8500bp, reasons=E01,E03) |
| Challenge.submitOperatorDispute | Operator / Verifier / Arbiter | 82,020 | 321585333 | [`0x0c28f6f67518...`](https://sepolia.arbiscan.io/tx/0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4) | [View Tx](https://sepolia.arbiscan.io/tx/0x0c28f6f675189fc0b94dd75f6cc3f02b89e8d693117978098defe6694dfcf7c4) | Operator lodged dispute with verified Merkle proof |
| Challenge.resolve (Arbiter 0 Vote) | Operator / Verifier / Arbiter | 77,704 | 321585379 | [`0x7a1178c5f09f...`](https://sepolia.arbiscan.io/tx/0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049) | [View Tx](https://sepolia.arbiscan.io/tx/0x7a1178c5f09f9ef8b68ab100f77286b37f382d29c3f300b7d4621c6920296049) | Arbiter 0 cast vote 1 of 2 (UPHELD_FRAUD) |
| Challenge.resolve (Arbiter 1 Resolution & Slash) | Operator / Verifier / Arbiter | 318,914 | 321585388 | [`0xac83b05905b5...`](https://sepolia.arbiscan.io/tx/0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540) | [View Tx](https://sepolia.arbiscan.io/tx/0xac83b05905b55a0983e45fbe113f34c1a9187d5280afff2af691c7a7dc39e540) | Arbiter 1 reached 2-of-3 quorum: Slashed 50% operator bond |
| Challenge.settleExpired (Batch #5) | Operator / Verifier / Arbiter | 144,998 | 321585487 | [`0xcf769c014196...`](https://sepolia.arbiscan.io/tx/0xcf769c0141964062a3abd780c5b7148bfe8c0d503aec8d1bfe9797273dd6d2a7) | [View Tx](https://sepolia.arbiscan.io/tx/0xcf769c0141964062a3abd780c5b7148bfe8c0d503aec8d1bfe9797273dd6d2a7) | Settled expired challenge on Batch #5 |
| BondVault.depositOperatorBond (Top-up) | Operator / Verifier / Arbiter | 46,345 | 321585569 | [`0x9d511c6cc4a8...`](https://sepolia.arbiscan.io/tx/0x9d511c6cc4a8e3c8c4797f3aa88518460def3bb154bfa25ebbe8bb46ed0b66d6) | [View Tx](https://sepolia.arbiscan.io/tx/0x9d511c6cc4a8e3c8c4797f3aa88518460def3bb154bfa25ebbe8bb46ed0b66d6) | Operator topped up bond by 0.002 ETH |

---

## 4. Gas Measurement Summary (Empirical Benchmarks)

Empirically measured on Arbitrum Sepolia EVM testnet. Per `AGENTS.md` rules, gas price and token prices are configuration inputs (kept null) and never assumed or invented.

**Cost Formula:**  
$$\text{Cost} = \text{Gas Used} \times \text{Gas Price (ETH)} \times \text{ETH Price (EUR)}$$

| Operation | Sample Count | Min Gas | Median Gas | Max Gas |
| :--- | :--- | :--- | :--- | :--- |
| **anchorBatch** | 20 | 179,831 | 179,843 | 179,855 |
| **commitVote** | 6 | 103,410 | 103,410 | 120,510 |
| **revealVote** | 6 | 176,983 | 177,505 | 194,605 |
| **finalize** | 2 | 127,850 | 188,177 | 248,504 |
| **openChallenge** | 1 | 120,654 | 120,654 | 120,654 |
| **submitOperatorDispute** | 1 | 82,020 | 82,020 | 82,020 |
| **resolve** | 2 | 77,704 | 198,309 | 318,914 |
| **recordAttestation** | 1 | 281,626 | 281,626 | 281,626 |

### 20 anchorBatch Gas Benchmark Samples

| Call # | Gas Used | Block Number | Transaction Hash | Explorer Link |
| :--- | :--- | :--- | :--- | :--- |
| Sample #01 | 179,831 | 321585847 | [`0x12c427a36b008e...`](https://sepolia.arbiscan.io/tx/0x12c427a36b008e6745bd2186c0772cf210806feb37a509f23ec7b237634f461b) | [View Tx](https://sepolia.arbiscan.io/tx/0x12c427a36b008e6745bd2186c0772cf210806feb37a509f23ec7b237634f461b) |
| Sample #02 | 179,843 | 321585862 | [`0x525b1dd5744d06...`](https://sepolia.arbiscan.io/tx/0x525b1dd5744d0674edaec6cf0812ca03fde4745de697755d2c27863f146b8137) | [View Tx](https://sepolia.arbiscan.io/tx/0x525b1dd5744d0674edaec6cf0812ca03fde4745de697755d2c27863f146b8137) |
| Sample #03 | 179,843 | 321585880 | [`0x4be3c846ae8ee3...`](https://sepolia.arbiscan.io/tx/0x4be3c846ae8ee3af84c85d41c55aea6cade02dac10aa79ba821b6db081c7f18e) | [View Tx](https://sepolia.arbiscan.io/tx/0x4be3c846ae8ee3af84c85d41c55aea6cade02dac10aa79ba821b6db081c7f18e) |
| Sample #04 | 179,843 | 321585896 | [`0xdea0840e075769...`](https://sepolia.arbiscan.io/tx/0xdea0840e07576901f13532b673c6299475ac476e20f4253b009d4d94c895297d) | [View Tx](https://sepolia.arbiscan.io/tx/0xdea0840e07576901f13532b673c6299475ac476e20f4253b009d4d94c895297d) |
| Sample #05 | 179,843 | 321585915 | [`0x8e8cd9be3b3110...`](https://sepolia.arbiscan.io/tx/0x8e8cd9be3b31103c2a55e38fa88c92b435fa19d8d6364d2c98c0553cb5e4faec) | [View Tx](https://sepolia.arbiscan.io/tx/0x8e8cd9be3b31103c2a55e38fa88c92b435fa19d8d6364d2c98c0553cb5e4faec) |
| Sample #06 | 179,843 | 321585931 | [`0x96af26f11d9460...`](https://sepolia.arbiscan.io/tx/0x96af26f11d9460ada1a8bbd8bfb0e08c6394544bf83c23ac4ee11018e8ebdb6d) | [View Tx](https://sepolia.arbiscan.io/tx/0x96af26f11d9460ada1a8bbd8bfb0e08c6394544bf83c23ac4ee11018e8ebdb6d) |
| Sample #07 | 179,843 | 321585945 | [`0x448612c2d6d550...`](https://sepolia.arbiscan.io/tx/0x448612c2d6d550df9bd5fad51cf53f9841facfd6228137c086e04b6778384ccb) | [View Tx](https://sepolia.arbiscan.io/tx/0x448612c2d6d550df9bd5fad51cf53f9841facfd6228137c086e04b6778384ccb) |
| Sample #08 | 179,843 | 321585965 | [`0xcf5a53eed81ce1...`](https://sepolia.arbiscan.io/tx/0xcf5a53eed81ce13c2862113e01cbef69c5dc82a45cdd113e2b27180c46e343d2) | [View Tx](https://sepolia.arbiscan.io/tx/0xcf5a53eed81ce13c2862113e01cbef69c5dc82a45cdd113e2b27180c46e343d2) |
| Sample #09 | 179,843 | 321585981 | [`0x73d99103df2414...`](https://sepolia.arbiscan.io/tx/0x73d99103df24149acd55587b0a455fa2c88a7dba69240cb93400c75fdb5b2f0c) | [View Tx](https://sepolia.arbiscan.io/tx/0x73d99103df24149acd55587b0a455fa2c88a7dba69240cb93400c75fdb5b2f0c) |
| Sample #10 | 179,843 | 321585995 | [`0x96e8861c807a9a...`](https://sepolia.arbiscan.io/tx/0x96e8861c807a9ae6d5cd6881b3a3aa7f8ab10ffdb313db620fbe712add068806) | [View Tx](https://sepolia.arbiscan.io/tx/0x96e8861c807a9ae6d5cd6881b3a3aa7f8ab10ffdb313db620fbe712add068806) |
| Sample #11 | 179,843 | 321586010 | [`0x416085b9251333...`](https://sepolia.arbiscan.io/tx/0x416085b9251333041aac693a7be14c4b22111cd4e871fcdca0d425d329be68f6) | [View Tx](https://sepolia.arbiscan.io/tx/0x416085b9251333041aac693a7be14c4b22111cd4e871fcdca0d425d329be68f6) |
| Sample #12 | 179,843 | 321586027 | [`0x2e796c807c18b8...`](https://sepolia.arbiscan.io/tx/0x2e796c807c18b8fb3afabbfa4c48609ed71d0cdd40608e2132fef0e9571f06f2) | [View Tx](https://sepolia.arbiscan.io/tx/0x2e796c807c18b8fb3afabbfa4c48609ed71d0cdd40608e2132fef0e9571f06f2) |
| Sample #13 | 179,843 | 321586046 | [`0x794448c32bea1d...`](https://sepolia.arbiscan.io/tx/0x794448c32bea1dd8b3a6591a1cc0aa82cf6ca279b54f386718f334f284af17ca) | [View Tx](https://sepolia.arbiscan.io/tx/0x794448c32bea1dd8b3a6591a1cc0aa82cf6ca279b54f386718f334f284af17ca) |
| Sample #14 | 179,843 | 321586061 | [`0x4b3abe282c6044...`](https://sepolia.arbiscan.io/tx/0x4b3abe282c6044ca0550c854e7b7729662573a3eb901fef0d582d837f52c9399) | [View Tx](https://sepolia.arbiscan.io/tx/0x4b3abe282c6044ca0550c854e7b7729662573a3eb901fef0d582d837f52c9399) |
| Sample #15 | 179,843 | 321586077 | [`0xbf7654ec430613...`](https://sepolia.arbiscan.io/tx/0xbf7654ec43061357bcdaf5da72d7f27dda67c01fe76162fceb4f32a6c1185a26) | [View Tx](https://sepolia.arbiscan.io/tx/0xbf7654ec43061357bcdaf5da72d7f27dda67c01fe76162fceb4f32a6c1185a26) |
| Sample #16 | 179,831 | 321586094 | [`0x1c7f61ce50bfdd...`](https://sepolia.arbiscan.io/tx/0x1c7f61ce50bfddb1d3a2a71cf8ae02cc175b2d59a9fa39e86e9aeca31fbcbbdf) | [View Tx](https://sepolia.arbiscan.io/tx/0x1c7f61ce50bfddb1d3a2a71cf8ae02cc175b2d59a9fa39e86e9aeca31fbcbbdf) |
| Sample #17 | 179,843 | 321586111 | [`0x8a7a5450c266d2...`](https://sepolia.arbiscan.io/tx/0x8a7a5450c266d254ba96fab435ac24c8e40d74b9df60bee10686a89aa0cef73e) | [View Tx](https://sepolia.arbiscan.io/tx/0x8a7a5450c266d254ba96fab435ac24c8e40d74b9df60bee10686a89aa0cef73e) |
| Sample #18 | 179,843 | 321586127 | [`0x8bc08869068f12...`](https://sepolia.arbiscan.io/tx/0x8bc08869068f1205286c8b54ef4e2ebdc0fb8387575ef7b0f512e22ffb195675) | [View Tx](https://sepolia.arbiscan.io/tx/0x8bc08869068f1205286c8b54ef4e2ebdc0fb8387575ef7b0f512e22ffb195675) |
| Sample #19 | 179,843 | 321586142 | [`0xc4b248400f8bf1...`](https://sepolia.arbiscan.io/tx/0xc4b248400f8bf1d8414e3001fb8db6874dfb75ffc75e31c0b8cc85cd78e25919) | [View Tx](https://sepolia.arbiscan.io/tx/0xc4b248400f8bf1d8414e3001fb8db6874dfb75ffc75e31c0b8cc85cd78e25919) |
| Sample #20 | 179,855 | 321586158 | [`0xb0bff261e0af2b...`](https://sepolia.arbiscan.io/tx/0xb0bff261e0af2b2e4731c07fb3c22f161860074847530088424a0b4578f59ee3) | [View Tx](https://sepolia.arbiscan.io/tx/0xb0bff261e0af2b2e4731c07fb3c22f161860074847530088424a0b4578f59ee3) |