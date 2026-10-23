# VeriCEMS UI Redesign: Spec, Text Diet and Prompts

**How to use:** save this file as `docs/DESIGN.md` in your repo (and optionally put `DESIGN-jobright.md` in `docs/reference/`). Add `docs/DESIGN.md` to the honesty-lint skip list, because it quotes banned words. Then run prompts R1 to R3 in Section 8, one per conversation.

---

## 1. Direction and decisions

**Direction:** your Jobright design file (light canvas, black pill buttons, bold condensed headings, a pale colour band, a scrolling black ticker), with the **mint green replaced by red**, adapted for a dense data app. Jobright is a marketing system, so I shrink the sizes and radii for dashboards.

**One open item:** I could not read blockchain.com's actual colours (the page fetch returned text only), and I believe its accent is blue. So the red below is a **default you should confirm**. It is a single token (`--brand`), so changing it takes seconds.

| Jobright | VeriCEMS |
|---|---|
| Mint `#00f0a0` accent | **Red** `--brand` |
| Pale-mint bands `#ecffe0` | **Pale blush** bands `--band` |
| Black pill primary buttons | Unchanged |
| Titillium Web headings, Inter body | Unchanged (plus JetBrains Mono for hashes) |
| Scrolling black job ticker | **Live event ticker** (batch anchored, votes, slashed) |
| 40 px card radius, 96 px sections | **24 px** cards, **48 px** sections (dense app) |
| Floating mockup cards | White cards on blush bands, hairline borders |

---

## 2. Tokens

```css
:root {
  /* brand */
  --brand: #E5383B;          /* default red: confirm or replace */
  --brand-pressed: #BA1F22;
  --on-brand: #FFFFFF;
  --brand-on-black: #FF6B6B; /* readable red on black bands */

  /* neutrals */
  --ink: #0A0A0A;
  --canvas: #FFFFFF;
  --band: #FFF0F0;           /* replaces Jobright's pale mint */
  --surface-soft: #F2F4F5;
  --hairline: #E5E7EB;
  --muted: #86909C;          /* large text and icons only */
  --muted-strong: #5B6573;   /* use for all small text (contrast) */

  /* status (small chips only, always with icon + word) */
  --verified: #0E9F6E;
  --warning: #D97706;
  --flagged-bg: #FDECEC;
  --flagged-ink: #9B1C1C;

  /* shape and space */
  --radius-chip: 12px;
  --radius-card: 24px;
  --radius-pill: 9999px;
  --space: 8px;              /* 8 px grid */
  --section: 48px;
}
```

**Fonts** (installed locally with `@fontsource`, no CDN): Titillium Web 600/700 for headings, Inter 400/500/600 for UI, JetBrains Mono 500 for hashes and numbers.

**App type scale** (smaller than Jobright's marketing sizes): page title 36 px, section title 28 px, card title 20 px, body 15 px, caption 13 px, mono 12 to 13 px.

### Red and status colours must not clash
Because the brand is red and "fraud" is also red-ish, keep them visually different:
- **Brand red** is for buttons, the logo and active tabs only. Buttons are large pills.
- **Status** (clean, fraud, warning) uses small rounded-rectangle chips with an **icon and a word** (for example a triangle and "FRAUD", a tick and "CLEAN"), never colour alone.
- **Fraud chip:** soft pink background, deep red text, triangle icon. **Clean chip:** green tick.
- Key "attack caught" moments use a **black band** with white text and a red icon, which reads as an alert, not as a button.

---

## 3. Layout

- **Top bar (white):** logo left; four pill tabs centre (Operator, Verifier, Importer, Benchmark); right side holds the network badge (LOCAL / TESTNET / OFFLINE SNAPSHOT) and a compact **demo dock** (play, next, reset).
- **Event ticker (black band under the top bar):** one-line scrolling events such as "Batch 12 anchored · 3 of 5 voted FRAUD · bond slashed". Pause on hover; static last three events under reduced motion. Demo captions appear here.
- **Content:** a centred 1200 px column, 12-column grid, 24 px gutters, 8 px spacing grid. Sections alternate white and blush bands.
- **No fixed element may cover content.** The current bottom demo bar overlaps the page (screenshot 5); it moves into the top bar.
- **No left sidebar.**

### Provenance chips (keep these, they are your honesty labels)
`REAL` (solid outline with a dot), `SYNTHETIC` (dashed outline), `ILLUSTRATIVE` (hatched), `MOCK` (amber fill). Show one per panel, small.

---

## 4. The text diet (cut about 60%, keep the honesty)

**Rules**
1. **One idea per card.** Title of at most 4 words, then data.
2. **No paragraph over 20 words** inside a card. If it needs more, move it into a "?" popover.
3. **Numbers and chips instead of sentences.** Say "96% verified", not "The portal found that 96 percent of hours were verified".
4. **Help text lives in popovers.** Each screen gets one "?" button with at most 4 bullets of at most 8 words.
5. **Never show internal language:** no "AGENTS.md", "Honesty Rule", file paths, script names, commit-generation notes, or machine ids such as `slow_drift_0_1pct_day`.
6. **No markdown artefacts:** no backticks or asterisks rendered in the UI.
7. **Tables have 4 columns at most.** Long explanations go behind an expand arrow, limited to 12 words.
8. **Provenance is a chip, not a sentence.**
9. **Labels are short:** "Address", not "Node Addr:"; "Model", not "Model H:".
10. **Details are one click away**, never deleted.

**What you must NOT cut** (judges look for these): the REAL / SYNTHETIC / ILLUSTRATIVE chips, the "needs source" state, the formula in the calculator (one line, with a "Show the math" expander), the "what still gets through" panel (shortened to three bullets with a "details" expander), and the tampered-report failure state.

**Text budget per screen (visible words excluding data):** Operator about 40, Verifier about 40, Importer about 60, Benchmark about 60.

---

## 5. Your six screenshots: what is wrong and how to fix it

| # | What I see | Cause | Fix |
|---|---|---|---|
| 1 | Merkle panel shows an empty dark canvas with a white control box | The graph did not fit its content, and the controls use default white styling | Replace React Flow with a small **custom SVG tree** (Section 7.5): no controls, always fits |
| 2 | White rectangles behind every node card; the controls overlap the leaves | React Flow's default node wrapper (white background and border) is still applied around custom cards | Same fix. If you keep React Flow: transparent node wrapper, restyled controls, `fitView` on mount, a fixed container height, no lock button |
| 3 | "VERIFIER-01" wraps onto two lines; cramped labels; five repeated "Model H" values; every card says HONEST | Narrow cards with too many fields | Compact card (Section 7.1). Show the model hash **once** for all five ("All run model 0x4b7…678 ✓ identical"). Drop the HONEST chip unless a lazy-verifier mode is on |
| 4 | An orange banner quoting "AGENTS.md Honesty Rule 4" | Developer language leaked into the UI | Replace with an inline state: "3 inputs need a source" + the three chips + a "Load example" button |
| 5 | Four paragraphs under "How to read this"; the demo bar covers the content | Too much text; a fixed bar overlaps | Move the help into a "?" popover with 4 short bullets; move the demo dock into the top bar |
| 6 | Dev provenance text at the top; literal backticks in numbers ("`8.12% ± 11.54%`"); machine ids; narrow, wrapped table headings; long paragraphs | Raw markdown printed as text; too many columns; too much copy | Strip backticks; drop the id column; use the 4-column table (Section 7.4); move "why it gets through" behind an expander (12 words) |

Also note from screenshot 6: three attacks have recall below 50%. That is the honest result; keep it, just present it briefly.

---

## 6. Screen specs

**Operator** (about 40 visible words)
- Title "Live telemetry" with a `REAL` chip ("EPA replay").
- Three stat tiles: packets, batches anchored, trust score.
- One chart card; a hash-chain strip; four black pill buttons for attacks; a bond card.

**Verifier** (about 40 words)
- Five compact vote cards in a row; a quorum bar "3 of 5 flagged"; a status timeline of chips; a challenge card with a countdown and a 2-of-3 arbiter indicator; a quarantine evidence drawer.

**Importer** (about 60 words)
- Left: one-line upload dropzone and a result card ("✓ 96% verified · 3 flagged").
- Right: calculator as two big cards, "Default" and "Verified", each with a total in euros, and a **"You save €X"** in black with a red accent. The formula is one line, plus a "Show the math" expander. A "?" popover replaces the how-to cards.
- Needs-source state is the three-chip inline message from fix 4.

**Benchmark** (about 60 words)
- Title "What we catch, and what we don't". The 4-column table, the ROC and adaptive charts, "What still gets through" as three bullets plus a details expander, and a one-line footer of chips: "5 splits · seed 42 · commit 9cad8a0 · REAL EPA data".

---

## 7. Component specs

### 7.1 Verifier card
Width about 220 px; padding 16 px; radius 24 px; hairline border.
- Row 1: "V1" avatar circle, status chip (CLEAN or FRAUD with icon).
- Row 2: big verdict score as a number with a small bar underneath (for example "98%" for clean).
- Row 3: address chip (short, copy, explorer link).
- Row 4: stake in small muted text ("0.50 ETH").
- Nothing else. The shared model hash appears once above the row of cards.

### 7.2 Stat tile
Large number (Titillium Web 28 px), a 13 px caption, a small icon. On the blush band, no border.

### 7.3 Cost split (importer)
Two cards side by side. Left "Default value" (surface-soft), right "Verified data" (white with a black border). Under them a black strip: "You save €X". Every input editable in a collapsed "Inputs" panel.

### 7.4 Results table (benchmark)
Columns: **Attack** (human name) · **Caught** (bar plus "mean ± std" as a plain number) · **Delay** · **Why** (arrow that expands to at most 12 words). Rows below 50% recall get a small triangle chip "Below 50%". Numbers are rendered as text, never inside backticks.

### 7.5 Merkle tree (custom SVG)
Eight leaves, three levels, in one `viewBox` that scales to its container.
- Node: rounded rectangle with a 6-character hash, mono font.
- Root: brand-red outline plus a "ROOT" label; chips for copy and explorer link above the tree.
- Edges: 1 px hairline. A flagged leaf uses the fraud chip colours.
- Hover or focus shows the full hash. No zoom, drag or controls. Keyboard-focusable nodes.

---

## 8. Prompts for Antigravity

Suggested models: **R1** Gemini 3.8 Flash; **R2** Claude Sonnet 5.5 (Thinking); **R3** Gemini 3.8 Flash. Append the efficiency addendum (Section 9) to each. Do not touch `backend/`, `contracts/`, `ml/` or `calculator/`.

### R1. Tokens, shell and base components

```text
Follow AGENTS.md. Work only in web/. Read docs/DESIGN.md Sections 2, 3 and 4 (this redesign spec). Do not read the project guide.

GOAL: Replace the dark theme with the new light design system and rebuild the shell.

TASKS
1. Implement the Section 2 tokens as CSS variables and as Tailwind theme values. Fonts: Titillium Web (headings), Inter, JetBrains Mono via @fontsource packages, no CDN. Remove the old dark tokens everywhere.
2. Shell: top bar (logo, four pill tabs, network badge, compact demo dock with play / next / reset), a black event ticker band under the top bar, a centred 1200 px content column, and alternating white and blush bands. Remove the left sidebar.
3. Restyle the base components to the spec: Button (black pill, red pill, ghost), Chip (REAL, SYNTHETIC, ILLUSTRATIVE, MOCK, CLEAN, FRAUD with icons), StatTile, Card (24 px radius, hairline border), Popover for help text, HashChip (short, copy, explorer link), Skeleton, EmptyState, ErrorState.
4. Event ticker: fed by the existing WebSocket events; pause on hover; static last three events under prefers-reduced-motion; demo captions also appear here.
5. No fixed element may cover page content at any width. The old bottom demo bar must be removed.
6. Add scripts/ui_text_lint.mjs that fails on UI strings containing "AGENTS.md", "Honesty Rule", file paths, backticks or markdown asterisks, and on any Card paragraph over 25 words. Wire it into npm run lint.
7. Keep every provenance label and every "needs source" state.

DONE WHEN: build, lint and the existing Playwright smoke tests pass; no horizontal scroll at 390, 768 and 1440 px.
```

### R2. Operator, Verifier and the Merkle tree

```text
Follow AGENTS.md. Work only in web/. Read docs/DESIGN.md Sections 4, 5, 6 and 7 (7.1, 7.2, 7.5). Do not read the project guide.

GOAL: Rebuild the Operator and Verifier screens in the new design with far less text.

TASKS
1. Operator screen per Section 6: title with REAL chip, three stat tiles, one telemetry chart card, the hash-chain strip, four black pill attack buttons, and the bond card. Visible words excluding data: about 40.
2. Verifier screen per Section 6: the shared model-hash line shown once, five compact vote cards (Section 7.1), the quorum bar, status timeline chips, a challenge card with countdown and 2-of-3 arbiter indicator, and a quarantine evidence drawer.
3. Replace the React Flow Merkle tree with the custom SVG tree in Section 7.5 (8 leaves, 3 levels, responsive viewBox, hover/focus shows the full hash, root chips for copy and explorer). Remove the React Flow dependency if nothing else uses it.
4. Remove the HONEST chip unless a lazy-verifier mode is active.
5. Help text goes in a single "?" popover per screen (4 bullets of at most 8 words).
6. Every number still comes from the API or chain. Loading, empty and error states stay.
7. Update the Playwright tests for the new markup.

DONE WHEN: build, lint and Playwright tests pass; no horizontal scroll at 390, 768 and 1440 px; the Merkle tree shows at every width with no white boxes.
```

### R3. Importer and Benchmark

```text
Follow AGENTS.md. Work only in web/. Read docs/DESIGN.md Sections 4, 5, 6 and 7 (7.3, 7.4). Do not read the project guide.

GOAL: Rebuild the Importer and Benchmark screens in the new design with far less text.

TASKS
1. Importer per Section 6: a one-line upload dropzone, a result card ("verified %, flagged count"), the two-card cost split (Default vs Verified) with a black "You save" strip, the formula as one line with a "Show the math" expander showing every substituted step, and editable inputs in a collapsed panel with the Sources drawer.
2. Replace the orange "calculation blocked" banner with the inline state: "N inputs need a source", one chip per missing parameter, and a "Load example" button. Never mention AGENTS.md or rules in the UI.
3. Replace the four how-to cards with one "?" popover of 4 short bullets.
4. A tampered report must still fail visibly (clear red-icon chip and a short reason).
5. Benchmark per Section 6 and 7.4: the 4-column table with a bar for "Caught", expandable "Why" (max 12 words), human attack names only, rows below 50 percent flagged with a chip; ROC and adaptive charts; "What still gets through" as three bullets with a details expander; a one-line footer of provenance chips. Remove the developer provenance paragraph and strip backticks and markdown from every rendered value.
6. Keep the REAL / SYNTHETIC / ILLUSTRATIVE chips and the limitation content (shortened, not removed).
7. Update the Playwright tests.

DONE WHEN: build, lint and Playwright tests pass; the text lint passes; each screen's visible word count is within its budget (report the counts).
```

---

## 9. Efficiency addendum (paste at the end of every prompt)

```text
EFFICIENCY RULES (these override anything above): Do not read docs/VeriCEMS_Project_Guide.md. Show at most 30 lines of any command output. Do not take screenshots or run the browser; I will review visually. Keep the Walkthrough under 40 lines.
```

---

## 10. After the MVP

The explainer website plan stays as written; when you start it, simply paste these same tokens into `site/src/styles/tokens.css` so the site matches the app (the plan's default warm look is only a placeholder).
