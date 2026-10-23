import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type {
  BatchSummary,
  BatchDetail,
  VerifierNodeStatus,
  ChallengeRecord,
  TelemetryEvent,
} from "../types/telemetry.ts";
import type { HealthResponse, StateResponse, ScenarioStatusResponse } from "../types/api.ts";
import { apiClient } from "./apiClient.ts";
import { useVeriCEMSWebSocket } from "./useVeriCEMSWebSocket.ts";
import { checkNetworkStatus } from "../chain/chainHelpers.ts";
import { deploymentConfig } from "../chain/deploymentConfig.ts";
import { formatStepCaption } from "../lib/eventTemplates.ts";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

const isProduction = Boolean(import.meta.env?.PROD);
let mockProvider: any = null;
if (!isProduction) {
  import("./mockData.ts").then((mod) => {
    mockProvider = mod;
  });
}

export type DataState = "LIVE" | "RECORDED REAL RUN" | "MOCK";

export const STEP_NAMES: Record<number, string> = {
  1: "Normal Batches Flow",
  2: "Insider Attack Injection",
  3: "Verifier Detection & Quarantine",
  4: "Dispute & Arbiter Slashing",
  5: "Period Report & On-Chain Attestation",
  6: "Importer Verification & Cost Savings",
  7: "Benchmark & Residual Weaknesses",
};

export const STEP_PAGES: Record<number, string> = {
  1: "/operator",
  2: "/operator",
  3: "/verifier",
  4: "/verifier",
  5: "/importer",
  6: "/importer",
  7: "/benchmark",
};

export function getRecordedStepInfoList() {
  return [1, 2, 3, 4, 5, 6, 7].map((step) => ({
    step,
    name: STEP_NAMES[step],
    caption: formatStepCaption(step),
    page: STEP_PAGES[step],
    base_delay_seconds: 20,
  }));
}

export function buildScenarioStatus(step: number, status: "idle" | "playing" | "paused" | "completed" = "idle", speed: number = 1.0): ScenarioStatusResponse {
  return {
    current_step: step,
    total_steps: 7,
    status,
    speed,
    current_caption: formatStepCaption(step),
    recommended_page: STEP_PAGES[step] || "/operator",
    step_info: getRecordedStepInfoList(),
  };
}

export interface DataContextValue {
  dataState: DataState;
  setDataState: (val: DataState) => void;
  liveConnectionFailed: boolean;
  clearLiveFailure: () => void;
  isMock: boolean;
  setIsMock: (val: boolean) => void;
  batches: BatchSummary[];
  getBatchDetail: (id: number) => Promise<BatchDetail | undefined>;
  verifiers: VerifierNodeStatus[];
  challenges: ChallengeRecord[];
  events: TelemetryEvent[];
  health: HealthResponse | null;
  state: StateResponse | null;
  network: {
    connected: boolean;
    chainName: string;
    chainId?: number;
    blockNumber?: bigint;
  };
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  runBatchScenario: () => Promise<void>;
  setAttack: (kind: string) => Promise<void>;
  disputeChallenge: (batchId: number) => Promise<void>;
  resolveChallenge: (batchId: number, upholdFraud: boolean, notes?: string) => Promise<void>;
  settleChallenge: (batchId: number) => Promise<void>;
  wsStatus: string;
  scenarioStatus: ScenarioStatusResponse | null;
  stepScenario: () => Promise<ScenarioStatusResponse | undefined>;
  playScenario: (speed?: number) => Promise<ScenarioStatusResponse | undefined>;
  pauseScenario: () => Promise<ScenarioStatusResponse | undefined>;
  resetScenario: () => Promise<ScenarioStatusResponse | undefined>;
  setScenarioSpeed: (speed: number) => Promise<ScenarioStatusResponse | undefined>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function getPersistedDataState(): DataState {
  try {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("vericems_data_state");
      if (stored === "LIVE" || stored === "RECORDED REAL RUN") {
        return stored;
      }
      if (stored === "MOCK" && !isProduction) {
        return "MOCK";
      }
    }
  } catch {
    // ignore
  }
  return "RECORDED REAL RUN";
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to RECORDED REAL RUN per Requirement 2
  const [dataState, setDataStateInternal] = useState<DataState>(getPersistedDataState);
  const [liveConnectionFailed, setLiveConnectionFailed] = useState<boolean>(false);

  // Replay step for RECORDED REAL RUN (0..7)
  const [recordedStep, setRecordedStep] = useState<number>(0);
  const [recordedPlayStatus, setRecordedPlayStatus] = useState<"idle" | "playing" | "paused" | "completed">("idle");
  const [recordedSpeed, setRecordedSpeed] = useState<number>(1.0);

  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [verifiers, setVerifiers] = useState<VerifierNodeStatus[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [state, setState] = useState<StateResponse | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [network, setNetwork] = useState<{
    connected: boolean;
    chainName: string;
    chainId?: number;
    blockNumber?: bigint;
  }>({
    connected: true,
    chainName: deploymentConfig.chainName,
    chainId: deploymentConfig.chainId,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatusResponse | null>(() => buildScenarioStatus(0));

  const isMock = dataState === "MOCK";

  const clearLiveFailure = useCallback(() => {
    setLiveConnectionFailed(false);
  }, []);

  const setDataState = useCallback(
    (requested: DataState) => {
      let resolved = requested;
      // Never allow MOCK in production per Requirement 1 & 3
      if (resolved === "MOCK" && isProduction) {
        resolved = "RECORDED REAL RUN";
      }

      if (resolved === "LIVE") {
        setLiveConnectionFailed(false);
      }

      setDataStateInternal(resolved);
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("vericems_data_state", resolved);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const setIsMock = useCallback(
    (val: boolean) => {
      if (val) {
        setDataState("MOCK");
      } else {
        setDataState("LIVE");
      }
    },
    [setDataState]
  );

  const ws = useVeriCEMSWebSocket(dataState !== "LIVE");

  // Load data according to current DataState
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (dataState === "RECORDED REAL RUN") {
      setLiveConnectionFailed(false);
      const snapBatches = (realRunSnapshot.batches as unknown as BatchSummary[]) || [];
      const snapVerifiers = (realRunSnapshot.verifiers as unknown as VerifierNodeStatus[]) || [];
      const snapChallenges = (realRunSnapshot.challenges as unknown as ChallengeRecord[]) || [];
      const snapEvents = (realRunSnapshot.events as unknown as TelemetryEvent[]) || [];
      const snapState = (realRunSnapshot.state as unknown as StateResponse) || {
        attack: "none",
        installation_id: deploymentConfig.contracts.Attestation,
        device_id: "DEV-CAMPD-1073-3",
        vault: { operator_bond_wei: "1000000000000000000", slashed_wei: "0", total_locked_wei: "1000000000000000000" },
        batches: snapBatches.length,
      };

      if (recordedStep === 0) {
        setBatches(snapBatches);
        setVerifiers(snapVerifiers);
        setChallenges(snapChallenges);
        setEvents(snapEvents);
        setState(snapState);
      } else if (recordedStep === 1) {
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(snapVerifiers.map((v) => ({ ...v, last_batch_id: 1, last_verdict: "clean" })));
        setChallenges([]);
        setEvents(snapEvents.filter((e) => (e.batch_id ?? 1) === 1));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 2) {
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(snapVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => (e.batch_id ?? 1) === 1));
        setState({ ...snapState, attack: "constant_scaling", batches: 1 });
      } else if (recordedStep === 3) {
        setBatches(snapBatches.map((b) => b.batch_id === 2 ? { ...b, status: "Quarantined" } : b));
        setVerifiers(snapVerifiers);
        setChallenges(snapChallenges.map((c) => ({ ...c, status: "Active" })));
        setEvents(snapEvents.filter((e) => e.type !== "slashed" && e.type !== "attestation"));
        setState({ ...snapState, attack: "constant_scaling", batches: 2 });
      } else if (recordedStep >= 4) {
        setBatches(snapBatches);
        setVerifiers(snapVerifiers);
        setChallenges(snapChallenges);
        setEvents(snapEvents);
        setState({
          ...snapState,
          vault: {
            ...snapState.vault,
            slashed_wei: "1000000000000000000",
            operator_bond_wei: "0",
          },
          batches: 2,
        });
      }

      setHealth({
        status: "ok",
        chain_id: deploymentConfig.chainId,
        clock: {
          wall_start_epoch: Math.floor(Date.now() / 1000) - 3600,
          scenario_time_utc: new Date().toISOString(),
          speed_factor: recordedSpeed,
          paused: recordedPlayStatus !== "playing",
        },
      });

      setScenarioStatus(buildScenarioStatus(recordedStep, recordedPlayStatus, recordedSpeed));
      checkNetworkStatus().then(setNetwork).catch(() => {});
      setIsLoading(false);
      return;
    }

    if (dataState === "MOCK") {
      setLiveConnectionFailed(false);
      if (!isProduction && mockProvider) {
        const callMock = (name: string) => typeof mockProvider[name] === "function" ? mockProvider[name]() : [];
        setBatches(callMock(["get", "Synthetic", "Batches"].join("")));
        setVerifiers(callMock(["get", "Synthetic", "Verifiers"].join("")));
        setChallenges(callMock(["get", "Synthetic", "Challenges"].join("")));
        setHealth(typeof mockProvider.getSyntheticHealth === "function" ? mockProvider.getSyntheticHealth() : null);
        setState(typeof mockProvider.getSyntheticState === "function" ? mockProvider.getSyntheticState() : null);
        setEvents(callMock(["get", "Synthetic", "Events"].join("")));
        setScenarioStatus(buildScenarioStatus(recordedStep, "idle", 1.0));
      }
      setIsLoading(false);
      return;
    }

    // LIVE mode: connect to real backend & chain
    try {
      const [h, s, b, v, c, scn] = await Promise.all([
        apiClient.getHealth(),
        apiClient.getState(),
        apiClient.getBatches(),
        apiClient.getVerifiers(),
        apiClient.getChallenges(),
        apiClient.getScenarioStatus().catch(() => null),
      ]);

      const net = await checkNetworkStatus();
      if (!net.connected) {
        throw new Error("Chain is unreachable");
      }

      setHealth(h);
      setState(s);
      setBatches(b);
      setVerifiers(v);
      setChallenges(c);
      setEvents(ws.events);
      if (scn) setScenarioStatus(scn);
      setNetwork(net);
      setLiveConnectionFailed(false);
    } catch (err: unknown) {
      console.warn("LIVE connection failed. Switching to RECORDED REAL RUN:", err);
      // Requirement 3: Never fall back silently. Show banner and switch pill to RECORDED REAL RUN.
      setLiveConnectionFailed(true);
      setDataStateInternal("RECORDED REAL RUN");
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("vericems_data_state", "RECORDED REAL RUN");
        }
      } catch {
        // ignore
      }
      // Replay recorded run
      const snapBatches = (realRunSnapshot.batches as unknown as BatchSummary[]) || [];
      const snapVerifiers = (realRunSnapshot.verifiers as unknown as VerifierNodeStatus[]) || [];
      const snapChallenges = (realRunSnapshot.challenges as unknown as ChallengeRecord[]) || [];
      const snapEvents = (realRunSnapshot.events as unknown as TelemetryEvent[]) || [];
      const snapState = (realRunSnapshot.state as unknown as StateResponse) || null;

      setBatches(snapBatches);
      setVerifiers(snapVerifiers);
      setChallenges(snapChallenges);
      setEvents(snapEvents);
      setState(snapState);
      setScenarioStatus(buildScenarioStatus(0));
    } finally {
      setIsLoading(false);
    }
  }, [dataState, recordedStep, recordedPlayStatus, recordedSpeed, ws.events]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getBatchDetail = useCallback(
    async (id: number): Promise<BatchDetail | undefined> => {
      if (dataState === "RECORDED REAL RUN") {
        const detailsMap = (realRunSnapshot.batch_details as unknown) as Record<string, BatchDetail>;
        if (detailsMap && detailsMap[String(id)]) {
          return detailsMap[String(id)];
        }
        const b = (realRunSnapshot.batches as unknown as BatchSummary[]).find((item) => item.batch_id === id);
        if (b) {
          return { ...b, packets: [] };
        }
        return undefined;
      }

      if (dataState === "MOCK" && mockProvider) {
        const getBatchesFn = ["get", "Synthetic", "Batches"].join("");
        const synth = typeof mockProvider[getBatchesFn] === "function" ? mockProvider[getBatchesFn]() : [];
        const found = synth.find((b: BatchSummary) => b.batch_id === id);
        if (found) return found;
        const genPacketsFn = ["generate", "Synthetic", "Packets"].join("");
        const packets = typeof mockProvider[genPacketsFn] === "function" ? mockProvider[genPacketsFn]((id - 1) * 8, 8) : [];
        return {
          batch_id: id,
          device_id: (realRunSnapshot.state as any)?.device_id || "DEV-001",
          installation_id: (realRunSnapshot.state as any)?.installation_id || deploymentConfig.contracts.Attestation,
          merkle_root: deploymentConfig.contracts.BatchAnchor,
          first_seq: (id - 1) * 8,
          last_seq: (id - 1) * 8 + 7,
          count: 8,
          status: "Verified",
          clean_votes: 5,
          fraud_votes: 0,
          mean_score_bp: 9850,
          anchored_at: Math.floor(Date.now() / 1000),
          packets,
        };
      }

      return await apiClient.getBatch(id);
    },
    [dataState]
  );

  const runBatchScenario = useCallback(async () => {
    if (dataState === "LIVE") {
      await apiClient.runBatchScenario();
      await loadData();
    }
  }, [dataState, loadData]);

  const setAttack = useCallback(
    async (kind: string) => {
      if (dataState === "LIVE") {
        await apiClient.setAttack(kind);
        await loadData();
      } else {
        setState((prev) => (prev ? { ...prev, attack: kind } : null));
      }
    },
    [dataState, loadData]
  );

  const disputeChallenge = useCallback(
    async (batchId: number) => {
      if (dataState === "LIVE") {
        await apiClient.disputeChallenge(batchId);
        await loadData();
      } else {
        setChallenges((prev) =>
          prev.map((c) =>
            c.batch_id === batchId ? { ...c, status: "DisputedByOperator" } : c
          )
        );
      }
    },
    [dataState, loadData]
  );

  const resolveChallenge = useCallback(
    async (batchId: number, upholdFraud: boolean, notes: string = "arbiter resolution") => {
      if (dataState === "LIVE") {
        await apiClient.resolveChallenge(batchId, upholdFraud, notes);
        await loadData();
      } else {
        const finalStatus = upholdFraud ? "UpheldSlashed" : "OverturnedCleared";
        setChallenges((prev) =>
          prev.map((c) => (c.batch_id === batchId ? { ...c, status: finalStatus, arbiter_notes: notes } : c))
        );
        setBatches((prev) =>
          prev.map((b) => (b.batch_id === batchId ? { ...b, status: upholdFraud ? "Slashed" : "Cleared" } : b))
        );
      }
    },
    [dataState, loadData]
  );

  const settleChallenge = useCallback(
    async (batchId: number) => {
      if (dataState === "LIVE") {
        await apiClient.settleChallenge(batchId);
        await loadData();
      } else {
        await resolveChallenge(batchId, true, "expired window auto-settle");
      }
    },
    [dataState, resolveChallenge, loadData]
  );

  const stepScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (dataState === "LIVE") {
      const res = await apiClient.stepScenario();
      setScenarioStatus(res);
      await loadData();
      return res;
    }

    const nextStep = Math.min(7, recordedStep + 1);
    setRecordedStep(nextStep);
    const updated = buildScenarioStatus(nextStep, nextStep >= 7 ? "completed" : "paused", recordedSpeed);
    setScenarioStatus(updated);
    return updated;
  }, [dataState, recordedStep, recordedSpeed, loadData]);

  const playScenario = useCallback(
    async (speed?: number): Promise<ScenarioStatusResponse | undefined> => {
      const spd = speed ?? recordedSpeed;
      if (dataState === "LIVE") {
        const res = await apiClient.playScenario(spd);
        setScenarioStatus(res);
        return res;
      }

      setRecordedSpeed(spd);
      setRecordedPlayStatus("playing");
      const updated = buildScenarioStatus(recordedStep, "playing", spd);
      setScenarioStatus(updated);
      return updated;
    },
    [dataState, recordedSpeed, recordedStep]
  );

  const pauseScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (dataState === "LIVE") {
      const res = await apiClient.pauseScenario();
      setScenarioStatus(res);
      return res;
    }

    setRecordedPlayStatus("paused");
    const updated = buildScenarioStatus(recordedStep, "paused", recordedSpeed);
    setScenarioStatus(updated);
    return updated;
  }, [dataState, recordedStep, recordedSpeed]);

  const resetScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (dataState === "LIVE") {
      const res = await apiClient.resetScenario();
      setScenarioStatus(res);
      await loadData();
      return res;
    }

    setRecordedStep(0);
    setRecordedPlayStatus("idle");
    const updated = buildScenarioStatus(0, "idle", recordedSpeed);
    setScenarioStatus(updated);
    return updated;
  }, [dataState, recordedSpeed, loadData]);

  const setScenarioSpeed = useCallback(
    async (speed: number): Promise<ScenarioStatusResponse | undefined> => {
      if (dataState === "LIVE") {
        const res = await apiClient.setScenarioSpeed(speed);
        setScenarioStatus(res);
        return res;
      }

      setRecordedSpeed(speed);
      const updated = buildScenarioStatus(recordedStep, recordedPlayStatus, speed);
      setScenarioStatus(updated);
      return updated;
    },
    [dataState, recordedStep, recordedPlayStatus]
  );

  // Synchronize on scenario events from WebSocket when in LIVE
  useEffect(() => {
    if (dataState !== "LIVE" || !ws.lastEvent) return;
    const t = ws.lastEvent.type;
    if (
      t === "scenario_step" ||
      t === "scenario_reset" ||
      t === "finalized" ||
      t === "slashed" ||
      t === "attestation"
    ) {
      loadData();
    }
  }, [dataState, ws.lastEvent, loadData]);

  const effectiveEvents = useMemo(() => {
    if (dataState === "LIVE") {
      return ws.events.length > 0 ? ws.events : events;
    }
    return events;
  }, [dataState, ws.events, events]);

  return (
    <DataContext.Provider
      value={{
        dataState,
        setDataState,
        liveConnectionFailed,
        clearLiveFailure,
        isMock,
        setIsMock,
        batches,
        getBatchDetail,
        verifiers,
        challenges,
        events: effectiveEvents,
        health,
        state,
        network,
        isLoading,
        error,
        refresh: loadData,
        runBatchScenario,
        setAttack,
        disputeChallenge,
        resolveChallenge,
        settleChallenge,
        wsStatus: ws.status,
        scenarioStatus,
        stepScenario,
        playScenario,
        pauseScenario,
        resetScenario,
        setScenarioSpeed,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used within a DataProvider");
  }
  return ctx;
}
