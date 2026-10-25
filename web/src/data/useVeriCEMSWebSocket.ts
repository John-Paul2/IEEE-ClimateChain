import { useEffect, useRef, useState, useCallback } from "react";
import type { TelemetryEvent } from "../types/telemetry";

export interface WebSocketState {
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR" | "MOCK";
  lastEvent: TelemetryEvent | null;
  events: TelemetryEvent[];
  error?: string;
}

export function useVeriCEMSWebSocket(isMock: boolean = true) {
  const [state, setState] = useState<WebSocketState>({
    status: isMock ? "MOCK" : "CONNECTING",
    lastEvent: null,
    events: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mockIntervalRef = useRef<number | null>(null);

  const handleEvent = useCallback((event: TelemetryEvent) => {
    setState((prev) => {
      const getEventId = (ev: TelemetryEvent): string => {
        return (
          ev.event_id ||
          (ev.data as any)?.event_id ||
          (ev.seq !== undefined ? `seq-${ev.batch_id ?? 0}-${ev.seq}` : "") ||
          `${ev.type}-${ev.timestamp || ev.timestamp_utc || ""}-${ev.batch_id ?? ""}`
        );
      };
      const id = getEventId(event);
      if (prev.events.some((e) => getEventId(e) === id)) {
        return prev;
      }
      return {
        ...prev,
        lastEvent: event,
        events: [event, ...prev.events].slice(0, 100),
      };
    });
  }, []);

  useEffect(() => {
    if (isMock) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setState((prev) => ({ ...prev, status: "MOCK" }));

      // Synthetic periodic event stream for mock mode
      let counter = 100;
      mockIntervalRef.current = window.setInterval(() => {
        counter++;
        const mockEvt: TelemetryEvent = {
          event_id: `synthetic-evt-${counter}`,
          timestamp: new Date().toISOString(),
          type: "PACKET_RECORDED",
          batch_id: 4,
          data: {
            seq: counter,
            device_id: "DEV-001",
            synthetic_stack_flow_kscfm: 842.1 + (counter % 5),
            co2_mass_short_tons: 294.8 + (counter % 3) * 0.4,
          },
        };
        handleEvent(mockEvt);
      }, 10_000);

      return () => {
        if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
      };
    }

    // Live WebSocket connection to backend /ws/events
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;

    function connect() {
      setState((prev) => ({ ...prev, status: "CONNECTING", error: undefined }));
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setState((prev) => ({ ...prev, status: "CONNECTED" }));
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as TelemetryEvent;
            handleEvent(parsed);
          } catch (err) {
            console.error("Failed to parse WebSocket message", err);
          }
        };

        ws.onerror = () => {
          setState((prev) => ({ ...prev, status: "ERROR", error: "WebSocket connection failed" }));
        };

        ws.onclose = () => {
          setState((prev) => ({ ...prev, status: "DISCONNECTED" }));
          // Auto-reconnect after 3 seconds
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        };
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          status: "ERROR",
          error: err instanceof Error ? err.message : "Failed to open socket",
        }));
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isMock, handleEvent]);

  return state;
}
