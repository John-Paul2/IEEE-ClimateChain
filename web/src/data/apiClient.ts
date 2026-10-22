/**
 * Typed API client for VeriCEMS backend (backend/vericems/api.py).
 */

import type {
  HealthResponse,
  StateResponse,
  BatchSummary,
  BatchDetail,
  VerifierNodeStatus,
  ChallengeRecord,
  TelemetryEvent,
  ReportRequest,
  ReportResponse,
  ReportVerifyResponse,
  ScenarioStatusResponse,
} from "../types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      let errBody: { error?: string; detail?: string; message?: string } = {};
      try {
        errBody = await res.json();
      } catch {
        // non-JSON error
      }
      const code = errBody.error || `HTTP_${res.status}`;
      const msg = errBody.detail || errBody.message || `Request to ${endpoint} failed with ${res.status}`;
      throw new ApiError(res.status, code, msg, errBody);
    }

    return (await res.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, "NETWORK_ERROR", err instanceof Error ? err.message : "Network failure");
  }
}

export const apiClient = {
  getHealth: () => request<HealthResponse>("/api/health"),
  getState: () => request<StateResponse>("/api/state"),
  getBatches: () => request<BatchSummary[]>("/api/batches"),
  getBatch: (batchId: number) => request<BatchDetail>(`/api/batches/${batchId}`),
  getVerifiers: () => request<VerifierNodeStatus[]>("/api/verifiers"),
  getEvents: (limit: number = 100) => request<TelemetryEvent[]>(`/api/events?limit=${limit}`),
  getChallenges: () => request<ChallengeRecord[]>("/api/challenges"),

  // Scenario operations
  runBatchScenario: () => request<Record<string, unknown>>("/api/scenario/batch", { method: "POST" }),
  setAttack: (kind: string) =>
    request<{ attack: string }>("/api/scenario/attack", {
      method: "POST",
      body: JSON.stringify({ kind }),
    }),
  setVerifierMode: (verifierId: string, mode: string) =>
    request<{ verifier_id: string; mode: string }>(`/api/verifiers/${verifierId}/mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  // Challenge operations
  disputeChallenge: (batchId: number) =>
    request<Record<string, unknown>>(`/api/challenges/${batchId}/dispute`, { method: "POST" }),
  resolveChallenge: (batchId: number, upholdFraud: boolean, notes: string = "arbiter resolution") =>
    request<Record<string, unknown>>(`/api/challenges/${batchId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ uphold_fraud: upholdFraud, notes }),
    }),
  settleChallenge: (batchId: number) =>
    request<Record<string, unknown>>(`/api/challenges/${batchId}/settle`, { method: "POST" }),

  // Reporting operations
  createReport: (body: ReportRequest) =>
    request<ReportResponse>("/api/report", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyReport: (payload: unknown) =>
    request<ReportVerifyResponse>("/api/report/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Scenario operations
  getScenarioStatus: () => request<ScenarioStatusResponse>("/api/scenario/status"),
  stepScenario: () => request<ScenarioStatusResponse>("/api/scenario/step", { method: "POST" }),
  playScenario: (speed?: number) =>
    request<ScenarioStatusResponse>("/api/scenario/play", {
      method: "POST",
      body: JSON.stringify({ speed }),
    }),
  pauseScenario: () => request<ScenarioStatusResponse>("/api/scenario/pause", { method: "POST" }),
  resetScenario: () => request<ScenarioStatusResponse>("/api/scenario/reset", { method: "POST" }),
  setScenarioSpeed: (speed: number) =>
    request<ScenarioStatusResponse>("/api/scenario/speed", {
      method: "POST",
      body: JSON.stringify({ speed }),
    }),
  getLatestReport: () => request<Record<string, unknown>>("/api/report/latest"),
};
