/**
 * Realistic synthetic mock data provider for offline/demo operation.
 * Conforms to AGENTS.md Rule 3: explicitly labelled synthetic in code and data.
 */

import type {
  BatchDetail,
  VerifierNodeStatus,
  ChallengeRecord,
  TelemetryEvent,
  TelemetryPacket,
} from "../types/telemetry";
import type { HealthResponse, StateResponse } from "../types/api";

export function generateSyntheticPackets(startSeq: number, count: number): TelemetryPacket[] {
  const packets: TelemetryPacket[] = [];
  let prevHash = "0x" + "00".repeat(32);

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
    const packetHash = `0x${((seq + 1) * 11111111).toString(16).padStart(8, "0")}${"a1b2c3d4e5f67890".repeat(3).slice(0, 56)}`;
    const signature = `0x${((seq + 1) * 7777777).toString(16).padStart(8, "0")}${"deadbeefcafe1234".repeat(7).slice(0, 120)}`;

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

  return [
    {
      batch_id: 1,
      device_id: "DEV-STEEL-001",
      installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkle_root: "0x789a42f8c5b9671144177cd390de2ef830026e6d1c815ec6ba9d2424fa75d9e1",
      first_seq: 0,
      last_seq: 7,
      count: 8,
      status: "Verified",
      anchored_at: 1782820800,
      tx_hash: "0x89ab12cd34ef567890abcdef1234567890abcdef1234567890abcdef12345678",
      clean_votes: 5,
      fraud_votes: 0,
      mean_score_bp: 9820,
      packets: p1,
    },
    {
      batch_id: 2,
      device_id: "DEV-STEEL-001",
      installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkle_root: "0x34bc89de01fa23bc45de67ef890123456789abcdef0123456789abcdef012345",
      first_seq: 8,
      last_seq: 15,
      count: 8,
      status: "Verified",
      anchored_at: 1782823200,
      tx_hash: "0x12cd34ef567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      clean_votes: 4,
      fraud_votes: 1,
      mean_score_bp: 9410,
      packets: p2,
    },
    {
      batch_id: 3,
      device_id: "DEV-STEEL-001",
      installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkle_root: "0xfa123456bcde7890123456789abcdef0123456789abcdef0123456789abcdef0",
      first_seq: 16,
      last_seq: 23,
      count: 8,
      status: "Quarantined",
      anchored_at: 1782825600,
      tx_hash: "0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      clean_votes: 1,
      fraud_votes: 4,
      mean_score_bp: 2150,
      packets: p3,
    },
    {
      batch_id: 4,
      device_id: "DEV-STEEL-001",
      installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      merkle_root: "0xee99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbb",
      first_seq: 24,
      last_seq: 31,
      count: 8,
      status: "Anchored",
      anchored_at: Math.floor(Date.now() / 1000) - 45,
      tx_hash: "0xbeefcafe00112233445566778899aabbccddeeff00112233445566778899aabb",
      clean_votes: 2,
      fraud_votes: 0,
      mean_score_bp: 9650,
      packets: p4,
    },
  ];
}

export function getSyntheticVerifiers(): VerifierNodeStatus[] {
  return [
    {
      verifier_id: "VERIFIER-01",
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 4,
      last_verdict: "clean",
      last_score_bp: 9820,
      last_model_hash: "0x4b7c891023d456789abcdef0123456789abcdef0123456789abcdef012345678",
    },
    {
      verifier_id: "VERIFIER-02",
      address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 4,
      last_verdict: "clean",
      last_score_bp: 9790,
      last_model_hash: "0x4b7c891023d456789abcdef0123456789abcdef0123456789abcdef012345678",
    },
    {
      verifier_id: "VERIFIER-03",
      address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2100,
      last_model_hash: "0x4b7c891023d456789abcdef0123456789abcdef0123456789abcdef012345678",
    },
    {
      verifier_id: "VERIFIER-04",
      address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2200,
      last_model_hash: "0x4b7c891023d456789abcdef0123456789abcdef0123456789abcdef012345678",
    },
    {
      verifier_id: "VERIFIER-05",
      address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
      mode: "honest",
      staked_amount_wei: "500000000000000000",
      is_active: true,
      last_batch_id: 3,
      last_verdict: "fraud",
      last_score_bp: 2150,
      last_model_hash: "0x4b7c891023d456789abcdef0123456789abcdef0123456789abcdef012345678",
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
      type: "BATCH_ANCHORED",
      batch_id: 3,
      data: {
        device_id: "DEV-STEEL-001",
        first_seq: 16,
        last_seq: 23,
        merkle_root: "0xfa123456bcde7890123456789abcdef0123456789abcdef0123456789abcdef0",
      },
    },
    {
      event_id: "evt-002",
      timestamp: new Date(now.getTime() - 90_000).toISOString(),
      type: "VERIFIER_VOTE_COMMITTED",
      batch_id: 3,
      data: { verifier_id: "VERIFIER-03", commitment: "0x11aa22bb..." },
    },
    {
      event_id: "evt-003",
      timestamp: new Date(now.getTime() - 60_000).toISOString(),
      type: "VERIFIER_VOTE_REVEALED",
      batch_id: 3,
      data: { verifier_id: "VERIFIER-03", verdict: "fraud", score_bp: 2100 },
    },
    {
      event_id: "evt-004",
      timestamp: new Date(now.getTime() - 35_000).toISOString(),
      type: "QUORUM_REACHED",
      batch_id: 3,
      data: { outcome: "FRAUD", clean_votes: 1, fraud_votes: 4 },
    },
    {
      event_id: "evt-005",
      timestamp: new Date(now.getTime() - 35_000).toISOString(),
      type: "CHALLENGE_OPENED",
      batch_id: 3,
      data: { challenge_window_seconds: 120, bond_at_risk_wei: "1000000000000000000" },
    },
  ];
}

export function getSyntheticHealth(): HealthResponse {
  return {
    status: "ok",
    chain_id: 31337,
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
    installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
    device_id: "DEV-STEEL-001",
    vault: {
      operator_bond_wei: "1000000000000000000",
      slashed_wei: "0",
      total_locked_wei: "3500000000000000000",
    },
    batches: 4,
  };
}
