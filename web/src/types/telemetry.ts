/**
 * Core telemetry, batch, verifier and event types for VeriCEMS.
 * Strictly conforms to docs/INTERFACES.md and backend/vericems/api.py.
 */

export type ChannelSource = "real" | "synthetic";

export interface TelemetryPacket {
  device_id: string;
  seq: number;
  timestamp_utc: string;
  values: {
    co2_mass_short_tons?: number;
    gross_load_mw?: number;
    heat_input_mmbtu?: number;
    so2_mass_lbs?: number;
    nox_mass_lbs?: number;
    op_time_fraction?: number;
    // Explicit synthetic channels per AGENTS.md Rule 3 & INTERFACES.md
    synthetic_stack_o2_pct?: number;
    synthetic_flue_temp_c?: number;
    synthetic_stack_flow_kscfm?: number;
    synthetic_fuel_flow_mmbtu_indep?: number;
    [channel: string]: number | undefined;
  };
  prev_hash: string;
  signature: string;
  packet_hash?: string;
}

export type BatchStatus = "Anchored" | "Verified" | "Quarantined" | "Slashed" | "Cleared";

export interface BatchSummary {
  batch_id: number;
  device_id: string;
  installation_id: string;
  merkle_root: string;
  first_seq: number;
  last_seq: number;
  count: number;
  status: BatchStatus;
  anchored_at?: number;
  tx_hash?: string;
  anchor_tx_hash?: string;
  finalize_tx_hash?: string;
  clean_votes?: number;
  fraud_votes?: number;
  mean_score_bp?: number;
  reason_codes?: string[];
  verdict_summary?: {
    winning_verdict?: number;
    matching_votes?: number;
    score_bp_by_verifier?: Record<string, number>;
    reason_codes?: string[];
  };
}

export interface MerkleProofItem {
  leaf_index: number;
  packet_hash: string;
  leaf_hash: string;
  siblings: string[];
  merkle_root: string;
}

export interface BatchDetail extends BatchSummary {
  packets: TelemetryPacket[];
  merkle?: {
    merkle_root: string;
    leaves: string[];
    proofs: MerkleProofItem[];
  };
}

export interface VerifierNodeStatus {
  verifier_id: string;
  address: string;
  mode: "honest" | "adversarial_clean" | "adversarial_fraud" | "silent";
  staked_amount_wei: string;
  is_active: boolean;
  last_batch_id?: number;
  last_verdict?: "clean" | "fraud";
  last_score_bp?: number;
  last_model_hash?: string;
  commitment?: string;
  revealed?: boolean;
  tx_hash?: string;
}

export type ChallengeStatus =
  | "Active"
  | "Open"
  | "Disputed"
  | "DisputedByOperator"
  | "ResolvedFraud"
  | "UpheldSlashed"
  | "ResolvedCleared"
  | "OverturnedCleared"
  | "Settled"
  | "ExpiredSlashed";

export interface ChallengeRecord {
  batch_id: number;
  opened_at_epoch?: number;
  expires_at_epoch?: number;
  window_closes_at?: number;
  status: ChallengeStatus | string;
  operator_bond_wei?: string;
  slashed_amount_wei?: string | number;
  arbiter_notes?: string;
  evidence_hash?: string;
  operator_dispute_hash?: string | null;
  explanation_uri?: string | null;
  reason_codes?: string[];
  arbiter_votes?: Array<{
    arbiter_id?: string;
    arbiter_address?: string;
    approved?: boolean;
    tx_hash?: string;
  }>;
  tx_hashes?: Record<string, string>;
}

export interface TelemetryEvent {
  event_id: string;
  timestamp: string;
  type:
    | "PACKET_RECORDED"
    | "BATCH_ANCHORED"
    | "VERIFIER_VOTE_COMMITTED"
    | "VERIFIER_VOTE_REVEALED"
    | "QUORUM_REACHED"
    | "CHALLENGE_OPENED"
    | "CHALLENGE_RESOLVED"
    | "ATTESTATION_RECORDED"
    | "packet"
    | "batch_anchored"
    | "vote"
    | "finalized"
    | "flagged"
    | "challenge_open"
    | "slashed"
    | "attestation"
    | "scenario_step"
    | "scenario_reset"
    | string;
  batch_id?: number;
  data: Record<string, unknown>;
}

export interface PeriodAttestationRecord {
  attestation_id: number;
  installation_id: string;
  period_label: string;
  total_emissions_kg_co2e: string;
  production_kg: string;
  coverage_bp: number;
  period_merkle_root: string;
  attested_at: number;
  attested_by: string;
  verified_batch_ids: number[];
}
