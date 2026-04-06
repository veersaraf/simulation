// ============================================================
// useWebSocket — Connects to server, syncs state into Zustand
// ============================================================

import { useEffect, useRef } from "react";
import { useWorldStore } from "../store/useWorldStore";

const WS_URL = "ws://localhost:3001";
const RECONNECT_DELAY = 2000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setConnected = useWorldStore((s) => s.setConnected);
  const setWorldFull = useWorldStore((s) => s.setWorldFull);
  const applyDiff = useWorldStore((s) => s.applyDiff);
  const addEvent = useWorldStore((s) => s.addEvent);
  const setSimulationStatus = useWorldStore((s) => s.setSimulationStatus);
  const setWs = useWorldStore((s) => s.setWs);

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected to server");
        setConnected(true);
        setWs(ws);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          switch (msg.type) {
            case "STATE_FULL":
              setWorldFull(msg.data);
              break;
            case "STATE_DIFF":
              applyDiff(msg.data);
              break;
            case "EVENT":
              addEvent(msg.data);
              break;
            case "SIM_STATUS":
              setSimulationStatus(msg.data);
              break;
          }
        } catch (err) {
          console.error("[WS] Parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting...");
        setConnected(false);
        setWs(null);
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [
    setConnected,
    setWorldFull,
    applyDiff,
    addEvent,
    setSimulationStatus,
    setWs,
  ]);
}
