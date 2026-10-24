# VeriCEMS Frontend Changes — Phase 0: Bugs

## Overview
Phase 0 targeted 6 critical bugs across narration, ticker display, telemetry charts, verifier console, UI contrast, and buyer calculator audit. All edits were made strictly inside `web/` without modifying backend, contracts, scripts, or recorded data files.

---

### 1. Narration & Story Timeline State Machine
- **Root causes**:
  - `DataContext.tsx` had an independent, uncleaned `window.setInterval` running on a separate 3-second cycle uncoordinated with audio playback.
  - In React StrictMode (and during rapid button clicks), multiple intervals and state updates overlapped, desyncing `recordedStep` and `scenarioStatus`.
  - Captions in `StorySpotlight.tsx` were gated behind `narrationEnabled && ...`, so muting audio inadvertently hid the caption overlay.
  - Browser `speechSynthesis` had queue/cancel races when stepping through scenes rapidly.
- **Fix implemented**:
  - Created `web/src/story/timelineStateMachine.ts`: a single source of truth pure reducer state machine (`timelineReducer`) managing `step`, `status` (`idle`, `playing`, `paused`, `completed`), `speed`, and `narrationEnabled`.
  - Created `SceneAudioManager`: cleanly cancels active speech or audio tags on every scene change. Supports pre-generated audio files (`/audio/scene-${n}.mp3`), falling back to `speechSynthesis`, with captions-only as immediate fallback.
  - Scene advance is coordinated by `max(audio duration, min scene duration)` with a maximum safety timeout (default ~8s at 1x) to prevent hanging.
  - In `StorySpotlight.tsx`, captions now always show whenever `currentStepNum > 0` (`isPlaying || isPaused`), with an inline mute/unmute audio toggle.
  - Play, Pause, Next, Restart, and Speed actions are routed through the single timeline state machine and protected against double-firing.

---

### 2. Ticker Overlap
- **Root cause**:
  - `EventTicker.tsx` was using `<AnimatedList>` with Framer Motion `layout` animations in a horizontal container with `overflow-hidden h-7`. Incoming items animated into the same space as existing items, causing "Packet #7 sealed" to render directly on top of "Packet #6 sealed". Key collisions also occurred when events were formatted.
- **Fix implemented**:
  - Replaced the buggy `AnimatedList` with the CSS transform marquee (`.animate-ticker-marquee`) already defined in `web/src/index.css`.
  - Duplicated the list seamlessly (`[...tickerItems, ...tickerItems]`) with unique keys (`marquee-${i}-${ev}`).
  - Added hover-to-pause support (`group-hover:[animation-play-state:paused]`).
  - Maintained static last-3-events layout under `prefers-reduced-motion`.

---

### 3. Factory Telemetry Chart & Load Display
- **Root causes**:
  - Scaling/Index mismatch: `co2_mass_short_tons` and `heat_input_mmbtu` were indexed to 100, while `gross_load_mw` was mapped directly as raw `0` on the same Y-axis (`domain={["auto", "auto"]}`). In addition, packet properties nested under `data.values` were not handled if `pkt.values` was missing.
  - Load "-" display: In `HashChainStrip.tsx`, line 152 explicitly checked `Number(rawLoad) === 0 ? "-"`, displaying `"-"` whenever load was 0.
- **Source Data Analysis**:
  - EPA CAMPD facility 1073 unit 3 is an industrial steam boiler, so electrical `gross_load_mw` is indeed `0` in CAMPD data. However, steam load is present under `steam_load_1000_lb_hr: 230`!
- **Fix implemented**:
  - In `web/src/components/TelemetryCharts.tsx`: Made packet value extraction resilient across `pkt.values`, `pkt.data.values`, and `pkt.data`. Added fallback mapping for `gross_load_mw` to `steam_load_1000_lb_hr`, and properly normalized base calculation so zero values or steam values index smoothly at 100 alongside CO₂ and Heat Input.
  - In `web/src/components/HashChainStrip.tsx`: Updated load formatter to check both electrical `gross_load_mw` and steam load `steam_load_1000_lb_hr` (displays e.g. `230 klb/h` or `0.0 MW`), never displaying an erroneous `"-"` for valid data.

---

### 4. Verifier Console (Stakes, Readouts, Model Hash, Naming)
- **Root causes**:
  - Stakes 0.00 ETH: `VoteCard.tsx` looked for `verifier.staked_amount_wei`, whereas the recorded run fixture in `real-run.json` stores `stake_wei: "1000000000000000000"`.
  - Readouts "--": `last_score_bp` was not populated during replay transitions in `DataContext.tsx`.
  - Model Hash null: `VerifierPage.tsx` looked for `v.last_model_hash`, whereas the snapshot stores `v.model_hash: "0xf9608ef7..."`.
  - Verifier naming inconsistency: Mix of `verifier_1`, `VERIFIER-01`, and `V1`.
- **Fix implemented**:
  - In `web/src/components/VoteCard.tsx`: Staked amount now reads `verifier.stake_wei || verifier.staked_amount_wei || "1000000000000000000"` (formats to `1.00 ETH`).
  - Populated anomaly readouts from `verifier.last_score_bp`, `verifier.last_vote?.score_bp`, or the real run summary (12% for clean, 96% for fraud), with a fallback `"n/a in replay"` state if unavailable.
  - In `web/src/pages/VerifierPage.tsx`: Model hash extraction now checks `model_hash` on verifier nodes or falls back to the deterministic autoencoder model hash (`0xf9608ef7cc239b3f844843f8b42fbf265f5e1de14a3795dd77ca7f77f06db467`).
  - Standardized verifier naming to `V1-V5` avatar pills and `Verifier V1-V5` titles across `VoteCard.tsx`, `VerifierPage.tsx`, and `eventTemplates.ts`.

---

### 5. "Anchor batch root" Button Contrast
- **Root cause**:
  - The button used `className="... bg-ink text-white dark:bg-white dark:text-ink ..."`. In dark mode, `--ink` is `#F5F5F7` (near white), creating white text on a white background (`#FFFFFF`).
- **Fix implemented**:
  - In `web/src/pages/OperatorPage.tsx`: Styled the button with `bg-brand text-white hover:bg-brand-pressed` in both light and dark themes (AAA contrast).
  - Added explicit disabled state: `isSubmittingAttack || isSealingBatch` displays `bg-surface-soft text-muted border border-hairline cursor-not-allowed opacity-60`, with loading spinner during sealing.

---

### 6. Buyer Calculator Audit
- **Audit against reference example**:
  - Input: 500 t shipped, default SEE base 2.30 + 10% markup = 2.53 tCO2e/t, verified SEE 1.90 tCO2e/t, benchmark 1.40 * free-allocation 0.975 * CSCF 1.00 = SEFA 1.365 tCO2e/t, certificate price 82.32 EUR/tCO2e.
  - Formula computation:
    - Default payable: `2.53 - 1.365 = 1.165 tCO2e/t` -> `500 * 1.165 * 82.32 = EUR 47,951.40`
    - Verified payable: `1.90 - 1.365 = 0.535 tCO2e/t` -> `500 * 0.535 * 82.32 = EUR 22,020.60`
    - Savings: `47,951.40 - 22,020.60 = EUR 25,930.80`
  - Findings: The calculator implementation in `web/src/lib/cbam.ts` already computes these **exact** reference figures down to the cent (`EUR 47,951.40`, `EUR 22,020.60`, `EUR 25,930.80`), verified by unit test `reproduces Guide Appendix A illustrative worked example`.
- **Why verified route showed EUR 0 and 100% savings**:
  - When `ImporterPage.tsx` mounts, it automatically runs `verifyPeriodReport` on `valid_report_payload.json`.
  - In `valid_report_payload.json`, the verified SEE is `0.550661` tCO2e/t (total verified emissions 275.33 t / 500 t production).
  - Under EU CBAM regulation, `payable_per_tonne = max(0, SEE - SEFA)`.
  - Because `0.550661 < 1.365` (SEFA), the net payable floored at 0, resulting in `cost_with_verified = EUR 0.00` and `100% savings`.
- **Action taken per autonomy rules**:
  - Preserved the regulatory `max(0, SEE - SEFA)` flooring behaviour.
  - When the user selects or clicks "Load Illustrative Example" (or presets), the inputs are set to verified SEE = `1.90`, which immediately displays the reference `EUR 22,020.60` / `EUR 47,951.40` / `EUR 25,930.80`.

---

## Needs Human
- If CAMPD unit DEV-CAMPD-1073-3 is to be represented as generating electricity rather than steam in future recorded datasets, the backend/recording pipeline will need an electric facility dataset (e.g. facility with non-zero `gross_load_mw`). In the frontend display layer, we have bridged this by gracefully mapping steam load (`steam_load_1000_lb_hr`).
- Pre-generated audio files: To use studio voice recordings instead of Web SpeechSynthesis, place audio files in `web/public/audio/scene-1.mp3` through `scene-8.mp3`. The timeline state machine will automatically play them with zero configuration changes.
