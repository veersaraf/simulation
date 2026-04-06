// ============================================================
// StateBroadcaster — Watches state.json, computes diffs, broadcasts
// ============================================================

import { watch } from "chokidar";
import { readFileSync } from "fs";
import type { WorldState, StateDiff, WSMessage } from "./types.js";
import type { WebSocketServer } from "./WebSocketServer.js";

export class StateBroadcaster {
  private statePath: string;
  private wsServer: WebSocketServer;
  private lastState: WorldState | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(statePath: string, wsServer: WebSocketServer) {
    this.statePath = statePath;
    this.wsServer = wsServer;
  }

  start(): void {
    // Read initial state
    this.lastState = this.readState();

    // Watch for file changes
    const watcher = watch(this.statePath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    watcher.on("change", () => {
      // Debounce rapid writes
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.onFileChange(), 100);
    });

    console.log(`[StateBroadcaster] Watching ${this.statePath}`);
  }

  private readState(): WorldState {
    const raw = readFileSync(this.statePath, "utf-8");
    return JSON.parse(raw) as WorldState;
  }

  private onFileChange(): void {
    try {
      const newState = this.readState();
      const diff = this.computeDiff(this.lastState!, newState);

      if (diff) {
        const msg: WSMessage = {
          type: "STATE_DIFF",
          data: diff,
          timestamp: Date.now(),
        };
        this.wsServer.broadcast(msg);
        console.log(
          `[StateBroadcaster] Diff broadcast — ${
            diff.zones ? Object.keys(diff.zones).length : 0
          } zone(s) changed`
        );
      }

      this.lastState = newState;
    } catch (err) {
      console.error("[StateBroadcaster] Error reading state:", err);
    }
  }

  private computeDiff(
    oldState: WorldState,
    newState: WorldState
  ): StateDiff | null {
    const diff: StateDiff = {};
    let hasChanges = false;

    // Compare meta
    if (JSON.stringify(oldState.meta) !== JSON.stringify(newState.meta)) {
      diff.meta = {};
      for (const key of Object.keys(newState.meta) as Array<
        keyof typeof newState.meta
      >) {
        if (
          JSON.stringify(oldState.meta[key]) !==
          JSON.stringify(newState.meta[key])
        ) {
          (diff.meta as Record<string, unknown>)[key] = newState.meta[key];
        }
      }
      hasChanges = true;
    }

    // Compare zones
    const changedZones: Record<string, unknown> = {};
    for (const [zoneId, newZone] of Object.entries(newState.zones)) {
      const oldZone = oldState.zones[zoneId];
      if (!oldZone || JSON.stringify(oldZone) !== JSON.stringify(newZone)) {
        changedZones[zoneId] = newZone;
        hasChanges = true;
      }
    }

    // Check for removed zones
    for (const zoneId of Object.keys(oldState.zones)) {
      if (!newState.zones[zoneId]) {
        changedZones[zoneId] = null;
        hasChanges = true;
      }
    }

    if (Object.keys(changedZones).length > 0) {
      diff.zones = changedZones as StateDiff["zones"];
    }

    return hasChanges ? diff : null;
  }
}
