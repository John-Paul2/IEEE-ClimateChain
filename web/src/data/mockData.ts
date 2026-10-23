/**
 * Realistic synthetic mock data provider for offline/demo operation.
 * Conforms to AGENTS.md Rule 3: explicitly labelled synthetic in code and data.
 */

import { keccak256, stringToBytes } from "viem";
import type {
  BatchDetail,
  VerifierNodeStatus,
  ChallengeRecord,
  TelemetryEvent,
  TelemetryPacket,
} from "../types/telemetry";
import type { HealthResponse, StateResponse } from "../types/api";
import { deploymentConfig } from "../chain/deploymentConfig.ts";

const synthHash = (seed: string): string => keccak256(stringToBytes(seed));

export function generateSyntheticPackets(startSeq: number, count: number): TelemetryPacket[] {
  const packets: TelemetryPacket[] = [];
  let prevHash = synthHash("initial-prev-hash");

  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const date = new Date(Date.UTC(2026, 6, 1, 12, i * 5, 0));
    // Synthetic combustion telemetry
    const load = 300 + Math.sin(seq / 3) * 20;
    const heat = load * 9.2 + Math.cos(seq / 2) * 10;
    const co2 = heat * 0.102 + (Math.sin(seq) * 1.5);
    const o2 = 4.2 + (Math.sin(seq / 4) * 0.3);
    const temp = 148.0 + (Math.cos(seq / 5) * 4.0);
    const flow = 840 + load * 0.5;

    // Deterministic mock hash string for visual display
    const packetHash = synthHash(`packet-${seq}`);
    const signature = synthHash(`sig-${seq}`);

    packets.push({
      device_id: "DEV-STEEL-001",
      seq,
      timestamp_utc: date.toISOString().replace(".000", ""),
      values: {
        co2_mass_short_tons: Number(co2.toFixed(2)),
        gross_load_mw: Number(load.toFixed(1)),
        heat_input_mmbtu: Number(heat.toFixed(1)),
        synthetic_stack_o2_pct: Number(o2.toFixed(2)),
        synthetic_flue_temp_c: Number(temp.toFixed(1)),
        synthetic_stack_flow_kscfm: Number(flow.toFixed(1)),
        synthetic_fuel_flow_mmbtu_indep: Number((heat * 0.999).toFixed(1)),
      },
      prev_hash: prevHash,
      signature,
      packet_hash: packetHash,
    });

    prevHash = packetHash;
  }

  return packets;
}

export function getSyntheticBatches(): BatchDetail[] {
  const p1 = generateSyntheticPackets(0, 8);
  const p2 = generateSyntheticPackets(8, 8);
  const p3 = generateSyntheticPackets(16, 8);
  const p4 = generateSyntheticPackets(24, 8);
  const instId = deploymentConfig.contracts.Attestation;

  return [
    {
      batch_id: 1,
      device_id: "DEV-STEEL-001",
      installation_id: instId,
      merkle_root: synthHash("batch-1-root"),
      first_seq: 0,
      last_seq: 7,
      count: 8,
      status: "Verified",
      anchored_at: 1782820800,
      tx_hash: synthHash("batch-1-tx"),
      clean_votes: 5,
      fraud_votes: 0,
      mean_score_bp: 9820,
      packets: p1,
    },
    {
      batch_id: 2,
      device_id: "DEV-STEEL-001",
      installation_id: instId,
      merkle_root: synthHash("batch-2-root"),
      first_seq: 8,
      last_seq: 15,
      count: 8,
      status: "Verified",
      anchored_at: 1782823200,
      tx_hash: synthHash("batch-2-tx"),
      clean_votes: 4,
      fraud_votes: 1,
      mean_score_bp: 9410,
      packets: p2,
    },
    {
      batch_id: 3,
      device_id: "DEV-STEEL-001",
      installation_id: instId,
      merkle_root: synthHash("batch-3-root"),
      first_seq: 16,
      last_seq: 23,
      count: 8,
      status: "Quarantined",
      anchored_at: 1782825600,
      tx_hash: synthHash("batch-3-tx"),
      clean_votes: 1,
      fraud_votes: 4,
      mean_score_bp: 2150,
      packets: p3,
    },
    {
      batch_id: 4,
      device_id: "DEV-STEEL-001",
      installation_id: instId,
      merkle_root: synthHash("batch-4-root"),
      first_seq: 24,
      last_seq: 31,
      count: 8,
      status: "Anchored",
      anchored_at: Math.floor(Date.now() / 1000) - 45,
      tx_hash: synthHash("batch-4-tx"),
      clean_votes: 2,
      fraud_votes: 0,
      mean_score_bp: 9650,
      packets: p4,
    },
  ];
}

export function getSyntheticVerifiers(): VerifierNodeStatus[] {
  const verifiers = deploymentConfig.verifiers || [];
  const quorum = deploymentConfig.contracts.VerifierQuorum;
  const modelHash = synthHash("model-onnx-ae-physics-v1");

  return [
    {
      verifier_id: "VERIFIER-01",
      address: verifiers[0] || quorum,
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 4,
      last_verdict: "clean",
      last_score_bp: 9820,
      last_model_hash: modelHash,
    },
    {
      verifier_id: "VERIFIER-02",
      address: verifiers[1] || quorum,
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 4,
      last_verdict: "clean",
      last_score_bp: 9790,
      last_model_hash: modelHash,
    },
    {
      verifier_id: "VERIFIER-03",
      address: verifiers[2] || quorum,
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2100,
      last_model_hash: modelHash,
    },
    {
      verifier_id: "VERIFIER-04",
      address: verifiers[3] || quorum,
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2200,
      last_model_hash: modelHash,
    },
    {
      verifier_id: "VERIFIER-05",
      address: verifiers[4] || quorum,
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2150,
      last_model_hash: modelHash,
    },
  ];
}

export function getSyntheticChallenges(): ChallengeRecord[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      batch_id: 3,
      opened_at_epoch: now - 35,
      expires_at_epoch: now + 85, // 120s challenge window
      status: "Active",
      operator_bond_wei: "1000000000000000000",
      arbiter_notes: "Auto-opened by VerifierQuorum 4-of-5 fraud consensus (CO2 mass-balance discrepancy detected).",
    },
  ];
}

export function getSyntheticEvents(): TelemetryEvent[] {
  const now = new Date();
  return [
    {
      event_id: "evt-001",
      timestamp: new Date(now.getTime() - 120_000).toISOString(),
      type: "batch_anchored",
      batch_id: 3,
      data: {
        device_id: "DEV-STEEL-001",
        first_seq: 16,
        last_seq: 23,
        merkle_root: synthHash("batch-3-root"),
      },
    },
    {
      event_id: "evt-002",
      timestamp: new Date(now.getTime() - 90_000).toISOString(),
      type: "vote",
      batch_id: 3,
      data: { verifier_id: "VERIFIER-03", commitment: synthHash("vote-commitment-3") },
    },
    {
      event_id: "evt-003",
      timestamp: new Date(now.getTime() - 60_000).toISOString(),
      type: "vote",
      batch_id: 3,
      data: { verifier_id: "VERIFIER-03", verdict: 1, score_bp: 2100 },
    },
    {
      event_id: "evt-004",
      timestamp: new Date(now.getTime() - 35_000).toISOString(),
      type: "finalized",
      batch_id: 3,
      data: { winning_verdict: 1, matching_votes: 4, score_bp_by_verifier: { "VERIFIER-01": 9000, "VERIFIER-02": 2100, "VERIFIER-03": 2100, "VERIFIER-04": 2200, "VERIFIER-05": 2150 } },
    },
    {
      event_id: "evt-005",
      timestamp: new Date(now.getTime() - 35_000).toISOString(),
      type: "challenge_open",
      batch_id: 3,
      data: { challenge_window_seconds: 120, bond_at_risk_wei: "1000000000000000000" },
    },
  ];
}

export function getSyntheticHealth(): HealthResponse {
  return {
    status: "ok",
    chain_id: deploymentConfig.chainId,
    clock: {
      wall_start_epoch: Math.floor(Date.now() / 1000) - 3600,
      scenario_time_utc: new Date().toISOString(),
      speed_factor: 1,
      paused: false,
    },
  };
}

export function getSyntheticState(): StateResponse {
  return {
    attack: "none",
    installation_id: deploymentConfig.contracts.Attestation,
    device_id: "DEV-STEEL-001",
    vault: {
      operator_bond_wei: "1000000000000000000",
      slashed_wei: "0",
      total_locked_wei: "3500000000000000000",
    },
    batches: 4,
  };
}
