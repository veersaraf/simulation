// ============================================================
// SimulationLoop — Orchestrates agent waking, scheduled tasks,
// event routing, and anti-loop detection.
//
// Time model: agents commit world-hours to tasks via act().
// A schedule-check timer wakes them when their hours expire.
// ============================================================

import { eventBus } from "./EventBus.js";
import { ActionResolver } from "./ActionResolver.js";
import { WorldAgent } from "./WorldAgent.js";
import { WorldClock } from "./WorldClock.js";
import { Character } from "./Character.js";
import type { SimEvent } from "./types.js";

// ---- Types ----

interface ScheduledTask {
  action: string;
  target?: string;
  hoursCommitted: number;
  startedAtWorldMinutes: number;
}

interface AgentSchedule {
  wakeAtWorldMinutes: number | null;
  task: ScheduledTask | null;
  completing: boolean; // lock to prevent double-completion
}

interface SimulationConfig {
  worldAgent: WorldAgent;
  actionResolver: ActionResolver;
  worldClock: WorldClock;
  characters: Character[];
  antiLoopThreshold: number;
  /** Delay between back-to-back event-driven wakes (ms) */
  wakeDelay: number;
}

// ============================================================

export class SimulationLoop {
  private worldAgent: WorldAgent;
  private actionResolver: ActionResolver;
  private worldClock: WorldClock;
  private characters: Map<string, Character> = new Map();
  private antiLoopThreshold: number;
  private wakeDelay: number;

  private running = false;
  private paused = false;
  private consecutiveMessages = 0;

  /** Per-agent scheduled wake state */
  private schedules: Map<string, AgentSchedule> = new Map();

  /** Queued messages for non-listening agents */
  private messageQueue: Map<string, SimEvent[]> = new Map();

  /** Timer that polls agent schedules every 500ms */
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SimulationConfig) {
    this.worldAgent   = config.worldAgent;
    this.actionResolver = config.actionResolver;
    this.worldClock   = config.worldClock;
    this.antiLoopThreshold = config.antiLoopThreshold;
    this.wakeDelay    = config.wakeDelay;

    for (const char of config.characters) {
      this.characters.set(char.id, char);
      this.messageQueue.set(char.id, []);
      this.schedules.set(char.id, {
        wakeAtWorldMinutes: null,
        task: null,
        completing: false,
      });
    }
  }

  // ---- Lifecycle ----

  start(): void {
    this.running = true;
    console.log("[SimLoop] Simulation started (30:1 world clock)");

    // Subscribe to all EventBus events for routing
    eventBus.on("*", (event) => this.routeEvent(event));

    // Schedule-check timer: fires every 500ms real time
    // At 30:1, 500ms real = 0.25 world minutes = 15 world seconds
    this.scheduleTimer = setInterval(() => {
      if (!this.running || this.paused) return;
      this.checkSchedules();
    }, 500);

    // Kick off with initial world event to wake agents for their first decision
    this.fireWorldEvent(
      "You've just arrived on New Eden. The shuttle wreckage smolders behind you. " +
      "Morning light at 06:00 — a full day ahead. Decide your first task."
    );
  }

  pause(): void {
    this.paused = true;
    console.log("[SimLoop] Paused");
  }

  resume(): void {
    this.paused = false;
    console.log("[SimLoop] Resumed");
  }

  stop(): void {
    this.running = false;
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  injectUserEvent(message: string): void {
    eventBus.emit({
      type: "USER_INJECT",
      payload: message,
      timestamp: Date.now(),
      source: "user",
    });
  }

  fireWorldEvent(message: string): void {
    eventBus.emit({
      type: "WORLD_EVENT",
      payload: message,
      timestamp: Date.now(),
      source: "world",
    });
  }

  // ---- Schedule-check timer ----

  /** Called every 500ms. Wakes agents whose task time has elapsed. */
  private checkSchedules(): void {
    const now = this.worldClock.worldMinutes;

    for (const [agentId, schedule] of this.schedules) {
      if (
        schedule.wakeAtWorldMinutes !== null &&
        now >= schedule.wakeAtWorldMinutes &&
        !schedule.completing
      ) {
        schedule.completing = true;
        const character = this.characters.get(agentId)!;
        const task = schedule.task;

        // Reset schedule before async work
        schedule.wakeAtWorldMinutes = null;
        schedule.task = null;

        // Complete the task and wake the agent
        this.completeTask(character, task, now).finally(() => {
          schedule.completing = false;
        });
      }
    }
  }

  /** Apply task output, restore agent to listening, then wake for next decision. */
  private async completeTask(
    character: Character,
    task: ScheduledTask | null,
    nowWorldMinutes: number
  ): Promise<void> {
    let taskResultText: string | undefined;
    let completedTaskInfo:
      | { action: string; hoursCommitted: number; hoursActual: number; result: string }
      | undefined;

    if (task) {
      const hoursActual = Math.max(
        0,
        (nowWorldMinutes - task.startedAtWorldMinutes) / 60
      );

      console.log(
        `[SimLoop] ${character.id} completed ${task.action} ` +
        `(${hoursActual.toFixed(1)}h / ${task.hoursCommitted}h committed)`
      );

      const result = this.actionResolver.executeTask(
        character.id,
        task.action,
        task.target,
        task.hoursCommitted,
        hoursActual,
        character.state
      );

      taskResultText = result.message;
      completedTaskInfo = {
        action: task.action,
        hoursCommitted: task.hoursCommitted,
        hoursActual,
        result: result.message,
      };

      // Log action event for UI
      if (task.action !== "sleep" && task.action !== "move") {
        eventBus.emit({
          type: "ACTION_COMPLETE",
          payload: {
            agent: character.id,
            action: task.action,
            hoursActual: Math.round(hoursActual * 10) / 10,
            result: result.message,
          },
          timestamp: Date.now(),
          source: character.id,
        });
      }
    }

    // Restore agent to listening so they receive events again
    character.state.reachability = "listening";

    // Broadcast task end so the frontend clears the persistent indicator
    eventBus.emit({
      type: "TASK_END",
      payload: { agent: character.id, action: task?.action ?? "unknown" },
      timestamp: Date.now(),
      source: character.id,
    });

    // Wake with ACTION_COMPLETE so they decide their next task
    const wakeEvent: SimEvent = {
      type: "ACTION_COMPLETE",
      payload: taskResultText ?? "Your scheduled time block ended.",
      timestamp: Date.now(),
      source: "scheduler",
    };

    await this.wakeAgent(character, wakeEvent, completedTaskInfo);
  }

  // ---- Event routing ----

  private async routeEvent(event: SimEvent): Promise<void> {
    if (!this.running || this.paused) return;
    if (event.source === "router" || event.source === "scheduler") return;

    for (const [agentId, character] of this.characters) {
      if (event.source === agentId) continue;

      if (this.shouldDeliverEvent(character, event)) {
        await this.delay(this.wakeDelay);
        if (!this.running || this.paused) return;
        await this.wakeAgent(character, event);
      } else if (event.type === "AGENT_MESSAGE") {
        this.messageQueue.get(agentId)?.push(event);
      }
    }
  }

  private shouldDeliverEvent(character: Character, event: SimEvent): boolean {
    const { activity, reachability } = character.state;
    const t = event.type as string;

    if (t === "PRIORITY_EVENT" || t === "USER_INJECT") return true;

    // Dead
    if (activity === "non-active" && reachability === "non-listening") return false;

    // Resting/sleeping: only world events and priority
    if (activity === "non-active" && reachability === "listening") {
      return t === "WORLD_EVENT" || t === "PRIORITY_EVENT";
    }

    // Occupied (working): ignore all events — schedule timer handles waking
    if (activity === "active" && reachability === "non-listening") {
      // PRIORITY interrupts even occupied agents
      return t === "PRIORITY_EVENT";
    }

    // Active and listening: receive everything
    return true;
  }

  // ---- Agent wake ----

  private async wakeAgent(
    character: Character,
    event: SimEvent,
    completedTask?: { action: string; hoursCommitted: number; hoursActual: number; result: string }
  ): Promise<void> {
    try {
      // Generate perception packet with clock context
      const clock = this.worldClock.snapshot();
      let perception: string;
      try {
        perception = await this.worldAgent.generatePerceptionPacket(
          character.id,
          clock,
          completedTask
        );
      } catch (err) {
        console.error(`[SimLoop] Perception failed for ${character.id}:`, (err as Error).message);
        perception = this.fallbackPerception(character.id, clock);
      }

      // Drain queued messages into perception context
      const queued = this.messageQueue.get(character.id) ?? [];
      if (queued.length > 0) {
        this.messageQueue.set(character.id, []);
        const queuedText = queued
          .map((e) => {
            const p = e.payload as Record<string, unknown>;
            return `[${p.from ?? e.source} says]: ${p.message ?? ""}`;
          })
          .join("\n");
        perception += `\n\n## Queued Messages (received while you were working)\n${queuedText}`;
      }

      // Call LLM
      let toolCalls: Awaited<ReturnType<typeof character.wake>>;
      try {
        toolCalls = await character.wake(event, perception);
      } catch (err) {
        console.error(`[SimLoop] Wake failed for ${character.id}, retrying:`, (err as Error).message);
        await this.delay(3000);
        toolCalls = await character.wake(event, perception);
      }

      // Broadcast agent speech
      if (character.lastSpeech) {
        eventBus.emit({
          type: "AGENT_MESSAGE",
          payload: { from: character.id, to: "narrator", message: character.lastSpeech },
          timestamp: Date.now(),
          source: character.id,
        });
        character.lastSpeech = null;
      }

      // Process tool calls
      let scheduledTask = false;
      for (const tc of toolCalls) {
        const result = await this.processToolCall(character, tc);
        character.addToolResult(tc.id, result);
        if (tc.tool === "act") scheduledTask = true;
      }

      // Anti-loop: if agent didn't commit to a task, count it
      if (!scheduledTask) {
        this.consecutiveMessages++;
        if (this.consecutiveMessages >= this.antiLoopThreshold) {
          console.log(`[SimLoop] Anti-loop triggered (${this.consecutiveMessages} non-task wakes)`);
          this.consecutiveMessages = 0;
          this.fireWorldEvent(await this.generatePressureEvent());
        }
      } else {
        this.consecutiveMessages = 0;
      }

    } catch (err) {
      console.error(`[SimLoop] Error waking ${character.id}:`, (err as Error).message);
    }
  }

  // ---- Tool call handling ----

  private async processToolCall(
    character: Character,
    tc: { tool: string; args: Record<string, unknown>; id: string }
  ): Promise<string> {

    switch (tc.tool) {

      case "act": {
        const action  = tc.args.action  as string;
        const target  = tc.args.target  as string | undefined;
        const hours   = Math.max(0.1, Math.min(16, Number(tc.args.hours) || 1));
        const clock   = this.worldClock.snapshot();

        // Move and eat are near-instant — execute immediately, no schedule
        if (action === "move" || action === "eat") {
          const result = this.actionResolver.executeTask(
            character.id, action, target, hours, hours, character.state
          );
          if (action === "move") {
            // Brief occupy period (0.5h) then back to listening
            this.setOccupied(character, action, target, 0.5);
            return result.message;
          }
          return result.message;
        }

        // All other actions: occupy the agent for the committed hours
        this.setOccupied(character, action, target, hours);

        const wakeTime = this.worldClock.futureMinutes(hours);
        const wakeStr  = this.fmtWorldTime(wakeTime);

        console.log(
          `[SimLoop] ${character.id} committed to ${action} for ${hours}h ` +
          `(wakes at ${wakeStr})`
        );

        return (
          `Task started: ${action} for ${hours}h. ` +
          `You will be occupied until ~${wakeStr}. ` +
          `Stay focused — no interruptions unless critical.`
        );
      }

      case "speak_to": {
        const targetId = tc.args.target as string;
        const message  = tc.args.message as string;
        eventBus.emit({
          type: "AGENT_MESSAGE",
          payload: { from: character.id, to: targetId, message },
          timestamp: Date.now(),
          source: character.id,
        });
        return `Message sent to ${targetId}.`;
      }

      case "query_space": {
        const direction = tc.args.direction as string | undefined;
        const state = this.actionResolver.getState();
        const zone  = this.actionResolver.findAgentZone(state, character.id);
        if (!zone) return "You are nowhere.";
        return await this.worldAgent.querySpace(zone.id, direction);
      }

      case "propose_plan": {
        const targetAgent = tc.args.target_agent as string;
        const plan  = tc.args.plan  as string;
        const steps = tc.args.steps as string[];
        eventBus.emit({
          type: "AGENT_MESSAGE",
          payload: {
            from: character.id,
            to: targetAgent,
            message: `[PLAN] ${plan}\nSteps: ${steps.map((s, i) => `${i + 1}. ${s}`).join(", ")}`,
          },
          timestamp: Date.now(),
          source: character.id,
        });
        return `Plan proposed to ${targetAgent}.`;
      }

      case "write_memory":
        return "Memory recorded.";

      case "set_disposition":
        return `Disposition set to ${tc.args.disposition}.`;

      default:
        return `Unknown tool: ${tc.tool}`;
    }
  }

  // ---- Helpers ----

  /** Mark agent as occupied for the duration and register schedule. */
  private setOccupied(
    character: Character,
    action: string,
    target: string | undefined,
    hours: number
  ): void {
    character.state.reachability = "non-listening";
    character.state.activity     = "active";
    character.state.disposition  = action === "sleep" ? "resting" : "working";

    const schedule = this.schedules.get(character.id)!;
    schedule.wakeAtWorldMinutes = this.worldClock.futureMinutes(hours);
    schedule.task = {
      action,
      target,
      hoursCommitted: hours,
      startedAtWorldMinutes: this.worldClock.worldMinutes,
    };

    // Broadcast task start so the frontend can show a persistent indicator
    eventBus.emit({
      type: "TASK_START",
      payload: {
        agent: character.id,
        action,
        target,
        hours,
        startedAtWorldMinutes: this.worldClock.worldMinutes,
      },
      timestamp: Date.now(),
      source: character.id,
    });
  }

  /** Format world-minutes as HH:MM */
  private fmtWorldTime(worldMinutes: number): string {
    const totalMins = Math.floor(worldMinutes) % (24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  private fallbackPerception(agentId: string, clock: ReturnType<typeof this.worldClock.snapshot>): string {
    try {
      const state = this.actionResolver.getState();
      const zone  = this.actionResolver.findAgentZone(state, agentId);
      if (!zone) return "You are lost. Orient yourself.";
      const others = zone.agents.filter((a) => a !== agentId);
      const adj    = zone.adjacent.map((id) => state.zones[id]?.name || id).join(", ");
      return (
        `${clock.timeString} (${clock.timePhase}), ${clock.season}, Day ${clock.worldDays}. ` +
        `Daylight remaining: ${clock.daylightHoursRemaining}h. ` +
        `You are at ${zone.name}. ${zone.description} ` +
        `Objects: ${zone.objects.join(", ") || "none"}. ` +
        `Structures: ${zone.structures.join(", ") || "none"}. ` +
        `${others.length > 0 ? `${others.join(", ")} are here.` : "You are alone."} ` +
        `Adjacent: ${adj}.`
      );
    } catch {
      return "You are on New Eden. Assess your situation.";
    }
  }

  private async generatePressureEvent(): Promise<string> {
    const clock = this.worldClock.snapshot();
    const options = [
      `It is ${clock.timeString}. ${clock.daylightHoursRemaining}h of daylight remain. You have no shelter yet — act before dark.`,
      "A cold wind sweeps in from the highlands. Temperature is dropping. Winter preparation cannot wait.",
      "Your stomach churns. Without food you will weaken. Gather something before energy fails.",
      "Storm clouds build on the horizon. Anything left in the open will suffer.",
      "Silence from the forest — then a crack of branches. Something large is moving nearby.",
      `It is ${clock.timeString} on Day ${clock.worldDays}. Time moves whether you do or not. Decide your next move.`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  get isRunning(): boolean { return this.running; }
  get isPaused():  boolean { return this.paused; }
}
