// ============================================================
// StructureMesh — Renders built structures in zones
// ============================================================

interface Props {
  type: string;
  position: [number, number, number];
  index: number;
}

export function StructureMesh({ type, position, index }: Props) {
  // Offset structures slightly so they don't overlap
  const offsetX = (index % 3 - 1) * 2;
  const offsetZ = (Math.floor(index / 3) - 1) * 2;

  switch (type) {
    case "campfire":
      return (
        <group position={[position[0] + offsetX, position[1], position[2] + offsetZ]}>
          {/* Fire pit stones */}
          <mesh position={[0, 0.1, 0]}>
            <torusGeometry args={[0.4, 0.1, 4, 6]} />
            <meshStandardMaterial color="#757575" flatShading />
          </mesh>
          {/* Fire */}
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.2, 0.5, 5]} />
            <meshStandardMaterial
              color="#ff6f00"
              emissive="#ff6f00"
              emissiveIntensity={0.5}
              flatShading
            />
          </mesh>
          {/* Glow */}
          <pointLight
            position={[0, 0.5, 0]}
            color="#ff9800"
            intensity={2}
            distance={5}
          />
        </group>
      );

    case "shelter":
      return (
        <group position={[position[0] + offsetX, position[1], position[2] + offsetZ]}>
          {/* Base */}
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[2, 0.8, 1.5]} />
            <meshStandardMaterial color="#795548" flatShading />
          </mesh>
          {/* Roof */}
          <mesh position={[0, 1.1, 0]} castShadow>
            <coneGeometry args={[1.5, 0.8, 4]} />
            <meshStandardMaterial color="#5d4037" flatShading />
          </mesh>
        </group>
      );

    case "wall_section":
      return (
        <mesh
          position={[position[0] + offsetX, position[1] + 0.5, position[2] + offsetZ]}
          castShadow
        >
          <boxGeometry args={[2.5, 1, 0.3]} />
          <meshStandardMaterial color="#9e9e9e" flatShading />
        </mesh>
      );

    default:
      // Generic structure — small cube
      return (
        <mesh
          position={[position[0] + offsetX, position[1] + 0.3, position[2] + offsetZ]}
          castShadow
        >
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color="#8d6e63" flatShading />
        </mesh>
      );
  }
}
