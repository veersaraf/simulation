// ============================================================
// Zone Positions — Maps zone IDs to 3D world coordinates
// ============================================================

export const ZONE_RADIUS = 8;

// Scaled 1.8x from Phase 1 for breathing room + bridge space
export const ZONE_POSITIONS: Record<
  string,
  { x: number; y: number; z: number }
> = {
  landing_site: { x: 0, y: 0, z: 10 },
  forest_edge: { x: -18, y: 0, z: -4 },
  dense_forest: { x: -18, y: 0, z: -25 },
  river_bank: { x: -22, y: 0, z: 18 },
  open_meadow: { x: 18, y: 0, z: -4 },
  rocky_highlands: { x: 0, y: 0, z: -43 },
  stone_quarry: { x: 18, y: 0, z: -25 },
  beach: { x: 14, y: 0, z: 36 },
  lake_shore: { x: -14, y: 0, z: 36 },
};

/**
 * Extract unique adjacency pairs from zone data.
 * Returns array of [zoneIdA, zoneIdB] tuples (sorted to deduplicate).
 */
export function getAdjacencyPairs(
  zones: Record<string, { adjacent: string[] }>
): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];

  for (const [zoneId, zone] of Object.entries(zones)) {
    for (const adj of zone.adjacent) {
      const key = [zoneId, adj].sort().join(":");
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([zoneId, adj].sort() as [string, string]);
      }
    }
  }

  return pairs;
}
