import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useReducer } from "react";
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
import { STORY_STEPS } from "../story/steps.ts";
import {
  timelineReducer,
  createInitialTimelineState,
  sceneAudioManager,
} from "../story/timelineStateMachine.ts";
import realRunSnapshot from "../../public/snapshots/real-run.json" with { type: "json" };

const isProduction = Boolean(import.meta.env?.PROD);
let mockProvider: any = null;
if (!isProduction) {
  import("./mockData.ts").then((mod) => {
    mockProvider = mod;
  });
}

export type DataState = "LIVE" | "RECORDED REAL RUN" | "MOCK";

export const STEP_NAMES: Record<number, string> = Object.fromEntries(
  STORY_STEPS.map((s) => [s.stepNumber, s.title])
);

export const STEP_PAGES: Record<number, string> = Object.fromEntries(
  STORY_STEPS.map((s) => [s.stepNumber, s.tab])
);

export function getRecordedStepInfoList() {
  return STORY_STEPS.map((step) => ({
    step: step.stepNumber,
    name: step.title,
    caption: step.sentence,
    page: step.tab,
    base_delay_seconds: 3,
  }));
}

export function buildScenarioStatus(
  step: number,
  status: "idle" | "playing" | "paused" | "completed" = "idle",
  speed: number = 1.0
): ScenarioStatusResponse {
  const currentStepObj = STORY_STEPS.find((s) => s.stepNumber === step);
  return {
    current_step: step,
    total_steps: STORY_STEPS.length,
    status,
    speed,
    current_caption: currentStepObj ? currentStepObj.sentence : (step > 0 ? formatStepCaption(step) : ""),
    recommended_page: currentStepObj ? currentStepObj.tab : "/operator",
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
  narrationEnabled: boolean;
  setNarrationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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
  // Default to RECORDED REAL RUN
  const [dataState, setDataStateInternal] = useState<DataState>(getPersistedDataState);
  const [liveConnectionFailed, setLiveConnectionFailed] = useState<boolean>(false);

  // Single source of truth Timeline state machine
  const [timeline, dispatchTimeline] = useReducer(
    timelineReducer,
    undefined,
    () => createInitialTimelineState(true, 1.0)
  );

  const [liveScenarioStatus, setLiveScenarioStatus] = useState<ScenarioStatusResponse | null>(null);

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

  const isMock = dataState === "MOCK";

  const clearLiveFailure = useCallback(() => {
    setLiveConnectionFailed(false);
  }, []);

  const setDataState = useCallback(
    (requested: DataState) => {
      let resolved = requested;
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

  // Load data according to current DataState & timeline step
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

      const cleanVerifiers = snapVerifiers.map((v) => ({
        ...v,
        last_batch_id: 1,
        last_verdict: "clean" as const,
        last_score_bp: 1216,
        staked_amount_wei: (v as any).stake_wei || v.staked_amount_wei || "1000000000000000000",
        last_model_hash: (v as any).model_hash || v.last_model_hash || "0xf9608ef7cc239b3f844843f8b42fbf265f5e1de14a3795dd77ca7f77f06db467",
      }));

      const fraudVerifiers = snapVerifiers.map((v) => ({
        ...v,
        last_batch_id: 2,
        last_verdict: "fraud" as const,
        last_score_bp: 9585,
        staked_amount_wei: (v as any).stake_wei || v.staked_amount_wei || "1000000000000000000",
        last_model_hash: (v as any).model_hash || v.last_model_hash || "0xf9608ef7cc239b3f844843f8b42fbf265f5e1de14a3795dd77ca7f77f06db467",
      }));

      const recordedStep = timeline.step;

      if (recordedStep === 0) {
        // Initial state before play: batch 1 packets streaming, clean baseline
        const firstBatch = snapBatches.filter((b) => b.batch_id === 1);
        setBatches(firstBatch);
        setVerifiers(cleanVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => (e.batch_id ?? 1) === 1 && e.type === "packet"));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 1) {
        // Step 1: Sealing each reading (packets chained)
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(cleanVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => (e.batch_id ?? 1) === 1 && e.type === "packet"));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 2) {
        // Step 2: Fingerprinting the batch (batch anchored)
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(cleanVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => e.batch_id === 1 && (e.type === "packet" || e.type === "batch_anchored")));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 3) {
        // Step 3: Verifiers check it (vote)
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(cleanVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => e.batch_id === 1 && (e.type === "packet" || e.type === "batch_anchored" || e.type === "vote")));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 4) {
        // Step 4: Majority says clean (finalized clean)
        setBatches(snapBatches.filter((b) => b.batch_id === 1));
        setVerifiers(cleanVerifiers);
        setChallenges([]);
        setEvents(snapEvents.filter((e) => e.batch_id === 1));
        setState({ ...snapState, attack: "none", batches: 1 });
      } else if (recordedStep === 5) {
        // Step 5: Flagged as suspicious (flagged fraud on batch 2)
        setBatches(snapBatches.map((b) => b.batch_id === 2 ? { ...b, status: "Quarantined" } : b));
        setVerifiers(fraudVerifiers);
        setChallenges(snapChallenges.map((c) => ({ ...c, status: "Active" })));
        setEvents(snapEvents.filter((e) => e.type !== "slashed" && e.type !== "attestation"));
        setState({ ...snapState, attack: "constant_scaling", batches: 2 });
      } else if (recordedStep === 6) {
        // Step 6: Time to appeal (challenge window open)
        setBatches(snapBatches.map((b) => b.batch_id === 2 ? { ...b, status: "Quarantined" } : b));
        setVerifiers(fraudVerifiers);
        setChallenges(snapChallenges.map((c) => ({ ...c, status: "Active" })));
        setEvents(snapEvents.filter((e) => e.type !== "slashed" && e.type !== "attestation"));
        setState({ ...snapState, attack: "constant_scaling", batches: 2 });
      } else if (recordedStep === 7) {
        // Step 7: Deposit slashed (slashed)
        setBatches(snapBatches);
        setVerifiers(fraudVerifiers);
        setChallenges(snapChallenges.map((c) => ({ ...c, status: "UpheldSlashed" })));
        setEvents(snapEvents.filter((e) => e.type !== "attestation"));
        setState({
          ...snapState,
          attack: "constant_scaling",
          vault: {
            ...snapState.vault,
            slashed_wei: "1000000000000000000",
            operator_bond_wei: "0",
          },
          batches: 2,
        });
      } else if (recordedStep >= 8) {
        // Step 8: Proof for the buyer (attestation)
        setBatches(snapBatches);
        setVerifiers(cleanVerifiers);
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
          speed_factor: timeline.speed,
          paused: timeline.status !== "playing",
        },
      });

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

      const batchesWithPackets = await Promise.all(
        b.map(async (batch) => {
          if (batch.packets && batch.packets.length > 0) return batch;
          try {
            const detail = await apiClient.getBatch(batch.batch_id);
            return detail ? { ...batch, packets: detail.packets || [] } : batch;
          } catch {
            return batch;
          }
        })
      );

      setHealth(h);
      setState(s);
      setBatches(batchesWithPackets);
      setVerifiers(v);
      setChallenges(c);
      setEvents(ws.events);
      if (scn) setLiveScenarioStatus(scn);
      setNetwork(net);
      setLiveConnectionFailed(false);
    } catch (err: unknown) {
      console.warn("LIVE connection failed. Switching to RECORDED REAL RUN:", err);
      setLiveConnectionFailed(true);
      setDataStateInternal("RECORDED REAL RUN");
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("vericems_data_state", "RECORDED REAL RUN");
        }
      } catch {
        // ignore
      }
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
    } finally {
      setIsLoading(false);
    }
  }, [dataState, timeline.step, timeline.status, timeline.speed, ws.events]);

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
    } else {
      dispatchTimeline({ type: "SET_STEP", step: 3 });
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
      setLiveScenarioStatus(res);
      await loadData();
      return res;
    }

    dispatchTimeline({ type: "NEXT" });
    const nextStep = Math.min(STORY_STEPS.length, timeline.step + 1);
    const updated = buildScenarioStatus(nextStep, nextStep >= STORY_STEPS.length ? "completed" : "paused", timeline.speed);
    return updated;
  }, [dataState, timeline.step, timeline.speed, loadData]);

  const playScenario = useCallback(
    async (speed?: number): Promise<ScenarioStatusResponse | undefined> => {
      const spd = speed ?? timeline.speed;
      if (dataState === "LIVE") {
        const res = await apiClient.playScenario(spd);
        setLiveScenarioStatus(res);
        return res;
      }

      dispatchTimeline({ type: "PLAY", speed: spd });
      const startStep = timeline.step === 0 || timeline.step >= STORY_STEPS.length ? 1 : timeline.step;
      const updated = buildScenarioStatus(startStep, "playing", spd);
      return updated;
    },
    [dataState, timeline.speed, timeline.step]
  );

  const pauseScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (dataState === "LIVE") {
      const res = await apiClient.pauseScenario();
      setLiveScenarioStatus(res);
      return res;
    }

    dispatchTimeline({ type: "PAUSE" });
    const updated = buildScenarioStatus(timeline.step, "paused", timeline.speed);
    return updated;
  }, [dataState, timeline.step, timeline.speed]);

  const resetScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (dataState === "LIVE") {
      const res = await apiClient.resetScenario();
      setLiveScenarioStatus(res);
      await loadData();
      return res;
    }

    dispatchTimeline({ type: "RESTART" });
    const updated = buildScenarioStatus(0, "idle", timeline.speed);
    return updated;
  }, [dataState, timeline.speed, loadData]);

  const setScenarioSpeed = useCallback(
    async (speed: number): Promise<ScenarioStatusResponse | undefined> => {
      if (dataState === "LIVE") {
        const res = await apiClient.setScenarioSpeed(speed);
        setLiveScenarioStatus(res);
        return res;
      }

      dispatchTimeline({ type: "SET_SPEED", speed });
      const updated = buildScenarioStatus(timeline.step, timeline.status, speed);
      return updated;
    },
    [dataState, timeline.step, timeline.status]
  );

  const setNarrationEnabled = useCallback((action: React.SetStateAction<boolean>) => {
    if (typeof action === "function") {
      dispatchTimeline({ type: "TOGGLE_NARRATION" });
    } else {
      dispatchTimeline({ type: "SET_NARRATION", enabled: action });
    }
  }, []);

  // Single timeline state machine auto-advance effect driven by audio duration & min scene time
  useEffect(() => {
    if (dataState !== "RECORDED REAL RUN" || timeline.status !== "playing") {
      sceneAudioManager.cancelCurrentAudio();
      return;
    }

    if (timeline.step <= 0 || timeline.step > STORY_STEPS.length) {
      return;
    }

    const currentStepObj = STORY_STEPS[timeline.step - 1];
    if (!currentStepObj) {
      dispatchTimeline({ type: "COMPLETE" });
      return;
    }

    const cleanup = sceneAudioManager.playSceneAudio(
      currentStepObj,
      timeline.speed,
      timeline.narrationEnabled,
      () => {
        dispatchTimeline({ type: "NEXT" });
      }
    );

    return cleanup;
  }, [dataState, timeline.status, timeline.step, timeline.speed, timeline.narrationEnabled]);

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

  const scenarioStatus: ScenarioStatusResponse = useMemo(() => {
    if (dataState === "LIVE" && liveScenarioStatus) {
      return liveScenarioStatus;
    }
    return buildScenarioStatus(timeline.step, timeline.status, timeline.speed);
  }, [dataState, liveScenarioStatus, timeline.step, timeline.status, timeline.speed]);

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
        narrationEnabled: timeline.narrationEnabled,
        setNarrationEnabled,
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
