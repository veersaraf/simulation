// ============================================================
// PassiveWorldEngine — DEPRECATED
//
// Time, seasons, and crop-growth are now handled by:
//   - WorldClock       (engine/WorldClock.ts)  — 30:1 clock, phases, seasons
//   - ActionResolver.tickCrops()               — crop stage advancement
//
// This file is kept as a no-op stub to avoid import errors during
// any transition period. It can be deleted once all references are removed.
// ============================================================

export class PassiveWorldEngine {
  constructor(_tickIntervalMs = 30000) {
    console.warn("[PassiveWorldEngine] DEPRECATED — use WorldClock instead.");
  }
  start(): void  { /* no-op */ }
  pause(): void  { /* no-op */ }
  resume(): void { /* no-op */ }
  stop(): void   { /* no-op */ }
}
