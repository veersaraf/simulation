// ============================================================
// ZoneBridge — Terrain connector between adjacent zones
// ============================================================

import { useMemo } from "react";
import * as THREE from "three";
import type { Zone } from "../store/useWorldStore";
import { ZONE_POSITIONS, ZONE_RADIUS } from "../data/zonePositions";

interface Props {
  zoneA: Zone;
  zoneB: Zone;
}

/** Blend two hex color strings. */
function blendColors(c1: string, c2: string, t = 0.5): string {
  const a = new THREE.Color(c1);
  const b = new THREE.Color(c2);
  a.lerp(b, t);
  return "#" + a.getHexString();
}

/** Get the surface Y of a zone tile (matches ZoneTile positioning). */
function getSurfaceY(zone: Zone): number {
  const height = 0.5 + zone.elevation * 3;
  return zone.elevation * 1.5 + height;
}

export function ZoneBridge({ zoneA, zoneB }: Props) {
  const geometry = useMemo(() => {
    const posA = ZONE_POSITIONS[zoneA.id];
    const posB = ZONE_POSITIONS[zoneB.id];
    if (!posA || !posB) return null;

    const surfaceA = getSurfaceY(zoneA);
    const surfaceB = getSurfaceY(zoneB);

    // Direction from A to B
    const dx = posB.x - posA.x;
    const dz = posB.z - posA.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const nx = dx / dist;
    const nz = dz / dist;

    // Start at edge of hex A, end at edge of hex B
    const edgeOffset = ZONE_RADIUS * 0.85;
    const startX = posA.x + nx * edgeOffset;
    const startZ = posA.z + nz * edgeOffset;
    const endX = posB.x - nx * edgeOffset;
    const endZ = posB.z - nz * edgeOffset;

    // Bridge length and angle
    const bridgeDx = endX - startX;
    const bridgeDz = endZ - startZ;
    const bridgeLen = Math.sqrt(bridgeDx * bridgeDx + bridgeDz * bridgeDz);
    const angle = Math.atan2(bridgeDx, bridgeDz);

    // Midpoint position
    const midX = (startX + endX) / 2;
    const midZ = (startZ + endZ) / 2;
    const midY = (surfaceA + surfaceB) / 2;

    // Bridge width tapers slightly for natural look
    const bridgeWidth = ZONE_RADIUS * 0.6;

    return { midX, midY, midZ, bridgeLen, bridgeWidth, angle, surfaceA, surfaceB };
  }, [zoneA, zoneB]);

  const color = useMemo(
    () => blendColors(zoneA.color, zoneB.color),
    [zoneA.color, zoneB.color]
  );

  if (!geometry) return null;

  const { midX, midY, midZ, bridgeLen, bridgeWidth, angle, surfaceA, surfaceB } = geometry;

  // Use a custom shape for the bridge that follows the elevation gradient
  return (
    <group position={[midX, midY, midZ]} rotation={[0, angle, 0]}>
      {/* Main bridge body — a flat box connecting the zones */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[bridgeWidth, 0.4, bridgeLen]} />
        <meshStandardMaterial
          color={color}
          flatShading
          roughness={0.85}
        />
      </mesh>
      {/* Slight slope mesh to smooth elevation transitions */}
      {Math.abs(surfaceA - surfaceB) > 0.5 && (
        <mesh
          position={[0, 0.05, 0]}
          rotation={[
            Math.atan2(surfaceA - surfaceB, bridgeLen),
            0,
            0,
          ]}
          receiveShadow
        >
          <boxGeometry args={[bridgeWidth * 0.9, 0.15, bridgeLen * 0.8]} />
          <meshStandardMaterial
            color={color}
            flatShading
            roughness={0.9}
          />
        </mesh>
      )}
    </group>
  );
}
