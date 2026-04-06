// ============================================================
// Water — Ocean plane with time-of-day color shifts
// ============================================================

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const WATER_COLORS: Record<string, string> = {
  dawn: "#4a8c7e",
  day: "#2a9d8f",
  dusk: "#3d6b7a",
  night: "#0d2137",
};

const WATER_OPACITY: Record<string, number> = {
  dawn: 0.7,
  day: 0.75,
  dusk: 0.7,
  night: 0.85,
};

interface Props {
  time?: string;
}

export function Water({ time = "day" }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y =
        Math.sin(clock.elapsedTime * 0.5) * 0.08 - 0.3;
    }
  });

  const color = WATER_COLORS[time] || WATER_COLORS.day;
  const opacity = WATER_OPACITY[time] || 0.75;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.3, 0]}
    >
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  );
}
