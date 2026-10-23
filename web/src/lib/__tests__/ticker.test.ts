/**
 * Unit tests for ticker text and caption templates per Requirement 4 & 7.
 * Tests that every event type formats according to templates without hardcoded
 * sentences, network names, euro amounts, or quorum counts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatEventTickerText, formatStepCaption } from "../eventTemplates.ts";
import type { TelemetryEvent } from "../../types/telemetry.ts";

describe("VeriCEMS Event Ticker & Caption Templates", () => {
  it("formats batch_anchored using template 'Batch {n} anchored'", () => {
    const event: TelemetryEvent = {
      type: "batch_anchored",
      batch_id: 42,
      data: { merkle_root: "0x1234", tx_hash: "0xabcd" },
    };
    const text = formatEventTickerText(event);
    assert.equal(text, "Batch 42 anchored");
    assert.doesNotMatch(text, /Arbitrum|Sepolia|Polygon|Amoy|Base/i);
    assert.doesNotMatch(text, /confirmed/i);
    assert.doesNotMatch(text, /€|EUR/);
  });

  it("formats vote using template 'Verifier {id} voted {verdict} on Batch {n}'", () => {
    const cleanVote: TelemetryEvent = {
      type: "vote",
      batch_id: 7,
      data: { verifier_id: "VERIFIER-02", verdict: 0, score_bp: 9800 },
    };
    assert.equal(formatEventTickerText(cleanVote), "Verifier VERIFIER-02 voted CLEAN on Batch 7");

    const fraudVote: TelemetryEvent = {
      type: "vote",
      batch_id: 8,
      data: { verifier_id: "VERIFIER-04", verdict: 1, score_bp: 2200 },
    };
    assert.equal(formatEventTickerText(fraudVote), "Verifier VERIFIER-04 voted FRAUD on Batch 8");
  });

  it("formats finalized using template '{k} of {m} verifiers voted {verdict}'", () => {
    const cleanFinalized: TelemetryEvent = {
      type: "finalized",
      batch_id: 1,
      data: {
        status: "Verified",
        winning_verdict: 0,
        matching_votes: 5,
        score_bp_by_verifier: {
          "v1": 9800,
          "v2": 9750,
          "v3": 9900,
          "v4": 9850,
          "v5": 9820,
        },
      },
    };
    assert.equal(formatEventTickerText(cleanFinalized), "5 of 5 verifiers voted CLEAN");

    const fraudFinalized: TelemetryEvent = {
      type: "finalized",
      batch_id: 2,
      data: {
        status: "Quarantined",
        winning_verdict: 1,
        matching_votes: 4,
        score_bp_by_verifier: {
          "v1": 9000,
          "v2": 2100,
          "v3": 2150,
          "v4": 2200,
          "v5": 2050,
        },
      },
    };
    assert.equal(formatEventTickerText(fraudFinalized), "4 of 5 verifiers voted FRAUD");
  });

  it("formats packet event using dynamic sequence range", () => {
    const event: TelemetryEvent = {
      type: "packet",
      data: { first_seq: 16, count: 8 },
    };
    assert.equal(formatEventTickerText(event), "Packets 16–23 sealed");
  });

  it("formats flagged event with reason codes", () => {
    const event: TelemetryEvent = {
      type: "flagged",
      batch_id: 3,
      data: { reason_codes: ["E01", "E03"] },
    };
    assert.equal(formatEventTickerText(event), "Batch 3 flagged: E01, E03");
  });

  it("formats challenge_open event (both initial and operator disputed)", () => {
    const openEvent: TelemetryEvent = {
      type: "challenge_open",
      batch_id: 5,
      data: { window_closes_at: 1782829000 },
    };
    assert.equal(formatEventTickerText(openEvent), "Challenge opened for Batch 5");

    const disputeEvent: TelemetryEvent = {
      type: "challenge_open",
      batch_id: 5,
      data: { disputed: true },
    };
    assert.equal(formatEventTickerText(disputeEvent), "Batch 5 disputed by operator");
  });

  it("formats slashed event with final batch status", () => {
    const event: TelemetryEvent = {
      type: "slashed",
      batch_id: 6,
      data: { batch_status: "Slashed", slashed_amount_wei: "1000000000000000000" },
    };
    assert.equal(formatEventTickerText(event), "Batch 6 resolved: Slashed · Operator bond slashed");
  });

  it("formats attestation event with attestation id", () => {
    const event: TelemetryEvent = {
      type: "attestation",
      data: { attestation_id: 3 },
    };
    assert.equal(formatEventTickerText(event), "Attestation #3 recorded");
  });

  it("formats scenario_step and scenario_reset", () => {
    const stepEv: TelemetryEvent = {
      type: "scenario_step",
      data: { step: 2, name: "Attack Injection" },
    };
    assert.equal(formatEventTickerText(stepEv), "Scenario step 2: Attack Injection");

    const resetEv: TelemetryEvent = {
      type: "scenario_reset",
    };
    assert.equal(formatEventTickerText(resetEv), "Scenario reset");
  });

  it("ensures step captions carry no chain names, word confirmed, or euro amounts", () => {
    for (let step = 1; step <= 7; step++) {
      const cap = formatStepCaption(step);
      assert.ok(cap.length > 0);
      assert.doesNotMatch(cap, /Arbitrum|Sepolia|Polygon|Amoy|Base/i);
      assert.doesNotMatch(cap, /\bconfirmed\b/i);
      assert.doesNotMatch(cap, /€|EUR/);
    }
  });
});
