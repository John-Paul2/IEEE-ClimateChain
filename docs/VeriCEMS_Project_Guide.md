# VeriCEMS: Complete Project Guide

**IEEE Global ClimateChain Hackathon 2026 · Track 4 (Climate Data & Environmental Monitoring), with a bridge to carbon compliance**

> **Tagline:** *Don't trust the sensor. Verify the physics and the chain.*

This file answers all 12 of your questions in one place. It is written for someone who is new to the topic, so every idea is explained in plain words before it is used.

---

## How to read this file

Facts and numbers carry a tag so you always know how far to trust them:

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | Confirmed against at least one source during our research. Most sources were secondary (news, consultancies), so **re-check against the official text before quoting it in your submission.** |
| **[VERIFY]** | Not confirmed yet. Check before you use it. |
| **[ILLUSTRATIVE]** | Invented numbers used only to teach. Never present them as real data. |
| **[DECISION]** | A choice you need to make. |

**Deadline reality:** the submission deadline is **October 25, 2026, 11:59 PM UTC**; judging runs Oct 26 to Nov 6; winners are announced at COP 31 (Nov 10-21) **[VERIFIED, hackathon page]**.

### Where each of your questions is answered

| Your question | Section |
|---|---|
| 1. Flow of the project from the start | 3 |
| 2. How blockchain is used; is it strong? | 4 |
| 3. Real-world application and scalability | 6 |
| 4. How current systems work and where we fit | 5 |
| 5. Datasets and what to collect | 7 |
| 6. Making the project viable | 8 |
| 7. Comparison with competitors | 9 |
| 8. Target users and why | 10 |
| 9. What makes it impressive | 11 |
| 10. This md file | (you are reading it) |
| 11. Overview and problem statement | 1 |
| 12. Background knowledge in basic terms | 2 |
| Extra: hackathon rules check, tech stack, appendices | 12, 13, 14 |

---

# 1. Project overview and problem statement (Question 11)

## 1.1 The project in one paragraph

Factories that export steel, cement, aluminium and fertiliser to Europe must now prove how much CO₂ they emit, because the EU charges importers a carbon cost on those emissions. The proof starts with sensors in the factory's chimney. But the sensor data passes through the factory's own computers before anyone else sees it, so a dishonest operator can alter it. **VeriCEMS makes that data tamper-evident.** It digitally seals each reading at the source, links the readings so nothing can be deleted or replayed, checks them against the laws of physics, and has independent verifiers vote on whether each batch looks honest. Operators put up a deposit (a "bond") that they lose if fraud is confirmed. Honest data becomes a verifiable record that an EU importer can check in one click, along with how much money verified data saves them compared with the EU's punitive default values.

## 1.2 The problem statement (draft for your 2-page deliverable)

**Title: Trustworthy emissions data for CBAM: making smokestack measurements tamper-evident**

**Context.** The EU Carbon Border Adjustment Mechanism (CBAM) entered its definitive phase on 1 January 2026 **[VERIFIED]**. EU importers of covered goods (cement, iron and steel, aluminium, fertilisers, electricity, hydrogen) must surrender CBAM certificates for the emissions embedded in those goods. Certificates are priced from the EU carbon market; the Q3 2026 price is €82.32 per tonne of CO₂e **[VERIFIED]**. If a foreign producer cannot supply verified, installation-level emissions data, the importer must fall back on **default values**, which carry a markup of 10% in 2026, 20% in 2027 and 30% from 2028 **[VERIFIED, secondary source]**. Honest producers therefore have a financial reason to prove their real emissions, and importers have a legal reason to demand that proof.

**The gap.** A producer's emissions are measured by monitoring equipment on the stack, but that data passes through computers the producer controls. A dishonest operator can scale numbers down, replay "clean" history, or flatten the readings, and a blockchain cannot detect this on its own: it can only preserve whatever it is given. This is known as the **oracle problem**. Verification by accredited third parties is periodic and sample-based, so tampering between audits can go unnoticed, and an importer has no cheap way to tell an honest supplier's data from a manipulated one.

**Why it matters.** Carbon pricing only changes behaviour if the measurements behind it are credible. Misreported emissions mean unpriced emissions, an unfair advantage for cheaters over honest producers, and higher audit costs for everyone.

**Our solution (VeriCEMS).** A four-layer pipeline:
1. **Sealed telemetry:** each reading is signed by a device key and chained to the previous one, so deletion, reordering and replay become detectable.
2. **Physics and AI checks:** the data must obey combustion mass balance and match learned normal behaviour; an adversarial benchmark measures what still slips through.
3. **Bonded verifier quorum:** independent verifiers vote; fraud findings enter a challenge window and, if upheld, cost the operator part of its bond.
4. **Importer portal:** a buyer verifies a supplier's attestation against the chain and sees the CBAM cost with default values versus verified data.

**Why blockchain.** The operator, the verifiers, the importer and the regulator do not fully trust one another and sit in different countries. A neutral, shared, tamper-evident ledger with enforceable deposits gives them one record to rely on that no single party controls.

**Scope and honesty.** VeriCEMS supports, and does not replace, accredited human verification and the official CBAM registry. The prototype is evaluated on real US power-plant data as a proxy for industrial installations, with some channels simulated and clearly labelled.

## 1.3 What we build (the MVP)

1. Hash-chained, signed telemetry (simulated secure element in the demo)
2. Detection engine: physics mass-balance rules plus a physics-informed autoencoder
3. An honest benchmark of 8 attack types, including an adaptive attacker, on real data
4. Smart contracts: device registry, bond vault, batch anchoring, verifier quorum, challenge and slashing, attestations
5. Importer portal with a transparent CBAM cost calculator
6. Required documents, diagram and a 3-minute video

## 1.4 What we deliberately do NOT build (scope freeze)

Zero-knowledge circuits, live satellite integration, full Scope 2 and precursor accounting, and a physical hardware rig are **future work**, mentioned in the paper but not built. Optional extras if time allows: unpredictable canary batches, simulated analog-dilution attack, one precursor-credential example.

## 1.5 Why this fits Track 4

The official Track 4 bullets include *decentralized climate data collection and verification networks* and *IoT sensor networks for environmental monitoring* **[VERIFIED, hackathon page]**. VeriCEMS is a decentralized verification network for sensor data, and it connects to the carbon-market theme that COP 31 is expected to focus on.

## 1.6 Honest limits (say these out loud in your submission)

- Signing data cannot fix a sensor that was physically tampered with before it measured anything. We detect some of this; we do not claim to catch all of it.
- Real data comes from US power plants, not steel or cement works, so it is a proxy.
- A determined, coordinated insider who fakes every independent source at once is still possible; our goal is to make that much more expensive, not impossible.
- This is a proof of concept, not a certified compliance product.

---

# 2. Everything you need to know, in basic terms (Question 12)

Read this section first if any word in the rest of the file is unfamiliar. Each idea builds on the one before it.

## 2.1 Greenhouse gases and "CO₂e"

Some gases trap heat in the atmosphere. The best known is carbon dioxide (CO₂). Others, such as methane, trap more heat per tonne, so scientists convert everything into **CO₂ equivalent (CO₂e)** to count it in a single unit: **tonnes of CO₂e (tCO₂e)**.

Factories release CO₂ in two main ways:
- **Burning fuel** (coal, gas, oil) for heat or power.
- **Chemical processes** (for example, making cement releases CO₂ from limestone even without burning anything extra).

The gas leaves through a chimney called a **stack**. The mixture of gases coming out is called **flue gas**.

## 2.2 Carbon pricing: making pollution cost money

If emitting is free, nobody has a reason to emit less. **Carbon pricing** charges emitters per tonne. In the EU this works through the **Emissions Trading System (EU ETS)**: companies need an **allowance** (permit) for every tonne they emit, and the allowance price is set by a market. To protect European industry from being undercut, some companies receive some allowances **free** (called **free allocation**), and these free allowances are being phased out over time.

**The problem this creates:** if EU factories pay for carbon but foreign factories do not, production (and emissions) can simply move abroad. This is called **carbon leakage**.

## 2.3 CBAM: the carbon price at the border

The **Carbon Border Adjustment Mechanism (CBAM)** applies a similar carbon cost to certain imports so that imported goods face a comparable price. Key facts:

| Fact | Detail |
|---|---|
| Covered goods | Cement, iron and steel, aluminium, fertilisers, electricity, hydrogen |
| Definitive (paying) phase | Started **1 Jan 2026** **[VERIFIED]** |
| Who is legally responsible | The **EU importer** (the "authorised declarant"), not the foreign factory |
| First annual declaration and certificate surrender | **30 Sept 2027**, covering 2026 imports **[VERIFIED]** |
| Certificate sales begin | **Feb 2027** **[VERIFIED]** |
| Certificate price in 2026 | Based on quarterly averages: Q1 €75.36, Q2 €75.28, Q3 €82.32 per tCO₂e **[VERIFIED]** |
| Penalty for failing to surrender enough certificates | €100 per tCO₂e (Article 26) **[VERIFIED, secondary source]** |
| Small-importer exemption | 50 tonnes of goods **mass** per importer per year (not 50 tonnes of CO₂) **[VERIFIED]** |

**Embedded emissions** are the emissions released while making the product. Per tonne of product, this is the **Specific Embedded Emissions (SEE)**:

> SEE = emissions of the installation ÷ tonnes of product made (for a simple single-product plant)

**Default values:** if the foreign producer cannot provide verified actual data, the importer must use a standard value for that product and country. These defaults carry a **markup** (10% in 2026, 20% in 2027, 30% from 2028) **[VERIFIED, secondary source]**. This is the main reason honest producers want verified data: it is cheaper than the default.

**Benchmark and free allocation adjustment:** EU producers get free allowances up to a **benchmark** (a standard emissions level per tonne for each production route). CBAM subtracts an equivalent amount from what importers owe, so importers only pay for emissions **above** the benchmark-sized free allocation. The amount subtracted is:

> SEFA = free-allocation factor × CSCF × benchmark

and the importer's payable emissions per tonne are:

> payable = max(0, SEE − SEFA)

- The **free-allocation factor** is 97.5% in 2026 (that is, the "CBAM factor" of 2.5% payable) and shrinks to 0% free (100% payable) by 2034 **[VERIFIED for 2026 and 2034; check the years in between]**.
- **CSCF** (cross-sectoral correction factor) is a correction number. A review claimed it equals 1.00 for 2026 to 2030 but **[VERIFY]**: treat it as an input you look up.
- Benchmarks are in Implementing Regulation 2025/2620; default values in 2025/2621 (corrected by 2026/1740) **[VERIFIED]**.

**Important consequence:** because only a benchmark-sized chunk is shielded, most of the gap between a marked-up default value and a lower verified value is charged at the full price. Verified data really saves money, even in 2026.

**Who checks the numbers:** CBAM requires verification of declared emissions by an **accredited verifier** (an independent auditing body certified to do this) **[VERIFIED, rules exist in Implementing Regulation 2025/2546 and Delegated Regulation 2025/2551]**.

> Our demo focuses on **direct stack emissions**. Some sectors also count indirect (electricity) emissions. Check the regulation's Annex II and the methodology act before claiming anything about that **[VERIFY]**.

## 2.4 How factories measure emissions today

- **CEMS (Continuous Emission Monitoring System):** analyzers attached to the stack that measure gas concentrations (CO₂, O₂, SO₂, NOx), gas flow and temperature, all day, every day. A data system converts them into mass of CO₂ emitted.
- **Measurement-based vs calculation-based:** you can *measure* emissions at the stack (CEMS), or *calculate* them from how much fuel you burned and a standard emission factor. CBAM allows both.
- **Calibration:** analyzers drift, so they are regularly tested with known "zero" and "span" gases. Quality-assurance rules exist for how monitors are certified and checked (for example EN 14181 in Europe and 40 CFR Part 75 in the US) **[VERIFY details]**.

## 2.5 How cheating can happen, and the "oracle problem"

Three broad ways to cheat:
1. **Digital:** change the numbers in the computer after the sensor measures them (scale them down, repeat old clean data, flatten them).
2. **Analog/physical:** interfere with the measurement itself, for example by diluting the sample with outside air or pulling the probe out of the gas stream. The sensor then honestly reports a diluted number.
3. **Insider collusion:** someone who controls several systems at once makes everything agree.

**The oracle problem, in one analogy:** a blockchain is like a notebook that nobody can erase. If the person writing in it lies, you get a perfectly preserved lie. Garbage in, garbage forever. A system that uses a blockchain for emissions data must therefore work on *how the data gets there*, not just where it ends up. That is the whole point of VeriCEMS.

## 2.6 Blockchain basics

- A **blockchain** is a shared record (a "ledger") copied across many computers. New entries are added in **blocks**, and each block is linked to the previous one, so changing history would mean changing every later block on most of the computers at once. That makes tampering very hard and very visible.
- **Why people use it:** several parties who do not trust each other can rely on one record that no single party controls.
- **Wallet / address:** your identity on a blockchain is a pair of keys; the public part acts like an account number.
- **Gas:** every action costs a small fee, paid in the chain's currency. Writing less data costs less.
- **Layer 2 (L2):** a cheaper "express lane" built on top of a main chain such as Ethereum, with much lower fees. We would use an L2.
- **Testnet:** a practice version of a blockchain using worthless "test" coins. The hackathon accepts testnet deployments **[VERIFIED]**.
- **Public vs private chain:** public chains are open to anyone; private ones are controlled by a group. We use a public testnet so anyone can inspect our transactions.

## 2.7 Cryptography basics (the three tools we use)

**Hash (a digital fingerprint).** A hash function turns any data into a short fixed-size code. Change one digit of the data and the code changes completely. You cannot work backwards from the code to the data. Example: the hash of a day's readings is a fingerprint of that day.

**Digital signature (a wax seal).** A device has a **private key** (kept secret) and a **public key** (shared). It signs data with the private key; anyone can check the signature with the public key. If the data changes after signing, the check fails. In real deployments, the private key lives inside a **secure element**, a tamper-resistant chip that never reveals the key (the ATECC608 is an example).

**Hash chain (a notebook with numbered pages).** Each reading includes the fingerprint of the previous reading. Now you cannot delete, reorder or insert a reading without breaking the chain. A replayed old reading would carry the wrong "previous fingerprint". Think of a notebook where every page quotes the fingerprint of the page before.

**Merkle tree (one fingerprint for a whole stack).** Hash each reading, then hash pairs of hashes, then pairs of those, until one hash remains: the **Merkle root**. Writing only the root on the blockchain commits to *all* the readings at tiny cost. Later, someone can prove that one specific reading was part of that batch by showing a short chain of hashes (a **Merkle proof**), without revealing the others.

## 2.8 Smart contracts, bonds and verification games

- A **smart contract** is a program stored on a blockchain that runs exactly as written and cannot be quietly changed. It can hold money and enforce rules automatically.
- **Staking / bond:** a participant locks a deposit as a promise of good behaviour.
- **Slashing:** if they are proven to have cheated, part of the deposit is taken away. Think of a security deposit on a rental flat.
- **Quorum (3-of-5):** a decision needs agreement from at least 3 out of 5 independent verifiers, so one bad verifier cannot decide alone.
- **Commit-reveal:** verifiers first submit a sealed answer (a hash), then reveal it. This stops them from copying each other.
- **Optimistic challenge window:** a decision is provisional for a set time (say 24 hours). During it, the accused can dispute. Only after the window closes does the penalty happen. This protects honest operators from false alarms.
- **Verifier's dilemma:** if 99% of batches are honest, a lazy verifier can always vote "fine" without running any checks. Fixes include occasionally slipping in known-bad "canary" batches and punishing verifiers who miss them (an idea related to forced errors in the TrueBit protocol).

## 2.9 The AI and physics ideas (no maths needed)

- **Mass balance / stoichiometry:** burning a fuel produces a predictable amount of CO₂ per unit of energy. If a plant reports burning a lot of fuel but very little CO₂, the numbers are inconsistent. This kind of rule is simple and easy to defend.
- **Anomaly detection:** teaching a program what "normal" looks like and flagging anything that doesn't fit.
- **Autoencoder:** a small neural network that learns to squeeze normal data into a short summary and rebuild it. If it rebuilds the data badly, the data is unusual. A **physics-informed** version also gets penalised when its rebuilt data breaks a known physical rule.
- **Spectral / FFT analysis:** looking at the "rhythm" of a signal. Fake data is often too smooth (too regular) or repeats too perfectly.
- **Adversarial (adaptive) attacker:** an attacker who knows how your detector works and tries to fool it on purpose. Testing against one is the honest way to measure a defence.
- **Metrics:**
  - **Precision:** of everything we flagged, how much was truly fraud?
  - **Recall:** of all the fraud, how much did we flag?
  - **False positive rate:** how often do we wrongly accuse an honest batch? This matters a lot because accusations can cost an operator money.
  - **ROC curve / AUROC:** a graph and a score showing how well a detector separates fraud from honest data across all thresholds.
- **Train / validation / test split and leakage:** you teach the model on one set, tune it on a second, and measure it on a third it has never seen. If related data leaks between sets (for example, the same power plant appears in both training and testing), the results look better than they really are. We split **by facility** to avoid that.

## 2.10 Glossary

| Term | Plain meaning |
|---|---|
| CBAM | EU carbon cost applied to imports |
| EU ETS | The EU's carbon market for its own industry |
| tCO₂e | Tonnes of CO₂ equivalent |
| SEE | Emissions per tonne of product |
| Default value | Fallback emissions figure used when verified data is missing (with markup) |
| Benchmark | Standard emissions per tonne for a production route |
| SEFA | Free-allocation amount subtracted from what the importer owes |
| CEMS | Continuous Emission Monitoring System (stack sensors) |
| Stack / flue gas | The chimney / the gas leaving it |
| Authorised declarant | The EU importer legally responsible under CBAM |
| Accredited verifier | Independent, certified auditor of emissions data |
| Oracle problem | A blockchain can't tell if the data fed into it is true |
| Hash | A fingerprint of data |
| Hash chain | Readings linked by fingerprints so order and completeness are provable |
| Merkle root / proof | One fingerprint for a batch / proof that an item is in it |
| Digital signature | Cryptographic seal proving who sent data and that it was unchanged |
| Secure element | Tamper-resistant chip holding a private key |
| Smart contract | Program on a blockchain enforcing rules automatically |
| Bond / stake | Deposit that can be lost for cheating |
| Slashing | Taking part of a deposit as punishment |
| Quorum | Minimum number of verifiers needed to decide |
| Commit-reveal | Submit a sealed answer, then open it later |
| Challenge window | Time during which a decision can be disputed |
| Testnet | Practice blockchain with worthless coins |
| L2 | Cheaper layer built on a main blockchain |
| Gas | Fee for blockchain actions |
| Autoencoder | Network that rebuilds normal data; poor rebuilds signal anomalies |
| Adaptive attacker | Attacker who knows and targets your detector |
| Precision / recall | Accuracy of alarms / share of fraud caught |
| False positive | An honest batch wrongly flagged |
| Proxy dataset | Real data from a similar but not identical setting |

## 2.11 The whole story in one paragraph

A steel works in India wants to sell to a German buyer. The German buyer owes the EU a carbon cost for the steel's emissions, and if the Indian plant cannot prove its real emissions the buyer must use a pricey default. The plant already measures its stack, but the buyer cannot trust numbers that passed through the plant's own computers. VeriCEMS seals each reading at the source, chains and batches them, checks them against physics, lets independent verifiers vote, makes the plant put up a deposit it loses if fraud is confirmed, and gives the buyer a one-click way to confirm the record and see the savings. The blockchain is the neutral referee that holds the fingerprints, the deposits and the verdicts.

---

# 3. The flow of the project from the start (Question 1)

## 3.1 The cast

| Actor | Role |
|---|---|
| **Operator** | The factory. Runs the monitoring system and posts a bond. |
| **Gateway** | A small device beside the monitoring system. Seals and chains the readings. |
| **Verifier nodes** (5 in the demo) | Independent parties that run the checks and vote. |
| **Arbiter** | A small group (multisig) standing in for accredited verification bodies. Resolves disputes. |
| **Smart contracts** | The neutral referee that holds fingerprints, deposits and verdicts. |
| **Importer** | The EU buyer who needs to trust the supplier's data. |

## 3.2 Step by step

**Step 0. One-time setup**
- The gateway creates a key pair; the private key never leaves the secure element (simulated in the demo).
- The public key is registered on-chain against the installation's ID (**DeviceRegistry**).
- The operator locks a bond (**BondVault**). Verifiers register with their own stakes.

**Step 1. Measure**
The stack analyzers measure gases, flow and temperature. A plant data system records them (typically about once a minute in real life; one hourly record per step in our CAMPD-based benchmark).

**Step 2. Seal and chain**
Every reading becomes a packet:

```
packet = { seq, timestamp, values, previous_packet_hash, signature }
```

The signature is made inside the secure element. Because each packet contains the previous one's hash, you cannot delete, reorder or replay readings without breaking the chain.

**Step 3. Batch and commit**
Every batch (for example one hour in production; 24 records in the benchmark; 8 in the live demo so it moves fast) is hashed into a **Merkle tree**. Only the **root** (32 bytes) goes on the blockchain (**BatchAnchor**). The raw packets stay off-chain with the operator, and copies go to the verifiers.

**Step 4. Check (off-chain, by each verifier independently)**
1. Signatures valid? Chain unbroken? Sequence numbers complete? (cheap, deterministic)
2. Physics: does CO₂ mass match heat input and fuel? Do load, heat input and emissions move together?
3. AI: is the physics-informed autoencoder's reconstruction error unusually high? Do the spectral/autocorrelation features look natural?
4. Combine into a verdict and a trust score.

**Step 5. Vote (commit-reveal)**
Each verifier submits a sealed commitment: `hash(model_hash + input_hash + quantized_score + verdict)`, then reveals it. Three of five matching "clean" verdicts accept the batch; three "fraud" verdicts flag it.

**Step 6. Outcome**
- **Clean:** the batch is recorded as verified and counts toward the period's attestation.
- **Flagged:** the batch is **quarantined**. The evidence is anchored on-chain, and a **challenge window** opens (24 hours in real life; about 2 minutes in the demo).

**Step 7. Challenge and slashing**
The operator can dispute during the window by submitting raw data and an explanation. The arbiter decides. If the flag stands, part of the bond is **slashed** (shared between verifiers who found the fraud and a treasury). If the flag is overturned, the batch is cleared and verifiers who flagged carelessly lose some stake.

**Step 8. Period report**
At the end of a period, accepted batches are summed into total verified emissions and divided by production to give SEE. The system issues an on-chain **attestation** (installation, period, total tCO₂e, coverage, Merkle roots) and a downloadable signed report ("CBAM-aligned", not "official").

**Step 9. Importer verifies**
The importer uploads the report. The portal recomputes the Merkle proofs against the on-chain roots, shows the attestation, lists flagged or missing hours, and runs the CBAM calculator comparing default values with verified data.

**Step 10. Real-world use of the evidence**
The importer uses the evidence in its normal CBAM process; the accredited verifier uses it to focus audits on suspicious periods.

## 3.3 Flow diagram

```
 STACK SENSORS ──► PLANT DATA SYSTEM ──► GATEWAY (secure element)
                                           │  seals + chains packets
                                           ▼
                                  hourly BATCH ──► Merkle root ──► [ BLOCKCHAIN ]
                                           │                         ▲   ▲   ▲
                                 raw packets (off-chain)             │   │   │
                                           │                  commits │  │   │ bond, verdicts,
                                           ▼                          │  │   │ attestations
                         VERIFIER NODES x5 (physics + AI + chain checks)  │   │
                                           │                              │   │
                                  3-of-5 vote ──► clean ──► attestation ──┘   │
                                           └────► flagged ─► challenge window ┘
                                                             │ arbiter decides
                                                             ▼
                                                       slash or clear
                                                                     
 IMPORTER PORTAL ◄── signed report + Merkle proofs ◄── period report
     │ verifies against chain, runs CBAM calculator (default vs verified)
```

## 3.4 A worked story (all names fictional)

*Southern Steel Works* (a fictional installation in India) ships 500 tonnes of steel to *Hansa Metallhandel GmbH* (fictional, Germany).

- **A normal hour:** load 310 MW-equivalent, heat input and CO₂ move together, the verifiers vote clean, the root is anchored, coverage ticks up.
- **An attack hour:** an insider scales the reported CO₂ down 30% before the gateway signs it. The signature is valid, because the data was changed *before* sealing. But CO₂ no longer matches heat input, the autoencoder's error spikes, and the verifiers vote "fraud". The batch is quarantined, the challenge window opens, and the arbiter upholds the flag, so the bond is slashed.
- **The buyer's view:** Hansa uploads the report. The portal shows 96% of hours verified, 3 quarantined hours (visible evidence), and a cost comparison against the default.

## 3.5 Attack classes and what stops each

| Attack | What stops it | Honest remaining weakness |
|---|---|---|
| Tamper with data **after** signing | Signature check fails | None beyond key security |
| Delete, reorder or replay packets | Hash chain and sequence numbers | An attacker holding the signing key can re-sign |
| Scale or flatten numbers **before** signing | Physics rules, autoencoder, spectral checks | A smart attacker who matches the physics may pass |
| Slow calibration drift | Trend checks against load and fuel records | Small drifts are hard to detect quickly |
| Physical or analog tampering (dilution, probe displacement) | Partial: oxygen and flow consistency checks (simulated in our demo) | Sensor honestly reporting a manipulated sample |
| Coordinated insider faking several systems | Cross-source consistency (fuel records, power usage) | Possible if every independent source is also faked |
| Malicious firmware on the gateway | Future work: secure boot and remote attestation | Must trust the device manufacturer |
| Colluding or lazy verifiers | Bonds, quorum, canary batches (optional) | Verifier set must be diverse |

---

# 4. How blockchain is used, and is the implementation strong? (Question 2)

## 4.1 What goes on-chain and what stays off

| On-chain (small, valuable, needs neutrality) | Off-chain (large, private, or computed) |
|---|---|
| Device public keys and status | Raw readings (confidential to the operator) |
| Bonds and slashing | AI model and its inference |
| Merkle roots of each batch | Detailed analysis and charts |
| Verifier commitments and votes | The web app |
| Challenge outcomes | CBAM calculator (runs in the browser) |
| Period attestations | |

## 4.2 The contracts (outline)

| Contract | Job | Main functions (sketch) |
|---|---|---|
| **DeviceRegistry** | Who may produce data | `registerDevice`, `rotateKey`, `revokeDevice` |
| **BondVault** | Holds deposits | `deposit`, `requestWithdraw` (with delay), `slash` |
| **BatchAnchor** | Records Merkle roots | `anchorBatch(deviceId, root, firstSeq, lastSeq)` |
| **VerifierQuorum** | Collects votes | `commitVote`, `revealVote`, `finalize` |
| **Challenge** | Disputes | `openChallenge`, `resolve` (arbiter), `settle` |
| **Attestation** | Final records | `recordAttestation(installation, period, totalTonnes, root, coverage)` |

Keep the contracts small and simple. Fewer moving parts means fewer bugs and an easier security story.

## 4.3 Why blockchain and not a normal database? (a judge will ask)

1. **No single trusted owner.** An exporter would not trust the importer's database, the importer would not trust the exporter's, and neither may trust a single national body. A shared ledger removes the need to pick one.
2. **Tamper-evident history with a neutral timestamp.** Anyone can prove a batch existed in a certain form at a certain time.
3. **Enforceable deposits.** Bonds and slashing are executed by code, not by a company that can be pressured or fail.
4. **Anyone can verify.** An importer or auditor can check a proof without asking permission.
5. **Resilience.** No single server to switch off or quietly edit.

The honest counterpoint: if all parties already trusted one operator, a database would do. Our case is the opposite: the parties have conflicting interests.

## 4.4 Is the implementation strong?

**Strong points**
- It confronts the oracle problem directly instead of ignoring it.
- It uses **economic enforcement** (bonds, challenge windows, commit-reveal) that mirrors modern "optimistic" verification designs.
- It keeps sensitive data off-chain and puts only fingerprints on-chain.
- It is measurable: gas costs, test coverage and attack-detection results can all be reported.

**Weak points and assumptions (state them openly)**
- **Hardware trust:** keys must live in tamper-resistant hardware and firmware must be trustworthy. The demo simulates this.
- **The arbiter is a trust anchor.** Disputes need a decider. We model it as a multisig of accredited-verifier bodies, which mirrors the role verifiers already play in CBAM.
- **Verifier diversity:** five verifiers run by us prove the mechanism but not independence. Production needs different organizations.
- **False positives are costly.** Wrongly slashing an honest operator would destroy trust. So in the real world slashing should follow a human or accredited confirmation, and we report the false-positive rate openly.
- **Determinism of AI outputs.** Floating-point results can differ slightly between computers, so verifiers might not produce identical hashes. Fix: quantize scores to fixed bins, pin library versions, and commit to a discretized verdict.
- **Signature verification cost.** Most EVM chains verify secp256k1 signatures cheaply but not the P-256 curve used by many secure elements. Verifiers check signatures off-chain; some L2s add P-256 support (RIP-7212) **[VERIFY]**, enabling on-chain checks later.

## 4.5 Security design rules for the contracts

- Commit-reveal for votes; reveal only after the commit phase ends.
- Pull payments instead of pushing funds; reentrancy guards on every function that moves value.
- Role-based access control, a pause switch, no upgradeable proxies (keep it auditable).
- Withdrawal delay on bonds so operators cannot dodge slashing.
- Tests with Foundry, including fuzz tests and **invariants** such as: total funds are conserved; slashed amount never exceeds the bond; a batch is finalized at most once; sequence numbers only increase; only registered, non-revoked devices can anchor.
- Run Slither and include its output in the security document.

## 4.6 Questions judges are likely to ask

| Question | Short answer |
|---|---|
| Why not a database? | The parties distrust each other; bonds need neutral enforcement (4.3). |
| What if the factory signs fake data? | We say plainly that signatures prove origin, not truth. Physics, AI and cross-checks target this, with an adversarial benchmark showing what still slips through. |
| Who runs the AI? | Five independent verifier nodes run the same committed model; quorum and bonds keep them honest. |
| What if verifiers collude? | Bond losses, diverse operators in production, and canary batches; honest limit in the paper. |
| Who resolves disputes? | A multisig arbiter representing accredited verifiers, an explicit trust anchor. |
| Is it ready for production? | No. It is a proof of concept with a clear path: shadow pilot, then a verifier partnership. |
| What does it cost per installation? | We measure gas on testnet and report a formula and a projection (Section 6). |
| Does it replace the CBAM registry or verifiers? | No. It adds continuous, tamper-evident evidence that supports them. |

---

# 5. How current systems work and where we fit in (Question 4)

## 5.1 How it works today (simplified)

1. The plant monitors emissions following an approved **monitoring plan**, either by direct measurement (CEMS) or by calculation from fuel use.
2. Readings land in the plant's own data systems.
3. The plant compiles an **annual installation emissions report**.
4. An **accredited verifier** audits documents and, where needed, visits the site. This is typically annual **[VERIFY]**.
5. The plant passes the data to its EU buyers, usually through spreadsheets or CBAM-specific software platforms.
6. The importer files its CBAM declaration (first one due 30 Sept 2027 **[VERIFIED]**) and surrenders certificates.
7. If no verified data exists, the importer uses **default values with a markup**.

Comparable regimes elsewhere rely on similar ideas: certified monitors plus quality-assurance rules plus audits (for example 40 CFR Part 75 in the US) **[VERIFY details]**.

## 5.2 Where today's system is weak

- **Trust gap at the source:** between the sensor and the report, plant-controlled systems handle the data.
- **Periodic and sample-based checking:** tampering between audits can go unnoticed.
- **Slow and manual:** exchanging data in spreadsheets and PDFs across companies and countries is costly.
- **No cheap way for an importer to check a supplier:** they rely on trust and paperwork.
- **Software tools focus on collecting and calculating**, not on proving the integrity of the raw measurements. For example, commercial CBAM tools describe supplier data collection, calculation and report generation **[VERIFIED, vendor pages]**.

## 5.3 Where VeriCEMS plugs in

```
TODAY:      sensor ─► plant systems ─► annual report ─► annual audit ─► importer
                       ▲ trust gap here                   ▲ periodic

WITH US:    sensor ─► SEAL + CHAIN ─► continuous verification ─► attestation ─► importer
                       (tamper-evident)  (physics + AI + quorum)    (checkable)
                                              │
                                              └─► flags help the accredited verifier target audits
```

| Actor | What changes |
|---|---|
| Plant | Gets a way to *prove* its numbers and escape default-value markups |
| Importer | Can verify a supplier in minutes and quantify the saving |
| Accredited verifier | Gets continuous evidence and risk flags instead of only a snapshot |
| Regulator | Gets tamper-evident evidence of attempted fraud |

**What does not change:** accredited verification remains required, the official CBAM registry remains the filing channel, and certified monitoring equipment remains the measurement source. VeriCEMS is a **layer around** them, not a replacement.

---

# 6. How it applies in the real world, and how it scales (Question 3)

## 6.1 What a real deployment looks like

| Piece | What it is | Notes |
|---|---|---|
| **Edge gateway** | A small industrial computer with a secure element, installed next to the plant's monitoring system | Reads data through standard industrial interfaces (commonly Modbus or OPC UA) **[VERIFY per vendor]** |
| **Cloud or on-site agent** | Packages batches, computes Merkle roots, submits them to the chain, stores raw packets | Operator keeps raw data; copies go to verifiers |
| **Verifier nodes** | Servers run by independent organizations (verification bodies, universities, industry groups) | Run the same committed model and rules |
| **Blockchain (L2)** | Holds keys, bonds, roots, votes, attestations | Cheap fees; chain-agnostic design |
| **Importer portal** | Web app for supplier checks and CBAM cost comparison | Exports evidence for the importer's own process |

**How it connects to the official system:** VeriCEMS does *not* submit anything to the EU CBAM registry. It produces tamper-evident evidence that the operator, importer and verifier can use inside their normal process.

## 6.2 Scale arithmetic (so you can answer "does this scale?")

**Raw data volume per installation.** One-minute records give 365 × 24 × 60 = **525,600 records per year**. At roughly 100 to 200 bytes each (values, hash, signature) that is on the order of **50 to 100 MB per installation per year** **[ILLUSTRATIVE estimate; measure it]**. This stays off-chain.

**On-chain writes.** With one Merkle root per hour:
- Per installation: 24 × 365 = **8,760 root submissions per year**.
- For 10,000 installations: 10,000 × 8,760 = **87.6 million per year**, about 10,000 per hour, or roughly **2.8 per second** on average.

That is well within what modern L2s handle, but cost still matters, so there are levers:
- **Batch less often:** daily roots cut the count by 24 times.
- **Batch of batches:** an aggregator combines many installations' roots into one on-chain root per hour (about 8,760 writes per year for the whole network). Trade-off: longer proofs and a little more trust in the aggregator.
- **Cost formula:** annual on-chain cost per installation = roots per year × gas per anchor × gas price. **Measure gas per anchor on your testnet deployment and report the real figure.** Do not quote a number you did not measure.

**Verification compute.** Each batch needs one cheap model pass per verifier. Work grows linearly with the number of installations and spreads across independent verifier nodes.

**Chain footprint.** Modern proof-of-stake chains and L2s use far less energy than proof-of-work chains. Cite a source for the exact comparison in your sustainability roadmap **[VERIFY]**.

## 6.3 Rollout path (this is your adoption strategy)

1. **Phase 0, hackathon:** simulation on real proxy data, testnet contracts.
2. **Phase 1, shadow mode:** install the gateway beside an existing monitoring system at one cooperative plant, change nothing, and compare results.
3. **Phase 2, verifier partnership:** one accredited verifier uses the flags and evidence on a real audit.
4. **Phase 3, network:** multiple verifier organizations, importer onboarding, integration with CBAM data-pack formats.

## 6.4 Honest barriers

- **Regulatory acceptance:** accredited verification is mandatory, so we position as pre-verification assurance.
- **Hardware and integration cost** for old plants.
- **Data confidentiality:** plants guard process data. Only fingerprints go on-chain and raw data is shared selectively. Zero-knowledge proofs are future work.
- **Legal liability** for false flags: addressed by challenge windows and human arbitration.
- **Chicken-and-egg adoption:** importers want data from suppliers who aren't on the network yet. The default-value markup gives suppliers a push.

## 6.5 Who pays (business model sketch)

Plant pays a subscription or hardware fee, because verified data replaces marked-up defaults and wins buyers. Importers may co-fund suppliers' onboarding because it lowers their own certificate costs. Verifiers earn rewards for correct work. The bond is a deposit, not a fee.

---

# 7. Datasets, tools and things you need to collect (Question 5)

## 7.1 The main dataset: EPA CAMPD (US power-plant monitoring data)

**What it is:** The US EPA's Clean Air Markets Program Data portal (campd.epa.gov) publishes hourly emissions and operating data from regulated power plants, reported under a rule called 40 CFR Part 75. It is free, large and real.

**Why we use it:** It is a high-volume public record of how real combustion units behave hour by hour: load changes, startups, shutdowns, noise. It gives our detector realistic "normal" behaviour to learn from.

**What it probably contains** (confirm in your own data card): facility and unit identifiers, date and hour, operating time, gross load (MW), steam load, heat input (mmBtu), CO₂ mass, SO₂ mass, NOx mass, and related rates and fuel type. **[VERIFY by downloading]**

**What it probably does NOT contain** in the hourly files: stack O₂ concentration, flue temperature and flow rate. **[VERIFY]** If so, any check that uses them runs on **simulated channels that you must label as synthetic.**

**Two honest caveats to write in the paper:**
1. It is **power-sector** data, a *proxy* for steel or cement plants.
2. Some fields may be **derived from each other** (for example CO₂ mass computed from heat input). A "CO₂ vs heat input" check can then be partly circular. Say so, and use the real data as a realistic baseline of normal operation, while treating independent evidence as simulated and labelled. **[VERIFY against Part 75 documentation]**

**How to split it:** by facility, using something like `GroupShuffleSplit` across 20+ facilities, repeated several times, and report mean ± standard deviation.

## 7.2 Regulatory parameters (for the importer calculator)

| Parameter | Where to find it | Status |
|---|---|---|
| CBAM certificate price (per quarter) | European Commission CBAM pages; Q3 2026 = €82.32 | **[VERIFIED]**; use the latest quarter |
| Benchmarks per production route | Implementing Regulation (EU) 2025/2620 | Look up values in the text |
| Country default values | Implementing Regulation (EU) 2025/2621, corrected by 2026/1740 | Use corrected tables |
| Default-value markups | 10% (2026), 20% (2027), 30% (2028+) | **[VERIFIED, secondary]**; read the act |
| Free-allocation factor schedule | CBAM Regulation 2023/956, Article 31 | 97.5% in 2026 **[VERIFIED]**; check later years |
| CSCF | Official Commission decision | **[VERIFY]**; keep as an input |
| Methodology (SEE, monitoring rules) | Implementing Regulation (EU) 2025/2547 | **[VERIFIED to exist]** |
| Verification principles | 2025/2546; accreditation 2025/2551 | **[VERIFIED to exist]** |

Official starting point: the Commission's "CBAM legislation and guidance" page (taxation-customs.ec.europa.eu). Open every regulation yourself and note the article or annex for each number.

## 7.3 Other data to gather

| Item | Why | Where |
|---|---|---|
| Fuel emission factors | Physics rule constants | EPA emission-factor tables / Part 75 appendices; **look up, don't hardcode from memory** |
| India's exports of CBAM-covered goods to the EU | Case-study framing and impact scenario | Eurostat trade data, Indian government trade statistics, think-tank reports |
| Typical emission intensity of steel/cement routes | Realistic illustrative values | CBAM default tables, industry reports |
| Closest prior work | Honest novelty claim | Google Scholar and GitHub searches (Section 9 lists starting points) |

## 7.4 Accounts, tools and tokens

GitHub (public repo), Devpost account and the project page, testnet wallet with faucet coins, an RPC endpoint (free tier from a node provider), a block-explorer account for contract verification, Python 3.11+, Node 20+, Foundry, Docker.

## 7.5 Things you must produce (not collect)

1. **Data card:** exact columns, units, unit types, fuels, which fields are derived, what is real vs synthetic.
2. **Tested CBAM calculator** with a cross-check against an official or reputable third-party example.
3. **Benchmark results** (real, including what still gets through).
4. **Gas report, test coverage, Slither output.**
5. **Architecture diagram and technical specification.**
6. **Security and data-integrity assessment.**
7. **Two-page problem statement** (Section 1.2 is your draft).
8. **Climate-impact assessment, adoption strategy, scalability roadmap.**
9. **3-minute video.**
10. **User feedback** (optional but valuable): even 2 to 3 short conversations.

## 7.6 Humans to talk to (highest-value, lowest-cost evidence)

A CBAM consultant or accredited verifier, an environmental engineer at a manufacturer, an exporter's compliance person, a blockchain or security researcher. Ask: *Would this reduce your work or risk? What would stop you using it?* Quote their feedback (with permission).

Short outreach message you can adapt:

> Hi [Name], I'm a student building a hackathon prototype that makes factory emissions data tamper-evident for EU CBAM reporting. Could I ask you 3 quick questions about how emissions data is verified today and whether this would be useful? 10 minutes at most. Thank you!

---

# 8. Making the project viable (Question 6)

"Viable" means it would survive contact with the real world. Here is what must be true and how you show it.

## 8.1 The viability case in five lines

1. **There is a real, dated, money-backed need:** CBAM is live and the price is real.
2. **The user has an incentive:** verified data replaces marked-up defaults, which cuts the cost of the product to the buyer.
3. **It fits the existing system:** supports accredited verifiers and the registry, does not fight them.
4. **The technology is proportionate:** hash chains, Merkle roots, bonds and quorum are mature ideas; only small data goes on-chain.
5. **The claims are measured:** detection results, gas costs and false-positive rates come from real runs.

## 8.2 Risk register

| Risk | Why it matters | Mitigation |
|---|---|---|
| False positives slash an honest operator | Destroys trust and adoption | Quorum + challenge window + human arbiter; report false-positive rate; real-world slashing only after confirmation |
| Compromised key or firmware | Attacker signs fake data | Secure element, secure boot, remote attestation (future work), key rotation and revocation |
| Colluding or lazy verifiers | Rubber-stamped batches | Bonds, diversity, canary batches (optional) |
| Regulators won't accept it | No adoption | Position as supporting evidence; involve accredited verifiers early |
| Model gives different outputs on different machines | Votes don't match | Fixed-point quantization, pinned libraries, discretized verdict |
| Cost too high | Plants won't pay | Batching, L2, batch-of-batches; show measured costs |
| Data confidentiality | Plants won't share | Only hashes on-chain; selective disclosure; ZK as future work |
| Regulatory numbers change | Calculator becomes wrong | Parameters in a config file with "last verified" dates and a sources drawer |
| Overclaiming | Loses credibility | Label synthetic, proxy and illustrative items; publish limits |

## 8.3 Viability proof checklist (do these and you can say "viable" honestly)

- [ ] Contracts deployed and **verified** on a testnet; tests pass; Slither results included
- [ ] **Measured** gas per anchor, and a cost-per-installation projection
- [ ] Benchmark on real data with **false-positive rate**, precision, recall, and the adaptive attacker's partial success shown
- [ ] CBAM calculator checked against one official or reputable third-party example
- [ ] At least one conversation with a domain expert, quoted in your docs
- [ ] A clear statement of what VeriCEMS does **not** do
- [ ] One-command reproduction so anyone can rerun your results

## 8.4 Deadline reality (if time runs short, protect things in this order)

1. Deployed, tested contracts
2. Real benchmark results
3. Importer calculator
4. Required documents and video (these are mandatory)
5. UI polish
6. Optional extras (canaries, analog simulation)

---

# 9. Comparing ourselves to competitors (Question 7)

## 9.1 The landscape

We searched for existing work. The main finding: **blockchain for emissions monitoring is not new.** Your originality must come from the *combination* and the *rigor*, not from "emissions plus blockchain".

| Group | What they do | Examples found | Relation to us |
|---|---|---|---|
| **A. CBAM compliance software** | Collect supplier data, calculate embedded emissions, generate reports, connect importers with suppliers and verifiers | Commercial platforms such as Assent, Coolset, The Carbon Pricing Platform, The Sustainability Cloud **[VERIFIED, vendor pages]** | They handle **workflow and calculation**. We secure the **integrity of the raw measurements** feeding them. Complementary, not head-to-head. |
| **B. Academic and prototype work on blockchain emissions monitoring** | Store emissions data on a blockchain, sometimes with random audits or anomaly detection | Tremble (blockchain-endorsed emission monitoring); an authenticated emissions accounting system with random verification (arXiv 2011.13954); a blockchain monitoring model for industrial parks using an outlier detector; a master's thesis on trusted pollution registers using secure hardware and oracles **[VERIFIED to exist]** | This is your **closest prior art**. Cite it and state precisely how you differ (9.3). |
| **C. Carbon-credit and dMRV platforms** | Digital measurement, reporting and verification for credit issuance | Registry platforms and open frameworks such as Hedera's Guardian **[VERIFY current status]** | Different asset (credits, not installation emissions), different users. |
| **D. Monitoring hardware and data-system vendors** | Make the analyzers and software that produce the data | Established CEMS manufacturers and data-system providers **[general knowledge; VERIFY]** | They are the **source of the data**. We are a layer on top of their output. |
| **E. Satellite and remote-sensing estimates** | Independent, coarse facility-level estimates | Open facility-level inventories **[VERIFY]** | Useful for sanity checks; far too coarse to prove a stack reading. Future work for us. |
| **F. Other hackathon entries (likely)** | Carbon-credit marketplaces, peer-to-peer energy trading, QR-code supply-chain trackers, sensor-to-blockchain loggers | Guesses based on the track list | Most will log data on-chain without adversarial testing. That is where you stand apart. |

## 9.2 Capability comparison

Legend: ● strong focus · ◐ partial · ○ not a focus. This is a **generalization by group**, not a claim about any single product. "VeriCEMS" shows what we are **aiming** to deliver; only count it once it is built and demonstrated.

| Capability | VeriCEMS (target) | A. CBAM software | B. Academic prototypes | C. dMRV / credit platforms | F. Typical hackathon entry |
|---|---|---|---|---|---|
| Tamper-evident readings from the source | ● | ○ | ◐ | ◐ | ◐ |
| Physics-based anomaly checks | ● | ○ | ◐ | ○ | ○ |
| Tested against an adaptive attacker | ● | ○ | ○ | ○ | ○ |
| Economic enforcement (bonds, challenges) | ● | ○ | ○ | ◐ | ○ |
| Independent multi-party verification | ● | ◐ | ◐ | ● | ○ |
| Direct link to CBAM cost for the importer | ● | ● | ○ | ○ | ○ |
| Reproducible open benchmark | ● | ○ | ◐ | ○ | ○ |
| Real customers and integrations | ○ | ● | ○ | ● | ○ |
| Regulatory recognition | ○ | ◐ | ○ | ◐ | ○ |

## 9.3 How to differentiate from the closest prior art (Group B)

Write one paragraph in your paper that says, in effect: *Prior systems store or audit emissions data on a blockchain; we focus on whether that data can be faked before it is stored, evaluate against attacks including an adaptive one, enforce honesty with bonded verifiers and a challenge window, and tie the output to the importer's CBAM cost.* Also quote a limitation of your own approach in the same paragraph.

## 9.4 Honest "ahead / behind" assessment

**Where we can credibly be ahead**
- Threat-model-first design with a published list of what still gets through
- Adversarial evaluation on real data
- Economic enforcement plus an explicit arbiter role
- A concrete importer-facing CBAM cost bridge
- A reusable open benchmark

**Where we are behind (say so)**
- No real customers, integrations or regulatory acceptance
- Proxy data, simulated hardware, five verifiers run by one team
- Commercial CBAM tools already offer polished workflows and expert services

**Conclusion:** you are not inferior if you position as the **integrity layer underneath** compliance tools. You would be inferior only if you pretended to be a full compliance platform.

## 9.5 Is it outdated?

The building blocks are current: optimistic verification with bonds and challenge windows, commit-reveal voting, Merkle batching, L2 deployment, physics-informed machine learning, and adversarial evaluation. Things you deliberately leave as future work: zero-knowledge proofs of the checks, hardware attestation, restaking-style verifier security, verifiable-credential export, and interoperability with standard data-pack formats **[VERIFY each before naming specific products]**.

## 9.6 Do this 30-minute novelty check before you write "novel"

1. Google Scholar: "blockchain continuous emission monitoring", "tamper-evident CEMS data", "emissions oracle anomaly detection", "CBAM verification blockchain".
2. GitHub search: "CEMS blockchain", "emissions oracle", "CBAM verifier".
3. Devpost: browse the ClimateChain gallery for similar entries.
4. Note the three closest items and write one sentence each on how you differ.
5. Use careful wording: *"To our knowledge we did not find a prior system that combines X, Y and Z; we did not perform an exhaustive search."*

---

# 10. Target users and why (Question 8)

## 10.1 Primary users

| User | Their pain | What they get from VeriCEMS | Why we chose them |
|---|---|---|---|
| **Exporters and plant operators** (steel, aluminium, cement, fertiliser producers selling to the EU, with India as the case study) | Must supply verified installation-level data or buyers fall back on marked-up defaults; honest firms get lumped in with cheats | A tamper-evident record that proves their real emissions, and a stake that signals honesty | They hold the data and have the strongest financial motive to prove it |
| **EU importers (authorised declarants)** | Legally liable for certificates; cannot cheaply tell whether supplier data is trustworthy | One-click verification of a supplier's attestation and a clear default-vs-verified cost comparison | They bear the legal and financial risk, so they will demand better evidence |
| **Accredited verifiers** | Periodic, sample-based audits; limited visibility between visits | Continuous evidence and risk flags that tell them where to look | They are the legal gatekeepers; without them, nothing is accepted |

## 10.2 Secondary users

| User | Value |
|---|---|
| Regulators, customs and competent authorities | Tamper-evident evidence of attempted fraud |
| Lenders, insurers and ESG auditors | Reliable emissions data for risk and financing decisions |
| Monitoring-equipment vendors and integrators | A channel partner: add the gateway to their offering |

## 10.3 Why these exact users (the reasoning)

1. **Money and legal liability meet here.** The importer pays; the exporter loses sales. Solutions succeed where someone has to pay and someone has to prove.
2. **The bottleneck is trust, not data.** Plants already measure emissions. What is missing is a way for strangers to believe those measurements.
3. **It is happening now.** The paying phase started 1 Jan 2026 and the first declaration is due 30 Sept 2027, so users have urgency.
4. **The India-to-EU case is concrete.** India exports covered goods to the EU, so the problem is real for local industry **[VERIFY with trade statistics and cite them]**.
5. **They are reachable.** You can talk to a consultant, verifier or exporter this week for feedback.

## 10.4 Who we are not targeting

Consumers, small farms and carbon-credit retail buyers. Their problems (credit quality, nature-based carbon) are different, and widening the audience would blur the pitch.

## 10.5 Fictional personas for your demo

- **Operator:** *Meera, compliance manager at Southern Steel Works (fictional).* Wants to prove her plant's real emissions and stop losing quotes to a default-value penalty.
- **Importer:** *Jonas, sourcing lead at Hansa Metallhandel GmbH (fictional).* Needs supplier data he can defend in his declaration and a cost number he can show finance.
- **Verifier:** *Dr. Okafor, lead auditor at a verification body (fictional).* Wants to know which suppliers and which weeks deserve a closer look.

---

# 11. How to make it as impressive as possible (Question 9)

## 11.1 Priority list by value for effort

| Item | Score impact | Effort |
|---|---|---|
| Deployed, verified contracts on a testnet with block-explorer links in the UI | High | Medium |
| Honest benchmark on real data (including what still gets through) | High | Medium |
| Importer portal with visible formula, editable inputs and sources drawer | High | Low |
| Polished, scripted demo and video | High | Medium |
| Security document with tests, fuzzing, invariants and Slither output | High | Medium |
| Expert quote or user feedback | Medium | Low |
| Open benchmark release (scripts and labeled data) | Medium | Low |
| Unpredictable canary batches | Medium | Medium |
| Real hardware on camera | Medium | High |
| Real zero-knowledge circuit | High on paper | Very high (skip; mention as future work) |

## 11.2 Substance judges can check

- Real data, a data card, and clear labels on anything synthetic
- Facility-grouped splits, a three-way detector comparison (simple threshold, physics rule, proposed model) and reported false positives
- An adaptive attacker defined precisely (what it knows, what it can change)
- Contracts with tests, fuzzing, invariants and a Slither report
- Reproducibility: pinned versions, fixed seeds, one command to rebuild results
- A sources table mapping every regulatory number to its primary text
- "Informed by" mapping to standards: IEEE 2413-2019 (IoT architecture) **[VERIFIED published]**; drafts IEEE P3218 (blockchain for carbon trading), P3219 (blockchain-based zero-trust framework for IoT), P2418.1 (blockchain for IoT) **[VERIFIED to exist as drafts]**. Say "informed by", never "compliant with".

## 11.3 Visual design (this is 10% of the score and most of the first impression)

**Mood:** a calm, trustworthy "mission control", not a neon hacker theme.

**Palette**

| Role | Colour |
|---|---|
| Background | `#0B1220` (deep navy) |
| Surface / cards | `#111A2E` |
| Borders | `#1F2A44` |
| Primary text | `#E6EDF7` |
| Muted text | `#8FA0BF` |
| Verified / success | `#2DD4BF` (teal) |
| Flagged / danger | `#F43F5E` |
| Warning | `#F59E0B` |
| Info | `#60A5FA` |

**Typography:** Inter for interface text, JetBrains Mono for hashes and numbers.

**Four screens**

1. **Operator live view:** streaming readings, packets visibly linking into a hash chain, a trust gauge, bond status, and an attack-injection panel on the side.
2. **Verifier console:** five node cards showing votes appear, the challenge-window countdown, and a quarantine evidence viewer.
3. **Importer portal (your hero screen):** a split view of "default value" vs "verified data" with the formula visible, editable inputs, a savings figure that counts up, and a "verify on-chain" button.
4. **Benchmark and threat model:** results table, ROC curves and a clearly marked "What still gets through" panel.

**Details that signal quality**
- Truncated hashes with copy buttons and links to the block explorer
- Consistent spacing grid, one accent colour for "verified", one for "flagged"
- Motion with a purpose: chain links drawing, the Merkle tree filling, the gauge dropping on an attack; nothing decorative
- Loading, empty and error states for every panel
- Do not rely on colour alone (add icons and labels); keep text contrast high
- A **demo mode** with a "play scenario" button that runs a scripted, deterministic story so nothing breaks while recording

## 11.4 Storytelling: the 3-minute video (the limit is 3 minutes)

| Time | Content |
|---|---|
| 0:00 to 0:25 | The problem in one scene: a German importer owes carbon cost on steel; the only proof is numbers from a sensor the supplier controls |
| 0:25 to 1:10 | System in one diagram, then live telemetry and an injected attack being caught, with the reason shown on screen |
| 1:10 to 1:50 | Verifiers vote, batch quarantined, challenge window, bond slashed on-chain (show the block explorer transaction) |
| 1:50 to 2:25 | Importer portal: upload a report, verify proofs, see the cost comparison with the formula visible |
| 2:25 to 2:50 | Benchmark results and the honest "what still gets through" slide |
| 2:50 to 3:00 | Climate impact and the pilot path |

Record from the scripted demo mode, and keep a backup recording.

## 11.5 Make the climate-impact case honestly

Your system does not cut emissions directly. It **protects the integrity of carbon pricing, which is what drives cuts.** Quantify it as a clearly labelled scenario:

> Unpriced emissions deterred = covered emissions × assumed misreporting rate × detection rate

- *Covered emissions:* a sourced figure (for example CBAM-covered exports from India).
- *Misreporting rate:* a range of hypothetical scenarios (say 1%, 5%, 10%), labelled as assumptions, not evidence of real fraud.
- *Detection rate:* **your measured benchmark result.**

**[ILLUSTRATIVE example]** If 1,000,000 tCO₂e were in scope, 5% were misreported and the detector caught 70%, then 1,000,000 × 0.05 × 0.70 = 35,000 tCO₂e, worth 35,000 × €82.32 = €2,881,200 at the Q3 2026 price. These numbers are invented to show the method.

Also describe the **incentive effect** (verified low-emission producers pay less) and the **chain's own footprint** (an L2 batch anchor is tiny; cite a source).

## 11.6 What to avoid

- Invented statistics or "100% accuracy" claims
- Calling something zero-knowledge, official, compliant or airtight when it is not
- Unlabeled synthetic data
- Feature soup: more tabs and buzzwords than you can defend
- Naming real companies in a fictional case study

## 11.7 Using AI without losing credibility

Everyone will use AI, so the edge is verification. Treat AI output as hypotheses. Check every regulatory number against the primary text, run every claim as an experiment, and be able to explain every line of your contracts and detector. Before you submit, ask an AI to act as a hostile judge and quiz you, then answer without notes.

---

# 12. Hackathon rules check

Source: the official hackathon page (cmte.ieee.org/turkiye-blockchain/hackatlon). **Re-read it and the Devpost page yourself before submitting, in case anything changed.**

## 12.1 Key facts

- Organised by IEEE Blockchain Türkiye, with the Istanbul Chamber of Commerce among the listed collaborating organizations **[VERIFIED]**.
- The Technical Review Committee includes security and blockchain academics (for example Prof. Dr. Şeref Sağıroğlu is listed as group chair and committee member) **[VERIFIED]**. Write for a technical panel that will probe your claims.
- Teams of 2 to 5 or individuals; one team per person; check eligibility and country restrictions on Devpost **[VERIFY]**.
- The page shows two scoring breakdowns. Treat both as important:
  - **70%** technical innovation and blockchain implementation, **20%** climate impact, **10%** scalability
  - Weighted criteria: **30%** climate impact, **30%** technical/blockchain, **10%** each for feasibility, security and transparency, user experience, and scalability

## 12.2 Required deliverables and status

| Requirement | Where it lives in this project | Status |
|---|---|---|
| Working prototype (testnet allowed) | Contracts + app + backend | To build |
| Source repo with documentation | GitHub, one-command run | To build |
| Architecture diagram and technical specification | Section 3 diagram + stack in Section 13 (turn into a clean diagram) | **Not started** |
| 3-minute demo video | Section 11.4 script | **Not started** |
| Security and data-integrity assessment | Threat model (3.5), contract rules (4.5), tests and Slither | Partly planned |
| Problem statement (max 2 pages) | Section 1.2 draft | Draft ready |
| Climate-impact assessment with projections | Section 11.5 method + your measured detection rate | **Not started** |
| Adoption and implementation strategy | Sections 6.3 to 6.5, 10 | Draft ready |
| Scalability and sustainability roadmap | Section 6.2 to 6.4 with measured gas | Needs measurements |
| User-testing results (optional) | Section 7.6 | Optional |

> The 4-page IEEE-style paper is **not** a required deliverable. Fold its content into the security assessment and technical specification instead of writing a separate one.

---

# 13. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript, Tailwind CSS | Fast to build, clean design system |
| Charts and visuals | Recharts (charts), React Flow (hash chain and Merkle visuals), Framer Motion (purposeful animation) | Good defaults, readable code |
| Chain interaction | viem or wagmi | Modern, typed, small |
| Backend | Python FastAPI with WebSockets | Same language as the ML code; easy streaming |
| Data and ML | pandas, NumPy, SciPy, scikit-learn (baselines, grouped splits), PyTorch (small autoencoder), ONNX export | ONNX lets verifiers hash identical model weights |
| Cryptography | Python `cryptography` library (ECDSA P-256), SHA-256 hash chain, Merkle trees (OpenZeppelin's `MerkleProof` on-chain) | Standard, auditable |
| Smart contracts | Solidity 0.8.x, Foundry (tests, fuzz, invariants), OpenZeppelin | Strong testing culture |
| Security tooling | Slither, plus Foundry invariant tests | Required for the security document |
| Chain | An L2 testnet such as Polygon Amoy or Arbitrum Sepolia | Cheap, easy faucets, explorer links |
| Verifier nodes | Five Python processes with separate keys | Be explicit in the demo that production would use independent organizations |
| Packaging | Docker Compose, GitHub Actions CI | One-command reproduction |
| Storage | SQLite for the demo | Simple |

## 13.1 Suggested repository layout

```
vericems/
├─ contracts/          # Solidity + Foundry tests
├─ backend/            # FastAPI, gateway simulator, verifier nodes
├─ ml/                 # data card, preprocessing, detectors, attacks, benchmark
├─ web/                # React app (4 screens)
├─ calculator/         # cbam_calculator.py + config + tests
├─ docs/               # architecture diagram, spec, security assessment, problem statement
├─ data/               # scripts to fetch CAMPD (do not commit large raw files)
└─ README.md           # one-command run, results summary, limits, sources table
```

---

# 14. Appendices

## A. The CBAM cost formula and a worked example

**Formula**

```
SEFA            = free_allocation_factor × CSCF × benchmark
payable_per_t   = max(0, SEE − SEFA)
cost (EUR)      = tonnes_shipped × payable_per_t × certificate_price
savings (EUR)   = cost_with_default − cost_with_verified
```

Show the formula, every input and its source on screen. State whether you are computing net liability after the free-allocation adjustment (you are) and which quarter's price you used.

**Worked example. ALL NUMBERS ARE [ILLUSTRATIVE] AND DO NOT REPRESENT ANY REAL PRODUCT:**

| Input | Value |
|---|---|
| Tonnes shipped | 500 |
| Benchmark | 1.40 tCO₂e per tonne |
| Free-allocation factor (2026) | 0.975 |
| CSCF | 1.00 |
| **SEFA** | 0.975 × 1.00 × 1.40 = **1.365** |
| Verified SEE | 1.90 |
| Default value (base) | 2.30 |
| Default with 10% markup | 2.30 × 1.10 = **2.53** |
| Price | €82.32 per tCO₂e |

| Case | Payable per tonne | Cost for 500 t |
|---|---|---|
| With verified data | 1.90 − 1.365 = 0.535 | 500 × 0.535 × 82.32 = **€22,020.60** |
| With default value | 2.53 − 1.365 = 1.165 | 500 × 1.165 × 82.32 = **€47,951.40** |
| **Savings** | 0.63 | **€25,930.80** |

Simplification: the example uses the same benchmark in both cases. In reality, when default values are used, default benchmarks may apply **[VERIFY]**, so build that distinction into the calculator.

## B. Calculator configuration (keep every parameter editable, dated and sourced)

```json
{
  "price_eur_per_tco2e": { "value": 82.32, "quarter": "2026-Q3", "last_verified": "YYYY-MM-DD", "source": "Commission CBAM price page" },
  "free_allocation_factor_by_year": {
    "2026": 0.975,
    "note": "Fill later years from Regulation 2023/956 Article 31 (payable share expected: 2.5% in 2026 rising to 100% in 2034; verify each year)"
  },
  "cscf_by_year": { "2026": null, "note": "Look up in the official decision; do not assume" },
  "benchmark_tco2e_per_t": { "route": null, "value": null, "source": "Implementing Regulation (EU) 2025/2620" },
  "default_value_base_tco2e_per_t": { "cn_code": null, "country": null, "value": null, "source": "Implementing Regulation (EU) 2025/2621 as corrected by 2026/1740" },
  "default_markup_by_year": { "2026": 0.10, "2027": 0.20, "2028": 0.30 }
}
```

Unit-test the calculator against at least one official or reputable third-party worked example.

## C. The 8 attacks in plain words

| # | Attack | What the attacker does | Main defence | What to measure |
|---|---|---|---|---|
| 1 | Constant scaling | Multiply CO₂ by a fixed factor (for example minus 30%) | Physics: CO₂ no longer matches heat input | Recall vs scale factor |
| 2 | Flatline | Replace readings with a constant "clean" value | Spectral/variance checks and load mismatch | Recall, detection delay |
| 3 | Naive replay | Loop old clean data | Hash chain and sequence numbers | Recall |
| 4 | Time-shifted replay | Replay old data, re-signed | Load and time-pattern consistency | Recall |
| 5 | Noise on flatline | Flatten, then add fake noise | Autoencoder residual and physics | Recall |
| 6 | Slow drift | Shave a tiny amount per day | Trend checks against load and fuel records | Delay and recall at each drift rate |
| 7 | Selective dropping | Delete high-emission packets | Sequence gaps and hash chain | Recall |
| 8 | Adaptive white-box | Knows the detector and optimises numbers to stay under its threshold | Cross-source consistency | Report **honestly**, including the failures |

**Define the adaptive attacker precisely:** what it knows (fuel constant, spectral window, model weights, threshold), what it can change (which channels, how much), and its goal (minimise reported CO₂ while staying under the detector's threshold). Report how much reduction it achieves before being caught.

## D. Evaluation plan

1. **Data card** from real CAMPD files (columns, units, derived fields, what is synthetic).
2. **Split by facility:** repeated random grouped splits across 20+ facilities; mean ± standard deviation.
3. **Three detectors side by side:** (1) static threshold, (2) deterministic mass-balance rule, (3) proposed model with chain checks.
4. **Metrics:** precision, recall, false-positive rate, AUROC, detection delay.
5. **Tune thresholds on validation data only;** report on held-out test data.
6. **Report all findings**, including where the simple rule beats the neural network, and a "What still gets through" section.
7. **Fix random seeds and pin library versions;** include the commit hash in the results.

## E. Facts to verify before you submit

- [ ] Open each regulation (2023/956, 2025/2083, 2025/2546, 2025/2547, 2025/2548, 2025/2620, 2025/2621, 2026/1740) on the Commission or EUR-Lex pages and note the exact articles
- [ ] The latest quarterly certificate price
- [ ] Free-allocation factor for each year and the CSCF values
- [ ] The benchmark and default value for your illustrative product
- [ ] Which sectors count indirect emissions
- [ ] CAMPD columns and which fields are derived
- [ ] Hackathon eligibility and country restrictions
- [ ] Exact titles and venues of prior-art papers before citing
- [ ] Any "benefit" or "efficiency" figure you quote has a source

## F. Sources used in our research

Hackathon
- https://cmte.ieee.org/turkiye-blockchain/hackatlon/

CBAM facts and regulations
- https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en
- https://cbamguide.com/news/2026-10-05-q3-2026-cbam-certificate-price/
- https://cbamguide.com/learn/implementing-regulations/
- https://cbamguide.com/learn/omnibus/
- https://greensutra.in/news/cbam-free-allocation-adjustment-2026/
- https://www.opis.com/resources/energy-market-news-from-opis/provisional-cbam-calculation-values-pass-committee-vote/
- https://icapcarbonaction.com/en/news/eu-cbam-enters-compliance-phase-and-outlines-path-ahead

COP 31
- https://verra.org/events/cop-31-conference/
- https://carbon-pulse.com/504644/

Standards
- https://standict.eu/standards-repository/ieee-2413-2019ieee-standard-architectural-framework-internet-things-iot
- https://sagroups.ieee.org/2418-1

Prior art and competitors
- https://arxiv.org/pdf/2011.13954
- https://par.nsf.gov/servlets/purl/10317806
- https://www.arxiv.org/pdf/2601.13772
- https://eprints.ucm.es/57090/1/AngelAlgoviaGarcia.pdf
- https://www.portbase.com/en/marketplace/the-carbon-pricing-platform/
- https://coolset.com/academy/how-to-collect-supplier-emissions-data-for-cbam-compliance-step-by-step-guide

Papers to cite (confirm exact titles and venues)
- Luu et al., 2015, "Demystifying Incentives in the Consensus Computer" (the verifier's dilemma)
- Teutsch and Reitwiessner, TrueBit (forced errors against lazy verifiers)

Data
- US EPA Clean Air Markets Program Data: campd.epa.gov **[VERIFY exact download page]**

## G. Suggested order of work

1. Download CAMPD, write the **data card**
2. Build and unit-test the **CBAM calculator**
3. Write and test the **contracts**; deploy and verify on a testnet; measure gas
4. Build the **attack scripts** and run the **benchmark**
5. Build the **four screens** and the scripted demo mode
6. Write the **required documents** (problem statement, security assessment, impact, adoption, roadmap)
7. Record the **3-minute video**
8. Talk to one or two experts and add their feedback
9. Final fact-check pass using Appendix E, then submit well before the deadline

---

*End of guide. Treat every [VERIFY] as a to-do, and every [ILLUSTRATIVE] as a teaching number only.*
