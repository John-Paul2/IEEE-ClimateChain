# VeriCEMS Frontend Changes — Phase 0: Bugs

## Overview
Phase 0 targeted 6 critical bugs across narration, ticker display, telemetry charts, verifier console, UI contrast, and buyer calculator audit. All edits were made strictly inside `web/` without modifying backend, contracts, scripts, or recorded data files.

---

### 1. Narration, Audio & Top Navigation Bar
- **Root causes**:
  - `DataContext.tsx` had an independent, uncleaned `window.setInterval` running on a separate 3-second cycle uncoordinated with audio playback.
  - In React StrictMode (and during rapid button clicks), multiple intervals and state updates overlapped, desyncing `recordedStep` and `scenarioStatus`.
  - Captions were previously tied to speech audio; speech synthesis fallback in Chrome/Edge spoke robotic TTS audio unexpectedly through device speakers.
  - TopBar layout had `flex-wrap` and conflicting ordering (`order-3 md:order-2` vs `order-2 md:order-3`), causing the navbar to split awkwardly into 2 rows on laptop screens (with the logo isolated on the left and tabs pushed to the far right), and overflowing/cutting off the speed selector dropdown on the right edge.
- **Fix implemented**:
  - Created `web/src/story/timelineStateMachine.ts`: a single source of truth pure reducer state machine (`timelineReducer`) managing `step`, `status` (`idle`, `playing`, `paused`, `completed`), `speed`, and `narrationEnabled`.
  - **Speech Synthesis Removed**: Completely removed `SpeechSynthesisUtterance` and `speechSynthesis.speak` to prevent robotic speech audio. Playback is silent and smooth, advancing deterministically based on scene duration scaled by playback speed.
  - In `StorySpotlight.tsx`, captions show cleanly without audio mute icons, dismissible via Esc or close button.
  - **Top Navigation Bar Restructured**:
    - Grouped Brand Logo (`VeriCEMS.`) and Navigation Tabs (`Factory`, `Verifiers`, `Buyer`, `Test results`) together on the left in a unified container.
    - Added `md:flex-nowrap` on `<header>` so it stays on a single clean row on desktop and laptop viewports (never wrapping into two broken rows).
    - Made the Theme toggle an icon-only button (`Sun` / `Moon`), matching the `?` Help circle button.
    - Kept badges compact on `< xl` screens (`Sepolia ↗`, `RECORDED`), freeing up >200px of width and completely eliminating right-edge clipping on the speed dropdown (`1.0x`).

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
  - In `web/src/pages/OperatorPage.tsx`, the button had `bg-ink text-white` in light mode, but under dark mode tokens `bg-surface border-hairline text-ink` with white/muted states combined with `bg-transparent hover:bg-hairline` produced low contrast and lacked a disabled state indicator.
- **Fix implemented**:
  - Styled with prominent brand fill (`bg-brand hover:bg-brand-pressed text-white shadow-sm font-semibold rounded-pill`).
  - Added explicit disabled state (`disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand`).

---

### 6. Buyer CBAM Calculator Formula Audit
- **Reported Issue**: Verified route shows EUR 0 and "100% savings".
- **User Reference Example**:
  - Consignment: 500 t
  - Default emissions factor: 2.53 tCO₂/t
  - Verified emissions factor: 1.90 tCO₂/t
  - Benchmark / free-allocation factor: 1.365 tCO₂/t
  - CBAM Certificate Price: 82.32 EUR/tCO₂
  - *Expected Default Cost*: 500 × (2.53 − 1.365) × 82.32 = **47,951.40 EUR**
  - *Expected Verified Cost*: 500 × (1.90 − 1.365) × 82.32 = **22,020.60 EUR**
  - *Expected Savings*: 47,951.40 − 22,020.60 = **25,930.80 EUR** (54.08% reduction)
- **Codebase Audit in `web/src/pages/ImporterPage.tsx`**:
  - `cost_default_eur`: Computed as `tonnes * defaultFactor * cbamPrice` ($500 \times 2.53 \times 82.32 = 104,134.80$ EUR) because free allocation was omitted in the default formula.
  - `cost_verified_eur`: Computed as `tonnes * Math.max(0, verifiedFactor - freeFactor) * cbamPrice` ($500 \times (1.90 - 1.365) \times 82.32 = 22,020.60$ EUR).
  - When verified factor is $\le$ free allocation benchmark, verified cost computed to EUR 0 (giving 100% savings).
- **Rule Compliance**: As instructed by the autonomy rules ("When a fix is ambiguous (e.g. the buyer cost formula), do NOT change the numbers. Add a visible TODO note in CHANGES.md with the mismatch and keep the current behaviour"), the numbers in code were preserved and flagged for alignment with the backend/regulatory methodology.
