// ============================================================
// VeerSim — Server Entry Point
// ============================================================

import { readFileSync } from "fs";
import { WebSocketServer } from "./engine/WebSocketServer.js";
import { StateBroadcaster } from "./engine/StateBroadcaster.js";
import { WorldAgent } from "./engine/WorldAgent.js";
import { ActionResolver } from "./engine/ActionResolver.js";
import { Character } from "./engine/Character.js";
import { SimulationLoop } from "./engine/SimulationLoop.js";
import { WorldClock } from "./engine/WorldClock.js";
import { eventBus } from "./engine/EventBus.js";
import { loadProjectEnv, resolveLLMConfig } from "./engine/llmConfig.js";
import { PROJECT_ROOT, WORLD_STATE_PATH } from "./engine/projectPaths.js";
import type {
  SimulationStatus,
  WorldState,
  WSMessage,
} from "./engine/types.js";

const WS_PORT = 3001;

async function boot() {
  console.log("============================================");
  console.log("  VeerSim — AI Civilization Simulation");
  console.log("============================================\n");

  const envPath = loadProjectEnv(PROJECT_ROOT);
  if (envPath) {
    console.log(`[Boot] Loaded environment from ${envPath}`);
  }

  // 1. Load world state
  const raw = readFileSync(WORLD_STATE_PATH, "utf-8");
  const worldState: WorldState = JSON.parse(raw);
  const zoneCount = Object.keys(worldState.zones).length;
  console.log(
    `[Boot] Loaded world "${worldState.meta.name}" — ${zoneCount} zones`
  );

  // State getter (re-reads from disk to stay in sync with ActionResolver writes)
  const getState = (): WorldState =>
    JSON.parse(readFileSync(WORLD_STATE_PATH, "utf-8"));

  const simulationStatus: SimulationStatus = {
    running: false,
    paused: false,
    aiEnabled: false,
  };

  // 2. Start WebSocket server
  const wsServer = new WebSocketServer(
    WS_PORT,
    getState,
    () => simulationStatus
  );
  wsServer.start();

  // 3. Start StateBroadcaster (watches state.json for file changes)
  const broadcaster = new StateBroadcaster(WORLD_STATE_PATH, wsServer);
  broadcaster.start();

  // 4. Wire EventBus → WebSocket broadcast
  eventBus.on("*", (event) => {
    const msg: WSMessage = {
      type: "EVENT",
      data: event,
      timestamp: Date.now(),
    };
    wsServer.broadcast(msg);
  });

  // 5. Initialize AI components (if API key is available)
  const llmConfig = resolveLLMConfig();
  if (!llmConfig) {
    console.log(
      "[Boot] No supported API key found — simulation disabled. Set XAI_API_KEY, X-API-KEY, or OPENAI_API_KEY to run agents."
    );
    console.log(
      "[Boot] Server running in static mode (3D world only).\n"
    );
  } else {
    simulationStatus.aiEnabled = true;
    console.log(
      `[Boot] ${llmConfig.provider.toUpperCase()} key found — initializing AI agents with ${llmConfig.model}...\n`
    );

    // World Agent
    const worldAgent = new WorldAgent(
      llmConfig.apiKey,
      llmConfig.model,
      llmConfig.baseURL
    );
    console.log("[Boot] World Agent initialized");

    // Action Resolver
    const actionResolver = new ActionResolver();
    console.log("[Boot] Action Resolver initialized");

    // Character Agents
    const alice = new Character({
      id: "alice",
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      baseURL: llmConfig.baseURL,
    });
    const bob = new Character({
      id: "bob",
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      baseURL: llmConfig.baseURL,
    });

    // World Clock — 30:1 compressed 24h clock
    const worldClock = new WorldClock();

    // Simulation Loop
    const simLoop = new SimulationLoop({
      worldAgent,
      actionResolver,
      worldClock,
      characters: [alice, bob],
      antiLoopThreshold: 6,
      wakeDelay: 2000, // 2 seconds between agent wakes
    });

    // Expose for debugging / user injection
    (globalThis as Record<string, unknown>).__sim = simLoop;
    (globalThis as Record<string, unknown>).__worldAgent = worldAgent;
    (globalThis as Record<string, unknown>).__worldClock = worldClock;
    (globalThis as Record<string, unknown>).__alice = alice;
    (globalThis as Record<string, unknown>).__bob = bob;

    // Start the world clock (wires crop growth tick into ActionResolver)
    worldClock.start(() => actionResolver.tickCrops());
    console.log("[Boot] World Clock started (30:1 compression)");

    // Handle WebSocket messages from client (user injection)
    wsServer.onMessage((data: string) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "USER_INJECT") {
          simLoop.injectUserEvent(msg.payload as string);
        } else if (msg.type === "PAUSE") {
          simLoop.pause();
          worldClock.pause();
          simulationStatus.paused = true;
          wsServer.broadcastSimulationStatus(simulationStatus);
        } else if (msg.type === "RESUME") {
          simLoop.resume();
          worldClock.resume();
          simulationStatus.paused = false;
          wsServer.broadcastSimulationStatus(simulationStatus);
        }
      } catch {
        // ignore malformed messages
      }
    });

    // Start the simulation!
    console.log("\n[Boot] Starting simulation...\n");
    simLoop.start();
    simulationStatus.running = true;
    simulationStatus.paused = false;
    wsServer.broadcastSimulationStatus(simulationStatus);
  }

  console.log("[Boot] VeerSim server ready.");
  console.log(`[Boot] WebSocket: ws://localhost:${WS_PORT}`);
  console.log("[Boot] Waiting for client connections...\n");
}

boot().catch((err) => {
  console.error("[Fatal] Boot failed:", err);
  process.exit(1);
});
