/**
 * Typed response schemas for backend/vericems/api.py.
 */

import type { BatchSummary, BatchDetail, VerifierNodeStatus, ChallengeRecord, TelemetryEvent } from "./telemetry";

export interface HealthResponse {
  status: string;
  chain_id: number;
  clock: {
    wall_start_epoch?: number;
    scenario_time_utc?: string;
    speed_factor?: number;
    paused?: boolean;
    [k: string]: unknown;
  };
}

export interface StateResponse {
  attack: string;
  installation_id: string;
  device_id: string;
  vault: {
    operator_bond_wei?: string;
    slashed_wei?: string;
    total_locked_wei?: string;
    [k: string]: unknown;
  };
  batches: number;
}

export interface AttackRequest {
  kind: string;
}

export interface ModeRequest {
  mode: string;
}

export interface ResolveRequest {
  uphold_fraud: boolean;
  notes?: string;
}

export interface ReportRequest {
  period_label: string;
  production_tonnes: number;
}

export interface ReportResponse {
  period_label: string;
  production_tonnes: number;
  total_emissions_tco2e: number;
  specific_embedded_emissions: number;
  coverage_bp: number;
  verified_batch_ids: number[];
  period_merkle_root: string;
  attestation_id?: number;
  tx_hash?: string;
}

export interface ReportVerifyResponse {
  valid: boolean;
  reason?: string;
  calculated_see?: number;
  claimed_see?: number;
  merkle_roots_matched?: boolean;
  on_chain_attestation_found?: boolean;
}

export interface ScenarioStepInfo {
  step: number;
  name: string;
  caption: string;
  page: string;
  base_delay_seconds: number;
}

export interface ScenarioStatusResponse {
  current_step: number;
  total_steps: number;
  status: "idle" | "playing" | "paused" | "completed" | "error";
  speed: number;
  current_caption: string;
  recommended_page: string;
  step_info: ScenarioStepInfo[];
  last_result?: unknown;
  error?: string | null;
}

export type { BatchSummary, BatchDetail, VerifierNodeStatus, ChallengeRecord, TelemetryEvent };
