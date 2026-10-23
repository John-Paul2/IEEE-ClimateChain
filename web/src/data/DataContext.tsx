import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type {
  BatchSummary,
  BatchDetail,
  VerifierNodeStatus,
  ChallengeRecord,
  TelemetryEvent,
} from "../types/telemetry";
import type { HealthResponse, StateResponse, ScenarioStatusResponse } from "../types/api";
import { apiClient } from "./apiClient";
import {
  getSyntheticBatches,
  getSyntheticVerifiers,
  getSyntheticChallenges,
  getSyntheticEvents,
  getSyntheticHealth,
  getSyntheticState,
  generateSyntheticPackets,
} from "./mockData";
import { useVeriCEMSWebSocket } from "./useVeriCEMSWebSocket";
import { checkNetworkStatus } from "../chain/chainHelpers";

export const DEFAULT_MOCK_SCENARIO: ScenarioStatusResponse = {
  current_step: 0,
  total_steps: 7,
  status: "idle",
  speed: 1.0,
  current_caption: "Demo Ready · Press Play or Next Step to begin the VeriCEMS story.",
  recommended_page: "/operator",
  step_info: [
    { step: 1, name: "Normal Batches Flow", caption: "Step 1/7: Normal telemetry batches flow and verifier quorum confirms clean emissions.", page: "/operator", base_delay_seconds: 20 },
    { step: 2, name: "Insider Attack Injection", caption: "Step 2/7: Insider injects constant-scaling attack (-30% CO2) at edge before signing.", page: "/operator", base_delay_seconds: 15 },
    { step: 3, name: "Verifier Detection & Quarantine", caption: "Step 3/7: Verifier committee flags combustion & autoencoder residuals; batch quarantined.", page: "/verifier", base_delay_seconds: 25 },
    { step: 4, name: "Dispute & Arbiter Slashing", caption: "Step 4/7: Operator disputes with inclusion proof; arbiters uphold; bond slashed on-chain.", page: "/verifier", base_delay_seconds: 25 },
    { step: 5, name: "Period Report & On-Chain Attestation", caption: "Step 5/7: Period report generated; CBAM attestation recorded on EVM Layer-2.", page: "/importer", base_delay_seconds: 20 },
    { step: 6, name: "Importer Verification & Cost Savings", caption: "Step 6/7: EU Importer portal verifies genuine report; catches tampered copy; computes € savings.", page: "/importer", base_delay_seconds: 25 },
    { step: 7, name: "Benchmark & Residual Weaknesses", caption: "Step 7/7: Benchmark suite discloses empirical evasion limits and 'What still gets through'.", page: "/benchmark", base_delay_seconds: 20 },
  ],
};

export interface DataContextValue {
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
    networkType: "LOCAL" | "TESTNET" | "OFFLINE SNAPSHOT";
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

function getPersistedState(): StateResponse {
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem("vericems_state") : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return getSyntheticState();
}

function getPersistedIsMock(): boolean {
  try {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("vericems_is_mock");
      if (stored !== null) return stored === "true";
    }
  } catch {
    // fallback
  }
  return true;
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to mock mode so UI renders rich interactive state without backend
  const [isMock, setIsMockState] = useState<boolean>(getPersistedIsMock);

  const setIsMock = useCallback((val: boolean) => {
    setIsMockState(val);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("vericems_is_mock", String(val));
      }
    } catch {
      // ignore
    }
  }, []);
  const [batches, setBatches] = useState<BatchSummary[]>(getSyntheticBatches());
  const [verifiers, setVerifiers] = useState<VerifierNodeStatus[]>(getSyntheticVerifiers());
  const [challenges, setChallenges] = useState<ChallengeRecord[]>(getSyntheticChallenges());
  const [health, setHealth] = useState<HealthResponse | null>(getSyntheticHealth());
  const [state, setState] = useState<StateResponse | null>(getPersistedState());
  const [network, setNetwork] = useState<{
    connected: boolean;
    networkType: "LOCAL" | "TESTNET" | "OFFLINE SNAPSHOT";
    chainId?: number;
    blockNumber?: bigint;
  }>({
    connected: true,
    networkType: "LOCAL",
    chainId: 31337,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatusResponse | null>(DEFAULT_MOCK_SCENARIO);

  const ws = useVeriCEMSWebSocket(isMock);

  const updateState = useCallback(
    (updater: (prev: StateResponse | null) => StateResponse | null) => {
      setState((prev) => {
        const next = updater(prev);
        try {
          if (next && typeof window !== "undefined") {
            sessionStorage.setItem("vericems_state", JSON.stringify(next));
          }
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isMock) {
        setBatches((prev) => (prev.length > 0 ? prev : getSyntheticBatches()));
        setVerifiers((prev) => (prev.length > 0 ? prev : getSyntheticVerifiers()));
        setChallenges((prev) => (prev.length > 0 ? prev : getSyntheticChallenges()));
        setHealth(getSyntheticHealth());
        setState(getPersistedState());
      } else {
        const [h, s, b, v, c, scn] = await Promise.all([
          apiClient.getHealth(),
          apiClient.getState(),
          apiClient.getBatches(),
          apiClient.getVerifiers(),
          apiClient.getChallenges(),
          apiClient.getScenarioStatus().catch(() => null),
        ]);
        setHealth(h);
        setState(s);
        setBatches(b);
        setVerifiers(v);
        setChallenges(c);
        if (scn) setScenarioStatus(scn);
      }

      // Check on-chain network status
      checkNetworkStatus().then(setNetwork).catch(() => {});
    } catch (err: unknown) {
      console.warn("Falling back to synthetic mock data due to API/network error:", err);
      // Auto-fallback to mock data on error so UI never breaks
      setIsMock(true);
      setBatches(getSyntheticBatches());
      setVerifiers(getSyntheticVerifiers());
      setChallenges(getSyntheticChallenges());
      setHealth(getSyntheticHealth());
      setState(getPersistedState());
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getBatchDetail = useCallback(
    async (id: number): Promise<BatchDetail | undefined> => {
      if (isMock) {
        const synth = getSyntheticBatches();
        const found = synth.find((b) => b.batch_id === id);
        if (found) return found;
        // Generate on-the-fly detail
        const packets = generateSyntheticPackets((id - 1) * 8, 8);
        return {
          batch_id: id,
          device_id: "DEV-STEEL-001",
          installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
          merkle_root: `0x${id.toString(16).padStart(64, "0")}`,
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
    [isMock]
  );

  const runBatchScenario = useCallback(async () => {
    if (isMock) {
      const isAttacking = Boolean(state?.attack && state.attack !== "none");
      const attackKind = state?.attack || "none";
      const nextId = batches.length + 1;
      const now = Math.floor(Date.now() / 1000);
      const packets = generateSyntheticPackets(batches.length * 8, 8);

      let status: BatchSummary["status"] = "Verified";
      let meanScore = 9850;
      let cleanVotes = 5;
      let fraudVotes = 0;
      let reasons: string[] = [];

      if (isAttacking) {
        status = "Quarantined";
        cleanVotes = 1;
        fraudVotes = 4;
        if (attackKind === "constant_scaling") {
          meanScore = 3240;
          reasons = ["PHYSICS_RESIDUAL", "AE_RESIDUAL"];
        } else if (attackKind === "flatline") {
          meanScore = 2850;
          reasons = ["SPECTRAL_FLAT", "PHYSICS_RESIDUAL", "AE_RESIDUAL"];
        } else if (attackKind === "replay") {
          meanScore = 1950;
          reasons = ["CHAIN_BREAK", "SEQ_GAP", "SPECTRAL_REPEAT"];
        } else if (attackKind === "tamper_after_signing") {
          meanScore = 1200;
          reasons = ["SIG_INVALID", "CHAIN_BREAK"];
        } else {
          meanScore = 2500;
          reasons = ["PHYSICS_RESIDUAL", "AE_RESIDUAL"];
        }

        // Add a challenge for this quarantined batch
        const newChallenge: ChallengeRecord = {
          batch_id: nextId,
          opened_at_epoch: now,
          expires_at_epoch: now + 120,
          window_closes_at: now + 120,
          status: "Active",
          operator_bond_wei: "1000000000000000000",
          slashed_amount_wei: "0",
          evidence_hash: `0x${nextId.toString(16).padStart(64, "0")}`,
          reason_codes: reasons,
          tx_hashes: {
            challenge_open: `0xopen${nextId.toString(16).padStart(60, "0")}`,
          },
          arbiter_votes: [
            { arbiter_id: "ARBITER-01", arbiter_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", approved: false },
            { arbiter_id: "ARBITER-02", arbiter_address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", approved: false },
            { arbiter_id: "ARBITER-03", arbiter_address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", approved: false },
          ],
        };
        setChallenges((prev) => [newChallenge, ...prev.filter((c) => c.batch_id !== nextId)]);

        // Update verifiers to reflect fraud consensus
        setVerifiers((prev) =>
          prev.map((v, idx) => ({
            ...v,
            last_batch_id: nextId,
            last_verdict: idx === 0 ? "clean" : "fraud",
            last_score_bp: idx === 0 ? 8900 : meanScore + (idx * 50),
          }))
        );
      } else {
        // Honest pass
        setVerifiers((prev) =>
          prev.map((v) => ({
            ...v,
            last_batch_id: nextId,
            last_verdict: "clean",
            last_score_bp: 9800 + Math.floor(Math.random() * 150),
          }))
        );
      }

      const newBatch: BatchDetail = {
        batch_id: nextId,
        device_id: "DEV-STEEL-001",
        installation_id: "0x1111111111111111111111111111111111111111111111111111111111111111",
        merkle_root: `0x${nextId.toString(16).padStart(64, "0")}`,
        first_seq: batches.length * 8,
        last_seq: batches.length * 8 + 7,
        count: 8,
        status,
        clean_votes: cleanVotes,
        fraud_votes: fraudVotes,
        mean_score_bp: meanScore,
        anchored_at: now,
        tx_hash: `0xanchor${nextId.toString(16).padStart(58, "0")}`,
        reason_codes: reasons,
        verdict_summary: {
          winning_verdict: isAttacking ? 1 : 0,
          matching_votes: isAttacking ? 4 : 5,
          reason_codes: reasons,
        },
        packets,
      };

      setBatches((prev) => [newBatch, ...prev]);
    } else {
      await apiClient.runBatchScenario();
      await loadData();
    }
  }, [isMock, state, batches, loadData]);

  const setAttack = useCallback(
    async (kind: string) => {
      if (isMock) {
        updateState((prev) => (prev ? { ...prev, attack: kind } : null));
      } else {
        await apiClient.setAttack(kind);
        await loadData();
      }
    },
    [isMock, loadData, updateState]
  );

  const disputeChallenge = useCallback(
    async (batchId: number) => {
      if (isMock) {
        setChallenges((prev) =>
          prev.map((c) =>
            c.batch_id === batchId
              ? {
                  ...c,
                  status: "DisputedByOperator",
                  operator_dispute_hash: "0xdispute11223344556677889900aabbccddeeff11223344556677889900aabbccdd",
                  explanation_uri: "ipfs://synthetic-dispute-explanation-proof-0",
                  tx_hashes: {
                    ...(c.tx_hashes || {}),
                    dispute: "0xdisputetx99887766554433221100aabbccddeeff99887766554433221100aabbccdd",
                  },
                }
              : c
          )
        );
      } else {
        await apiClient.disputeChallenge(batchId);
        await loadData();
      }
    },
    [isMock, loadData]
  );

  const resolveChallenge = useCallback(
    async (batchId: number, upholdFraud: boolean, notes: string = "arbiter resolution") => {
      if (isMock) {
        const finalStatus = upholdFraud ? "UpheldSlashed" : "OverturnedCleared";
        setChallenges((prev) =>
          prev.map((c) =>
            c.batch_id === batchId
              ? {
                  ...c,
                  status: finalStatus,
                  slashed_amount_wei: upholdFraud ? "1000000000000000000" : "0",
                  arbiter_notes: notes,
                  arbiter_votes: [
                    { arbiter_id: "ARBITER-01", arbiter_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", approved: true, tx_hash: "0xarb1tx..." },
                    { arbiter_id: "ARBITER-02", arbiter_address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", approved: true, tx_hash: "0xarb2tx..." },
                    { arbiter_id: "ARBITER-03", arbiter_address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", approved: false },
                  ],
                  tx_hashes: {
                    ...(c.tx_hashes || {}),
                    arbiter_1: "0xarb1resolved99887766554433221100aabbccddeeff99887766554433221100aabb",
                    arbiter_2: "0xarb2resolved99887766554433221100aabbccddeeff99887766554433221100aabb",
                  },
                }
              : c
          )
        );

        // Update batch status
        setBatches((prev) =>
          prev.map((b) =>
            b.batch_id === batchId
              ? { ...b, status: upholdFraud ? "Slashed" : "Cleared" }
              : b
          )
        );

        // Update vault state if slashed
        if (upholdFraud) {
          updateState((prev) =>
            prev
              ? {
                  ...prev,
                  vault: {
                    ...prev.vault,
                    operator_bond_wei: "0",
                    slashed_wei: "1000000000000000000",
                  },
                }
              : null
          );
        }
      } else {
        await apiClient.resolveChallenge(batchId, upholdFraud, notes);
        await loadData();
      }
    },
    [isMock, loadData]
  );

  const settleChallenge = useCallback(
    async (batchId: number) => {
      if (isMock) {
        await resolveChallenge(batchId, true, "expired window auto-settle");
      } else {
        await apiClient.settleChallenge(batchId);
        await loadData();
      }
    },
    [isMock, resolveChallenge, loadData]
  );

  const stepScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (isMock) {
      const nextStep = Math.min(7, (scenarioStatus?.current_step || 0) + 1);
      const stepInfo = DEFAULT_MOCK_SCENARIO.step_info[nextStep - 1];
      if (nextStep === 1) {
        await setAttack("none");
        await runBatchScenario();
      } else if (nextStep === 2) {
        await setAttack("constant_scaling");
      } else if (nextStep === 3) {
        await runBatchScenario();
      } else if (nextStep === 4) {
        const ch = challenges[0];
        if (ch) {
          await disputeChallenge(ch.batch_id);
          await resolveChallenge(ch.batch_id, true, "2-of-3 arbiter council upheld fraud");
        }
      }
      const updated: ScenarioStatusResponse = {
        ...(scenarioStatus || DEFAULT_MOCK_SCENARIO),
        current_step: nextStep,
        status: nextStep >= 7 ? "completed" : "paused",
        current_caption: stepInfo?.caption || "",
        recommended_page: stepInfo?.page || "/operator",
      };
      setScenarioStatus(updated);
      return updated;
    } else {
      const res = await apiClient.stepScenario();
      setScenarioStatus(res);
      await loadData();
      return res;
    }
  }, [isMock, scenarioStatus, challenges, setAttack, runBatchScenario, disputeChallenge, resolveChallenge, loadData]);

  const playScenario = useCallback(async (speed?: number): Promise<ScenarioStatusResponse | undefined> => {
    if (isMock) {
      const spd = speed ?? scenarioStatus?.speed ?? 1.0;
      const updated: ScenarioStatusResponse = {
        ...(scenarioStatus || DEFAULT_MOCK_SCENARIO),
        status: "playing",
        speed: spd,
      };
      setScenarioStatus(updated);
      return updated;
    } else {
      const res = await apiClient.playScenario(speed);
      setScenarioStatus(res);
      return res;
    }
  }, [isMock, scenarioStatus]);

  const pauseScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (isMock) {
      const updated: ScenarioStatusResponse = {
        ...(scenarioStatus || DEFAULT_MOCK_SCENARIO),
        status: "paused",
      };
      setScenarioStatus(updated);
      return updated;
    } else {
      const res = await apiClient.pauseScenario();
      setScenarioStatus(res);
      return res;
    }
  }, [isMock, scenarioStatus]);

  const resetScenario = useCallback(async (): Promise<ScenarioStatusResponse | undefined> => {
    if (isMock) {
      setBatches(getSyntheticBatches());
      setVerifiers(getSyntheticVerifiers());
      setChallenges(getSyntheticChallenges());
      setState(getSyntheticState());
      const resetStatus: ScenarioStatusResponse = { ...DEFAULT_MOCK_SCENARIO, current_step: 0, status: "idle" };
      setScenarioStatus(resetStatus);
      return resetStatus;
    } else {
      const res = await apiClient.resetScenario();
      setScenarioStatus(res);
      await loadData();
      return res;
    }
  }, [isMock, loadData]);

  const setScenarioSpeed = useCallback(async (speed: number): Promise<ScenarioStatusResponse | undefined> => {
    if (isMock) {
      const updated: ScenarioStatusResponse = {
        ...(scenarioStatus || DEFAULT_MOCK_SCENARIO),
        speed,
      };
      setScenarioStatus(updated);
      return updated;
    } else {
      const res = await apiClient.setScenarioSpeed(speed);
      setScenarioStatus(res);
      return res;
    }
  }, [isMock, scenarioStatus]);

  // Synchronize on scenario events from WebSocket
  useEffect(() => {
    if (!ws.lastEvent) return;
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
  }, [ws.lastEvent, loadData]);

  const events = isMock && ws.events.length === 0 ? getSyntheticEvents() : ws.events;

  return (
    <DataContext.Provider
      value={{
        isMock,
        setIsMock,
        batches,
        getBatchDetail,
        verifiers,
        challenges,
        events,
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
