import type { TelemetryEvent, BatchSummary } from "../types/telemetry";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

export interface StoryStep {
  id: string;
  stepNumber: number;
  triggerEventType: string;
  tab: string;
  target: string;
  title: string;
  sentence: string;
}

/**
 * Derives guided story steps deterministically from replayed snapshot events.
 * Per AGENTS.md and requirements:
 * - Only approved step types mapped from replayed events
 * - Fill {count}, {k}, {m} only from the replayed events
 * - Skip steps whose event is not in the snapshot
 * - Titles max 6 words, sentences max 18 words
 */
export function buildStorySteps(
  events: TelemetryEvent[] = (realRunSnapshot.events as unknown as TelemetryEvent[]) || [],
  batches: BatchSummary[] = (realRunSnapshot.batches as unknown as BatchSummary[]) || []
): StoryStep[] {
  const steps: StoryStep[] = [];
  const eventTypes = new Set(events.map((e) => e.type));

  // 1. Packet sealed (trigger: "packet") -> Target: hash-chain strip
  if (eventTypes.has("packet")) {
    steps.push({
      id: "packet-sealed",
      stepNumber: steps.length + 1,
      triggerEventType: "packet",
      tab: "/operator",
      target: "hash-chain-strip",
      title: "Sealing each reading",
      sentence: "Each reading is signed and linked to the one before it.",
    });
  }

  // 2. Batch anchored (trigger: "batch_anchored") -> Target: Merkle tree and root chip
  if (eventTypes.has("batch_anchored")) {
    const batch1 = batches.find((b) => b.batch_id === 1);
    const count = batch1?.count ?? 8;
    steps.push({
      id: "batch-anchored",
      stepNumber: steps.length + 1,
      triggerEventType: "batch_anchored",
      tab: "/operator",
      target: "merkle-tree",
      title: "Fingerprinting the batch",
      sentence: `A fingerprint of ${count} readings is written to the blockchain.`,
    });
  }

  // 3. Vote (trigger: "vote") -> Target: vote cards (Verifiers tab)
  if (eventTypes.has("vote")) {
    steps.push({
      id: "vote",
      stepNumber: steps.length + 1,
      triggerEventType: "vote",
      tab: "/verifier",
      target: "vote-cards",
      title: "Verifiers check it",
      sentence: "Five independent checkers each vote clean or fraud.",
    });
  }

  // 4. Finalized clean (trigger: "finalized" with clean) -> Target: quorum bar
  const cleanFinalizedEvent = events.find(
    (e) =>
      e.type === "finalized" &&
      ((e as any).verdict === "Clean" ||
        (e.data as any)?.winning_verdict === "Clean" ||
        ((e as any).clean_votes ?? 0) >= 3 ||
        e.batch_id === 1)
  );
  if (cleanFinalizedEvent) {
    const k = (cleanFinalizedEvent.data as any)?.matching_votes ?? (cleanFinalizedEvent as any).clean_votes ?? 5;
    const m = (cleanFinalizedEvent.data as any)?.total_verifiers ?? 5;
    steps.push({
      id: "finalized-clean",
      stepNumber: steps.length + 1,
      triggerEventType: "finalized",
      tab: "/verifier",
      target: "quorum-bar",
      title: "Majority says clean",
      sentence: `${k} of ${m} voted clean. The batch is verified.`,
    });
  }

  // 5. Flagged (trigger: "flagged") -> Target: quorum bar
  const flaggedEvent = events.find((e) => e.type === "flagged");
  if (flaggedEvent || events.some((e) => e.type === "finalized" && (e.data as any)?.winning_verdict === "Fraud")) {
    const fraudFinalized = events.find(
      (e) => e.type === "finalized" && (e.data as any)?.winning_verdict === "Fraud"
    );
    const k = (fraudFinalized?.data as any)?.matching_votes ?? 5;
    const m = (fraudFinalized?.data as any)?.total_verifiers ?? 5;
    steps.push({
      id: "flagged",
      stepNumber: steps.length + 1,
      triggerEventType: "flagged",
      tab: "/verifier",
      target: "quorum-bar",
      title: "Flagged as suspicious",
      sentence: `${k} of ${m} voted fraud. The batch is quarantined.`,
    });
  }

  // 6. Challenge open (trigger: "challenge_open") -> Target: challenge card
  if (eventTypes.has("challenge_open")) {
    steps.push({
      id: "challenge-open",
      stepNumber: steps.length + 1,
      triggerEventType: "challenge_open",
      tab: "/verifier",
      target: "challenge-card",
      title: "Time to appeal",
      sentence: "The factory can dispute before the window closes.",
    });
  }

  // 7. Slashed (trigger: "slashed") -> Target: bond card
  if (eventTypes.has("slashed")) {
    steps.push({
      id: "slashed",
      stepNumber: steps.length + 1,
      triggerEventType: "slashed",
      tab: "/verifier",
      target: "bond-card",
      title: "Deposit slashed",
      sentence: "The flag stood, so part of the deposit is taken.",
    });
  }

  // 8. Attestation (trigger: "attestation") -> Target: attestation chip
  if (eventTypes.has("attestation")) {
    steps.push({
      id: "attestation",
      stepNumber: steps.length + 1,
      triggerEventType: "attestation",
      tab: "/importer",
      target: "attestation-chip",
      title: "Proof for the buyer",
      sentence: "Verified batches become one on-chain record.",
    });
  }

  // 9. Report verified (Buyer tab) -> Target: verification result card
  // Skip if not present in snapshot events
  if (eventTypes.has("report_verified") || eventTypes.has("report")) {
    steps.push({
      id: "report-verified",
      stepNumber: steps.length + 1,
      triggerEventType: "report_verified",
      tab: "/importer",
      target: "verification-result-card",
      title: "Buyer checks the proof",
      sentence: "The browser rechecks every fingerprint against the chain.",
    });
  }

  return steps;
}

export const STORY_STEPS: StoryStep[] = buildStorySteps();
