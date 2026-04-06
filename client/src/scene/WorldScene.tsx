// ============================================================
// WorldScene — R3F Canvas with dynamic day/night + season
// ============================================================

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { useWorldStore } from "../store/useWorldStore";
import { ZONE_POSITIONS, getAdjacencyPairs } from "../data/zonePositions";
import { ZoneTile } from "./ZoneTile";
import { ZoneLabel } from "./ZoneLabel";
import { ZoneBridge } from "./ZoneBridge";
import { AgentMesh } from "./AgentMesh";
import { StructureMesh } from "./StructureMesh";
import { Water } from "./Water";
import { FlyCamera } from "./FlyCamera";
import { FollowCamera } from "./FollowCamera";

// ---- Time-of-day lighting presets ----
interface TimePreset {
  sunPosition: [number, number, number];
  ambientIntensity: number;
  directionalIntensity: number;
  directionalColor: string;
  hemisphereTop: string;
  hemisphereBottom: string;
  hemisphereIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyTurbidity: number;
  skyRayleigh: number;
}

const TIME_PRESETS: Record<string, TimePreset> = {
  dawn: {
    sunPosition: [60, 8, 20],
    ambientIntensity: 0.3,
    directionalIntensity: 0.55,
    directionalColor: "#ffcc80",
    hemisphereTop: "#ff9e80",
    hemisphereBottom: "#4e342e",
    hemisphereIntensity: 0.35,
    fogColor: "#e8c4a0",
    fogNear: 80,
    fogFar: 300,
    skyTurbidity: 8,
    skyRayleigh: 4,
  },
  day: {
    sunPosition: [30, 50, 20],
    ambientIntensity: 0.5,
    directionalIntensity: 0.9,
    directionalColor: "#ffffff",
    hemisphereTop: "#87ceeb",
    hemisphereBottom: "#558b2f",
    hemisphereIntensity: 0.3,
    fogColor: "#c9e8ff",
    fogNear: 100,
    fogFar: 350,
    skyTurbidity: 10,
    skyRayleigh: 2,
  },
  dusk: {
    sunPosition: [-60, 6, -20],
    ambientIntensity: 0.2,
    directionalIntensity: 0.4,
    directionalColor: "#ff8a65",
    hemisphereTop: "#ce93d8",
    hemisphereBottom: "#3e2723",
    hemisphereIntensity: 0.25,
    fogColor: "#d4a0b0",
    fogNear: 70,
    fogFar: 280,
    skyTurbidity: 12,
    skyRayleigh: 4,
  },
  night: {
    sunPosition: [-30, -10, -10],
    ambientIntensity: 0.06,
    directionalIntensity: 0.08,
    directionalColor: "#b0bec5",
    hemisphereTop: "#1a237e",
    hemisphereBottom: "#0d0d1a",
    hemisphereIntensity: 0.1,
    fogColor: "#0d1b2a",
    fogNear: 40,
    fogFar: 200,
    skyTurbidity: 20,
    skyRayleigh: 0.5,
  },
};

/** Get the surface Y for a zone (matches ZoneTile). */
function getSurfaceY(elevation: number): number {
  const height = 0.5 + elevation * 3;
  return elevation * 1.5 + height + 0.1;
}

export function WorldScene() {
  const world = useWorldStore((s) => s.world);

  if (!world) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 18,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        Connecting to server...
      </div>
    );
  }

  const time = world.meta.time || "day";
  const season = world.meta.season || "spring";
  const preset = TIME_PRESETS[time] || TIME_PRESETS.day;

  // Derive a smooth sun position from precise hour (0-23) if available.
  // Maps hour to a 180° arc across the sky: sunrise=east, noon=zenith, sunset=west.
  const sunPosition: [number, number, number] = (() => {
    const h = world.meta.hour ?? null;
    const m = world.meta.minute ?? 0;
    if (h === null) return preset.sunPosition;
    const decHour = h + m / 60;
    // Solar arc: 0h → below horizon, 12h → zenith
    const angle = ((decHour - 12) / 12) * Math.PI; // -π to +π
    const elevation = Math.sin(-angle) * 80;        // Y: -80 to +80
    const azimuth   = Math.cos(-angle) * 80;        // X: east-west
    return [azimuth, elevation, 20];
  })();

  const zones = Object.values(world.zones);
  const adjacencyPairs = getAdjacencyPairs(world.zones);

  // Collect all agents with their positions
  const agents: Array<{ id: string; position: [number, number, number] }> = [];
  for (const zone of zones) {
    const pos = ZONE_POSITIONS[zone.id];
    if (!pos) continue;
    const surfY = getSurfaceY(zone.elevation);
    zone.agents.forEach((agentId, i) => {
      const offsetX = (i - (zone.agents.length - 1) / 2) * 1.5;
      agents.push({
        id: agentId,
        position: [pos.x + offsetX, surfY, pos.z],
      });
    });
  }

  // Build a lookup of agent id → position for the follow camera
  const agentPositions: Record<string, [number, number, number]> = {};
  for (const a of agents) {
    agentPositions[a.id] = a.position;
  }

  // Collect all structures with their positions
  const structures: Array<{
    type: string;
    position: [number, number, number];
    index: number;
    key: string;
  }> = [];
  for (const zone of zones) {
    const pos = ZONE_POSITIONS[zone.id];
    if (!pos) continue;
    const surfY = getSurfaceY(zone.elevation);
    zone.structures.forEach((struct, i) => {
      structures.push({
        type: struct,
        position: [pos.x, surfY, pos.z],
        index: i,
        key: `${zone.id}-${struct}-${i}`,
      });
    });
  }

  return (
    <Canvas
      camera={{ position: [0, 40, 70], fov: 60, near: 0.1, far: 500 }}
      style={{ width: "100%", height: "100%" }}
      shadows
    >
      {/* Dynamic Lighting based on time-of-day */}
      <ambientLight intensity={preset.ambientIntensity} />
      <directionalLight
        position={sunPosition}
        intensity={preset.directionalIntensity}
        color={preset.directionalColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <hemisphereLight
        args={[
          preset.hemisphereTop,
          preset.hemisphereBottom,
          preset.hemisphereIntensity,
        ]}
      />

      {/* Night moonlight — subtle blue fill */}
      {time === "night" && (
        <directionalLight
          position={[20, 40, -30]}
          intensity={0.12}
          color="#90caf9"
        />
      )}

      {/* Atmosphere */}
      <Sky
        sunPosition={sunPosition}
        turbidity={preset.skyTurbidity}
        rayleigh={preset.skyRayleigh}
      />
      <fog attach="fog" args={[preset.fogColor, preset.fogNear, preset.fogFar]} />

      {/* Water */}
      <Water time={time} />

      {/* Zone tiles and labels */}
      {zones.map((zone) => {
        const pos = ZONE_POSITIONS[zone.id];
        if (!pos) return null;
        const position: [number, number, number] = [pos.x, pos.y, pos.z];
        return (
          <group key={zone.id}>
            <ZoneTile zone={zone} position={position} season={season} />
            <ZoneLabel zone={zone} position={position} />
          </group>
        );
      })}

      {/* Terrain bridges */}
      {adjacencyPairs.map(([idA, idB]) => {
        const zA = world.zones[idA];
        const zB = world.zones[idB];
        if (!zA || !zB) return null;
        return <ZoneBridge key={`${idA}:${idB}`} zoneA={zA} zoneB={zB} />;
      })}

      {/* Agent meshes */}
      {agents.map((agent) => (
        <AgentMesh
          key={agent.id}
          agentId={agent.id}
          position={agent.position}
          color="#ffffff"
        />
      ))}

      {/* Structure meshes */}
      {structures.map((s) => (
        <StructureMesh
          key={s.key}
          type={s.type}
          position={s.position}
          index={s.index}
        />
      ))}

      {/* Camera controllers */}
      <FlyCamera />
      <FollowCamera agentPositions={agentPositions} />
    </Canvas>
  );
}
