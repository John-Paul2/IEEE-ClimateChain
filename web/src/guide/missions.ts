/**
 * Mission definitions for the VeriCEMS Learn-by-Doing Guide.
 *
 * Designed for clarity, zero interference with Story playback, and immediate visual feedback:
 * - Concise concept explanations (EU CBAM context).
 * - Direct step-by-step instructions.
 * - Real actions triggering app handlers without hijacking background timers.
 */

export interface GuideMissionStep {
  id: string;
  missionNumber: number;
  missionTitle: string;
  missionSubtitle: string;
  page: string;
  targetSelector: string;
  ghostTargetSelector: string;
  guideTargetId: string;
  concept: string;
  demoCaption: string;
  yourTurnCaption: string;
  whatToLookFor: string;
  actionType:
    | "play_packets"
    | "edit_co2"
    | "drag_hide_co2"
    | "flip_quorum"
    | "toggle_report_and_tonnes"
    | "free_play";
  performGhostAction: () => Promise<void>;
  detectUserAction: (targetEl: HTMLElement, onDone: () => void) => () => void;
}

export function triggerNativeClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  if (typeof el.click === "function") {
    el.click();
  }
}

export function triggerNativeInputChange(el: HTMLInputElement, value: string | number) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export const GUIDE_MISSIONS: GuideMissionStep[] = [
  // 1. Seal (Factory)
  {
    id: "mission-1-seal",
    missionNumber: 1,
    missionTitle: "Seal Telemetry",
    missionSubtitle: "Cryptographic hash-chaining & Merkle proofs",
    page: "/operator",
    targetSelector: '[data-guide="seal-strip"]',
    ghostTargetSelector: '[data-guide="packet-0"]',
    guideTargetId: "seal-strip",
    concept:
      "Each hourly stack reading is signed (secure element simulated in this demo) and includes the SHA-256 hash of the previous packet. Every 8 packets are anchored into one on-chain Merkle root.",
    demoCaption:
      "Watch the ghost select a packet to trace its Merkle proof.",
    yourTurnCaption:
      "Click any packet in the hash chain strip to inspect its proof.",
    whatToLookFor:
      "The Merkle tree below automatically expands and highlights the 3 sibling hashes up to the root.",
    actionType: "play_packets",
    performGhostAction: async () => {
      const packet0 =
        document.querySelector<HTMLElement>('[data-guide="packet-0"]') ||
        document.querySelector<HTMLElement>('[data-testid^="hash-chain-packet-"]');
      if (packet0) {
        triggerNativeClick(packet0);
      }
    },
    detectUserAction: (targetEl, onDone) => {
      const handler = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-testid^="hash-chain-packet-"]')) {
          onDone();
        }
      };
      targetEl.addEventListener("click", handler);
      return () => targetEl.removeEventListener("click", handler);
    },
  },

  // 2. Cheat (Factory)
  {
    id: "mission-2-cheat",
    missionNumber: 2,
    missionTitle: "Detect Tampering",
    missionSubtitle: "Inline CO₂ edit breaks the hash chain & Merkle root",
    page: "/operator",
    targetSelector: '[data-guide="co2-edit"]',
    ghostTargetSelector: '[data-guide="co2-edit"] button',
    guideTargetId: "co2-edit",
    concept:
      "Changing even a single digit of CO₂ alters that packet's SHA-256 hash, breaking the link to the next packet and invalidating the on-chain Merkle root.",
    demoCaption:
      "Watch the ghost edit a CO₂ reading to break the chain.",
    yourTurnCaption:
      "Click a packet's CO₂ tonnage, type a number, and press Enter.",
    whatToLookFor:
      "Watch the red 'chain broken here' alert appear and the page scroll to the invalidated Merkle root.",
    actionType: "edit_co2",
    performGhostAction: async () => {
      const editBtn = document.querySelector<HTMLElement>('[data-guide="co2-edit"] button');
      if (editBtn) triggerNativeClick(editBtn);

      await new Promise((r) => setTimeout(r, 450));

      const input = document.querySelector<HTMLInputElement>('[data-guide="co2-edit"] input');
      if (input) {
        triggerNativeInputChange(input, 52.3);
        const form = input.closest("form");
        if (form) {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      }
    },
    detectUserAction: (targetEl, onDone) => {
      const strip = targetEl.closest('[data-guide="seal-strip"]') || targetEl;
      const handler = (e: Event) => {
        if (e.type === "submit" || e.type === "change") {
          onDone();
        }
      };
      strip.addEventListener("submit", handler, { capture: true });
      strip.addEventListener("change", handler, { capture: true });
      return () => {
        strip.removeEventListener("submit", handler, { capture: true });
        strip.removeEventListener("change", handler, { capture: true });
      };
    },
  },

  // 3. Check (Factory)
  {
    id: "mission-3-check",
    missionNumber: 3,
    missionTitle: "Physics Check",
    missionSubtitle: "Combustion mass-balance stoichiometry",
    page: "/operator",
    targetSelector: '[data-guide="hide-slider"]',
    ghostTargetSelector: '[data-guide="hide-slider"]',
    guideTargetId: "hide-slider",
    concept:
      "Even if an attacker tampers before signing, fuel heat input and CO₂ must obey combustion stoichiometry. Scaling down CO₂ trips the mass-balance residual detector.",
    demoCaption:
      "Watch the ghost drag the slider until the physics detector trips.",
    yourTurnCaption:
      "Drag the 'Hide CO₂' slider right until the gauge turns red.",
    whatToLookFor:
      "When the CO₂/Heat ratio drops below the 3σ band, 'Physics check: caught' appears.",
    actionType: "drag_hide_co2",
    performGhostAction: async () => {
      const slider = document.querySelector<HTMLInputElement>('[data-guide="hide-slider"]');
      if (slider) {
        triggerNativeInputChange(slider, 26);
      }
    },
    detectUserAction: (targetEl, onDone) => {
      const handler = () => {
        onDone();
      };
      targetEl.addEventListener("input", handler);
      targetEl.addEventListener("change", handler);
      return () => {
        targetEl.removeEventListener("input", handler);
        targetEl.removeEventListener("change", handler);
      };
    },
  },

  // 4. Judge (Verifiers)
  {
    id: "mission-4-judge",
    missionNumber: 4,
    missionTitle: "Verifier Quorum",
    missionSubtitle: "3-of-5 consensus & operator bond slashing",
    page: "/verifier",
    targetSelector: '[data-guide="quorum-sim"]',
    ghostTargetSelector: '[data-guide="quorum-sim"] [data-sim-node="0"]',
    guideTargetId: "quorum-sim",
    concept:
      "Five independent verifiers run deterministic physics + ML checks on each batch. When 3 of 5 vote fraud, the batch is quarantined and 50% of the operator's ETH bond is slashed.",
    demoCaption:
      "Watch the ghost flip node votes to trigger the 3-of-5 threshold.",
    yourTurnCaption:
      "Click V1–V5 node circles to flip votes between Clean and Fraud.",
    whatToLookFor:
      "At ≥3 fraud votes, the 120s challenge window opens and the operator bond bar shrinks by 50%.",
    actionType: "flip_quorum",
    performGhostAction: async () => {
      const buttons = document.querySelectorAll<HTMLElement>('[data-guide="quorum-sim"] [data-sim-node]');
      if (buttons && buttons.length >= 3) {
        triggerNativeClick(buttons[0]);
        await new Promise((r) => setTimeout(r, 300));
        triggerNativeClick(buttons[1]);
        await new Promise((r) => setTimeout(r, 300));
        triggerNativeClick(buttons[2]);
      }
      await new Promise((r) => setTimeout(r, 400));
      const voteCard1 = document.querySelector<HTMLElement>('[data-guide="vote-card-1"]');
      if (voteCard1) triggerNativeClick(voteCard1);
    },
    detectUserAction: (targetEl, onDone) => {
      const handler = () => {
        onDone();
      };
      targetEl.addEventListener("click", handler);
      const voteCard1 = document.querySelector<HTMLElement>('[data-guide="vote-card-1"]');
      if (voteCard1) voteCard1.addEventListener("click", handler);
      return () => {
        targetEl.removeEventListener("click", handler);
        if (voteCard1) voteCard1.removeEventListener("click", handler);
      };
    },
  },

  // 5. Prove (Buyer)
  {
    id: "mission-5-prove",
    missionNumber: 5,
    missionTitle: "Customs Clearance",
    missionSubtitle: "Browser proof verification & EU CBAM tax savings",
    page: "/importer",
    targetSelector: '[data-guide="valid-toggle"]',
    ghostTargetSelector: '[data-testid="load-tampered-report-btn"]',
    guideTargetId: "valid-toggle",
    concept:
      "EU importers verify the telemetry report in-browser against on-chain roots. Verified actual emissions avoid punitive EU default benchmark surcharges.",
    demoCaption:
      "Watch the ghost test a tampered report and scale shipment tonnes.",
    yourTurnCaption:
      "Click 'Tampered' or 'Valid report', or drag the Consignment mass slider.",
    whatToLookFor:
      "The manifest stamp flips between VERIFIED and ALTERED, and Euro savings update live.",
    actionType: "toggle_report_and_tonnes",
    performGhostAction: async () => {
      const tamperedBtn = document.querySelector<HTMLElement>('[data-testid="load-tampered-report-btn"]');
      if (tamperedBtn) triggerNativeClick(tamperedBtn);

      await new Promise((r) => setTimeout(r, 700));

      const validBtn = document.querySelector<HTMLElement>('[data-testid="load-valid-report-btn"]');
      if (validBtn) triggerNativeClick(validBtn);

      await new Promise((r) => setTimeout(r, 500));

      const tonnesSlider = document.querySelector<HTMLInputElement>('[data-guide="tonnes-slider"]');
      if (tonnesSlider) triggerNativeInputChange(tonnesSlider, 1200);
    },
    detectUserAction: (targetEl, onDone) => {
      const handler = () => {
        onDone();
      };
      targetEl.addEventListener("click", handler);
      const tonnes = document.querySelector<HTMLElement>('[data-guide="tonnes-slider"]');
      if (tonnes) tonnes.addEventListener("input", handler);
      return () => {
        targetEl.removeEventListener("click", handler);
        if (tonnes) tonnes.removeEventListener("input", handler);
      };
    },
  },

  // 6. Free play
  {
    id: "mission-6-freeplay",
    missionNumber: 6,
    missionTitle: "Free Exploration",
    missionSubtitle: "Hands-on checklist across all modules",
    page: "/operator",
    targetSelector: '[data-guide="seal-strip"]',
    ghostTargetSelector: '[data-guide="seal-strip"]',
    guideTargetId: "seal-strip",
    concept:
      "You've experienced all three pillars of VeriCEMS. Click any item below to jump directly to that control and experiment freely.",
    demoCaption:
      "Explore the system and complete the interactive checklist items.",
    yourTurnCaption:
      "Click any item in the checklist to jump to it, or click Finish when ready.",
    whatToLookFor:
      "Each item checks off automatically as you interact with it.",
    actionType: "free_play",
    performGhostAction: async () => {},
    detectUserAction: (_targetEl, _onDone) => {
      return () => {};
    },
  },
];

export const FREE_PLAY_ITEMS = [
  { id: "edit_reading", label: "Edit an emissions reading", page: "/operator", guideId: "co2-edit" },
  { id: "hide_co2", label: "Drag Hide CO₂ physics slider", page: "/operator", guideId: "hide-slider" },
  { id: "flip_quorum", label: "Flip quorum committee votes", page: "/verifier", guideId: "quorum-sim" },
  { id: "tamper_report", label: "Test tampered CBAM report", page: "/importer", guideId: "valid-toggle" },
  { id: "drag_tonnes", label: "Scale consignment mass tonnes", page: "/importer", guideId: "tonnes-slider" },
  { id: "cut_emissions", label: "Simulate plant emissions cut", page: "/importer", guideId: "cut-slider" },
];
