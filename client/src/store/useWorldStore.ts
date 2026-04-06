// ============================================================
// Zustand Store — Central reactive state for the client
// ============================================================

import { create } from "zustand";

// Client-side type definitions (mirrors server types.ts)
export type BiomeType =
  | "grassland"
  | "forest"
  | "water"
  | "beach"
  | "rocky"
  | "meadow"
  | "wetland";

export interface Zone {
  id: string;
  name: string;
  description: string;
  biome: BiomeType;
  adjacent: string[];
  objects: string[];
  structures: string[];
  agents: string[];
  elevation: number;
  color: string;
}

export interface WorldMeta {
  name: string;
  tick: number;
  worldMinutes: number;  // total world-minutes elapsed (30:1 clock)
  worldDays: number;     // complete world days elapsed
  hour: number;          // 0-23
  minute: number;        // 0-59
  time: "dawn" | "day" | "dusk" | "night";
  season: "spring" | "summer" | "autumn" | "winter";
}

export interface WorldState {
  meta: WorldMeta;
  zones: Record<string, Zone>;
}

export interface SimEventData {
  type: string;
  payload: unknown;
  timestamp: number;
  source: string;
}

export interface SimulationStatus {
  running: boolean;
  paused: boolean;
  aiEnabled: boolean;
}

export interface AgentSpeech {
  message: string;
  target?: string;
  timestamp: number;
}

export interface AgentAction {
  action: string;
  target?: string;
  zone?: string;
  timestamp: number;
}

/** Tracks an ongoing multi-hour task (set on TASK_START, cleared on TASK_END) */
export interface AgentTask {
  action: string;
  target?: string;
  hours: number;
  startedAt: number; // timestamp
}

interface WorldStore {
  connected: boolean;
  world: WorldState | null;
  events: SimEventData[];
  simulation: SimulationStatus;
  panelOpen: boolean;
  ws: WebSocket | null;

  // Live agent data extracted from events
  agentSpeech: Record<string, AgentSpeech>;
  agentActions: Record<string, AgentAction>;
  /** Ongoing multi-hour tasks (persistent until TASK_END) */
  agentTasks: Record<string, AgentTask>;

  /** Agent being followed by the camera (null = free roam) */
  followAgent: string | null;

  setFollowAgent: (id: string | null) => void;
  setConnected: (v: boolean) => void;
  setWorldFull: (state: WorldState) => void;
  applyDiff: (diff: {
    zones?: Record<string, Partial<Zone> | null>;
    meta?: Partial<WorldMeta>;
  }) => void;
  addEvent: (event: SimEventData) => void;
  setSimulationStatus: (status: Partial<SimulationStatus>) => void;
  togglePanel: () => void;
  setWs: (ws: WebSocket | null) => void;
  sendMessage: (data: string) => void;
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  connected: false,
  world: null,
  events: [],
  simulation: {
    running: false,
    paused: false,
    aiEnabled: false,
  },
  panelOpen: false,
  ws: null,
  agentSpeech: {},
  agentActions: {},
  agentTasks: {},
  followAgent: null,

  setFollowAgent: (id) => set({ followAgent: id }),
  setConnected: (v) => set({ connected: v }),

  setWorldFull: (state) => set({ world: state }),

  applyDiff: (diff) =>
    set((s) => {
      if (!s.world) return s;

      let newZones = s.world.zones;
      if (diff.zones) {
        newZones = { ...newZones };
        for (const [id, patch] of Object.entries(diff.zones)) {
          if (patch === null) {
            delete newZones[id];
          } else {
            newZones[id] = { ...newZones[id], ...patch } as Zone;
          }
        }
      }

      let newMeta = s.world.meta;
      if (diff.meta) {
        newMeta = { ...newMeta, ...diff.meta };
      }

      return { world: { meta: newMeta, zones: newZones } };
    }),

  addEvent: (event) =>
    set((s) => {
      const updates: Partial<WorldStore> = {
        events: [...s.events.slice(-99), event],
      };

      // Extract agent speech from AGENT_MESSAGE events
      if (event.type === "AGENT_MESSAGE" && event.payload && typeof event.payload === "object") {
        const p = event.payload as Record<string, unknown>;
        if (p.from && p.message) {
          updates.agentSpeech = {
            ...s.agentSpeech,
            [String(p.from)]: {
              message: String(p.message),
              target: p.to ? String(p.to) : undefined,
              timestamp: event.timestamp,
            },
          };
        }
      }

      // Extract agent actions from AGENT_ACTION events
      if (event.type === "AGENT_ACTION" && event.payload && typeof event.payload === "object") {
        const p = event.payload as Record<string, unknown>;
        if (p.agent && p.action) {
          updates.agentActions = {
            ...s.agentActions,
            [String(p.agent)]: {
              action: String(p.action),
              target: p.target ? String(p.target) : undefined,
              zone: p.zone ? String(p.zone) : undefined,
              timestamp: event.timestamp,
            },
          };
        }
      }

      // Track ongoing tasks (TASK_START sets, TASK_END clears)
      if (event.type === "TASK_START" && event.payload && typeof event.payload === "object") {
        const p = event.payload as Record<string, unknown>;
        if (p.agent) {
          updates.agentTasks = {
            ...s.agentTasks,
            [String(p.agent)]: {
              action: String(p.action ?? ""),
              target: p.target ? String(p.target) : undefined,
              hours: Number(p.hours ?? 0),
              startedAt: event.timestamp,
            },
          };
        }
      }
      if (event.type === "TASK_END" && event.payload && typeof event.payload === "object") {
        const p = event.payload as Record<string, unknown>;
        if (p.agent) {
          const copy = { ...s.agentTasks };
          delete copy[String(p.agent)];
          updates.agentTasks = copy;
        }
      }

      return updates;
    }),

  setSimulationStatus: (status) =>
    set((s) => ({
      simulation: {
        ...s.simulation,
        ...status,
      },
    })),

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  setWs: (ws) => set({ ws }),

  sendMessage: (data) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  },
}));
