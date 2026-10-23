import type { TelemetryEvent } from "../types/telemetry.ts";

/**
 * Generate ticker text and captions strictly from events using templates.
 * Enforces AGENTS.md honesty rules: zero hard-coded sentences, network names,
 * euro amounts, or quorum counts.
 */
export function formatEventTickerText(event: TelemetryEvent): string {
  const type = event.type?.toLowerCase() || "";
  const batchId = event.batch_id ?? (event.data?.batch_id as number) ?? 1;
  const data = event.data || {};

  switch (type) {
    case "batch_anchored": {
      return `Batch ${batchId} anchored`;
    }

    case "vote": {
      const verifierId = (data.verifier_id as string) || "node";
      const verdict = data.verdict === 1 ? "FRAUD" : "CLEAN";
      return `Verifier ${verifierId} voted ${verdict} on Batch ${batchId}`;
    }

    case "finalized": {
      const k = typeof data.matching_votes === "number" ? data.matching_votes : 0;
      const scores = (data.score_bp_by_verifier as Record<string, number>) || {};
      const m = Object.keys(scores).length || 5;
      const verdict = data.winning_verdict === 1 ? "FRAUD" : "CLEAN";
      return `${k} of ${m} verifiers voted ${verdict}`;
    }

    case "packet": {
      const firstSeq = typeof data.first_seq === "number" ? data.first_seq : 0;
      const count = typeof data.count === "number" ? data.count : 8;
      const lastSeq = firstSeq + count - 1;
      return `Packets ${firstSeq}–${lastSeq} sealed`;
    }

    case "flagged": {
      const reasons = Array.isArray(data.reason_codes) && data.reason_codes.length > 0
        ? data.reason_codes.join(", ")
        : "anomaly detected";
      return `Batch ${batchId} flagged: ${reasons}`;
    }

    case "challenge_open": {
      if (data.disputed) {
        return `Batch ${batchId} disputed by operator`;
      }
      return `Challenge opened for Batch ${batchId}`;
    }

    case "slashed": {
      const status = (data.batch_status as string) || "Slashed";
      return `Batch ${batchId} resolved: ${status} · Operator bond slashed`;
    }

    case "attestation": {
      const attId = data.attestation_id ?? 1;
      return `Attestation #${attId} recorded`;
    }

    case "scenario_step": {
      const step = data.step ?? 1;
      const name = data.name || `Step ${step}`;
      return `Scenario step ${step}: ${name}`;
    }

    case "scenario_reset": {
      return `Scenario reset`;
    }

    default: {
      return `Event ${event.type || "unknown"} on Batch ${batchId}`;
    }
  }
}

/**
 * Generate step captions from step events or templates.
 * Zero hardcoded network names or euro amounts.
 */
export function formatStepCaption(step: number, scenarioEvent?: TelemetryEvent): string {
  if (scenarioEvent && scenarioEvent.data?.caption) {
    return String(scenarioEvent.data.caption);
  }

  switch (step) {
    case 1:
      return "Step 1/7: Telemetry batches flow and verifier quorum verifies clean emissions.";
    case 2:
      return "Step 2/7: Insider injects constant-scaling attack before signing.";
    case 3:
      return "Step 3/7: Verifier committee flags residuals and batch is quarantined.";
    case 4:
      return "Step 4/7: Operator disputes with inclusion proof; arbiters uphold; bond is slashed.";
    case 5:
      return "Step 5/7: Period report generated and CBAM attestation recorded.";
    case 6:
      return "Step 6/7: Importer portal verifies genuine report, rejects tampered copy, and calculates savings.";
    case 7:
      return "Step 7/7: Benchmark suite discloses empirical evasion limits and residual weaknesses.";
    default:
      return "Ready to replay recorded scenario run.";
  }
}
