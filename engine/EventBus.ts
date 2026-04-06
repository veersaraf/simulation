// ============================================================
// EventBus — Thin pub/sub layer over Node EventEmitter
// ============================================================

import { EventEmitter } from "events";
import type { EventType, SimEvent } from "./types.js";

class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many listeners (agents, world agent, broadcaster, etc.)
    this.emitter.setMaxListeners(50);
  }

  /** Emit a simulation event. Fires on its specific type channel AND on "*" (wildcard). */
  emit(event: SimEvent): void {
    console.log(
      `[EventBus] ${event.type} from ${event.source}:`,
      typeof event.payload === "string"
        ? event.payload.slice(0, 80)
        : JSON.stringify(event.payload).slice(0, 80)
    );
    this.emitter.emit(event.type, event);
    this.emitter.emit("*", event);
  }

  /** Subscribe to a specific event type, or "*" for all events. */
  on(type: EventType | "*", handler: (event: SimEvent) => void): void {
    this.emitter.on(type, handler);
  }

  /** Unsubscribe. */
  off(type: EventType | "*", handler: (event: SimEvent) => void): void {
    this.emitter.off(type, handler);
  }

  /** Subscribe once. */
  once(type: EventType | "*", handler: (event: SimEvent) => void): void {
    this.emitter.once(type, handler);
  }
}

// Singleton — one bus per process
export const eventBus = new EventBus();
