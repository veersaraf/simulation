// ============================================================
// VeerSim — Shared Type Definitions
// ============================================================

// --- Biomes ---

export type BiomeType =
  | "grassland"
  | "forest"
  | "water"
  | "beach"
  | "rocky"
  | "meadow"
  | "wetland";

// --- World State ---

export interface Zone {
  id: string;
  name: string;
  description: string;
  biome: BiomeType;
  adjacent: string[];
  objects: string[];
  structures: string[];
  agents: string[];
  elevation: number; // 0–1 scale
  color: string; // hex color
}

export interface WorldMeta {
  name: string;
  tick: number;          // mirrors worldMinutes for legacy compat
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

// --- Events ---

export type EventType =
  | "WORLD_EVENT"
  | "AGENT_ACTION"
  | "AGENT_MESSAGE"
  | "POSITION_UPDATE"
  | "ACTION_COMPLETE"
  | "USER_INJECT"
  | "PRIORITY_EVENT"
  | "STATE_SYNC"
  | "TASK_START"
  | "TASK_END";

export interface SimEvent {
  type: EventType;
  payload: unknown;
  timestamp: number;
  source: string;
}

// --- WebSocket Messages ---

export type WSMessageType =
  | "STATE_FULL"
  | "STATE_DIFF"
  | "EVENT"
  | "SIM_STATUS";

export interface SimulationStatus {
  running: boolean;
  paused: boolean;
  aiEnabled: boolean;
}

export interface WSMessage {
  type: WSMessageType;
  data: unknown;
  timestamp: number;
}

// --- State Diffs ---

export interface StateDiff {
  zones?: Record<string, Partial<Zone>>;
  meta?: Partial<WorldMeta>;
}
