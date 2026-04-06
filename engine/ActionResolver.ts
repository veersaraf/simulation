// ============================================================
// ActionResolver — Validates and executes world mutations.
// Output for gathering/chopping scales with committed hours.
// Partial output applied when a task is interrupted early.
// ============================================================

import { readFileSync, writeFileSync } from "fs";
import { eventBus } from "./EventBus.js";
import { WORLD_STATE_PATH } from "./projectPaths.js";
import type { WorldState, Zone } from "./types.js";
import type { AgentState } from "./Character.js";

export interface ActionResult {
  success: boolean;
  message: string;
  /** Fractional: 1.0 = fully done, 0.5 = interrupted halfway */
  completionRatio?: number;
}

// ---- Output rates per world-hour ----
const OUTPUT_PER_HOUR: Record<string, Record<string, number>> = {
  chop_wood:     { logs: 2 },
  gather_fruit:  { berries: 3 },
  gather_stones: { stones: 4 },
  gather_clay:   { clay: 3 },
  fish:          { fish: 1 },
};

// ---- Energy drain per world-hour (negative = restores) ----
const ENERGY_PER_HOUR: Record<string, number> = {
  chop_wood:     -6,
  gather_fruit:  -3,
  gather_stones: -5,
  gather_clay:   -4,
  fish:          -2,
  move:          -3,
  eat:           0,
  build_campfire:-4,
  build_shelter: -5,
  build_wall:    -5,
  plant_crop:    -2,
  harvest_crop:  -2,
  sleep:         12,   // restores per hour
  rest:          8,
};

// ---- Minimum hours required for builds ----
const BUILD_MIN_HOURS: Record<string, number> = {
  build_campfire: 1,
  build_shelter:  4,
  build_wall:     2,
  plant_crop:     0.5,
  harvest_crop:   0.5,
};

export class ActionResolver {

  // ---- State I/O ----

  getState(): WorldState {
    return JSON.parse(readFileSync(WORLD_STATE_PATH, "utf-8"));
  }

  private saveState(state: WorldState): void {
    writeFileSync(WORLD_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  }

  findAgentZone(state: WorldState, agentId: string): Zone | null {
    for (const zone of Object.values(state.zones)) {
      if (zone.agents.includes(agentId)) return zone;
    }
    return null;
  }

  // ---- Primary entry: called when task timer fires ----
  /**
   * Execute a timed action after N world-hours have elapsed.
   * hoursActual may be less than hoursCommitted if interrupted.
   */
  executeTask(
    agentId: string,
    action: string,
    target: string | undefined,
    hoursCommitted: number,
    hoursActual: number,
    agentState: AgentState
  ): ActionResult {
    const state = this.getState();
    const zone = this.findAgentZone(state, agentId);

    if (!zone) {
      return { success: false, message: `${agentId} is not in any zone` };
    }

    const ratio = Math.min(1, hoursActual / hoursCommitted);

    // Apply energy change
    const energyRate = ENERGY_PER_HOUR[action] ?? -3;
    agentState.energy = Math.max(
      0,
      Math.min(100, agentState.energy + energyRate * hoursActual)
    );

    switch (action) {
      case "move":
        return this.resolveMove(state, agentId, zone, target);

      case "chop_wood":
        return this.resolveGather(
          state, agentId, zone, agentState,
          "chop_wood", hoursActual, ratio,
          (z) => z.objects.some(o =>
            (o.includes("tree") || o.includes("oak") || o.includes("branch")) &&
            !o.includes("stump")
          ),
          (z) => {
            const tree = z.objects.find(o =>
              (o.includes("tree") || o.includes("oak") || o.includes("branch")) &&
              !o.includes("stump")
            )!;
            z.objects = z.objects.filter(o => o !== tree);
            z.objects.push("tree_stump");
          }
        );

      case "gather_fruit":
        return this.resolveGather(
          state, agentId, zone, agentState,
          "gather_fruit", hoursActual, ratio,
          (z) => z.objects.some(o => o.includes("berry") || o.includes("fruit")),
          () => {} // bush stays
        );

      case "gather_stones":
        return this.resolveGather(
          state, agentId, zone, agentState,
          "gather_stones", hoursActual, ratio,
          (z) => z.objects.some(o =>
            o.includes("stone") || o.includes("rock") ||
            o.includes("sandstone") || o.includes("limestone") || o.includes("loose")
          ),
          () => {}
        );

      case "gather_clay":
        return this.resolveGather(
          state, agentId, zone, agentState,
          "gather_clay", hoursActual, ratio,
          (z) => z.objects.includes("clay_deposit"),
          () => {}
        );

      case "fish":
        return this.resolveGather(
          state, agentId, zone, agentState,
          "fish", hoursActual, ratio,
          (z) => z.objects.some(o => o.includes("fish") || o.includes("tidal")),
          () => {}
        );

      case "eat":
        return this.resolveEat(agentId, agentState, target);

      case "sleep":
        return this.resolveSleep(agentId, agentState, hoursActual);

      case "build_campfire":
        return this.resolveBuild(
          state, agentId, zone, agentState, "build_campfire",
          hoursActual, { logs: 2, stones: 2 }, "campfire"
        );

      case "build_shelter":
        return this.resolveBuild(
          state, agentId, zone, agentState, "build_shelter",
          hoursActual, { logs: 4, stones: 2 }, "shelter"
        );

      case "build_wall":
        return this.resolveBuild(
          state, agentId, zone, agentState, "build_wall",
          hoursActual, { stones: 6 }, "wall_section"
        );

      case "plant_crop":
        return this.resolvePlantCrop(state, agentId, zone, agentState, hoursActual);

      case "harvest_crop":
        return this.resolveHarvestCrop(state, agentId, zone, agentState, hoursActual);

      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  }

  // ---- Mutation helpers ----

  private resolveMove(
    state: WorldState,
    agentId: string,
    currentZone: Zone,
    target?: string
  ): ActionResult {
    if (!target) {
      return { success: false, message: "Move requires a target zone id" };
    }

    // Allow fuzzy name matching (agents sometimes use display names)
    const targetId = this.resolveZoneId(state, target);
    if (!targetId) {
      return {
        success: false,
        message: `Zone "${target}" not found. Adjacent: ${currentZone.adjacent.join(", ")}`,
      };
    }

    if (!currentZone.adjacent.includes(targetId)) {
      return {
        success: false,
        message: `${targetId} is not adjacent to ${currentZone.id}. Adjacent: ${currentZone.adjacent.join(", ")}`,
      };
    }

    currentZone.agents = currentZone.agents.filter((a) => a !== agentId);
    state.zones[targetId].agents.push(agentId);
    this.saveState(state);

    eventBus.emit({
      type: "POSITION_UPDATE",
      payload: { agent: agentId, from: currentZone.id, to: targetId },
      timestamp: Date.now(),
      source: agentId,
    });

    return {
      success: true,
      message: `Moved to ${state.zones[targetId].name}.`,
      completionRatio: 1,
    };
  }

  /** Generic gather: validates resource, scales output by hours */
  private resolveGather(
    state: WorldState,
    agentId: string,
    zone: Zone,
    agentState: AgentState,
    action: string,
    hoursActual: number,
    ratio: number,
    hasResource: (z: Zone) => boolean,
    consumeResource: (z: Zone) => void
  ): ActionResult {
    if (!hasResource(zone)) {
      return {
        success: false,
        message: `No ${action.replace("_", " ")} resources in ${zone.name}.`,
      };
    }

    const rates = OUTPUT_PER_HOUR[action] ?? {};
    const gained: string[] = [];
    for (const [item, perHour] of Object.entries(rates)) {
      const amount = Math.max(1, Math.floor(perHour * hoursActual * ratio));
      agentState.inventory[item] = (agentState.inventory[item] || 0) + amount;
      gained.push(`${amount} ${item}`);
    }

    agentState.skills[action] = (agentState.skills[action] || 0) + 1;

    if (ratio >= 0.8) consumeResource(zone);
    this.saveState(state);

    eventBus.emit({
      type: "AGENT_ACTION",
      payload: { agent: agentId, action, zone: zone.id },
      timestamp: Date.now(),
      source: agentId,
    });

    const completionNote = ratio < 1 ? ` (interrupted at ${Math.round(ratio * 100)}%)` : "";
    return {
      success: true,
      message: `Gathered ${gained.join(", ")} from ${zone.name}${completionNote}. Energy: ${Math.round(agentState.energy)}/100.`,
      completionRatio: ratio,
    };
  }

  private resolveEat(
    agentId: string,
    agentState: AgentState,
    target?: string
  ): ActionResult {
    const foods = ["berries", "fish", "bread", "wheat"];
    const food = target
      ? foods.find((f) => f === target && (agentState.inventory[f] || 0) > 0)
      : foods.find((f) => (agentState.inventory[f] || 0) > 0);

    if (!food) {
      return { success: false, message: "No food in inventory. You are hungry." };
    }

    agentState.inventory[food]!--;
    if ((agentState.inventory[food] ?? 0) <= 0) delete agentState.inventory[food];
    agentState.energy = Math.min(100, agentState.energy + 25);

    return {
      success: true,
      message: `Ate ${food}. Energy: ${agentState.energy}/100.`,
      completionRatio: 1,
    };
  }

  private resolveSleep(
    agentId: string,
    agentState: AgentState,
    hoursActual: number
  ): ActionResult {
    const restored = Math.floor(ENERGY_PER_HOUR.sleep * hoursActual);
    agentState.energy = Math.min(100, agentState.energy + restored);
    return {
      success: true,
      message: `Slept ${hoursActual.toFixed(1)}h. Energy restored: +${restored}. Energy: ${agentState.energy}/100.`,
      completionRatio: 1,
    };
  }

  private resolveBuild(
    state: WorldState,
    agentId: string,
    zone: Zone,
    agentState: AgentState,
    action: string,
    hoursActual: number,
    costs: Record<string, number>,
    structureName: string
  ): ActionResult {
    const minHours = BUILD_MIN_HOURS[action] ?? 1;
    if (hoursActual < minHours) {
      return {
        success: false,
        message: `Not enough time — ${action} needs at least ${minHours}h. Only ${hoursActual.toFixed(1)}h elapsed.`,
      };
    }

    // Check materials
    for (const [item, needed] of Object.entries(costs)) {
      if ((agentState.inventory[item] || 0) < needed) {
        return {
          success: false,
          message: `Not enough ${item} — need ${needed}, have ${agentState.inventory[item] || 0}.`,
        };
      }
    }

    // Deduct materials
    for (const [item, needed] of Object.entries(costs)) {
      agentState.inventory[item]! -= needed;
      if ((agentState.inventory[item] ?? 0) <= 0) delete agentState.inventory[item];
    }

    zone.structures.push(structureName);
    agentState.skills[action] = (agentState.skills[action] || 0) + 1;
    this.saveState(state);

    eventBus.emit({
      type: "AGENT_ACTION",
      payload: { agent: agentId, action, zone: zone.id, structure: structureName },
      timestamp: Date.now(),
      source: agentId,
    });

    return {
      success: true,
      message: `Built ${structureName} at ${zone.name}! Energy: ${Math.round(agentState.energy)}/100.`,
      completionRatio: 1,
    };
  }

  private resolvePlantCrop(
    state: WorldState,
    agentId: string,
    zone: Zone,
    agentState: AgentState,
    hoursActual: number
  ): ActionResult {
    if (hoursActual < (BUILD_MIN_HOURS.plant_crop ?? 0.5)) {
      return { success: false, message: "Need at least 0.5h to plant a crop." };
    }
    if (!zone.objects.includes("fertile_soil_patch")) {
      return { success: false, message: "No fertile soil in this zone." };
    }
    if ((agentState.inventory.berries || 0) < 1) {
      return { success: false, message: "Need berries as seeds." };
    }

    agentState.inventory.berries!--;
    if ((agentState.inventory.berries ?? 0) <= 0) delete agentState.inventory.berries;
    zone.objects.push("planted_crop_stage_1");
    agentState.skills.plant_crop = (agentState.skills.plant_crop || 0) + 1;
    this.saveState(state);

    return {
      success: true,
      message: `Planted a crop at ${zone.name}. It will grow over time.`,
      completionRatio: 1,
    };
  }

  private resolveHarvestCrop(
    state: WorldState,
    agentId: string,
    zone: Zone,
    agentState: AgentState,
    hoursActual: number
  ): ActionResult {
    if (hoursActual < (BUILD_MIN_HOURS.harvest_crop ?? 0.5)) {
      return { success: false, message: "Need at least 0.5h to harvest." };
    }
    const cropIdx = zone.objects.indexOf("mature_crop");
    if (cropIdx === -1) {
      return { success: false, message: "No mature crops to harvest." };
    }

    zone.objects.splice(cropIdx, 1);
    zone.objects.push("fertile_soil_patch");
    agentState.inventory.wheat = (agentState.inventory.wheat || 0) + 3;
    agentState.skills.harvest_crop = (agentState.skills.harvest_crop || 0) + 1;
    this.saveState(state);

    return {
      success: true,
      message: `Harvested crops at ${zone.name}. Got 3 wheat.`,
      completionRatio: 1,
    };
  }

  /** Crop growth tick — called every 3 world-hours by WorldClock */
  tickCrops(): void {
    const state = this.getState();
    let changed = false;

    for (const zone of Object.values(state.zones)) {
      const s1 = zone.objects.indexOf("planted_crop_stage_1");
      if (s1 !== -1) {
        zone.objects[s1] = "planted_crop_stage_2";
        changed = true;
      }

      const s2 = zone.objects.indexOf("planted_crop_stage_2");
      if (s2 !== -1) {
        zone.objects[s2] = "mature_crop";
        changed = true;
        eventBus.emit({
          type: "WORLD_EVENT",
          payload: `Crops at ${zone.name} are now ripe and ready to harvest.`,
          timestamp: Date.now(),
          source: "world",
        });
      }
    }

    if (changed) this.saveState(state);
  }

  // ---- Fuzzy zone resolution ----
  private resolveZoneId(state: WorldState, input: string): string | null {
    const lower = input.toLowerCase().replace(/\s+/g, "_");
    // Exact match
    if (state.zones[lower]) return lower;
    if (state.zones[input]) return input;
    // Partial match
    for (const id of Object.keys(state.zones)) {
      if (id.includes(lower) || lower.includes(id)) return id;
      if (
        state.zones[id].name.toLowerCase().replace(/\s+/g, "_").includes(lower)
      ) {
        return id;
      }
    }
    return null;
  }
}
