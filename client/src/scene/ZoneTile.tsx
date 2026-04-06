// ============================================================
// ZoneTile — Hexagonal terrain platform with biome + season
// ============================================================

import { useMemo } from "react";
import type { Zone } from "../store/useWorldStore";
import { ZONE_RADIUS } from "../data/zonePositions";

// ---- Seasonal color palettes ----
const TREE_CANOPY_COLORS: Record<string, string[]> = {
  spring: ["#4caf50", "#66bb6a", "#43a047", "#81c784"],
  summer: ["#2e7d32", "#388e3c", "#1b5e20", "#33691e"],
  autumn: ["#e65100", "#bf360c", "#f9a825", "#ff6f00", "#d84315"],
  winter: ["#90a4ae", "#b0bec5", "#78909c", "#cfd8dc"],
};

const BUSH_COLORS: Record<string, string> = {
  spring: "#66bb6a",
  summer: "#43a047",
  autumn: "#8d6e63",
  winter: "#78909c",
};

const GRASS_TUFT_COLORS: Record<string, string> = {
  spring: "#81c784",
  summer: "#66bb6a",
  autumn: "#a1887f",
  winter: "#b0bec5",
};

const REED_COLORS: Record<string, string> = {
  spring: "#2e7d32",
  summer: "#1b5e20",
  autumn: "#6d4c41",
  winter: "#78909c",
};

// Seeded pseudo-random for deterministic decoration placement
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = ((h ^ (h >>> 16)) >>> 0);
    return h / 0xffffffff;
  };
}

// Check if point is inside hexagon
function inHex(x: number, z: number, r: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return az < r * 0.866 && az + ax * 0.577 < r * 0.866;
}

interface Props {
  zone: Zone;
  position: [number, number, number];
  season?: string;
}

export function ZoneTile({ zone, position, season = "spring" }: Props) {
  const height = 0.5 + zone.elevation * 3;
  const y = position[1] + zone.elevation * 1.5 + height / 2;

  // Winter: lighten zone base color slightly
  const baseColor =
    season === "winter"
      ? lightenColor(zone.color, 0.3)
      : season === "autumn"
        ? warmColor(zone.color, 0.15)
        : zone.color;

  return (
    <group position={[position[0], y, position[2]]}>
      {/* Hex platform */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry
          args={[ZONE_RADIUS, ZONE_RADIUS * 1.05, height, 6]}
        />
        <meshStandardMaterial
          color={baseColor}
          flatShading
          roughness={0.8}
        />
      </mesh>
      {/* Snow layer on top in winter */}
      {season === "winter" && (
        <mesh position={[0, height / 2 + 0.03, 0]} receiveShadow>
          <cylinderGeometry args={[ZONE_RADIUS * 0.95, ZONE_RADIUS * 0.95, 0.06, 6]} />
          <meshStandardMaterial color="#e8eaf6" flatShading roughness={0.9} />
        </mesh>
      )}
      {/* Biome decorations */}
      <BiomeDecorations zone={zone} height={height} season={season} />
    </group>
  );
}

// Simple color manipulation helpers
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.floor(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.floor(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.floor(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function warmColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.floor(60 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.floor(20 * amount));
  const b = Math.max(0, (num & 0xff) - Math.floor(40 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function BiomeDecorations({
  zone,
  height,
  season,
}: {
  zone: Zone;
  height: number;
  season: string;
}) {
  const decorations = useMemo(() => {
    const rng = seededRandom(zone.id);
    const r = ZONE_RADIUS * 0.75;
    const surfaceY = height / 2;

    switch (zone.biome) {
      case "forest":
        return <ForestDecorations rng={rng} r={r} surfaceY={surfaceY} season={season} />;
      case "rocky":
        return <RockyDecorations rng={rng} r={r} surfaceY={surfaceY} />;
      case "grassland":
        return <GrasslandDecorations rng={rng} r={r} surfaceY={surfaceY} season={season} />;
      case "beach":
        return <BeachDecorations rng={rng} r={r} surfaceY={surfaceY} />;
      case "wetland":
        return <WetlandDecorations rng={rng} r={r} surfaceY={surfaceY} season={season} />;
      case "meadow":
        return <MeadowDecorations rng={rng} r={r} surfaceY={surfaceY} season={season} />;
      default:
        return null;
    }
  }, [zone.id, zone.biome, height, season]);

  return <>{decorations}</>;
}

// --- Forest: cone+cylinder trees with seasonal canopy ---
function ForestDecorations({
  rng,
  r,
  surfaceY,
  season,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
  season: string;
}) {
  const canopyColors = TREE_CANOPY_COLORS[season] || TREE_CANOPY_COLORS.spring;

  const trees = useMemo(() => {
    const items: Array<{
      x: number;
      z: number;
      trunkH: number;
      canopyR: number;
      canopyH: number;
      shadeIdx: number;
    }> = [];
    for (let i = 0; i < 12; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      const scale = 0.6 + rng() * 0.8;
      items.push({
        x,
        z,
        trunkH: 1.2 * scale,
        canopyR: season === "winter" ? 0.5 * scale : 0.8 * scale,
        canopyH: season === "winter" ? 1.4 * scale : 2.2 * scale,
        shadeIdx: Math.floor(rng() * canopyColors.length),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rng, r]);

  const trunkColor = season === "winter" ? "#795548" : "#5d4037";

  return (
    <>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, surfaceY, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.trunkH / 2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.15, t.trunkH, 5]} />
            <meshStandardMaterial color={trunkColor} flatShading />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, t.trunkH + t.canopyH / 2 - 0.2, 0]} castShadow>
            <coneGeometry args={[t.canopyR, t.canopyH, 6]} />
            <meshStandardMaterial
              color={canopyColors[t.shadeIdx % canopyColors.length]}
              flatShading
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// --- Rocky: dodecahedron rocks (unchanged by season) ---
function RockyDecorations({
  rng,
  r,
  surfaceY,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
}) {
  const rocks = useMemo(() => {
    const items: Array<{
      x: number;
      z: number;
      s: number;
      ry: number;
      color: string;
      rx: number;
      rz: number;
    }> = [];
    for (let i = 0; i < 8; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      const colors = ["#78909c", "#90a4ae", "#8d6e63", "#757575"];
      items.push({
        x,
        z,
        s: 0.3 + rng() * 1.2,
        ry: rng() * Math.PI * 2,
        rx: rng() * 0.3,
        rz: rng() * 0.3,
        color: colors[Math.floor(rng() * colors.length)],
      });
    }
    return items;
  }, [rng, r]);

  return (
    <>
      {rocks.map((rock, i) => (
        <mesh
          key={i}
          position={[rock.x, surfaceY + rock.s * 0.4, rock.z]}
          rotation={[rock.rx, rock.ry, rock.rz]}
          castShadow
        >
          <dodecahedronGeometry args={[rock.s, 0]} />
          <meshStandardMaterial color={rock.color} flatShading />
        </mesh>
      ))}
    </>
  );
}

// --- Grassland: bushes ---
function GrasslandDecorations({
  rng,
  r,
  surfaceY,
  season,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
  season: string;
}) {
  const bushColor = BUSH_COLORS[season] || BUSH_COLORS.spring;

  const items = useMemo(() => {
    const bushes: Array<{ x: number; z: number; s: number }> = [];
    for (let i = 0; i < 8; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      bushes.push({ x, z, s: 0.2 + rng() * 0.4 });
    }
    return bushes;
  }, [rng, r]);

  return (
    <>
      {items.map((b, i) => (
        <mesh key={i} position={[b.x, surfaceY + b.s, b.z]} castShadow>
          <icosahedronGeometry args={[b.s, 0]} />
          <meshStandardMaterial color={bushColor} flatShading />
        </mesh>
      ))}
    </>
  );
}

// --- Beach: driftwood + shells ---
function BeachDecorations({
  rng,
  r,
  surfaceY,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
}) {
  const items = useMemo(() => {
    const logs: Array<{ x: number; z: number; len: number; ry: number }> = [];
    const shells: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < 3; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      logs.push({ x, z, len: 1 + rng() * 2, ry: rng() * Math.PI });
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      shells.push({ x, z });
    }
    return { logs, shells };
  }, [rng, r]);

  return (
    <>
      {items.logs.map((l, i) => (
        <mesh
          key={`log-${i}`}
          position={[l.x, surfaceY + 0.08, l.z]}
          rotation={[0, l.ry, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.08, 0.1, l.len, 5]} />
          <meshStandardMaterial color="#795548" flatShading />
        </mesh>
      ))}
      {items.shells.map((s, i) => (
        <mesh
          key={`shell-${i}`}
          position={[s.x, surfaceY + 0.05, s.z]}
        >
          <sphereGeometry args={[0.06, 4, 3]} />
          <meshStandardMaterial color="#fce4ec" flatShading />
        </mesh>
      ))}
    </>
  );
}

// --- Wetland: reeds ---
function WetlandDecorations({
  rng,
  r,
  surfaceY,
  season,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
  season: string;
}) {
  const reedColor = REED_COLORS[season] || REED_COLORS.spring;

  const reeds = useMemo(() => {
    const items: Array<{ x: number; z: number; h: number }> = [];
    for (let i = 0; i < 20; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      items.push({ x, z, h: 0.8 + rng() * 1.5 });
    }
    return items;
  }, [rng, r]);

  return (
    <>
      {reeds.map((reed, i) => (
        <mesh
          key={i}
          position={[reed.x, surfaceY + reed.h / 2, reed.z]}
        >
          <cylinderGeometry args={[0.02, 0.03, reed.h, 4]} />
          <meshStandardMaterial color={reedColor} flatShading />
        </mesh>
      ))}
    </>
  );
}

// --- Meadow: flowers (hidden in winter) + grass tufts ---
function MeadowDecorations({
  rng,
  r,
  surfaceY,
  season,
}: {
  rng: () => number;
  r: number;
  surfaceY: number;
  season: string;
}) {
  const tuftColor = GRASS_TUFT_COLORS[season] || GRASS_TUFT_COLORS.spring;
  const showFlowers = season !== "winter";

  const items = useMemo(() => {
    const flowers: Array<{ x: number; z: number; color: string }> = [];
    const tufts: Array<{ x: number; z: number; h: number }> = [];
    const flowerColors =
      season === "autumn"
        ? ["#ff8f00", "#d84315", "#6d4c41"]
        : ["#ffeb3b", "#e91e63", "#9c27b0", "#ff9800", "#f44336"];
    for (let i = 0; i < 15; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      flowers.push({
        x,
        z,
        color: flowerColors[Math.floor(rng() * flowerColors.length)],
      });
    }
    for (let i = 0; i < 8; i++) {
      const x = (rng() - 0.5) * r * 2;
      const z = (rng() - 0.5) * r * 2;
      if (!inHex(x, z, r)) continue;
      tufts.push({ x, z, h: 0.3 + rng() * 0.5 });
    }
    return { flowers, tufts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rng, r]);

  return (
    <>
      {showFlowers &&
        items.flowers.map((f, i) => (
          <mesh
            key={`flower-${i}`}
            position={[f.x, surfaceY + 0.15, f.z]}
          >
            <sphereGeometry args={[0.08, 5, 4]} />
            <meshStandardMaterial color={f.color} flatShading />
          </mesh>
        ))}
      {items.tufts.map((t, i) => (
        <mesh
          key={`tuft-${i}`}
          position={[t.x, surfaceY + t.h / 2, t.z]}
        >
          <coneGeometry args={[0.15, t.h, 4]} />
          <meshStandardMaterial color={tuftColor} flatShading />
        </mesh>
      ))}
    </>
  );
}
