// ============================================================
// WorldAgent — Narrator, spatial authority, and environmental force
// ============================================================

import { readFileSync, appendFileSync } from "fs";
import { resolve } from "path";
import OpenAI from "openai";
import { WORLD_DIR, WORLD_STATE_PATH } from "./projectPaths.js";
import type { WorldState, Zone, SimEvent } from "./types.js";
import type { ClockSnapshot } from "./WorldClock.js";

export class WorldAgent {
  private client: OpenAI;
  private model: string;
  private systemPrompt: string;
  private statePath: string;

  constructor(
    apiKey: string,
    model = "grok-4-1-fast-reasoning",
    baseURL?: string
  ) {
    this.client = baseURL
      ? new OpenAI({ apiKey, baseURL })
      : new OpenAI({ apiKey });
    this.model = model;
    this.statePath = WORLD_STATE_PATH;

    // Load system prompt
    this.systemPrompt = readFileSync(
      resolve(WORLD_DIR, "claude.md"),
      "utf-8"
    );
  }

  /** Read the current world state from disk. */
  private getState(): WorldState {
    return JSON.parse(readFileSync(this.statePath, "utf-8"));
  }

  /**
   * Generate a perception packet for a given agent.
   * Describes what the agent sees, hears, smells in their current zone.
   */
  async generatePerceptionPacket(
    agentId: string,
    clock?: ClockSnapshot,
    completedTask?: { action: string; hoursCommitted: number; hoursActual: number; result: string }
  ): Promise<string> {
    const state = this.getState();
    const agentZone = this.findAgentZone(state, agentId);

    if (!agentZone) {
      return `[${agentId} is not found in any zone]`;
    }

    const context = this.buildPerceptionContext(state, agentId, agentZone, clock, completedTask);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        {
          role: "user",
          content: `Generate a perception packet for agent "${agentId}". Context:\n\n${context}\n\nDescribe what ${agentId} perceives — where they are, what they see/hear/smell. Include time of day and adjacent zone hints. Under 200 words, vivid, present tense.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    return response.choices[0]?.message?.content ?? "[No perception generated]";
  }

  /**
   * Query what lies in a direction from a zone.
   * Returns prose description of adjacent zones.
   */
  async querySpace(fromZoneId: string, direction?: string): Promise<string> {
    const state = this.getState();
    const fromZone = state.zones[fromZoneId];

    if (!fromZone) {
      return `[Zone "${fromZoneId}" not found]`;
    }

    // Gather adjacent zone details
    const adjacentDetails = fromZone.adjacent
      .map((adjId) => {
        const adj = state.zones[adjId];
        if (!adj) return null;
        const agentsHere =
          adj.agents.length > 0
            ? ` (${adj.agents.join(", ")} ${adj.agents.length === 1 ? "is" : "are"} here)`
            : "";
        const objectCount = adj.objects.length;
        return `- **${adj.name}** (${adj.biome}, elevation ${adj.elevation}): ${adj.description}${agentsHere} [${objectCount} objects]`;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = direction
      ? `Agent is at "${fromZone.name}" and looks ${direction}. What do they see? Adjacent zones:\n\n${adjacentDetails}\n\nDescribe what they would find if they moved in that direction. Under 100 words.`
      : `Agent is at "${fromZone.name}" and surveys their surroundings. Adjacent zones:\n\n${adjacentDetails}\n\nDescribe what lies in each reachable direction. Under 100 words.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content ?? "[No spatial query result]";
  }

  /**
   * Narrate a simulation event in prose.
   */
  async narrateEvent(event: SimEvent): Promise<string> {
    const state = this.getState();

    const timeStr = state.meta.hour !== undefined
      ? `${String(state.meta.hour).padStart(2,"0")}:${String(state.meta.minute ?? 0).padStart(2,"0")}`
      : state.meta.time;
    const context = `Time: ${timeStr} (${state.meta.time}), Season: ${state.meta.season}, Day ${state.meta.worldDays ?? 0}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        {
          role: "user",
          content: `Narrate this event in third person, past tense. Be concise (1-3 sentences), include sensory details.\n\n${context}\n\nEvent: ${JSON.stringify(event)}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content ?? "[No narration generated]";
  }

  /**
   * Append an entry to the civilization ledger.
   */
  appendCivilizationLog(entry: string): void {
    const timestamp = new Date().toISOString().split("T")[0];
    const logEntry = `\n**[${timestamp}]** ${entry}\n`;
    appendFileSync(
      resolve(WORLD_DIR, "civilization.md"),
      logEntry,
      "utf-8"
    );
    console.log(`[WorldAgent] Civilization log: ${entry}`);
  }

  // ---- Internal helpers ----

  /** Find which zone an agent is in. */
  private findAgentZone(state: WorldState, agentId: string): Zone | null {
    for (const zone of Object.values(state.zones)) {
      if (zone.agents.includes(agentId)) {
        return zone;
      }
    }
    return null;
  }

  /** Build structured perception context from state data. */
  private buildPerceptionContext(
    state: WorldState,
    agentId: string,
    zone: Zone,
    clock?: ClockSnapshot,
    completedTask?: { action: string; hoursCommitted: number; hoursActual: number; result: string }
  ): string {
    const lines: string[] = [];

    // ---- Time ----
    lines.push("## Time");
    if (clock) {
      const sunriseStr = this.fmtDecHour(clock.sunrise);
      const sunsetStr  = this.fmtDecHour(clock.sunset);
      lines.push(`Clock: ${clock.timeString} | Phase: ${clock.timePhase} | Season: ${clock.season}`);
      lines.push(`Day ${clock.worldDays} | Sunrise: ${sunriseStr} | Sunset: ${sunsetStr}`);
      lines.push(`Daylight remaining: ${clock.daylightHoursRemaining}h`);
    } else {
      lines.push(`Phase: ${state.meta.time} | Season: ${state.meta.season}`);
      if (state.meta.hour !== undefined) {
        lines.push(`Clock: ${String(state.meta.hour).padStart(2,"0")}:${String(state.meta.minute ?? 0).padStart(2,"0")}`);
      }
    }
    lines.push("");

    // ---- Just-completed task ----
    if (completedTask) {
      const interrupted = completedTask.hoursActual < completedTask.hoursCommitted - 0.1;
      const label = interrupted ? "INTERRUPTED TASK" : "COMPLETED TASK";
      lines.push(`## ${label}`);
      lines.push(`Action: ${completedTask.action} (committed ${completedTask.hoursCommitted}h, actual ${completedTask.hoursActual.toFixed(1)}h)`);
      lines.push(`Result: ${completedTask.result}`);
      lines.push("");
    }

    // ---- Current location ----
    lines.push(`## Location: ${zone.name}`);
    lines.push(`Biome: ${zone.biome} | Elevation: ${zone.elevation}`);
    lines.push(zone.description);
    lines.push("");

    if (zone.objects.length > 0) {
      lines.push(`Objects: ${zone.objects.join(", ")}`);
    }
    if (zone.structures.length > 0) {
      lines.push(`Structures: ${zone.structures.join(", ")}`);
    }

    const others = zone.agents.filter((a) => a !== agentId);
    lines.push(others.length > 0 ? `Also here: ${others.join(", ")}` : "You are alone.");
    lines.push("");

    // ---- Adjacent zones ----
    lines.push("## Adjacent Zones");
    for (const adjId of zone.adjacent) {
      const adj = state.zones[adjId];
      if (!adj) continue;
      const who = adj.agents.length > 0 ? ` [${adj.agents.join(", ")} here]` : "";
      lines.push(`- ${adj.name} (${adj.biome}): ${adj.description.split(".")[0]}.${who}`);
    }

    return lines.join("\n");
  }

  private fmtDecHour(h: number): string {
    const hr  = Math.floor(h);
    const min = Math.round((h % 1) * 60);
    return `${String(hr).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
  }
}
