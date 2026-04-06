// ============================================================
// WorldClock — 30:1 compressed real-time world clock
//
// Compression: 1 real second = 30 world seconds = 0.5 world minutes
// Full 24-hour world day = 48 real minutes of real time
// Season: 7 world days per season (7 × 48min = ~5.6 real hours per season)
//
// Sunrise/sunset vary by season. Phase is derived from solar time,
// not a fixed bucket. Saves to state.json on every world-hour tick.
// ============================================================

import { readFileSync, writeFileSync } from "fs";
import { eventBus } from "./EventBus.js";
import { WORLD_STATE_PATH } from "./projectPaths.js";
import type { WorldState } from "./types.js";

// ----- Constants -----

/** 30:1 compression: 1 real second = 30 world seconds */
const COMPRESSION = 30;
const REAL_MS_PER_TICK = 1000;
const WORLD_MINUTES_PER_TICK = COMPRESSION / 60; // 0.5 world minutes per real second

const WORLD_DAYS_PER_SEASON = 7;

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
type Season = (typeof SEASONS)[number];

/** Sunrise / sunset decimal hours by season */
const SOLAR: Record<Season, { rise: number; set: number }> = {
  spring: { rise: 5.5,  set: 19.5 },  // 05:30 / 19:30
  summer: { rise: 4.5,  set: 20.5 },  // 04:30 / 20:30
  autumn: { rise: 6.5,  set: 18.5 },  // 06:30 / 18:30
  winter: { rise: 7.5,  set: 16.5 },  // 07:30 / 16:30
};

// ----- Public types -----

export interface ClockSnapshot {
  worldMinutes: number;
  worldDays: number;
  hour: number;
  minute: number;
  timePhase: "dawn" | "day" | "dusk" | "night";
  season: Season;
  sunrise: number; // decimal hour e.g. 5.5 = 05:30
  sunset: number;
  daylightHoursRemaining: number;
  timeString: string; // "HH:MM"
}

export class WorldClock {
  private _worldMinutes: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private lastPhase: string;
  private lastHour: number;
  private lastSeason: string;
  /** Counts real-second ticks; used to rate-limit external-edit detection */
  private tickCount = 0;
  /** Last worldMinutes value written to state.json by this clock */
  private lastWrittenWorldMinutes = -1;

  constructor(startHour = 6) {
    // Resume from persisted state if possible
    try {
      const raw = readFileSync(WORLD_STATE_PATH, "utf-8");
      const state = JSON.parse(raw) as WorldState;
      this._worldMinutes =
        typeof state.meta.worldMinutes === "number"
          ? state.meta.worldMinutes
          : startHour * 60;
    } catch {
      this._worldMinutes = startHour * 60;
    }

    this.lastPhase = this.derivePhase();
    this.lastHour = this.hour;
    this.lastSeason = this.deriveSeason();
    // Treat the value we read at boot as "last written" so the first
    // sync check doesn't immediately fire a false positive
    this.lastWrittenWorldMinutes = this._worldMinutes;
  }

  // ----- Getters -----

  get worldMinutes(): number {
    return this._worldMinutes;
  }

  get hour(): number {
    return Math.floor((this._worldMinutes % (24 * 60)) / 60);
  }

  get minute(): number {
    return Math.floor(this._worldMinutes % 60);
  }

  get worldDays(): number {
    return Math.floor(this._worldMinutes / (24 * 60));
  }

  get timeString(): string {
    return `${String(this.hour).padStart(2, "0")}:${String(this.minute).padStart(2, "0")}`;
  }

  /** Future world-minutes N hours from now — for scheduling agent wakes */
  futureMinutes(hours: number): number {
    return this._worldMinutes + hours * 60;
  }

  /** How many world-hours have elapsed since a past worldMinutes value */
  hoursElapsed(sinceWorldMinutes: number): number {
    return Math.max(0, (this._worldMinutes - sinceWorldMinutes) / 60);
  }

  /** Full snapshot for injection into perception packets */
  snapshot(): ClockSnapshot {
    const season = this.deriveSeason();
    const sol = SOLAR[season];
    const phase = this.derivePhase();
    const decHour = this.hour + this.minute / 60;
    const daylightLeft = Math.max(
      0,
      decHour < sol.rise ? sol.set - sol.rise : sol.set - decHour
    );
    return {
      worldMinutes: Math.floor(this._worldMinutes),
      worldDays: this.worldDays,
      hour: this.hour,
      minute: this.minute,
      timePhase: phase,
      season,
      sunrise: sol.rise,
      sunset: sol.set,
      daylightHoursRemaining: Math.round(daylightLeft * 10) / 10,
      timeString: this.timeString,
    };
  }

  // ----- Lifecycle -----

  start(onCropTick: () => void): void {
    console.log(
      `[WorldClock] Starting — ${this.timeString}, Day ${this.worldDays}, ${this.deriveSeason()}`
    );
    console.log(`[WorldClock] 30:1 compression — full day = 48 real minutes`);

    this.interval = setInterval(() => {
      if (this.paused) return;
      this.tick(onCropTick);
    }, REAL_MS_PER_TICK);
  }

  pause(): void  { this.paused = true; }
  resume(): void { this.paused = false; }
  stop(): void   { if (this.interval) clearInterval(this.interval); }

  // ----- Persistence -----

  /** Write current time into state.json meta. */
  persistToState(): void {
    try {
      const raw = readFileSync(WORLD_STATE_PATH, "utf-8");
      const state = JSON.parse(raw) as WorldState;
      const snap = this.snapshot();
      state.meta.worldMinutes = snap.worldMinutes;
      state.meta.worldDays    = snap.worldDays;
      state.meta.hour         = snap.hour;
      state.meta.minute       = snap.minute;
      state.meta.time         = snap.timePhase;
      state.meta.season       = snap.season;
      state.meta.tick         = snap.worldMinutes; // keep tick field in sync
      writeFileSync(WORLD_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
      // Track what we just wrote so syncFromFileIfNeeded can distinguish
      // our own writes from external edits
      this.lastWrittenWorldMinutes = snap.worldMinutes;
    } catch (err) {
      console.error("[WorldClock] Persist failed:", (err as Error).message);
    }
  }

  // ----- Internal -----

  private tick(onCropTick: () => void): void {
    // Every 5 real seconds, check if state.json was externally edited (god mode)
    this.tickCount++;
    if (this.tickCount % 5 === 0) {
      this.syncFromFileIfNeeded();
    }

    this._worldMinutes += WORLD_MINUTES_PER_TICK;

    const newPhase  = this.derivePhase();
    const newSeason = this.deriveSeason();
    const newHour   = this.hour;

    // Phase changed → fire event + persist
    if (newPhase !== this.lastPhase) {
      this.lastPhase = newPhase;
      this.persistToState();
      eventBus.emit({
        type: "WORLD_EVENT",
        payload: `${this.phaseDescription(newPhase)} [${this.timeString}]`,
        timestamp: Date.now(),
        source: "world",
      });
    }

    // Season changed → fire event + persist
    if (newSeason !== this.lastSeason) {
      this.lastSeason = newSeason;
      this.persistToState();
      eventBus.emit({
        type: "WORLD_EVENT",
        payload: `The season turns to ${newSeason}. ${this.seasonDescription(newSeason)} (Day ${this.worldDays})`,
        timestamp: Date.now(),
        source: "world",
      });
    }

    // Every world-hour → persist + maybe crop tick
    if (newHour !== this.lastHour) {
      this.lastHour = newHour;
      this.persistToState();
      if (newHour % 3 === 0) {
        onCropTick();
      }
    }
  }

  /**
   * Detect external edits to state.json (god-mode time changes).
   * Checks both worldMinutes and hour/minute in case only some fields were edited.
   * Threshold: >5 world-minutes drift = external edit (not normal clock advance).
   */
  private syncFromFileIfNeeded(): void {
    try {
      const raw = readFileSync(WORLD_STATE_PATH, "utf-8");
      const state = JSON.parse(raw) as WorldState;

      // Prefer worldMinutes if available; fall back to hour+minute
      let targetMinutes: number | null = null;

      const storedWorldMinutes = typeof state.meta.worldMinutes === "number"
        ? state.meta.worldMinutes : null;
      const storedHour = typeof state.meta.hour === "number" ? state.meta.hour : null;
      const storedMinute = typeof state.meta.minute === "number" ? state.meta.minute : 0;

      if (storedWorldMinutes !== null) {
        // Compare against what WE last wrote, not the running internal clock.
        // This avoids false positives as the clock advances between our hourly persists.
        const baseline = this.lastWrittenWorldMinutes >= 0
          ? this.lastWrittenWorldMinutes
          : this._worldMinutes;
        const drift = Math.abs(storedWorldMinutes - baseline);
        if (drift > 5) targetMinutes = storedWorldMinutes;
      } else if (storedHour !== null && storedHour !== this.hour) {
        // Only hour/minute were edited — reconstruct worldMinutes keeping the same day count
        const dayBase = this.worldDays * 24 * 60;
        targetMinutes = dayBase + storedHour * 60 + storedMinute;
      }

      if (targetMinutes === null) return;

      const fromStr = this.timeString;
      this._worldMinutes = targetMinutes;
      const toStr = this.timeString;

      this.lastHour   = this.hour;
      this.lastPhase  = this.derivePhase();
      this.lastSeason = this.deriveSeason();

      console.log(`[WorldClock] God-mode time edit: ${fromStr} → ${toStr}`);

      // Write canonical state so StateBroadcaster broadcasts the correct diff
      this.persistToState();

      // Notify agents of the new time
      eventBus.emit({
        type: "WORLD_EVENT",
        payload: `[God] Time set to ${toStr}. ${this.phaseDescription(this.derivePhase())}`,
        timestamp: Date.now(),
        source: "world",
      });
    } catch {
      // Ignore transient read errors
    }
  }

  private derivePhase(): "dawn" | "day" | "dusk" | "night" {
    const season = this.deriveSeason();
    const { rise, set } = SOLAR[season];
    const h = this.hour + this.minute / 60;
    if (h >= rise - 0.5 && h < rise + 1.5) return "dawn";
    if (h >= rise + 1.5 && h < set - 1)   return "day";
    if (h >= set - 1   && h < set + 1)    return "dusk";
    return "night";
  }

  private deriveSeason(): Season {
    const idx = Math.floor(this.worldDays / WORLD_DAYS_PER_SEASON) % 4;
    return SEASONS[idx];
  }

  private phaseDescription(phase: string): string {
    const season = this.deriveSeason();
    const { rise, set } = SOLAR[season];
    const fmt = (h: number) =>
      `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
    switch (phase) {
      case "dawn":  return `Dawn breaks at ${this.timeString}. Sunrise was at ${fmt(rise)}.`;
      case "day":   return `Full daylight. Sunset at ${fmt(set)}.`;
      case "dusk":  return `Dusk at ${this.timeString}. Darkness by ${fmt(set + 1)}.`;
      case "night": return `Night falls. Next sunrise at ${fmt(rise)}.`;
      default: return "";
    }
  }

  private seasonDescription(season: string): string {
    switch (season) {
      case "spring": return "New growth emerges. Longer days ahead.";
      case "summer": return "Long days, short nights. Peak growing season.";
      case "autumn": return "Days shorten. Prepare stores before winter.";
      case "winter": return "Short days. Cold bites. Food is scarce.";
      default: return "";
    }
  }
}
